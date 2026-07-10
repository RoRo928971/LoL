/**
 * チーム構成分析モジュール (試合プラン)。
 *
 * 味方5体・敵5体のチャンピオンから、チームバランス・
 * 敵構成に対する統合脅威 (アイテム調整用)・戦い方の指針を算出する。
 * Data Dragon のタグと評価値に基づくヒューリスティックであり、目安として提示する。
 */
const TeamComp = (() => {

  /** 1チャンピオンの特性プロファイル */
  function champProfile(c) {
    const tags = c.tags || [];
    const info = c.info || { attack: 5, magic: 5, defense: 5 };
    return {
      id: c.id,
      name: c.name,
      attack: info.attack,
      magic: info.magic,
      frontline: tags.includes('Tank') || (tags.includes('Fighter') && info.defense >= 6),
      engage: tags.includes('Tank') || (tags.includes('Support') && info.defense >= 7),
      poke: tags.includes('Mage') || tags.includes('Marksman'),
      sustain: Matchup.SUSTAIN_CHAMPIONS.has(c.id),
      burst: tags.includes('Assassin') || (info.magic >= 8 && info.defense <= 4),
      lateGame: tags.includes('Marksman') || (tags.includes('Mage') && !tags.includes('Assassin')),
      tanky: tags.includes('Tank') || info.defense >= 8,
    };
  }

  /**
   * チーム全体の分析。
   * @returns { size, physShare, magShare, frontline, engage, poke, burst,
   *            lateGame, tanky, sustainNames, compType, profiles }
   */
  function analyzeTeam(champs) {
    const profiles = champs.map(champProfile);
    const count = (f) => profiles.filter(f).length;
    const atk = profiles.reduce((s, p) => s + p.attack, 0);
    const mag = profiles.reduce((s, p) => s + p.magic, 0);
    const total = atk + mag || 1;

    const team = {
      size: profiles.length,
      physShare: atk / total,
      magShare: mag / total,
      frontline: count((p) => p.frontline),
      engage: count((p) => p.engage),
      poke: count((p) => p.poke),
      burst: count((p) => p.burst),
      lateGame: count((p) => p.lateGame),
      tanky: count((p) => p.tanky),
      sustainNames: profiles.filter((p) => p.sustain).map((p) => p.name),
      profiles,
    };
    team.compType = compType(team);
    return team;
  }

  /** チーム構成タイプの推定 */
  function compType(t) {
    if (t.size < 3) return null;
    if (t.engage >= 2) return { name: 'エンゲージ構成', desc: 'CCで仕掛けて一気に集団戦を起こすのが強い構成' };
    if (t.poke >= 3 && t.frontline <= 1) return { name: 'ポーク構成', desc: '射程を活かして開戦前に削り、正面衝突を避けたい構成' };
    if (t.burst >= 2) return { name: 'ピック構成', desc: '孤立した敵を捕まえて数的有利を作るのが得意な構成' };
    if (t.frontline >= 2 && t.lateGame >= 2) return { name: 'ファイト構成', desc: '前衛が時間を稼ぎ、後衛が継続火力を出す正面戦闘向きの構成' };
    return { name: 'バランス構成', desc: '状況に応じて柔軟に戦える構成' };
  }

  /** 味方チームの穴を警告として列挙する */
  function warnings(team) {
    if (!team || team.size < 3) return [];
    const w = [];
    if (team.physShare >= 0.72) w.push('ダメージが物理に偏っています。敵は物理防御を積むだけで対処できるため、魔法ダメージ源が欲しいところです。');
    if (team.magShare >= 0.72) w.push('ダメージが魔法に偏っています。敵は魔法防御を積むだけで対処できるため、物理ダメージ源が欲しいところです。');
    if (team.frontline === 0) w.push('前衛がいません。集団戦は正面から当たらず、ポークやピックで数的有利を作ってから戦いましょう。');
    if (team.engage === 0) w.push('エンゲージ (開戦手段) が乏しい構成です。敵に仕掛けられる前提で受けの立ち回りを意識しましょう。');
    if (team.lateGame === 0) w.push('後半にスケールするチャンピオンが少なめです。序盤〜中盤のうちに試合を動かしましょう。');
    return w;
  }

  /**
   * 敵チーム全体から統合脅威リストを作る (Matchup.counterItems に渡す)。
   * 重要度が高い順に並べる。
   */
  function buildThreats(enemyTeam) {
    const t = enemyTeam;
    const list = [];
    if (t.sustainNames.length >= 1) list.push('sustain');
    if (t.physShare >= t.magShare) {
      list.push('physical');
      if (t.magShare > 0.28) list.push('magic');
    } else {
      list.push('magic');
      if (t.physShare > 0.28) list.push('physical');
    }
    if (t.tanky >= 1) list.push('tanky');
    if (t.burst >= 1) list.push('burst');
    // タンクが複数いる場合は対タンクの優先度を上げる
    if (t.tanky >= 2) {
      const i = list.indexOf('tanky');
      list.splice(i, 1);
      list.splice(list.indexOf('sustain') === 0 ? 1 : 0, 0, 'tanky');
    }
    return list;
  }

  /** 自分のアーキタイプに合わせたブーツの調整 */
  function recommendBoots(items, archetypeKey, enemyTeam) {
    const heavyMagic = enemyTeam.magShare >= 0.55;
    const heavyPhys = enemyTeam.physShare >= 0.62;
    const durable = ['tank', 'fighter', 'fighter_ap', 'support_tank'].includes(archetypeKey);
    if (durable) {
      const id = heavyMagic ? 3111 : 3047;
      if (items[id]) {
        return {
          id: String(id), item: items[id],
          reason: heavyMagic ? '敵は魔法ダメージが多いためマーキュリーブーツ推奨' : '敵は物理ダメージが多いためプレートスチールキャップ推奨',
        };
      }
    }
    if (heavyMagic && !durable && items[3111] && ['assassin_ad', 'fighter'].includes(archetypeKey)) {
      return { id: '3111', item: items[3111], reason: '敵の魔法ダメージとCCが多い場合はマーキュリーも選択肢' };
    }
    return null; // アーキタイプ標準のまま
  }

  const SQUISHY = new Set(['marksman', 'mage', 'assassin_ad', 'assassin_ap', 'support_enchanter']);

  /** 戦い方の指針を生成する */
  function advice(own, archetypeKey, allyTeam, enemyTeam) {
    const tips = [];

    if (allyTeam && allyTeam.compType) {
      tips.push(`味方は「${allyTeam.compType.name}」。${allyTeam.compType.desc}。`);
    }
    if (enemyTeam.compType) {
      const counterNote = {
        'エンゲージ構成': '固まりすぎると一網打尽にされます。散開しつつ、視界を確保して仕掛けの初動をかわしましょう',
        'ポーク構成': '削り合いに付き合うと不利です。視界を取って一気に距離を詰めるか、オブジェクトで強制的に戦わせましょう',
        'ピック構成': '単独行動が最大の敵です。ミニマップを見て常に味方と行動しましょう',
        'ファイト構成': '正面から殴り合う前に、人数有利かスキル差がある状態を作ってから戦いましょう',
        'バランス構成': '明確な穴が少ない相手です。オブジェクト管理と人数有利を丁寧に積み重ねましょう',
      }[enemyTeam.compType.name];
      tips.push(`敵は「${enemyTeam.compType.name}」。${counterNote}。`);
    }

    // 勝ち筋 (スケーリング比較)
    if (allyTeam && allyTeam.size >= 3 && enemyTeam.size >= 3) {
      if (allyTeam.lateGame > enemyTeam.lateGame) {
        tips.push('勝ち筋: こちらの方が後半に強い構成です。序盤はキルを譲ってでも安全にファームし、時間を稼ぎましょう。');
      } else if (allyTeam.lateGame < enemyTeam.lateGame) {
        tips.push('勝ち筋: 敵の方が後半に強い構成です。序盤から積極的に仕掛けてスノーボールし、試合を早く終わらせましょう。');
      } else {
        tips.push('勝ち筋: スケーリングは互角です。ドラゴン・グラブなどのオブジェクトを丁寧に集めて差を作りましょう。');
      }
    }

    // 自分向けの注意
    if (enemyTeam.sustainNames.length) {
      tips.push(`敵の ${enemyTeam.sustainNames.join('・')} は回復量が多いチャンピオンです。回復阻害アイテムを2品目までに用意しましょう。`);
    }
    if (SQUISHY.has(archetypeKey) && enemyTeam.burst >= 1) {
      const divers = enemyTeam.profiles.filter((p) => p.burst).map((p) => p.name);
      tips.push(`${divers.join('・')} はあなたを狙ってきます。集団戦では味方の後ろに位置取り、生存アイテムの購入を優先しましょう。`);
    }
    if (enemyTeam.tanky >= 2 && ['marksman', 'mage', 'fighter', 'assassin_ad', 'assassin_ap'].includes(archetypeKey)) {
      tips.push('敵は前衛が厚い構成です。防御貫通・割合ダメージを揃えるか、前衛を無視して後衛を狙える位置取りを意識しましょう。');
    }
    if (['tank', 'support_tank'].includes(archetypeKey)) {
      const carries = enemyTeam.profiles.filter((p) => !p.frontline && (p.poke || p.burst)).map((p) => p.name);
      if (carries.length) {
        tips.push(`集団戦のあなたの仕事は、${carries.slice(0, 2).join('・')} などの敵火力役への妨害か、味方キャリーの保護です。どちらを担うか開戦前に決めておきましょう。`);
      }
    }
    if (archetypeKey === 'support_enchanter' && enemyTeam.burst >= 1) {
      tips.push('敵の飛び込みに合わせてヒール・シールド・CCを味方キャリーに使えるよう、スキルを温存して構えましょう。');
    }
    return tips;
  }

  return { champProfile, analyzeTeam, warnings, buildThreats, recommendBoots, advice };
})();
