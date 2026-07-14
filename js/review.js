/**
 * 試合詳細分析 (リプレイ分析) モジュール。
 *
 * Match-V5 タイムライン API の1分ごとのスナップショット
 * (座標・体力・AD/AP・防御・累計ダメージ) と全イベントから、
 * キルチャンス推定・アイテム効果・デスレビュー・マクロ指標を算出する。
 *
 * 注意: タイムラインは1分粒度であり、バースト計算は簡易モデルによる推定。
 * 結果はすべて「目安」として提示すること。
 */
const Review = (() => {

  /** matchId (例: JP1_123...) からリージョナルルーティングを引く */
  function regionalOf(matchId) {
    const prefix = String(matchId).split('_')[0].toLowerCase();
    return MyData.REGIONAL[prefix] || 'asia';
  }

  /** アカウント・マッチ詳細・タイムラインを取得する */
  async function fetchAll(matchId, apiKey, gameName, tagLine, onProgress) {
    const regional = regionalOf(matchId);
    onProgress('アカウントを確認中…');
    const account = await MyData.riot(regional,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, apiKey);
    onProgress('マッチ詳細を取得中…');
    const match = await MyData.riot(regional, `/lol/match/v5/matches/${matchId}`, apiKey);
    onProgress('タイムラインを取得中…');
    const timeline = await MyData.riot(regional, `/lol/match/v5/matches/${matchId}/timeline`, apiKey);
    return { account, match, timeline };
  }

  const dist = (a, b) => (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;

  /**
   * 簡易バーストモデル (約3秒間の交戦を想定):
   *   スキル: AD係数2.1 + AP係数2.3、通常攻撃: AD × 攻撃速度 × 2.5秒分
   *   相手の防御による軽減: 100/(100+防御値)
   */
  function estimateBurst(myStats, oppStats) {
    const physMult = 100 / (100 + Math.max(0, oppStats.armor || 0));
    const magMult = 100 / (100 + Math.max(0, oppStats.magicResist || 0));
    const ad = myStats.attackDamage || 0;
    const ap = myStats.abilityPower || 0;
    const as = (myStats.attackSpeed || 100) / 100;
    const spellBurst = 2.1 * ad * physMult + 2.3 * ap * magMult;
    const aaBurst = ad * as * 2.5 * physMult;
    return spellBurst + aaBurst;
  }

  /** 完成アイテム (コア・ブーツ) 判定 */
  function isCoreItem(item) {
    if (!item || !item.gold) return false;
    const noInto = !item.into || item.into.length === 0;
    if ((item.tags || []).includes('Boots')) return noInto && item.gold.total >= 800;
    return noInto && item.gold.total >= 1600;
  }

  /**
   * メイン分析。
   * @returns null (自分が見つからない場合) または分析結果オブジェクト
   */
  function analyze(match, timeline, puuid, items) {
    const parts = match.info.participants;
    const me = parts.find((p) => p.puuid === puuid);
    if (!me) return null;
    const opp = parts.find((p) =>
      p.teamId !== me.teamId && p.teamPosition && p.teamPosition === me.teamPosition) || null;

    const frames = (timeline.info && timeline.info.frames) || [];
    const pf = (f, id) => f.participantFrames && f.participantFrames[String(id)];

    // ---- 1分ごとの時系列 ----
    const series = [];
    let hasStats = false;
    frames.forEach((f, i) => {
      const my = pf(f, me.participantId);
      if (!my) return;
      const op = opp ? pf(f, opp.participantId) : null;
      if (my.championStats) hasStats = true;
      series.push({
        min: i,
        myGold: my.totalGold, myCurrentGold: my.currentGold || 0,
        myLevel: my.level,
        myCs: (my.minionsKilled || 0) + (my.jungleMinionsKilled || 0),
        myPos: my.position || null,
        myStats: my.championStats || null,
        myDmg: my.damageStats ? (my.damageStats.totalDamageDoneToChampions || 0) : 0,
        oppGold: op ? op.totalGold : null,
        oppLevel: op ? op.level : null,
        oppCs: op ? (op.minionsKilled || 0) + (op.jungleMinionsKilled || 0) : null,
        oppPos: op ? op.position || null : null,
        oppStats: op && op.championStats ? op.championStats : null,
        goldDiff: op ? my.totalGold - op.totalGold : null,
        csDiff: op ? ((my.minionsKilled || 0) + (my.jungleMinionsKilled || 0)) -
                     ((op.minionsKilled || 0) + (op.jungleMinionsKilled || 0)) : null,
      });
    });

    const events = frames.flatMap((f) => f.events || []);
    const frameAt = (ts) => series[Math.min(series.length - 1, Math.max(0, Math.round(ts / 60000)))];

    // ---- デスレビュー ----
    const allies = parts.filter((p) => p.teamId === me.teamId && p.participantId !== me.participantId);
    const myDeaths = events
      .filter((e) => e.type === 'CHAMPION_KILL' && e.victimId === me.participantId)
      .map((e) => {
        const idx = Math.min(series.length - 1, Math.floor(e.timestamp / 60000));
        const frame = frames[idx];
        const alliesNear = frame ? allies.filter((a) => {
          const apf = pf(frame, a.participantId);
          return apf && dist(apf.position, e.position) <= 3000;
        }).length : 0;
        const myFrame = frame ? pf(frame, me.participantId) : null;
        const killer = parts.find((p) => p.participantId === e.killerId);
        return {
          ts: e.timestamp,
          min: Math.floor(e.timestamp / 60000),
          pos: e.position || null,
          killerName: killer ? killer.championName : null,
          solo: alliesNear === 0,
          unspentGold: myFrame ? (myFrame.currentGold || 0) : 0,
          earlyGank: e.timestamp < 480000 && killer && killer.teamPosition === 'JUNGLE',
        };
      });

    // ---- オブジェクト関与 ----
    let objTotal = 0, objNear = 0;
    for (const e of events) {
      if (e.type === 'ELITE_MONSTER_KILL' && e.killerTeamId === me.teamId) {
        objTotal++;
        const s = frameAt(e.timestamp);
        if (s && dist(s.myPos, e.position) <= 4200) objNear++;
      }
    }

    // ---- ワード ----
    const wardsPlaced = events.filter((e) =>
      e.type === 'WARD_PLACED' && e.creatorId === me.participantId && e.wardType !== 'UNDEFINED').length;
    const wardsKilled = events.filter((e) =>
      e.type === 'WARD_KILL' && e.killerId === me.participantId).length;

    // ---- アイテム購入 (取り消しを考慮) と効果分析 ----
    const buildPurchases = (pid) => {
      const list = [];
      for (const e of events) {
        if (e.type === 'ITEM_PURCHASED' && e.participantId === pid) {
          list.push({ ts: e.timestamp, itemId: e.itemId });
        } else if (e.type === 'ITEM_UNDO' && e.participantId === pid) {
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].itemId === e.beforeId) { list.splice(i, 1); break; }
          }
        }
      }
      return list.filter((p) => isCoreItem(items[p.itemId]));
    };

    const dmgPerMin = (fromMin, toMin) => {
      const a = series[Math.max(0, Math.min(series.length - 1, fromMin))];
      const b = series[Math.max(0, Math.min(series.length - 1, toMin))];
      const mins = Math.max(1, b.min - a.min);
      return (b.myDmg - a.myDmg) / mins;
    };

    const myCorePurchases = buildPurchases(me.participantId).map((p) => {
      const min = Math.round(p.ts / 60000);
      return {
        ...p, min,
        item: items[p.itemId] || null,
        dmgBefore: dmgPerMin(min - 3, min),
        dmgAfter: dmgPerMin(min, min + 3),
      };
    });
    const oppCore = opp ? buildPurchases(opp.participantId) : [];
    const coreTiming = (myCorePurchases.length && oppCore.length)
      ? { myFirst: myCorePurchases[0].ts, oppFirst: oppCore[0].ts }
      : null;

    // ---- キルチャンス推定 (対面が必要) ----
    const killWindows = [];
    if (opp && hasStats) {
      for (const s of series) {
        if (s.min < 3 || !s.myStats || !s.oppStats) continue;
        if (s.oppStats.health <= 0 || s.myStats.health <= 0) continue;
        if (dist(s.myPos, s.oppPos) > 4500) continue; // 近くにいない分は対象外
        const burst = estimateBurst(s.myStats, s.oppStats);
        const oppHp = s.oppStats.health;
        const oppHpPct = s.oppStats.healthMax ? oppHp / s.oppStats.healthMax : 1;
        let verdict = null;
        if (burst >= oppHp) verdict = 'kill';
        else if (burst >= 0.72 * oppHp || oppHpPct <= 0.35) verdict = 'pressure';
        if (verdict) killWindows.push({ min: s.min, burst, oppHp, oppHpPct, verdict });
      }
    }
    // 連続する分をまとめる
    const windows = [];
    for (const w of killWindows) {
      const last = windows[windows.length - 1];
      if (last && w.min === last.endMin + 1 && w.verdict === last.verdict) {
        last.endMin = w.min;
        if (w.burst - w.oppHp > last.best.burst - last.best.oppHp) last.best = w;
      } else {
        windows.push({ startMin: w.min, endMin: w.min, verdict: w.verdict, best: w });
      }
    }

    // ---- レベル先行 ----
    const levelLeads = [];
    for (const s of series) {
      if (s.oppLevel == null) continue;
      if (s.myLevel > s.oppLevel) {
        const last = levelLeads[levelLeads.length - 1];
        if (last && s.min === last.endMin + 1) last.endMin = s.min;
        else levelLeads.push({ startMin: s.min, endMin: s.min });
      }
    }
    const myTo6 = series.find((s) => s.myLevel >= 6);
    const oppTo6 = series.find((s) => s.oppLevel != null && s.oppLevel >= 6);
    const firstTo6 = (myTo6 && oppTo6) ? { myMin: myTo6.min, oppMin: oppTo6.min } : null;

    return {
      me, opp, series, hasStats,
      myDeaths,
      objectives: { near: objNear, total: objTotal },
      wards: { placed: wardsPlaced, killed: wardsKilled },
      corePurchases: myCorePurchases,
      coreTiming,
      killWindows: windows,
      levelLeads,
      firstTo6,
    };
  }

  return { regionalOf, fetchAll, analyze, estimateBurst, isCoreItem };
})();
