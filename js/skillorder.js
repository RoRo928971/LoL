/**
 * スキル上げ順(スキルオーダー)モジュール。
 *
 * Data Dragon にはスキルオーダー情報が無いため、
 * 定番チャンピオンの一般的な推奨オーダーを収録している。
 * 未収録のチャンピオンは汎用の目安(Q>E>W)にフォールバックし、
 * UI上で「推定」であることを明示する。
 */
const SkillOrder = (() => {

  // チャンピオンID → スキルを上げ切る優先順 (Rは Lv6/11/16 で自動的に最優先)
  const CURATED = {
    Aatrox: ['Q', 'E', 'W'],
    Ahri: ['Q', 'W', 'E'],
    Akali: ['Q', 'E', 'W'],
    Alistar: ['Q', 'E', 'W'],
    Amumu: ['E', 'W', 'Q'],
    Annie: ['Q', 'W', 'E'],
    Ashe: ['Q', 'W', 'E'],
    AurelionSol: ['Q', 'W', 'E'],
    Azir: ['W', 'Q', 'E'],
    Bard: ['Q', 'W', 'E'],
    Blitzcrank: ['Q', 'E', 'W'],
    Brand: ['W', 'Q', 'E'],
    Braum: ['Q', 'E', 'W'],
    Caitlyn: ['Q', 'W', 'E'],
    Camille: ['Q', 'W', 'E'],
    Cassiopeia: ['E', 'Q', 'W'],
    Darius: ['Q', 'W', 'E'],
    Diana: ['Q', 'W', 'E'],
    DrMundo: ['Q', 'E', 'W'],
    Draven: ['Q', 'W', 'E'],
    Ekko: ['Q', 'E', 'W'],
    Ezreal: ['Q', 'W', 'E'],
    Fiddlesticks: ['W', 'Q', 'E'],
    Fiora: ['Q', 'E', 'W'],
    Galio: ['Q', 'W', 'E'],
    Gangplank: ['Q', 'E', 'W'],
    Garen: ['E', 'Q', 'W'],
    Gnar: ['Q', 'W', 'E'],
    Gragas: ['Q', 'E', 'W'],
    Graves: ['Q', 'E', 'W'],
    Gwen: ['Q', 'E', 'W'],
    Illaoi: ['Q', 'W', 'E'],
    Irelia: ['Q', 'E', 'W'],
    JarvanIV: ['Q', 'E', 'W'],
    Jhin: ['Q', 'W', 'E'],
    Jinx: ['Q', 'W', 'E'],
    Kaisa: ['Q', 'E', 'W'],
    Karma: ['Q', 'E', 'W'],
    Karthus: ['Q', 'E', 'W'],
    Kassadin: ['Q', 'E', 'W'],
    Kayn: ['Q', 'W', 'E'],
    Kennen: ['Q', 'W', 'E'],
    Khazix: ['Q', 'W', 'E'],
    Kindred: ['Q', 'W', 'E'],
    Kled: ['Q', 'E', 'W'],
    LeeSin: ['Q', 'W', 'E'],
    Lissandra: ['Q', 'E', 'W'],
    Lux: ['Q', 'E', 'W'],
    MasterYi: ['Q', 'E', 'W'],
    MissFortune: ['Q', 'W', 'E'],
    MonkeyKing: ['Q', 'E', 'W'],   // ウーコン
    Mordekaiser: ['Q', 'E', 'W'],
    Morgana: ['Q', 'W', 'E'],
    Nami: ['W', 'E', 'Q'],
    Nasus: ['Q', 'E', 'W'],
    Neeko: ['Q', 'E', 'W'],
    Nocturne: ['Q', 'E', 'W'],
    Olaf: ['Q', 'E', 'W'],
    Orianna: ['Q', 'W', 'E'],
    Pantheon: ['Q', 'E', 'W'],
    Poppy: ['Q', 'W', 'E'],
    Qiyana: ['Q', 'E', 'W'],
    Renekton: ['Q', 'W', 'E'],
    Rengar: ['Q', 'W', 'E'],
    Riven: ['Q', 'E', 'W'],
    Rumble: ['Q', 'E', 'W'],
    Ryze: ['Q', 'E', 'W'],
    Samira: ['Q', 'E', 'W'],
    Senna: ['Q', 'W', 'E'],
    Sett: ['Q', 'W', 'E'],
    Sivir: ['Q', 'W', 'E'],
    Smolder: ['Q', 'W', 'E'],
    Sona: ['Q', 'W', 'E'],
    Soraka: ['W', 'Q', 'E'],
    Swain: ['Q', 'E', 'W'],
    Sylas: ['Q', 'W', 'E'],
    Syndra: ['Q', 'W', 'E'],
    Taliyah: ['Q', 'W', 'E'],
    Talon: ['Q', 'W', 'E'],
    Teemo: ['E', 'Q', 'W'],
    Trundle: ['Q', 'W', 'E'],
    Tryndamere: ['Q', 'E', 'W'],
    Vayne: ['Q', 'W', 'E'],
    Veigar: ['Q', 'W', 'E'],
    Velkoz: ['Q', 'W', 'E'],
    Vex: ['Q', 'E', 'W'],
    Vi: ['Q', 'E', 'W'],
    Viktor: ['E', 'Q', 'W'],
    Vladimir: ['Q', 'E', 'W'],
    Warwick: ['Q', 'W', 'E'],
    Xayah: ['Q', 'W', 'E'],
    Xerath: ['Q', 'W', 'E'],
    XinZhao: ['W', 'Q', 'E'],
    Yasuo: ['Q', 'E', 'W'],
    Yone: ['Q', 'W', 'E'],
    Yorick: ['Q', 'E', 'W'],
    Zac: ['W', 'Q', 'E'],
    Zed: ['Q', 'E', 'W'],
    Zoe: ['Q', 'E', 'W'],
  };

  // スキルシステムが特殊で、通常のオーダー表示が意味を持たないチャンピオン
  const SPECIAL = {
    Aphelios: 'アフェリオスはスキルではなくステータス(攻撃力/攻撃速度/脅威)をレベルアップで強化する特殊なチャンピオンです。',
    Elise: '変身型チャンピオンのため R(変身)はレベル1で習得します。人間形態のスキルを Q > W > E の目安で上げましょう。',
    Jayce: '変身型チャンピオンのため R(変身)はレベル1で習得します。Q > W > E の目安で上げましょう。',
    Nidalee: '変身型チャンピオンのため R(変身)はレベル1で習得します。Q > E > W の目安で上げましょう。',
    Udyr: 'ウディアは4つのスキルを自由な順で強化できる特殊なチャンピオンです。主軸スキル2つを交互に上げるのが一般的です。',
  };

  /**
   * @returns {{ special: string } | { order: string[], curated: boolean }}
   */
  function get(championId) {
    if (SPECIAL[championId]) return { special: SPECIAL[championId] };
    const curated = CURATED[championId];
    if (curated) return { order: curated, curated: true };
    // 未収録: 多くのチャンピオンに当てはまる汎用の目安
    return { order: ['Q', 'E', 'W'], curated: false };
  }

  return { get };
})();
