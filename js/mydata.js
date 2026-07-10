/**
 * マイデータ (自分の戦績分析) モジュール。
 *
 * Riot ID から puuid を解決し、マッチ履歴を取得して
 * 勝率・KDA・チャンピオン別/ロール別の成績を集計する。
 * Riot API へのアクセスは同一オリジンの中継サーバー (/api/...) 経由。
 */
const MyData = (() => {

  const LS = {
    riotId: 'lolcomp.riotId',
    region: 'lolcomp.region',
    apiKey: 'lolcomp.apiKey',
    count: 'lolcomp.count',
  };

  // プラットフォーム → match-v5 等のリージョナルルーティング
  const REGIONAL = {
    jp1: 'asia', kr: 'asia',
    na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
    euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
    oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea',
  };

  const PLATFORMS = [
    ['jp1', '日本 (JP)'], ['kr', '韓国 (KR)'], ['na1', '北米 (NA)'],
    ['euw1', '西ヨーロッパ (EUW)'], ['eun1', '北東ヨーロッパ (EUNE)'],
    ['oc1', 'オセアニア (OCE)'], ['br1', 'ブラジル (BR)'],
  ];

  const QUEUE_LABELS = {
    420: 'ランク (ソロ/デュオ)', 440: 'ランク (フレックス)',
    400: 'ノーマル (ドラフト)', 430: 'ノーマル (ブラインド)', 480: 'クイックプレイ',
    450: 'ARAM', 490: 'クイックプレイ', 1700: 'アリーナ', 900: 'URF',
  };

  const ROLE_LABELS = {
    TOP: 'トップ', JUNGLE: 'ジャングル', MIDDLE: 'ミッド',
    BOTTOM: 'ボット', UTILITY: 'サポート',
  };

  const TIER_LABELS = {
    IRON: 'アイアン', BRONZE: 'ブロンズ', SILVER: 'シルバー', GOLD: 'ゴールド',
    PLATINUM: 'プラチナ', EMERALD: 'エメラルド', DIAMOND: 'ダイヤモンド',
    MASTER: 'マスター', GRANDMASTER: 'グランドマスター', CHALLENGER: 'チャレンジャー',
  };

  // ---------------- Riot API クライアント ----------------

  function friendlyError(status, body) {
    if (status === 401 || status === 403) {
      return 'APIキーが無効か期限切れです。developer.riotgames.com で開発用キーを再発行してください (24時間で失効します)。';
    }
    if (status === 404) return 'not_found';
    if (status === 429) return 'レート制限に達しました。1〜2分待ってから再試行してください。';
    if (status === 503 || status === 502) return 'Riot API が一時的に利用できません。時間をおいて再試行してください。';
    return (body && body.error) || `Riot API エラー (HTTP ${status})`;
  }

  async function riot(host, apiPath, apiKey, retries = 2) {
    const res = await fetch(`/api/${host}${apiPath}`, {
      headers: apiKey ? { 'X-Riot-Token': apiKey } : {},
    });
    if (res.status === 429 && retries > 0) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 5, 20);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return riot(host, apiPath, apiKey, retries - 1);
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* 非JSONレスポンス */ }
    if (!res.ok) {
      const err = new Error(friendlyError(res.status, body));
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /** 中継サーバーが動いているか確認する */
  async function ping() {
    try {
      const res = await fetch('/api/ping');
      if (!res.ok) return null;
      return res.json();
    } catch (e) { return null; }
  }

  /** アカウント → サモナー → ランク → マッチ履歴を順に取得する */
  async function fetchAll({ gameName, tagLine, platform, count, apiKey }, onProgress) {
    const regional = REGIONAL[platform] || 'asia';
    onProgress('アカウントを検索中…');
    let account;
    try {
      account = await riot(regional,
        `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        apiKey);
    } catch (e) {
      if (e.message === 'not_found') throw new Error(`プレイヤー「${gameName}#${tagLine}」が見つかりません。Riot ID とリージョンを確認してください。`);
      throw e;
    }

    onProgress('サモナー情報を取得中…');
    const summoner = await riot(platform, `/lol/summoner/v4/summoners/by-puuid/${account.puuid}`, apiKey)
      .catch(() => null);

    let league = [];
    try {
      league = await riot(platform, `/lol/league/v4/entries/by-puuid/${account.puuid}`, apiKey);
    } catch (e) {
      // 旧エンドポイントにフォールバック
      if (summoner && summoner.id) {
        league = await riot(platform, `/lol/league/v4/entries/by-summoner/${summoner.id}`, apiKey).catch(() => []);
      }
    }

    onProgress('マッチ履歴を取得中…');
    const ids = await riot(regional,
      `/lol/match/v5/matches/by-puuid/${account.puuid}/ids?count=${count}`, apiKey);

    const matches = [];
    const CHUNK = 4; // レート制限に配慮した並列数
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = await Promise.all(
        ids.slice(i, i + CHUNK).map((id) => riot(regional, `/lol/match/v5/matches/${id}`, apiKey))
      );
      matches.push(...chunk);
      onProgress(`マッチ詳細を取得中… (${Math.min(i + CHUNK, ids.length)}/${ids.length})`);
    }
    return { account, summoner, league, matches };
  }

  // ---------------- 集計 ----------------

  /**
   * マッチ配列から自分 (puuid) の成績を集計する。
   * リメイク (5分未満) は集計から除外する。
   */
  function analyze(matches, puuid) {
    const rows = [];
    for (const match of matches) {
      const info = match && match.info;
      if (!info || !Array.isArray(info.participants)) continue;
      const me = info.participants.find((p) => p.puuid === puuid);
      if (!me) continue;
      if ((info.gameDuration || 0) < 300) continue; // リメイク除外
      const minutes = info.gameDuration / 60;
      rows.push({
        matchId: match.metadata && match.metadata.matchId,
        queueId: info.queueId,
        gameCreation: info.gameCreation,
        durationMin: minutes,
        win: Boolean(me.win),
        champion: me.championName,
        kills: me.kills || 0, deaths: me.deaths || 0, assists: me.assists || 0,
        cs: (me.totalMinionsKilled || 0) + (me.neutralMinionsKilled || 0),
        visionScore: me.visionScore || 0,
        role: me.teamPosition || '',
        items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6]
          .filter((id) => id && id > 0),
        keystone: me.perks && me.perks.styles && me.perks.styles[0] &&
          me.perks.styles[0].selections && me.perks.styles[0].selections[0]
          ? me.perks.styles[0].selections[0].perk : null,
      });
    }

    const games = rows.length;
    const sum = (f) => rows.reduce((acc, r) => acc + f(r), 0);
    const wins = rows.filter((r) => r.win).length;
    const kda = (k, d, a) => (k + a) / Math.max(1, d);

    const overall = games === 0 ? null : {
      games, wins,
      winRate: wins / games,
      kills: sum((r) => r.kills) / games,
      deaths: sum((r) => r.deaths) / games,
      assists: sum((r) => r.assists) / games,
      kda: kda(sum((r) => r.kills), sum((r) => r.deaths), sum((r) => r.assists)),
      csPerMin: sum((r) => r.cs / r.durationMin) / games,
      vision: sum((r) => r.visionScore) / games,
    };

    const groupBy = (keyFn) => {
      const map = new Map();
      for (const r of rows) {
        const key = keyFn(r);
        if (!key) continue;
        if (!map.has(key)) map.set(key, { key, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
        const g = map.get(key);
        g.games++; if (r.win) g.wins++;
        g.kills += r.kills; g.deaths += r.deaths; g.assists += r.assists;
      }
      return [...map.values()]
        .map((g) => ({ ...g, winRate: g.wins / g.games, kda: kda(g.kills, g.deaths, g.assists) }))
        .sort((a, b) => b.games - a.games);
    };

    return {
      overall,
      byChampion: groupBy((r) => r.champion),
      byRole: groupBy((r) => r.role),
      recent: rows.sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0)),
    };
  }

  return {
    LS, PLATFORMS, QUEUE_LABELS, ROLE_LABELS, TIER_LABELS, REGIONAL,
    riot, ping, fetchAll, analyze,
  };
})();
