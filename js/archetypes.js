/**
 * チャンピオンの「アーキタイプ」(戦い方の型)の定義。
 *
 * ルーンIDやアイテムIDはパッチによって追加・削除されるため、
 * ここでは「優先順リスト」として持ち、実行時に Data Dragon 上に
 * 存在するものだけを採用する(recommend.js 参照)。
 */
const Archetypes = (() => {

  // ルーンツリーID(安定): 8000=栄華 8100=覇道 8200=魔道 8300=天啓 8400=不滅
  const PRECISION = 8000, DOMINATION = 8100, SORCERY = 8200, INSPIRATION = 8300, RESOLVE = 8400;

  /**
   * 各アーキタイプの定義。
   * - label: UI表示名
   * - runes: primary(メインツリー)/ secondary(サブツリー)のルーンID優先リスト
   *   keystone: キーストーン候補、slots: 下段3列それぞれの候補
   *   secondary.picks: サブツリーから2つ選ぶ候補(先頭から存在するもの順)
   * - shards: ステータスシャード(表示テキスト)
   * - itemWeights: アイテムのタグ・ステータスへの重み(動的スコアリング用)
   * - starters: スタートアイテムID候補
   * - bootsPref: ブーツID優先リスト
   * - curatedBoost: 定番アイテムIDへの加点(存在しないIDは無視される)
   */
  const DEFS = {
    marksman: {
      label: 'マークスマン (ADC)',
      runes: {
        primary: {
          tree: PRECISION,
          keystone: [8008, 8005, 8021],                 // リーサルテンポ > プレスアタック > フリートフットワーク
          slots: [
            [9101, 9111, 8009],                         // アブソーブライフ / 凱旋 / 冷静沈着
            [9104, 9103, 9105],                         // レジェンド: 迅速 / 血脈 / 気迫
            [8014, 8017, 8299],                         // 最期の慈悲 / 切り崩し / 背水の陣
          ],
        },
        secondary: { tree: SORCERY, picks: [8233, 8236, 8210, 8226] }, // 至高 / 強まる嵐 / 気迫
      },
      shards: ['攻撃速度', '適応攻撃力', '体力(スケール)'],
      itemWeights: {
        tags: { CriticalStrike: 30, Damage: 18, AttackSpeed: 14, LifeSteal: 10, ArmorPenetration: 8, OnHit: 8 },
        stats: { FlatPhysicalDamageMod: 0.25, FlatCritChanceMod: 60, PercentAttackSpeedMod: 40, PercentLifeStealMod: 30 },
      },
      starters: [1055, 2003],
      bootsPref: [3006, 3009, 3111],
      curatedBoost: { 6672: 25, 3031: 25, 3036: 15, 3072: 12, 3094: 12, 6673: 10, 3046: 10, 3033: 8, 3026: 8 },
    },

    mage: {
      label: 'メイジ',
      runes: {
        primary: {
          tree: SORCERY,
          keystone: [8229, 8214, 8230],                 // 秘儀の彗星 > エアリー > フェイズラッシュ
          slots: [
            [8226, 8224, 8275],                         // マナフローバンド
            [8210, 8233, 8234],                         // 至高
            [8237, 8236, 8232],                         // 追い火 / 強まる嵐
          ],
        },
        secondary: { tree: INSPIRATION, picks: [8304, 8347, 8321, 8352] }, // 魔法の靴 / 宇宙の英知
      },
      shards: ['適応攻撃力', '適応攻撃力', '体力(スケール)'],
      itemWeights: {
        tags: { SpellDamage: 30, Mana: 10, ManaRegen: 8, CooldownReduction: 10, MagicPenetration: 14, AbilityHaste: 10 },
        stats: { FlatMagicDamageMod: 0.5, FlatMPPoolMod: 0.01 },
      },
      starters: [1056, 2003],
      bootsPref: [3020, 3158, 3111],
      curatedBoost: { 6655: 25, 3089: 25, 4645: 15, 6653: 12, 3157: 12, 4628: 12, 3135: 10, 3116: 8, 3102: 8 },
    },

    assassin_ad: {
      label: 'アサシン (物理)',
      runes: {
        primary: {
          tree: DOMINATION,
          keystone: [8112, 9923, 8128],                 // 電撃 > ヘイルブレード > 魂の収穫
          slots: [
            [8143, 8139, 8126],                         // 突然の衝撃 / 血の味わい
            [8137, 8140, 8141],                         // シックスセンス 等 (パッチにより変動)
            [8135, 8105, 8106],                         // お宝ハンター / 執拗なハンター / アルティメットハンター
          ],
        },
        secondary: { tree: PRECISION, picks: [9111, 8014, 8009, 8299] }, // 凱旋 / 最期の慈悲
      },
      shards: ['適応攻撃力', '適応攻撃力', '体力'],
      itemWeights: {
        tags: { Damage: 25, ArmorPenetration: 30, CooldownReduction: 12, AbilityHaste: 12, Active: 6, NonbootsMovement: 8 },
        stats: { FlatPhysicalDamageMod: 0.35, FlatMovementSpeedMod: 2 },
      },
      starters: [1055, 2003],
      bootsPref: [3158, 3047, 3111],
      curatedBoost: { 6692: 25, 6697: 20, 6701: 20, 3142: 18, 6695: 15, 6694: 15, 3814: 12, 6676: 10, 3156: 8 },
    },

    assassin_ap: {
      label: 'アサシン (魔法)',
      runes: {
        primary: {
          tree: DOMINATION,
          keystone: [8112, 8128, 9923],                 // 電撃 > 魂の収穫
          slots: [
            [8143, 8139, 8126],
            [8137, 8140, 8141],
            [8106, 8135, 8105],                         // アルティメットハンター
          ],
        },
        secondary: { tree: SORCERY, picks: [8210, 8226, 8233, 8237] },
      },
      shards: ['適応攻撃力', '適応攻撃力', '体力'],
      itemWeights: {
        tags: { SpellDamage: 30, MagicPenetration: 25, CooldownReduction: 10, AbilityHaste: 10 },
        stats: { FlatMagicDamageMod: 0.5, FlatMovementSpeedMod: 2 },
      },
      starters: [1056, 2003],
      bootsPref: [3020, 3158, 3111],
      curatedBoost: { 4645: 25, 3152: 20, 6655: 18, 3089: 18, 3157: 15, 4630: 12, 3135: 12, 4628: 10 },
    },

    fighter: {
      label: 'ファイター (物理)',
      runes: {
        primary: {
          tree: PRECISION,
          keystone: [8010, 8008, 8021],                 // 征服者 > リーサルテンポ
          slots: [
            [9111, 9101, 8009],                         // 凱旋
            [9104, 9105, 9103],                         // レジェンド: 迅速 / 気迫
            [8299, 8014, 8017],                         // 背水の陣
          ],
        },
        secondary: { tree: RESOLVE, picks: [8444, 8473, 8451, 8242] },  // セカンドウィンド / ボーンアーマー / 超成長
      },
      shards: ['適応攻撃力', '適応攻撃力', '体力(スケール)'],
      itemWeights: {
        tags: { Damage: 22, Health: 14, CooldownReduction: 12, AbilityHaste: 12, LifeSteal: 8, SpellVamp: 6, AttackSpeed: 8 },
        stats: { FlatPhysicalDamageMod: 0.25, FlatHPPoolMod: 0.03, PercentAttackSpeedMod: 15 },
      },
      starters: [1054, 2003],
      bootsPref: [3047, 3111, 3006],
      curatedBoost: { 3078: 25, 6631: 20, 3071: 20, 3053: 15, 6333: 12, 3748: 12, 3156: 10, 3161: 10, 6610: 10, 3153: 10 },
    },

    fighter_ap: {
      label: 'ファイター (魔法)',
      runes: {
        primary: {
          tree: PRECISION,
          keystone: [8010, 8021, 8005],                 // 征服者
          slots: [
            [9111, 8009, 9101],
            [9105, 9104, 9103],
            [8299, 8014, 8017],
          ],
        },
        secondary: { tree: RESOLVE, picks: [8444, 8473, 8451, 8429] },
      },
      shards: ['適応攻撃力', '適応攻撃力', '体力(スケール)'],
      itemWeights: {
        tags: { SpellDamage: 25, Health: 16, CooldownReduction: 12, AbilityHaste: 12, SpellVamp: 10 },
        stats: { FlatMagicDamageMod: 0.4, FlatHPPoolMod: 0.04 },
      },
      starters: [1056, 2003],
      bootsPref: [3020, 3111, 3047],
      curatedBoost: { 4633: 25, 6653: 22, 3115: 15, 4629: 12, 3157: 10, 3089: 10, 3151: 12 },
    },

    tank: {
      label: 'タンク',
      runes: {
        primary: {
          tree: RESOLVE,
          keystone: [8437, 8439, 8465],                 // 握撃 > 余震 > ガーディアン
          slots: [
            [8446, 8401, 8463],                         // 打ちこわし
            [8429, 8444, 8473],                         // 心身調整 / セカンドウィンド
            [8451, 8242, 8453],                         // 超成長
          ],
        },
        secondary: { tree: PRECISION, picks: [9111, 9105, 8009, 8017] },
      },
      shards: ['適応攻撃力', '体力(スケール)', '体力(スケール)'],
      itemWeights: {
        tags: { Health: 20, Armor: 18, SpellBlock: 18, HealthRegen: 6, CooldownReduction: 8, AbilityHaste: 8, Aura: 6 },
        stats: { FlatHPPoolMod: 0.035, FlatArmorMod: 1.2, FlatSpellBlockMod: 1.2 },
      },
      starters: [1054, 2003],
      bootsPref: [3047, 3111, 3009],
      curatedBoost: { 3084: 25, 3068: 20, 6665: 18, 3075: 15, 2504: 15, 3110: 12, 3193: 12, 4401: 12, 3065: 12, 8020: 10 },
    },

    support_enchanter: {
      label: 'サポート (エンチャンター)',
      runes: {
        primary: {
          tree: SORCERY,
          keystone: [8214, 8229, 8230],                 // エアリー
          slots: [
            [8226, 8224, 8275],
            [8210, 8234, 8233],
            [8237, 8236, 8232],
          ],
        },
        secondary: { tree: RESOLVE, picks: [8463, 8453, 8444, 8473] },  // 生命の泉 / 生気付与
      },
      shards: ['適応攻撃力', '体力(スケール)', '体力(スケール)'],
      itemWeights: {
        tags: { GoldPer: 10, ManaRegen: 14, CooldownReduction: 14, AbilityHaste: 14, SpellDamage: 8, Health: 6, Aura: 10, Active: 8 },
        stats: { FlatMagicDamageMod: 0.15, FlatHPPoolMod: 0.02 },
      },
      starters: [3865, 2003],
      bootsPref: [3158, 3009, 3111],
      curatedBoost: { 6617: 25, 6620: 22, 3504: 20, 6616: 18, 3107: 15, 3222: 12, 3190: 12, 2065: 12, 3011: 8 },
    },

    support_tank: {
      label: 'サポート (タンク)',
      runes: {
        primary: {
          tree: RESOLVE,
          keystone: [8439, 8465, 8437],                 // 余震 > ガーディアン
          slots: [
            [8463, 8401, 8446],
            [8429, 8444, 8473],
            [8242, 8453, 8451],
          ],
        },
        secondary: { tree: INSPIRATION, picks: [8306, 8304, 8316, 8321] }, // ヘクステックフラッシュ / 魔法の靴
      },
      shards: ['適応攻撃力', '体力(スケール)', '体力(スケール)'],
      itemWeights: {
        tags: { Health: 18, Armor: 14, SpellBlock: 14, GoldPer: 10, Aura: 12, Active: 10, CooldownReduction: 10, AbilityHaste: 10 },
        stats: { FlatHPPoolMod: 0.035, FlatArmorMod: 1, FlatSpellBlockMod: 1 },
      },
      starters: [3865, 2003],
      bootsPref: [3111, 3047, 3009],
      curatedBoost: { 3190: 25, 3109: 20, 3050: 18, 3107: 12, 4401: 12, 3075: 8, 2065: 15 },
    },
  };

  /**
   * チャンピオンのタグとステータス評価からアーキタイプを推定する。
   * ユーザーはUI上で手動で変更できる(あくまで初期値)。
   */
  function detect(champion) {
    const tags = champion.tags || [];
    const info = champion.info || { attack: 5, magic: 5, defense: 5 };
    const has = (t) => tags.includes(t);
    const magicLeaning = info.magic > info.attack;

    if (has('Marksman')) return 'marksman';
    // 第1タグが Mage のチャンピオン (ラックス・モルガナ等) はメイジとして扱う
    if (has('Support') && tags[0] !== 'Mage') {
      // タンク/ファイター寄りのサポートはエンゲージ型とみなす
      if (has('Tank') || has('Fighter') || info.defense >= 7) return 'support_tank';
      return 'support_enchanter';
    }
    if (has('Assassin')) return magicLeaning ? 'assassin_ap' : 'assassin_ad';
    // Fighter/Tank を両方持つ場合は第1タグ(メインの役割)を優先する
    if (tags[0] === 'Fighter') return magicLeaning ? 'fighter_ap' : 'fighter';
    if (has('Tank')) return 'tank';
    if (has('Fighter')) return magicLeaning ? 'fighter_ap' : 'fighter';
    if (has('Mage')) return 'mage';
    return magicLeaning ? 'mage' : 'fighter';
  }

  return { DEFS, detect };
})();
