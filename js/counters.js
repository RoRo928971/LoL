/**
 * カウンター関係 (相性) の推定モジュール。
 *
 * 公式のカウンターデータは存在しないため、アーキタイプ間の相性マトリクスと
 * 特性 (回復・バースト・耐久) の補正で全チャンピオンとの相性を採点する。
 * あくまでタグ・評価値ベースのヒューリスティックであり、「自動推定」として提示する。
 */
const Counters = (() => {

  const POKE = new Set(['mage', 'marksman', 'support_enchanter']);

  const REASON = {
    assassinVsSoft: '機動力とバーストで柔らかい相手を仕留めやすい',
    tankVsAssassin: '硬さとCCで飛び込みを受け止めやすい',
    fighterVsTank: '継続ダメージと殴り合いの強さで硬い相手に有利',
    mageRange: '射程とスキルで接近される前に削れる',
    adcShred: '通常攻撃の継続火力で高耐久を溶かせる',
    engage: 'エンゲージ力で柔らかい相手に仕掛けやすい',
    brawl: '接近すれば殴り合いの強さで勝てる',
    sustainBeatsPoke: '回復力でポーク (削り) を無効化しやすい',
    pokeIntoSustain: '相手の回復で削りが通りにくい',
    burstSquishy: 'バーストが通りやすい',
    tankAbsorbs: '耐久がありバーストで落ちにくい',
    kited: '射程と機動力で距離を取られやすい',
    hardToKill: '硬い相手を倒す手段に乏しい',
    divedBy: '飛び込まれると対処が難しい',
  };

  // MATRIX[攻撃側アーキタイプ][防御側アーキタイプ] = { s: スコア, r: 理由 }
  const A = (s, r) => ({ s, r });
  const assassinRow = {
    marksman: A(2, REASON.assassinVsSoft), mage: A(2, REASON.assassinVsSoft),
    support_enchanter: A(1.5, REASON.assassinVsSoft),
    tank: A(-1.5, REASON.hardToKill), support_tank: A(-1.5, REASON.hardToKill),
    fighter: A(-0.5, REASON.hardToKill), fighter_ap: A(-0.5, REASON.hardToKill),
  };
  const fighterRow = {
    tank: A(1, REASON.fighterVsTank), support_tank: A(1, REASON.fighterVsTank),
    marksman: A(1, REASON.brawl), support_enchanter: A(1, REASON.brawl),
    assassin_ad: A(0.5, REASON.tankAbsorbs), assassin_ap: A(0.5, REASON.tankAbsorbs),
    mage: A(-0.5, REASON.kited),
  };
  const MATRIX = {
    assassin_ad: assassinRow,
    assassin_ap: assassinRow,
    fighter: fighterRow,
    fighter_ap: { ...fighterRow, tank: A(1.5, REASON.fighterVsTank) },
    tank: {
      assassin_ad: A(1.5, REASON.tankVsAssassin), assassin_ap: A(1.5, REASON.tankVsAssassin),
      fighter: A(0.5, REASON.tankAbsorbs),
      marksman: A(-1, REASON.kited), mage: A(-1.5, REASON.kited),
    },
    support_tank: {
      assassin_ad: A(1.5, REASON.tankVsAssassin), assassin_ap: A(1.5, REASON.tankVsAssassin),
      support_enchanter: A(1, REASON.engage), marksman: A(0.5, REASON.engage),
    },
    mage: {
      tank: A(1, REASON.mageRange), fighter: A(1, REASON.mageRange), fighter_ap: A(1, REASON.mageRange),
      support_tank: A(1, REASON.mageRange), marksman: A(0.5, REASON.mageRange),
      support_enchanter: A(0.5, REASON.mageRange),
      assassin_ad: A(-1.5, REASON.divedBy), assassin_ap: A(-1.5, REASON.divedBy),
    },
    marksman: {
      tank: A(1.5, REASON.adcShred), fighter: A(0.5, REASON.adcShred), fighter_ap: A(0.5, REASON.adcShred),
      support_enchanter: A(0.5, REASON.mageRange),
      assassin_ad: A(-1.5, REASON.divedBy), assassin_ap: A(-1.5, REASON.divedBy),
    },
    support_enchanter: {
      assassin_ad: A(-1.5, REASON.divedBy), assassin_ap: A(-1.5, REASON.divedBy),
      fighter: A(-1, REASON.divedBy), support_tank: A(-1, REASON.divedBy),
      mage: A(-0.5, REASON.kited),
    },
  };

  const isBurst = (c) =>
    (c.tags || []).includes('Assassin') ||
    ((c.info || {}).magic >= 8 && (c.info || {}).defense <= 4);

  /**
   * attacker が defender にどれだけ有利かを採点する。
   * @returns { score, reason } reason は最も寄与した正の要因
   */
  function score(attacker, defender) {
    const atkArch = Archetypes.detect(attacker);
    const defArch = Archetypes.detect(defender);
    const parts = [];

    const m = (MATRIX[atkArch] || {})[defArch];
    if (m) parts.push({ s: m.s, r: m.r });

    // 回復・サステイン補正
    if (Matchup.SUSTAIN_CHAMPIONS.has(defender.id) && POKE.has(atkArch)) {
      parts.push({ s: -1, r: REASON.pokeIntoSustain });
    }
    if (Matchup.SUSTAIN_CHAMPIONS.has(attacker.id) && POKE.has(defArch)) {
      parts.push({ s: 1, r: REASON.sustainBeatsPoke });
    }
    // バースト vs 柔らかい相手
    if (isBurst(attacker) && (defender.info || {}).defense <= 3) {
      parts.push({ s: 0.4, r: REASON.burstSquishy });
    }
    // 高耐久 vs バースト
    if ((attacker.info || {}).defense >= 8 && isBurst(defender)) {
      parts.push({ s: 0.4, r: REASON.tankAbsorbs });
    }

    const total = parts.reduce((s, p) => s + p.s, 0);
    const positive = parts.filter((p) => p.s > 0).sort((a, b) => b.s - a.s);
    return { score: total, reason: positive.length ? positive[0].r : '' };
  }

  /**
   * 対象チャンピオンのカウンター関係を全チャンピオンから算出する。
   * @returns { threats: 警戒すべき相手 (相手→対象が有利), favorable: 対象が有利な相手 }
   *          各要素 { champ, score, reason } スコア降順
   */
  function analyze(allChamps, target) {
    const others = allChamps.filter((c) => c.id !== target.id);
    const threats = others
      .map((c) => ({ champ: c, ...score(c, target) }))
      .filter((x) => x.score >= 1)
      .sort((a, b) => b.score - a.score);
    const favorable = others
      .map((c) => ({ champ: c, ...score(target, c) }))
      .filter((x) => x.score >= 1)
      .sort((a, b) => b.score - a.score);
    return { threats, favorable };
  }

  return { score, analyze, MATRIX };
})();
