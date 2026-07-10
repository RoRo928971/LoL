/**
 * 対面チャンピオン対策モジュール。
 * 対面のタグ・評価値から「脅威プロファイル」を判定し、
 * 自分のアーキタイプに合った対策アイテムを提案する。
 */
const Matchup = (() => {

  // 回復・サステインが強く、回復阻害が有効な代表的チャンピオン (IDは安定)
  const SUSTAIN_CHAMPIONS = new Set([
    'Aatrox', 'Briar', 'DrMundo', 'Fiddlesticks', 'Illaoi', 'Kayn', 'Maokai',
    'Milio', 'Nami', 'Nasus', 'Nunu', 'Olaf', 'Renata', 'Senna', 'Seraphine',
    'Sona', 'Soraka', 'Swain', 'Sylas', 'Trundle', 'Vladimir', 'Volibear',
    'Warwick', 'Yuumi', 'Zac',
  ]);

  const THREAT_LABELS = {
    physical: '物理ダメージ中心',
    magic: '魔法ダメージ中心',
    sustain: '回復・サステインが強力',
    burst: 'バーストダメージ',
    tanky: '高耐久',
  };

  // 柔らかい(生存アイテムが特に有効な)アーキタイプ
  const SQUISHY = new Set(['marksman', 'mage', 'assassin_ad', 'assassin_ap', 'support_enchanter']);

  // アーキタイプ → 対策アイテムグループ
  const GROUP_OF = {
    marksman: 'marksman',
    mage: 'ap', assassin_ap: 'ap', fighter_ap: 'ap',
    assassin_ad: 'ad', fighter: 'ad',
    tank: 'tank', support_tank: 'tank',
    support_enchanter: 'enchanter',
  };

  /**
   * 対策ニーズの定義。グループごとのアイテムID優先リスト。
   * IDが実データに無い場合は fallbackTag を持つ完成アイテムで代替する。
   */
  const NEEDS = {
    antiheal: {
      label: '回復阻害',
      desc: '重傷効果で対面の回復量を40%カットする',
      byGroup: {
        marksman: [3033, 3123], ad: [3033, 3123],
        ap: [3165, 3916], enchanter: [3165, 3916],
        tank: [3075, 3076],
      },
      fallbackTag: null,
    },
    antitank: {
      label: '対タンク',
      desc: '防御貫通や割合ダメージで高耐久の相手を削る',
      byGroup: {
        marksman: [3036, 3153], ad: [6694, 3071, 3153],
        ap: [3135, 6653], enchanter: [],
        tank: [3153, 3068],
      },
      fallbackTag: { marksman: 'ArmorPenetration', ad: 'ArmorPenetration', ap: 'MagicPenetration' },
    },
    armor: {
      label: '物理防御',
      desc: '物理ダメージを軽減する',
      byGroup: {
        marksman: [3026, 6673, 3143], ad: [6333, 3026, 3071],
        ap: [3157, 3110], enchanter: [3109, 3190],
        tank: [3143, 3110, 3075],
      },
      fallbackTag: { '*': 'Armor' },
    },
    mr: {
      label: '魔法防御',
      desc: '魔法ダメージを軽減する',
      byGroup: {
        marksman: [3139, 3156, 3091], ad: [3156, 3139, 3091],
        ap: [3102, 4629], enchanter: [3222, 3107],
        tank: [3065, 2504, 4401],
      },
      fallbackTag: { '*': 'SpellBlock' },
    },
    survival: {
      label: '生存重視',
      desc: 'バーストで落とされないための保険',
      byGroup: {
        marksman: [3026, 6673], ad: [3026, 6333],
        ap: [3157, 3102], enchanter: [3190, 3107],
        tank: [],
      },
      fallbackTag: null,
    },
  };

  /** 対面チャンピオンの脅威プロファイルを判定する */
  function threatProfile(opponent) {
    const tags = opponent.tags || [];
    const { attack = 5, magic = 5, defense = 5 } = opponent.info || {};
    const threats = [];

    // 回復阻害・対タンクは購入判断への影響が大きいので先頭に置く
    if (SUSTAIN_CHAMPIONS.has(opponent.id)) threats.push('sustain');
    if (tags.includes('Tank') || defense >= 8) threats.push('tanky');

    const physical = tags.includes('Marksman') || (attack >= 6 && attack >= magic);
    const magical = tags.includes('Mage') || (magic >= 6 && magic > attack);
    if (physical) threats.push('physical');
    if (magical) threats.push('magic');
    if (!physical && !magical) threats.push(attack >= magic ? 'physical' : 'magic');

    if (tags.includes('Assassin') || (magic >= 8 && defense <= 4)) threats.push('burst');
    return threats;
  }

  /** ID優先リストから実データに存在するアイテムを最大 max 件解決する */
  function resolveItems(items, ids, max) {
    const out = [];
    for (const id of ids || []) {
      const item = items[id];
      if (item && item.gold && item.gold.purchasable && !(item.maps && item.maps['11'] === false)) {
        out.push({ id: String(id), item });
        if (out.length >= max) break;
      }
    }
    return out;
  }

  /** タグでの代替検索(優先IDが全滅した場合の保険) */
  function fallbackByTag(items, def, tag, max) {
    return Object.entries(items)
      .filter(([, it]) => Recommend.isCompletedItem(it) && (it.tags || []).includes(tag))
      .map(([id, it]) => ({ id, item: it, score: (it.gold && it.gold.total) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(({ id, item }) => ({ id, item }));
  }

  /**
   * 脅威プロファイルに応じた対策アイテムのリストを組み立てる。
   * @returns [{ need, label, desc, entries: [{id, item}] }]
   */
  function counterItems(items, archetypeKey, threats) {
    const group = GROUP_OF[archetypeKey] || 'ad';
    const needKeys = [];
    for (const threat of threats) {
      if (threat === 'sustain') needKeys.push('antiheal');
      else if (threat === 'tanky') needKeys.push('antitank');
      else if (threat === 'physical') needKeys.push('armor');
      else if (threat === 'magic') needKeys.push('mr');
      else if (threat === 'burst' && SQUISHY.has(archetypeKey)) needKeys.push('survival');
    }

    const result = [];
    const usedIds = new Set();
    for (const key of [...new Set(needKeys)]) {
      const need = NEEDS[key];
      let entries = resolveItems(items, need.byGroup[group], 2)
        .filter((e) => !usedIds.has(e.id));
      if (entries.length === 0 && need.fallbackTag) {
        const tag = need.fallbackTag[group] || need.fallbackTag['*'];
        if (tag) entries = fallbackByTag(items, null, tag, 2).filter((e) => !usedIds.has(e.id));
      }
      if (entries.length === 0) continue;
      entries.forEach((e) => usedIds.add(e.id));
      result.push({ need: key, label: need.label, desc: need.desc, entries });
    }
    return result;
  }

  return { threatProfile, counterItems, THREAT_LABELS, SUSTAIN_CHAMPIONS };
})();
