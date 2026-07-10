/**
 * Data Dragon (Riot公式静的API) からのデータ取得を担当するモジュール。
 * APIキー不要・CORS対応のため、ブラウザから直接取得できる。
 */
const DDragon = (() => {
  const BASE = 'https://ddragon.leagueoflegends.com';
  const LOCALE = 'ja_JP';
  const FALLBACK_LOCALE = 'en_US';

  const state = {
    version: null,
    champions: null,      // { [id]: championSummary }
    items: null,          // { [itemId]: item }
    runeTrees: null,      // runesReforged.json の配列
    championDetail: {},   // { [id]: fullChampionData } キャッシュ
  };

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  }

  async function fetchLocalized(path) {
    try {
      return await fetchJson(`${BASE}/cdn/${state.version}/data/${LOCALE}/${path}`);
    } catch (e) {
      // 日本語データが取得できない場合は英語にフォールバック
      return fetchJson(`${BASE}/cdn/${state.version}/data/${FALLBACK_LOCALE}/${path}`);
    }
  }

  /** 最新パッチのチャンピオン・アイテム・ルーンデータを一括ロードする */
  async function load() {
    const versions = await fetchJson(`${BASE}/api/versions.json`);
    state.version = versions[0];

    const [champJson, itemJson, runesJson] = await Promise.all([
      fetchLocalized('champion.json'),
      fetchLocalized('item.json'),
      fetchLocalized('runesReforged.json'),
    ]);

    state.champions = champJson.data;
    state.items = itemJson.data;
    state.runeTrees = runesJson;
    return state;
  }

  /** チャンピオンの詳細(スキル・パッシブ等)を取得する。取得結果はキャッシュされる */
  async function loadChampionDetail(championId) {
    if (!state.championDetail[championId]) {
      const json = await fetchLocalized(`champion/${championId}.json`);
      state.championDetail[championId] = json.data[championId];
    }
    return state.championDetail[championId];
  }

  // ---- 画像URLヘルパー ----
  const championIcon = (c) => `${BASE}/cdn/${state.version}/img/champion/${c.image.full}`;
  const championSplash = (id, skin = 0) => `${BASE}/cdn/img/champion/splash/${id}_${skin}.jpg`;
  const championLoading = (id, skin = 0) => `${BASE}/cdn/img/champion/loading/${id}_${skin}.jpg`;
  const itemIcon = (itemId) => `${BASE}/cdn/${state.version}/img/item/${itemId}.png`;
  const spellIcon = (spell) => `${BASE}/cdn/${state.version}/img/spell/${spell.image.full}`;
  const passiveIcon = (passive) => `${BASE}/cdn/${state.version}/img/passive/${passive.image.full}`;
  const runeIcon = (iconPath) => `${BASE}/cdn/img/${iconPath}`;

  return {
    state, load, loadChampionDetail,
    championIcon, championSplash, championLoading,
    itemIcon, spellIcon, passiveIcon, runeIcon,
  };
})();
