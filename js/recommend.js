/**
 * ルーン構成・アイテムビルドの推薦エンジン。
 *
 * パッチによるルーン/アイテムの入れ替わりに耐えるため、
 * ID直指定ではなく「優先リスト + 実データとの突き合わせ」と
 * 「タグ/ステータスの動的スコアリング」で構成する。
 */
const Recommend = (() => {

  // ---------------- ルーン推薦 ----------------

  function findTree(runeTrees, treeId) {
    return runeTrees.find((t) => t.id === treeId) || runeTrees[0];
  }

  /** slot(ルーン一行)の中から優先リスト順に存在するルーンを選ぶ。無ければ先頭 */
  function pickFromSlot(slot, preferredIds) {
    for (const id of preferredIds) {
      const rune = slot.runes.find((r) => r.id === id);
      if (rune) return rune;
    }
    return slot.runes[0];
  }

  /**
   * アーキタイプ定義からルーンページを組み立てる。
   * @returns {{ primaryTree, keystone, primaryRunes: [r,r,r], secondaryTree, secondaryRunes: [r,r], shards: string[] }}
   */
  function buildRunePage(runeTrees, def) {
    const spec = def.runes;
    const primaryTree = findTree(runeTrees, spec.primary.tree);
    const keystone = pickFromSlot(primaryTree.slots[0], spec.primary.keystone);
    const primaryRunes = spec.primary.slots.map((prefs, i) =>
      pickFromSlot(primaryTree.slots[i + 1], prefs)
    );

    const secondaryTree = findTree(runeTrees, spec.secondary.tree);
    // サブツリーは異なる行から2つ。優先リスト順に走査し、行が被らないように選ぶ
    const minorSlots = secondaryTree.slots.slice(1);
    const chosen = [];
    const usedRows = new Set();
    for (const id of spec.secondary.picks) {
      if (chosen.length >= 2) break;
      minorSlots.forEach((slot, row) => {
        if (chosen.length >= 2 || usedRows.has(row)) return;
        const rune = slot.runes.find((r) => r.id === id);
        if (rune) { chosen.push(rune); usedRows.add(row); }
      });
    }
    // 足りなければ空いている行の先頭で埋める
    minorSlots.forEach((slot, row) => {
      if (chosen.length < 2 && !usedRows.has(row)) {
        chosen.push(slot.runes[0]);
        usedRows.add(row);
      }
    });

    return { primaryTree, keystone, primaryRunes, secondaryTree, secondaryRunes: chosen, shards: def.shards };
  }

  // ---------------- アイテム推薦 ----------------

  /** サモナーズリフトで購入できる完成アイテムか */
  function isCompletedItem(item) {
    if (!item.gold || !item.gold.purchasable) return false;
    if (item.maps && item.maps['11'] === false) return false;
    if (item.inStore === false) return false;
    if (item.requiredChampion || item.requiredAlly) return false;
    const tags = item.tags || [];
    if (tags.includes('Consumable') || tags.includes('Trinket') || tags.includes('Jungle') || tags.includes('Lane')) return false;
    if (tags.includes('Boots')) return false;                 // ブーツは別枠で選ぶ
    if (item.into && item.into.length > 0) return false;      // さらに進化するものは未完成
    if (item.gold.total < 1600) return false;                 // 小物を除外
    if (!item.description || /オーンの/.test(item.name || '')) return false;
    return true;
  }

  function isCompletedBoots(item) {
    const tags = item.tags || [];
    if (!tags.includes('Boots')) return false;
    if (!item.gold || !item.gold.purchasable) return false;
    if (item.maps && item.maps['11'] === false) return false;
    if (item.into && item.into.length > 0) return false;
    return item.gold.total >= 800;
  }

  /** アーキタイプの重みでアイテムを採点する */
  function scoreItem(item, def, itemId) {
    let score = 0;
    const w = def.itemWeights;
    for (const tag of item.tags || []) {
      if (w.tags[tag]) score += w.tags[tag];
    }
    for (const [stat, weight] of Object.entries(w.stats)) {
      const v = (item.stats || {})[stat];
      if (v) score += v * weight;
    }
    if (def.curatedBoost && def.curatedBoost[itemId]) score += def.curatedBoost[itemId];
    // 高額アイテムほどビルドの主軸になりやすいので軽く加点
    score += Math.min(item.gold.total, 3600) / 400;
    return score;
  }

  /**
   * アイテムビルド一式を組み立てる。
   * @returns {{ starters, boots, core, situational }} 各要素は {id, item} の配列
   */
  function buildItemSet(items, def) {
    const entries = Object.entries(items);

    const starters = def.starters
      .filter((id) => items[id])
      .map((id) => ({ id: String(id), item: items[id] }));

    // ブーツ: 優先リスト順、無ければタグスコア最高のもの
    let boots = null;
    for (const id of def.bootsPref) {
      if (items[id] && isCompletedBoots(items[id])) { boots = { id: String(id), item: items[id] }; break; }
    }
    if (!boots) {
      const candidates = entries.filter(([, it]) => isCompletedBoots(it));
      if (candidates.length) {
        candidates.sort((a, b) => scoreItem(b[1], def, b[0]) - scoreItem(a[1], def, a[0]));
        boots = { id: candidates[0][0], item: candidates[0][1] };
      }
    }

    // 完成アイテムをスコア順に並べ、名前重複(色違い等)を除いて上位を採用
    const ranked = entries
      .filter(([, it]) => isCompletedItem(it))
      .map(([id, it]) => ({ id, item: it, score: scoreItem(it, def, id) }))
      .sort((a, b) => b.score - a.score);

    const seen = new Set();
    const unique = ranked.filter(({ item }) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });

    return {
      starters,
      boots,
      core: unique.slice(0, 3),
      situational: unique.slice(3, 9),
    };
  }

  /** ビルド全体の合計ゴールドを計算する */
  function totalGold(itemSet) {
    let total = 0;
    for (const e of itemSet.starters) total += e.item.gold.total;
    if (itemSet.boots) total += itemSet.boots.item.gold.total;
    for (const e of itemSet.core) total += e.item.gold.total;
    return total;
  }

  return { buildRunePage, buildItemSet, totalGold, isCompletedItem };
})();
