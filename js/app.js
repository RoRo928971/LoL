/**
 * UI・画面遷移(ハッシュルーター)を担当するメインモジュール。
 * ビュー: #/champions(一覧) #/champion/:id(詳細) #/items(図鑑) #/runes(図鑑)
 */
(() => {
  const main = document.getElementById('main');
  const ROLE_TAGS = [
    ['Fighter', 'ファイター'], ['Tank', 'タンク'], ['Mage', 'メイジ'],
    ['Assassin', 'アサシン'], ['Marksman', 'マークスマン'], ['Support', 'サポート'],
  ];
  const ui = { champSearch: '', champRole: '', itemSearch: '', opponentId: '', counterRole: '' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  // Data Dragon の説明文は Riot 独自タグを含むHTML。タグを落としてテキスト化する
  const stripTags = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
  const gold = (n) => `${n.toLocaleString()} G`;

  // ---------------- ルーター ----------------

  function route() {
    const hash = location.hash || '#/champions';
    const [, view, param] = hash.split('/');
    const tabView = view === 'champion' ? 'champions' : view === 'review' ? 'mydata' : view;
    document.querySelectorAll('#nav-tabs .tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === tabView);
    });
    if (view === 'champion' && param) renderChampionDetail(decodeURIComponent(param));
    else if (view === 'items') renderItems();
    else if (view === 'runes') renderRunes();
    else if (view === 'mydata') renderMyData();
    else if (view === 'planner') renderPlanner();
    else if (view === 'review' && param) renderReview(decodeURIComponent(param));
    else renderChampions();
  }

  // ---------------- チャンピオン一覧 ----------------

  function renderChampions() {
    const champs = Object.values(DDragon.state.champions);
    main.innerHTML = `
      <section class="toolbar">
        <input type="search" id="champ-search" placeholder="チャンピオン名で検索…" value="${esc(ui.champSearch)}">
        <div class="chips" id="role-chips">
          <button class="chip ${ui.champRole === '' ? 'on' : ''}" data-role="">すべて</button>
          ${ROLE_TAGS.map(([tag, label]) =>
            `<button class="chip ${ui.champRole === tag ? 'on' : ''}" data-role="${tag}">${label}</button>`).join('')}
        </div>
      </section>
      <section class="champ-grid" id="champ-grid"></section>`;

    const grid = document.getElementById('champ-grid');
    const draw = () => {
      const q = ui.champSearch.trim().toLowerCase();
      const filtered = champs.filter((c) => {
        const hit = !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
        const role = !ui.champRole || (c.tags || []).includes(ui.champRole);
        return hit && role;
      });
      grid.innerHTML = filtered.map((c) => `
        <a class="champ-card" href="#/champion/${encodeURIComponent(c.id)}">
          <img loading="lazy" src="${DDragon.championIcon(c)}" alt="${esc(c.name)}">
          <span class="champ-name">${esc(c.name)}</span>
          <span class="champ-title">${esc(c.title)}</span>
        </a>`).join('') || '<p class="empty">該当するチャンピオンがいません。</p>';
    };

    document.getElementById('champ-search').addEventListener('input', (e) => {
      ui.champSearch = e.target.value; draw();
    });
    document.getElementById('role-chips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      ui.champRole = btn.dataset.role;
      document.querySelectorAll('#role-chips .chip').forEach((b) => b.classList.toggle('on', b === btn));
      draw();
    });
    draw();
  }

  // ---------------- チャンピオン詳細(ビルド推薦) ----------------

  async function renderChampionDetail(championId) {
    const summary = DDragon.state.champions[championId];
    if (!summary) { location.hash = '#/champions'; return; }

    main.innerHTML = '<div class="loading"><div class="spinner"></div><p>チャンピオン情報を取得中…</p></div>';
    let detail = null;
    try { detail = await DDragon.loadChampionDetail(championId); } catch (e) { /* スキル表示のみ省略 */ }

    let archetypeKey = Archetypes.detect(summary);

    const allChamps = Object.values(DDragon.state.champions)
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    const draw = () => {
      const def = Archetypes.DEFS[archetypeKey];
      const runePage = Recommend.buildRunePage(DDragon.state.runeTrees, def);
      const itemSet = Recommend.buildItemSet(DDragon.state.items, def);

      const opponent = ui.opponentId ? DDragon.state.champions[ui.opponentId] : null;
      const threats = opponent ? Matchup.threatProfile(opponent) : [];
      const counters = opponent ? Matchup.counterItems(DDragon.state.items, archetypeKey, threats) : [];

      main.innerHTML = `
        <section class="champ-hero" style="background-image:
          linear-gradient(to right, rgba(8,12,20,.95) 25%, rgba(8,12,20,.55)),
          url('${DDragon.championSplash(championId)}')">
          <div class="hero-inner">
            <a class="back-link" href="#/champions">← 一覧へ戻る</a>
            <h2>${esc(summary.name)} <small>${esc(summary.title)}</small></h2>
            <div class="tag-row">${(summary.tags || []).map((t) => {
              const jp = ROLE_TAGS.find(([tag]) => tag === t);
              return `<span class="tag">${jp ? jp[1] : esc(t)}</span>`;
            }).join('')}</div>
            <div class="info-bars">
              ${infoBar('攻撃', summary.info.attack, 'bar-ad')}
              ${infoBar('魔法', summary.info.magic, 'bar-ap')}
              ${infoBar('耐久', summary.info.defense, 'bar-def')}
              ${infoBar('難易度', summary.info.difficulty, 'bar-diff')}
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3>おすすめビルド</h3>
            <div class="build-controls">
              <label class="archetype-select">プレイスタイル:
                <select id="archetype-select">
                  ${Object.entries(Archetypes.DEFS).map(([key, d]) =>
                    `<option value="${key}" ${key === archetypeKey ? 'selected' : ''}>${d.label}</option>`).join('')}
                </select>
              </label>
              <label class="archetype-select">対面:
                <select id="opponent-select">
                  <option value="">選択なし</option>
                  ${allChamps.map((c) =>
                    `<option value="${esc(c.id)}" ${c.id === ui.opponentId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                </select>
              </label>
            </div>
          </div>
          ${opponent ? `
            <div class="matchup-bar">
              <img src="${DDragon.championIcon(opponent)}" alt="">
              <span class="matchup-name">vs ${esc(opponent.name)}</span>
              ${threats.map((t) => `<span class="threat-chip threat-${t}">${Matchup.THREAT_LABELS[t]}</span>`).join('')}
            </div>` : ''}

          <div class="build-grid">
            <div class="build-col">
              <h4>ルーン構成</h4>
              ${runePageHtml(runePage)}
            </div>
            <div class="build-col">
              <h4>アイテムビルド</h4>
              ${itemSetHtml(itemSet)}
              ${counters.length ? `
                <h4 class="counter-head">対面対策アイテム <small>(vs ${esc(opponent.name)})</small></h4>
                ${counters.map((c) => `
                  <div class="item-group">
                    <span class="group-label"><span class="need-tag">${esc(c.label)}</span> ${esc(c.desc)}</span>
                    <div class="item-row">${c.entries.map(itemChip).join('')}</div>
                  </div>`).join('')}` : ''}
            </div>
          </div>
        </section>

        ${countersPanelHtml(Counters.analyze(allChamps, summary))}
        ${combosHtml(championId, detail, archetypeKey)}
        ${skillOrderHtml(championId, detail)}
        ${detail ? spellsHtml(detail) : ''}`;

      document.getElementById('archetype-select').addEventListener('change', (e) => {
        archetypeKey = e.target.value; draw();
        document.getElementById('main').scrollIntoView();
      });
      document.getElementById('opponent-select').addEventListener('change', (e) => {
        ui.opponentId = e.target.value; draw();
      });
      bindCounterChips();
      bindItemTooltips();
    };
    draw();
  }

  const infoBar = (label, value, cls) => `
    <div class="info-bar">
      <span class="info-label">${label}</span>
      <span class="bar"><span class="bar-fill ${cls}" style="width:${value * 10}%"></span></span>
    </div>`;

  function runeHtml(rune, big = false) {
    return `
      <div class="rune ${big ? 'rune-big' : ''}" title="${esc(stripTags(rune.longDesc || rune.shortDesc))}">
        <img src="${DDragon.runeIcon(rune.icon)}" alt="">
        <div class="rune-text">
          <span class="rune-name">${esc(rune.name)}</span>
          <span class="rune-desc">${esc(stripTags(rune.shortDesc))}</span>
        </div>
      </div>`;
  }

  function runePageHtml(page) {
    return `
      <div class="rune-page">
        <div class="rune-tree">
          <div class="tree-head">
            <img src="${DDragon.runeIcon(page.primaryTree.icon)}" alt="">
            <span>メイン: ${esc(page.primaryTree.name)}</span>
          </div>
          ${runeHtml(page.keystone, true)}
          ${page.primaryRunes.map((r) => runeHtml(r)).join('')}
        </div>
        <div class="rune-tree">
          <div class="tree-head">
            <img src="${DDragon.runeIcon(page.secondaryTree.icon)}" alt="">
            <span>サブ: ${esc(page.secondaryTree.name)}</span>
          </div>
          ${page.secondaryRunes.map((r) => runeHtml(r)).join('')}
          <div class="shards">
            <span class="shards-label">ステータスシャード</span>
            ${page.shards.map((s) => `<span class="shard">${esc(s)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function itemChip(entry) {
    return `
      <div class="item-chip" data-item-id="${entry.id}">
        <img loading="lazy" src="${DDragon.itemIcon(entry.id)}" alt="${esc(entry.item.name)}">
        <div class="item-text">
          <span class="item-name">${esc(entry.item.name)}</span>
          <span class="item-gold">${gold(entry.item.gold.total)}</span>
        </div>
      </div>`;
  }

  function itemSetHtml(set) {
    return `
      <div class="item-build">
        <div class="item-group">
          <span class="group-label">スタート</span>
          <div class="item-row">${set.starters.map(itemChip).join('') || '<span class="empty">-</span>'}</div>
        </div>
        <div class="item-group">
          <span class="group-label">ブーツ</span>
          <div class="item-row">${set.boots ? itemChip(set.boots) : '<span class="empty">-</span>'}</div>
        </div>
        <div class="item-group">
          <span class="group-label">コアアイテム (ビルド順)</span>
          <div class="item-row">${set.core.map(itemChip).join('')}</div>
        </div>
        <div class="item-group">
          <span class="group-label">状況に応じた選択肢</span>
          <div class="item-row">${set.situational.map(itemChip).join('')}</div>
        </div>
        <p class="build-total">コアビルド合計: <strong>${gold(Recommend.totalGold(set))}</strong></p>
      </div>`;
  }

  // ---------------- カウンター一覧 ----------------

  let lastCounterData = null; // ロールフィルタの再描画用

  function counterRowsHtml(list, role, threat) {
    const filtered = role ? list.filter((x) => (x.champ.tags || []).includes(role)) : list;
    if (!filtered.length) return '<p class="empty">該当するチャンピオンがいません。</p>';
    return filtered.slice(0, 8).map((x) => `
      <a class="counter-row" href="#/champion/${encodeURIComponent(x.champ.id)}">
        <img loading="lazy" src="${DDragon.championIcon(x.champ)}" alt="">
        <span class="counter-name">${esc(x.champ.name)}</span>
        <span class="winbar counter-bar">
          <span class="winbar-fill ${threat ? 'fill-threat' : ''}" style="width:${Math.min(100, Math.round(x.score / 3 * 100))}%"></span>
        </span>
        <span class="counter-reason">${esc(x.reason)}</span>
      </a>`).join('');
  }

  function countersPanelHtml(counterData) {
    lastCounterData = counterData;
    return `
      <section class="panel">
        <div class="panel-head">
          <h3>カウンター一覧 <span class="badge badge-auto">自動推定</span></h3>
          <div class="chips" id="counter-role-chips">
            <button class="chip ${ui.counterRole ? '' : 'on'}" data-role="">すべて</button>
            ${ROLE_TAGS.map(([tag, label]) =>
              `<button class="chip ${ui.counterRole === tag ? 'on' : ''}" data-role="${tag}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="build-grid">
          <div class="build-col">
            <h4>警戒すべき相手 <small class="tip-source">(このチャンピオンのカウンター)</small></h4>
            <div id="counter-threats">${counterRowsHtml(counterData.threats, ui.counterRole, true)}</div>
          </div>
          <div class="build-col">
            <h4>有利がつきやすい相手</h4>
            <div id="counter-favorable">${counterRowsHtml(counterData.favorable, ui.counterRole, false)}</div>
          </div>
        </div>
        <p class="skill-note">タグ・評価値・回復/バースト特性に基づく相性の自動推定です。
        実際の有利不利はスキル構成やプレイヤーの練度で変わります。名前をクリックすると相手の詳細へ移動します。</p>
      </section>`;
  }

  function bindCounterChips() {
    const chips = document.getElementById('counter-role-chips');
    if (!chips) return;
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      ui.counterRole = btn.dataset.role;
      chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === btn));
      document.getElementById('counter-threats').innerHTML =
        counterRowsHtml(lastCounterData.threats, ui.counterRole, true);
      document.getElementById('counter-favorable').innerHTML =
        counterRowsHtml(lastCounterData.favorable, ui.counterRole, false);
    });
  }

  // コンボトークン (Q/W/E/R/AA/FL) を表示チップに変換する
  function comboTokenHtml(token, detail) {
    const info = Combos.tokenInfo(token);
    if (info.type === 'spell') {
      const idx = { Q: 0, W: 1, E: 2, R: 3 }[info.slot];
      const spell = detail && detail.spells && detail.spells[idx];
      return `
        <span class="combo-token" title="${esc(spell ? spell.name : info.slot)}">
          ${spell ? `<img src="${DDragon.spellIcon(spell)}" alt="">` : ''}
          <span class="combo-key">${esc(info.label)}</span>
        </span>`;
    }
    return `<span class="combo-token combo-token-text" title="${esc(info.title)}">
      <span class="combo-key combo-key-alt">${esc(info.label)}</span></span>`;
  }

  function combosHtml(championId, detail, archetypeKey) {
    const combos = Combos.get(championId);
    const playstyle = Combos.PLAYSTYLE[archetypeKey] || [];
    const allytips = (detail && detail.allytips) || [];
    const enemytips = (detail && detail.enemytips) || [];

    const comboSection = combos
      ? combos.map((c) => `
          <div class="combo">
            <div class="combo-head">
              <span class="combo-name">${esc(c.name)}</span>
            </div>
            <div class="combo-seq">
              ${c.keys.map((k) => comboTokenHtml(k, detail)).join('<span class="skill-arrow">›</span>')}
            </div>
            <p class="combo-desc">${esc(c.desc)}</p>
          </div>`).join('')
      : `<p class="skill-note">このチャンピオンのコンボは未収録です。
         下の「立ち回りの基本」とスキル説明を参考にしてください。
         (AA = 通常攻撃, FL = フラッシュ)</p>`;

    return `
      <section class="panel">
        <h3>コンボと使い方</h3>
        <div class="build-grid">
          <div class="build-col">
            <h4>コンボ ${combos ? '' : '<span class="badge badge-auto">未収録</span>'}</h4>
            ${comboSection}
            <h4 class="counter-head">立ち回りの基本 <small>(${esc(Archetypes.DEFS[archetypeKey].label)})</small></h4>
            <ul class="tips-list">
              ${playstyle.map((p) => `<li>${esc(p)}</li>`).join('')}
            </ul>
          </div>
          <div class="build-col">
            ${allytips.length ? `
              <h4>使い方のヒント <small class="tip-source">(公式データ)</small></h4>
              <ul class="tips-list">${allytips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
            ${enemytips.length ? `
              <h4 class="counter-head">このチャンピオンと対面するとき</h4>
              <ul class="tips-list tips-enemy">${enemytips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
            ${!allytips.length && !enemytips.length ? '<p class="empty">公式ヒントはありません。</p>' : ''}
          </div>
        </div>
      </section>`;
  }

  function skillOrderHtml(championId, detail) {
    const so = SkillOrder.get(championId);
    if (so.special) {
      return `
        <section class="panel">
          <h3>スキル上げの順番</h3>
          <p class="skill-note">${esc(so.special)}</p>
        </section>`;
    }

    const KEY_INDEX = { Q: 0, W: 1, E: 2 };
    const spellCell = (key) => {
      const spell = detail && detail.spells && detail.spells[KEY_INDEX[key]];
      return `
        <span class="skill-step">
          ${spell ? `<img src="${DDragon.spellIcon(spell)}" alt="" title="${esc(spell.name)}">` : ''}
          <span class="skill-key-big">${key}</span>
          ${spell ? `<span class="skill-spell-name">${esc(spell.name)}</span>` : ''}
        </span>`;
    };

    return `
      <section class="panel">
        <div class="panel-head">
          <h3>スキル上げの順番</h3>
          <span class="badge ${so.curated ? 'badge-curated' : 'badge-auto'}">
            ${so.curated ? '定番オーダー' : '目安 (自動推定)'}
          </span>
        </div>
        <div class="skill-order">
          <span class="skill-step skill-step-r">
            <span class="skill-key-big">R</span>
            <span class="skill-spell-name">Lv6 / 11 / 16 で最優先</span>
          </span>
          <span class="skill-arrow">›</span>
          ${so.order.map(spellCell).join('<span class="skill-arrow">›</span>')}
        </div>
        <p class="skill-note">序盤 (Lv1〜3) は ${so.order.join(' → ')} の順で1つずつ取得するのが目安です。
        ${so.curated ? '' : 'このチャンピオンは収録外のため、一般的な傾向からの推定表示です。'}</p>
      </section>`;
  }

  function spellsHtml(detail) {
    const spellKeys = ['Q', 'W', 'E', 'R'];
    return `
      <section class="panel">
        <h3>スキル</h3>
        <div class="spell-list">
          <div class="spell">
            <img src="${DDragon.passiveIcon(detail.passive)}" alt="">
            <div><span class="spell-key">P</span> <strong>${esc(detail.passive.name)}</strong>
              <p>${esc(stripTags(detail.passive.description))}</p></div>
          </div>
          ${detail.spells.map((sp, i) => `
            <div class="spell">
              <img src="${DDragon.spellIcon(sp)}" alt="">
              <div><span class="spell-key">${spellKeys[i]}</span> <strong>${esc(sp.name)}</strong>
                <p>${esc(stripTags(sp.description))}</p></div>
            </div>`).join('')}
        </div>
      </section>`;
  }

  // アイテムチップにホバー詳細(説明文)を付ける
  function bindItemTooltips() {
    document.querySelectorAll('.item-chip').forEach((el) => {
      const item = DDragon.state.items[el.dataset.itemId];
      if (item) el.title = `${item.name}\n${stripTags(item.description)}`;
    });
  }

  // ---------------- アイテム図鑑 ----------------

  function renderItems() {
    main.innerHTML = `
      <section class="toolbar">
        <input type="search" id="item-search" placeholder="アイテム名・効果で検索…" value="${esc(ui.itemSearch)}">
      </section>
      <section class="item-catalog" id="item-catalog"></section>`;

    const catalog = document.getElementById('item-catalog');
    const all = Object.entries(DDragon.state.items)
      .filter(([, it]) => Recommend.isCompletedItem(it) || (it.tags || []).includes('Boots'))
      .sort((a, b) => b[1].gold.total - a[1].gold.total);

    const draw = () => {
      const q = ui.itemSearch.trim().toLowerCase();
      const filtered = all.filter(([, it]) =>
        !q || it.name.toLowerCase().includes(q) || stripTags(it.description).toLowerCase().includes(q));
      catalog.innerHTML = filtered.map(([id, it]) => `
        <div class="item-card">
          <img loading="lazy" src="${DDragon.itemIcon(id)}" alt="">
          <div class="item-card-body">
            <div class="item-card-head"><strong>${esc(it.name)}</strong><span class="item-gold">${gold(it.gold.total)}</span></div>
            <p>${esc(it.plaintext || stripTags(it.description).slice(0, 120))}</p>
          </div>
        </div>`).join('') || '<p class="empty">該当するアイテムがありません。</p>';
    };

    document.getElementById('item-search').addEventListener('input', (e) => {
      ui.itemSearch = e.target.value; draw();
    });
    draw();
  }

  // ---------------- ルーン図鑑 ----------------

  // 図鑑用: クリックで完全な説明 (longDesc) を開閉できるルーン表示
  function runeCatalogItemHtml(rune, big = false) {
    const short = stripTags(rune.shortDesc);
    // 改行を保ったままタグを除去する
    const long = String(rune.longDesc || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();
    return `
      <div class="rune ${big ? 'rune-big' : ''} rune-expandable" role="button" tabindex="0"
           aria-expanded="false" title="クリックで詳細を表示">
        <img src="${DDragon.runeIcon(rune.icon)}" alt="">
        <div class="rune-text">
          <span class="rune-name">${esc(rune.name)} <span class="rune-toggle">▾</span></span>
          <span class="rune-desc rune-desc-open">${esc(short)}</span>
          ${long && long !== short ? `<span class="rune-full">${esc(long)}</span>` : ''}
        </div>
      </div>`;
  }

  function renderRunes() {
    main.innerHTML = `
      <section class="rune-catalog" id="rune-catalog">
        <p class="skill-note">ルーンをクリックすると完全な説明を表示します。</p>
        ${DDragon.state.runeTrees.map((tree) => `
          <div class="rune-tree-card">
            <div class="tree-head big">
              <img src="${DDragon.runeIcon(tree.icon)}" alt="">
              <span>${esc(tree.name)}</span>
            </div>
            ${tree.slots.map((slot, i) => `
              <div class="rune-slot-row ${i === 0 ? 'keystone-row' : ''}">
                ${slot.runes.map((r) => runeCatalogItemHtml(r, i === 0)).join('')}
              </div>`).join('')}
          </div>`).join('')}
      </section>`;

    const toggle = (el) => {
      el.classList.toggle('open');
      el.setAttribute('aria-expanded', el.classList.contains('open'));
    };
    const catalog = document.getElementById('rune-catalog');
    catalog.addEventListener('click', (e) => {
      const rune = e.target.closest('.rune-expandable');
      if (rune) toggle(rune);
    });
    catalog.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const rune = e.target.closest('.rune-expandable');
      if (rune) { e.preventDefault(); toggle(rune); }
    });
  }

  // ---------------- 試合プラン (チーム構成分析) ----------------

  const PLAN_LS = 'lolcomp.plan';

  function loadPlan() {
    try {
      const p = JSON.parse(localStorage.getItem(PLAN_LS));
      if (p && Array.isArray(p.allies) && Array.isArray(p.enemies)) return p;
    } catch (e) { /* 破損時は初期化 */ }
    return { allies: ['', '', '', '', ''], enemies: ['', '', '', '', ''], archetype: '' };
  }

  function champSelectHtml(id, value, placeholder, allChamps) {
    return `
      <select class="plan-select" id="${id}">
        <option value="">${placeholder}</option>
        ${allChamps.map((c) =>
          `<option value="${esc(c.id)}" ${c.id === value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>`;
  }

  function renderPlanner() {
    const allChamps = Object.values(DDragon.state.champions)
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const plan = loadPlan();

    main.innerHTML = `
      <section class="panel">
        <h3>試合プラン</h3>
        <p class="skill-note">試合のチャンピオンを設定すると、チームバランス・あなた用のアイテムビルド・戦い方を自動で分析します。
        分かる範囲の入力でも動作します (最低: 自分のチャンピオン)。</p>
        <div class="plan-form">
          <div class="plan-team">
            <h4>味方チーム</h4>
            <div class="plan-slot plan-slot-self">
              <span class="plan-slot-label">自分</span>
              ${champSelectHtml('plan-ally-0', plan.allies[0], '自分のチャンピオン…', allChamps)}
              <select class="plan-select" id="plan-archetype"></select>
            </div>
            ${[1, 2, 3, 4].map((i) => `
              <div class="plan-slot">
                <span class="plan-slot-label">味方</span>
                ${champSelectHtml(`plan-ally-${i}`, plan.allies[i], `味方 ${i + 1}…`, allChamps)}
              </div>`).join('')}
          </div>
          <div class="plan-team">
            <h4>敵チーム</h4>
            ${[0, 1, 2, 3, 4].map((i) => `
              <div class="plan-slot">
                <span class="plan-slot-label">敵</span>
                ${champSelectHtml(`plan-enemy-${i}`, plan.enemies[i], `敵 ${i + 1}…`, allChamps)}
              </div>`).join('')}
          </div>
        </div>
        <button class="chip" id="plan-clear">すべてクリア</button>
      </section>
      <div id="plan-result"></div>`;

    const archetypeSelect = document.getElementById('plan-archetype');
    const syncArchetypeOptions = () => {
      const own = DDragon.state.champions[plan.allies[0]];
      const detected = own ? Archetypes.detect(own) : null;
      const current = plan.archetype || detected;
      archetypeSelect.innerHTML = own
        ? Object.entries(Archetypes.DEFS).map(([key, d]) =>
            `<option value="${key}" ${key === current ? 'selected' : ''}>${d.label}${key === detected ? ' (自動)' : ''}</option>`).join('')
        : '<option value="">プレイスタイル</option>';
      archetypeSelect.disabled = !own;
    };

    const save = () => localStorage.setItem(PLAN_LS, JSON.stringify(plan));

    const compute = () => {
      syncArchetypeOptions();
      document.getElementById('plan-result').innerHTML = planResultHtml(plan);
      bindItemTooltips();
    };

    for (let i = 0; i < 5; i++) {
      document.getElementById(`plan-ally-${i}`).addEventListener('change', (e) => {
        plan.allies[i] = e.target.value;
        if (i === 0) plan.archetype = ''; // 自分を変えたらプレイスタイルは自動判定に戻す
        save(); compute();
      });
      document.getElementById(`plan-enemy-${i}`).addEventListener('change', (e) => {
        plan.enemies[i] = e.target.value; save(); compute();
      });
    }
    archetypeSelect.addEventListener('change', (e) => {
      plan.archetype = e.target.value; save(); compute();
    });
    document.getElementById('plan-clear').addEventListener('click', () => {
      plan.allies = ['', '', '', '', '']; plan.enemies = ['', '', '', '', '']; plan.archetype = '';
      save(); renderPlanner();
    });

    compute();
  }

  function teamCardHtml(title, champs, analysis, extraClass) {
    if (!champs.length) {
      return `<div class="team-card ${extraClass}"><h4>${title}</h4><p class="empty">チャンピオン未設定</p></div>`;
    }
    const t = analysis;
    const phys = Math.round(t.physShare * 100);
    return `
      <div class="team-card ${extraClass}">
        <h4>${title}</h4>
        <div class="team-icons">
          ${champs.map((c) => `<img src="${DDragon.championIcon(c)}" alt="" title="${esc(c.name)}">`).join('')}
        </div>
        <div class="dmg-bar-row">
          <span class="dmg-label">ダメージ</span>
          <span class="dmg-bar">
            <span class="dmg-phys" style="width:${phys}%"></span><span class="dmg-mag" style="width:${100 - phys}%"></span>
          </span>
          <span class="dmg-nums">物理 ${phys}% / 魔法 ${100 - phys}%</span>
        </div>
        <div class="team-stats">
          <span class="team-stat">前衛 <strong>${t.frontline}</strong></span>
          <span class="team-stat">エンゲージ <strong>${t.engage}</strong></span>
          <span class="team-stat">ポーク <strong>${t.poke}</strong></span>
          <span class="team-stat">バースト <strong>${t.burst}</strong></span>
          <span class="team-stat">後半型 <strong>${t.lateGame}</strong></span>
        </div>
        ${t.sustainNames.length ? `<p class="team-note">回復が強力: ${t.sustainNames.map(esc).join('・')}</p>` : ''}
        ${t.compType ? `<p class="team-type">${t.compType.name}</p>` : ''}
      </div>`;
  }

  function planResultHtml(plan) {
    const champs = DDragon.state.champions;
    const own = champs[plan.allies[0]];
    if (!own) {
      return '<section class="panel"><p class="empty">自分のチャンピオンを選択すると分析が表示されます。</p></section>';
    }
    const allyChamps = plan.allies.filter((id) => champs[id]).map((id) => champs[id]);
    const enemyChamps = plan.enemies.filter((id) => champs[id]).map((id) => champs[id]);
    const archetypeKey = plan.archetype || Archetypes.detect(own);
    const def = Archetypes.DEFS[archetypeKey];

    const allyAnalysis = TeamComp.analyzeTeam(allyChamps);
    const enemyAnalysis = enemyChamps.length ? TeamComp.analyzeTeam(enemyChamps) : null;
    const warns = TeamComp.warnings(allyAnalysis);

    // ビルド: 基本はアーキタイプ推薦、敵構成があれば対策を統合
    const itemSet = Recommend.buildItemSet(DDragon.state.items, def);
    let boots = itemSet.boots;
    let bootsReason = '';
    let counters = [];
    if (enemyAnalysis) {
      const override = TeamComp.recommendBoots(DDragon.state.items, archetypeKey, enemyAnalysis);
      if (override) { boots = override; bootsReason = override.reason; }
      counters = Matchup.counterItems(DDragon.state.items, archetypeKey, TeamComp.buildThreats(enemyAnalysis));
    }
    const tips = enemyAnalysis ? TeamComp.advice(own, archetypeKey, allyAnalysis, enemyAnalysis) : [];

    return `
      <section class="panel">
        <h3>チームバランス</h3>
        <div class="team-grid">
          ${teamCardHtml('味方チーム', allyChamps, allyAnalysis, 'team-ally')}
          ${enemyAnalysis
            ? teamCardHtml('敵チーム', enemyChamps, enemyAnalysis, 'team-enemy')
            : '<div class="team-card team-enemy"><h4>敵チーム</h4><p class="empty">敵チャンピオンを選択すると対策が精密になります。</p></div>'}
        </div>
        ${warns.length ? `
          <div class="warn-list">
            ${warns.map((w) => `<p class="warn-item">⚠ ${esc(w)}</p>`).join('')}
          </div>` : ''}
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>あなたのビルド — ${esc(own.name)}</h3>
          <a class="back-link" href="#/champion/${encodeURIComponent(own.id)}">チャンピオン詳細 →</a>
        </div>
        <div class="build-grid">
          <div class="build-col">
            <div class="item-group">
              <span class="group-label">スタート</span>
              <div class="item-row">${itemSet.starters.map(itemChip).join('') || '<span class="empty">-</span>'}</div>
            </div>
            <div class="item-group">
              <span class="group-label">ブーツ${bootsReason ? ` — ${esc(bootsReason)}` : ''}</span>
              <div class="item-row">${boots ? itemChip(boots) : '<span class="empty">-</span>'}</div>
            </div>
            <div class="item-group">
              <span class="group-label">コアアイテム (ビルド順)</span>
              <div class="item-row">${itemSet.core.map(itemChip).join('')}</div>
            </div>
          </div>
          <div class="build-col">
            ${counters.length ? `
              <span class="group-label">敵構成への対策 (優先度順)</span>
              ${counters.map((c) => `
                <div class="item-group">
                  <span class="group-label"><span class="need-tag">${esc(c.label)}</span> ${esc(c.desc)}</span>
                  <div class="item-row">${c.entries.map(itemChip).join('')}</div>
                </div>`).join('')}` : `
              <span class="group-label">状況に応じた選択肢</span>
              <div class="item-row">${itemSet.situational.slice(0, 4).map(itemChip).join('')}</div>`}
          </div>
        </div>
      </section>

      ${tips.length ? `
      <section class="panel">
        <h3>戦い方 <span class="badge badge-auto">自動分析</span></h3>
        <ul class="tips-list">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </section>` : ''}`;
  }

  // ---------------- マイデータ (戦績分析) ----------------

  // match-v5 の championName から Data Dragon のチャンピオンを引く
  // (大文字小文字の揺れ: FiddleSticks 等に対応)
  let champByLower = null;
  function findChampion(name) {
    if (!champByLower) {
      champByLower = {};
      for (const c of Object.values(DDragon.state.champions)) champByLower[c.id.toLowerCase()] = c;
    }
    return champByLower[String(name || '').toLowerCase()] || null;
  }

  // ルーンID → ルーン情報 (キーストーンアイコン表示用)
  let runeById = null;
  function findRune(id) {
    if (!runeById) {
      runeById = {};
      for (const tree of DDragon.state.runeTrees) {
        for (const slot of tree.slots) for (const r of slot.runes) runeById[r.id] = r;
      }
    }
    return runeById[id] || null;
  }

  const pct = (v) => `${Math.round(v * 100)}%`;
  const num = (v, digits = 1) => v.toFixed(digits);
  const timeAgo = (ts) => {
    if (!ts) return '';
    const d = Date.now() - ts;
    const h = Math.floor(d / 3600000);
    if (h < 1) return `${Math.max(1, Math.floor(d / 60000))}分前`;
    if (h < 24) return `${h}時間前`;
    return `${Math.floor(h / 24)}日前`;
  };

  async function renderMyData() {
    main.innerHTML = '<div class="loading"><div class="spinner"></div><p>確認中…</p></div>';

    const server = await MyData.ping();
    if (!server) {
      main.innerHTML = `
        <div class="error-box">
          <h3>中継サーバーが起動していません</h3>
          <p>マイデータ機能は Riot API を利用するため、付属の中継サーバーからの起動が必要です。
          静的サーバー (python3 -m http.server 等) では利用できません。</p>
          <pre>node server.js</pre>
          <p>で起動し、<strong>http://localhost:8000</strong> を開き直してください。
          他のタブ(ビルド提案・図鑑)はこのままでも利用できます。</p>
        </div>`;
      return;
    }

    const saved = (k, d = '') => localStorage.getItem(k) || d;
    main.innerHTML = `
      <section class="panel">
        <h3>マイデータ分析</h3>
        <p class="skill-note">Riot ID を入力すると、最近のマッチ履歴から勝率・KDA・チャンピオン別成績などを分析します。</p>
        <form id="mydata-form" class="mydata-form">
          <label>Riot ID
            <input type="text" id="md-riotid" placeholder="プレイヤー名#JP1" required
              value="${esc(saved(MyData.LS.riotId))}">
          </label>
          <label>リージョン
            <select id="md-region">
              ${MyData.PLATFORMS.map(([v, l]) =>
                `<option value="${v}" ${saved(MyData.LS.region, 'jp1') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          <label>取得試合数
            <select id="md-count">
              ${[10, 20, 30, 50].map((n) =>
                `<option value="${n}" ${saved(MyData.LS.count, '20') === String(n) ? 'selected' : ''}>${n}試合</option>`).join('')}
            </select>
          </label>
          ${server.hasEnvKey ? '' : `
          <label>Riot APIキー
            <input type="password" id="md-apikey" placeholder="RGAPI-..." required
              value="${esc(saved(MyData.LS.apiKey))}">
          </label>`}
          <button type="submit" class="primary-btn" id="md-submit">分析する</button>
        </form>
        ${server.hasEnvKey ? '' : `
        <p class="skill-note">APIキーは <a href="https://developer.riotgames.com" target="_blank" rel="noopener">developer.riotgames.com</a>
        で無料発行できます (開発用キーは24時間で失効)。キーはこのブラウザと自分のサーバーにのみ送信されます。</p>`}
      </section>
      <div id="mydata-result"></div>`;

    document.getElementById('mydata-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = document.getElementById('mydata-result');
      const btn = document.getElementById('md-submit');

      const riotId = document.getElementById('md-riotid').value.trim();
      const parts = riotId.split('#');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        result.innerHTML = '<div class="error-box"><p>Riot ID は「プレイヤー名#タグ」の形式で入力してください (例: Hide on bush#KR1)。</p></div>';
        return;
      }
      const platform = document.getElementById('md-region').value;
      const count = Number(document.getElementById('md-count').value);
      const keyInput = document.getElementById('md-apikey');
      const apiKey = keyInput ? keyInput.value.trim() : '';

      localStorage.setItem(MyData.LS.riotId, riotId);
      localStorage.setItem(MyData.LS.region, platform);
      localStorage.setItem(MyData.LS.count, String(count));
      if (apiKey) localStorage.setItem(MyData.LS.apiKey, apiKey);

      btn.disabled = true;
      result.innerHTML = '<div class="loading"><div class="spinner"></div><p id="md-progress">取得を開始…</p></div>';
      const progress = (msg) => {
        const el = document.getElementById('md-progress');
        if (el) el.textContent = msg;
      };

      try {
        const data = await MyData.fetchAll(
          { gameName: parts[0], tagLine: parts[1], platform, count, apiKey }, progress);
        const stats = MyData.analyze(data.matches, data.account.puuid);
        result.innerHTML = myDataDashboardHtml(data, stats);
      } catch (err) {
        result.innerHTML = `<div class="error-box"><h3>取得に失敗しました</h3><p>${esc(err.message)}</p></div>`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function rankCardHtml(league) {
    const entries = (league || []).filter((l) =>
      l.queueType === 'RANKED_SOLO_5x5' || l.queueType === 'RANKED_FLEX_SR');
    if (!entries.length) return '<span class="rank-line">ランク情報なし</span>';
    return entries.map((l) => {
      const label = l.queueType === 'RANKED_SOLO_5x5' ? 'ソロ/デュオ' : 'フレックス';
      const tier = MyData.TIER_LABELS[l.tier] || l.tier;
      const total = l.wins + l.losses;
      return `<span class="rank-line"><strong>${label}:</strong> ${esc(tier)} ${esc(l.rank || '')}
        ${l.leaguePoints}LP (${l.wins}勝${l.losses}敗 / 勝率${pct(total ? l.wins / total : 0)})</span>`;
    }).join('');
  }

  function statTilesHtml(o) {
    const tiles = [
      ['勝率', pct(o.winRate), `${o.wins}勝 ${o.games - o.wins}敗`],
      ['KDA', num(o.kda, 2), `${num(o.kills)} / ${num(o.deaths)} / ${num(o.assists)}`],
      ['CS / 分', num(o.csPerMin), '10分あたり ' + num(o.csPerMin * 10, 0)],
      ['ビジョンスコア', num(o.vision), '1試合平均'],
      ['試合数', String(o.games), 'リメイク除外'],
    ];
    return `<div class="stat-tiles">${tiles.map(([label, value, sub]) => `
      <div class="stat-tile">
        <span class="stat-label">${label}</span>
        <span class="stat-value">${esc(value)}</span>
        <span class="stat-sub">${esc(sub)}</span>
      </div>`).join('')}</div>`;
  }

  function winBarHtml(rate) {
    return `<span class="winbar"><span class="winbar-fill" style="width:${Math.round(rate * 100)}%"></span></span>`;
  }

  function championTableHtml(byChampion) {
    return `
      <table class="stats-table">
        <thead><tr><th>チャンピオン</th><th>試合</th><th>勝率</th><th>KDA</th></tr></thead>
        <tbody>
          ${byChampion.slice(0, 10).map((g) => {
            const champ = findChampion(g.key);
            return `<tr>
              <td class="champ-cell">
                ${champ ? `<img src="${DDragon.championIcon(champ)}" alt="">` : ''}
                ${champ
                  ? `<a href="#/champion/${encodeURIComponent(champ.id)}">${esc(champ.name)}</a>`
                  : esc(g.key)}
              </td>
              <td>${g.games}</td>
              <td>${pct(g.winRate)} ${winBarHtml(g.winRate)}</td>
              <td>${num(g.kda, 2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function roleTableHtml(byRole) {
    const rows = byRole.filter((g) => MyData.ROLE_LABELS[g.key]);
    if (!rows.length) return '<p class="empty">ロール情報がありません (ARAM等はロール集計対象外)。</p>';
    return `
      <table class="stats-table">
        <thead><tr><th>ロール</th><th>試合</th><th>勝率</th><th>KDA</th></tr></thead>
        <tbody>
          ${rows.map((g) => `<tr>
            <td>${MyData.ROLE_LABELS[g.key]}</td>
            <td>${g.games}</td>
            <td>${pct(g.winRate)} ${winBarHtml(g.winRate)}</td>
            <td>${num(g.kda, 2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function matchRowHtml(r) {
    const champ = findChampion(r.champion);
    const keystone = r.keystone ? findRune(r.keystone) : null;
    return `
      <div class="match-row ${r.win ? 'match-win' : 'match-loss'}">
        <span class="match-result">${r.win ? '勝利' : '敗北'}</span>
        <span class="match-champ">
          ${champ ? `<img src="${DDragon.championIcon(champ)}" alt="">` : ''}
          ${champ ? `<a href="#/champion/${encodeURIComponent(champ.id)}">${esc(champ.name)}</a>` : esc(r.champion)}
        </span>
        ${keystone ? `<img class="match-keystone" src="${DDragon.runeIcon(keystone.icon)}" alt="" title="${esc(keystone.name)}">` : ''}
        <span class="match-kda"><strong>${r.kills} / ${r.deaths} / ${r.assists}</strong></span>
        <span class="match-meta">CS ${r.cs} (${num(r.cs / r.durationMin)}/分)</span>
        <span class="match-items">
          ${r.items.map((id) => `<img src="${DDragon.itemIcon(id)}" alt="" title="${esc((DDragon.state.items[id] || {}).name || '')}">`).join('')}
        </span>
        <span class="match-meta">${MyData.QUEUE_LABELS[r.queueId] || 'その他'} · ${Math.round(r.durationMin)}分 · ${timeAgo(r.gameCreation)}</span>
        ${r.matchId ? `<a class="review-link" href="#/review/${encodeURIComponent(r.matchId)}">詳細分析 →</a>` : ''}
      </div>`;
  }

  function myDataDashboardHtml(data, stats) {
    const { account, summoner } = data;
    if (!stats.overall) {
      return '<div class="error-box"><p>集計対象の試合が見つかりませんでした。</p></div>';
    }
    return `
      <section class="panel">
        <div class="mydata-profile">
          <div>
            <h3>${esc(account.gameName)} <small class="tagline">#${esc(account.tagLine)}</small></h3>
            ${summoner ? `<span class="rank-line">レベル ${summoner.summonerLevel}</span>` : ''}
            ${rankCardHtml(data.league)}
          </div>
        </div>
        ${statTilesHtml(stats.overall)}
      </section>
      <section class="panel">
        <div class="build-grid">
          <div class="build-col">
            <h4>チャンピオン別成績</h4>
            ${championTableHtml(stats.byChampion)}
          </div>
          <div class="build-col">
            <h4>ロール別成績</h4>
            ${roleTableHtml(stats.byRole)}
          </div>
        </div>
      </section>
      <section class="panel">
        <h3>最近の試合</h3>
        <div class="match-list">${stats.recent.map(matchRowHtml).join('')}</div>
      </section>`;
  }

  // ---------------- 試合詳細分析 (リプレイ分析) ----------------

  const fmtClock = (ts) => {
    const s = Math.floor(ts / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  async function renderReview(matchId) {
    main.innerHTML = '<div class="loading"><div class="spinner"></div><p id="rv-progress">確認中…</p></div>';
    const progress = (msg) => {
      const el = document.getElementById('rv-progress');
      if (el) el.textContent = msg;
    };

    const server = await MyData.ping();
    const riotId = localStorage.getItem(MyData.LS.riotId) || '';
    const apiKey = server && server.hasEnvKey ? '' : (localStorage.getItem(MyData.LS.apiKey) || '');
    const idParts = riotId.split('#');

    if (!server) {
      main.innerHTML = `<div class="error-box"><h3>中継サーバーが起動していません</h3>
        <p>詳細分析には <code>node server.js</code> での起動が必要です。</p></div>`;
      return;
    }
    if (idParts.length !== 2 || (!server.hasEnvKey && !apiKey)) {
      main.innerHTML = `<div class="error-box"><h3>設定が必要です</h3>
        <p>先に<a href="#/mydata">マイデータ</a>タブで Riot ID とAPIキーを設定し、一度分析を実行してください。</p></div>`;
      return;
    }

    try {
      const { account, match, timeline } = await Review.fetchAll(matchId, apiKey, idParts[0], idParts[1], progress);
      const a = Review.analyze(match, timeline, account.puuid, DDragon.state.items);
      if (!a) {
        main.innerHTML = '<div class="error-box"><p>この試合にあなたが見つかりませんでした。</p></div>';
        return;
      }
      main.innerHTML = reviewHtml(match, a);
      bindItemTooltips();
    } catch (err) {
      main.innerHTML = `<div class="error-box"><h3>取得に失敗しました</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function reviewMapSvg(a) {
    const S = 320, MAX = 15000;
    const px = (p) => (p.x / MAX) * S;
    const py = (p) => S - (p.y / MAX) * S;
    const phases = [
      { label: '序盤 (〜10分)', cls: 'path-early', test: (m) => m <= 10 },
      { label: '中盤 (10〜20分)', cls: 'path-mid', test: (m) => m > 10 && m <= 20 },
      { label: '終盤 (20分〜)', cls: 'path-late', test: (m) => m > 20 },
    ];
    const lines = phases.map((ph) => {
      const pts = a.series.filter((s) => s.myPos && ph.test(s.min))
        .map((s) => `${px(s.myPos).toFixed(1)},${py(s.myPos).toFixed(1)}`);
      return pts.length >= 2 ? `<polyline class="${ph.cls}" points="${pts.join(' ')}"/>` : '';
    }).join('');
    const deaths = a.myDeaths.filter((d) => d.pos).map((d) => `
      <text class="death-mark" x="${px(d.pos).toFixed(1)}" y="${(py(d.pos) + 5).toFixed(1)}">✕<title>${fmtClock(d.ts)} デス</title></text>`).join('');
    return `
      <svg class="review-map" viewBox="0 0 ${S} ${S}" role="img" aria-label="マップ上の移動経路">
        <image href="${DDragon.mapImage()}" x="0" y="0" width="${S}" height="${S}" opacity="0.85"/>
        ${lines}${deaths}
      </svg>
      <div class="map-legend">
        ${phases.map((p) => `<span class="legend-item"><span class="legend-swatch ${p.cls}-sw"></span>${p.label}</span>`).join('')}
        <span class="legend-item"><span class="legend-death">✕</span>デス</span>
      </div>`;
  }

  function goldChartSvg(a) {
    const pts = a.series.filter((s) => s.goldDiff != null);
    if (pts.length < 2) return '<p class="empty">対面が特定できないためゴールド差グラフは表示できません。</p>';
    const W = 560, H = 170, L = 42, R = 20, T = 16, B = 26;
    const lastMin = pts[pts.length - 1].min || 1;
    const maxAbs = Math.max(600, ...pts.map((p) => Math.abs(p.goldDiff)));
    const x = (m) => L + (m / lastMin) * (W - L - R);
    const y = (v) => T + (H - T - B) / 2 - (v / maxAbs) * (H - T - B) / 2;
    const line = pts.map((p) => `${x(p.min).toFixed(1)},${y(p.goldDiff).toFixed(1)}`).join(' ');
    const ticks = [];
    for (let m = 0; m <= lastMin; m += 5) ticks.push(m);
    const marks = [10, 15, 20].filter((m) => m <= lastMin).map((m) => {
      const p = pts.find((q) => q.min === m);
      return p ? `${m}分: ${p.goldDiff > 0 ? '+' : ''}${p.goldDiff.toLocaleString()}G` : null;
    }).filter(Boolean);
    const last = pts[pts.length - 1];
    return `
      <svg class="gold-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="対面とのゴールド差の推移">
        <line class="axis-zero" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"/>
        ${ticks.map((m) => `<text class="axis-label" x="${x(m)}" y="${H - 8}">${m}</text>`).join('')}
        <text class="axis-label" x="${L - 6}" y="${y(maxAbs) + 4}" text-anchor="end">+${maxAbs.toLocaleString()}</text>
        <text class="axis-label" x="${L - 6}" y="${y(-maxAbs) + 4}" text-anchor="end">-${maxAbs.toLocaleString()}</text>
        <polyline class="gold-line" points="${line}"/>
        ${pts.map((p) => `<circle class="gold-dot" cx="${x(p.min).toFixed(1)}" cy="${y(p.goldDiff).toFixed(1)}" r="3.5">
          <title>${p.min}分: ${p.goldDiff > 0 ? '+' : ''}${p.goldDiff}G (CS差 ${p.csDiff > 0 ? '+' : ''}${p.csDiff})</title></circle>`).join('')}
        <text class="chart-end-label" x="${x(last.min) - 4}" y="${y(last.goldDiff) - 8}" text-anchor="end">${last.goldDiff > 0 ? '+' : ''}${last.goldDiff.toLocaleString()}G</text>
      </svg>
      ${marks.length ? `<p class="skill-note">対面とのゴールド差 — ${marks.join(' / ')}</p>` : ''}`;
  }

  function killWindowsHtml(a) {
    if (!a.opp) return '<p class="empty">対面レーナーが特定できない試合 (ARAM等) のため、キルチャンス分析は対象外です。</p>';
    if (!a.hasStats) return '<p class="empty">この試合のタイムラインにはステータス情報が含まれていないため、キルチャンス分析は表示できません。</p>';

    const oppChamp = findChampion(a.opp.championName);
    const rows = a.killWindows.map((w) => {
      const range = w.startMin === w.endMin ? `${w.startMin}分` : `${w.startMin}〜${w.endMin}分`;
      const hpPct = Math.round(w.best.oppHpPct * 100);
      return `
        <div class="kw-row kw-${w.verdict}">
          <span class="kw-time">${range}</span>
          <span class="kw-verdict">${w.verdict === 'kill' ? 'キル圏内 (推定)' : 'プレッシャー可'}</span>
          <span class="kw-detail">推定バースト ${Math.round(w.best.burst).toLocaleString()} vs 対面の体力 ${Math.round(w.best.oppHp).toLocaleString()} (${hpPct}%)</span>
        </div>`;
    }).join('');

    const notes = [];
    if (a.firstTo6) {
      if (a.firstTo6.myMin < a.firstTo6.oppMin) {
        notes.push(`レベル6到達があなた ${a.firstTo6.myMin}分・対面 ${a.firstTo6.oppMin}分。この間はアルティメット差でオールインのチャンスでした。`);
      } else if (a.firstTo6.myMin > a.firstTo6.oppMin) {
        notes.push(`対面が先にレベル6到達 (${a.firstTo6.oppMin}分、あなたは${a.firstTo6.myMin}分)。この間は仕掛けられる危険な時間帯でした。`);
      }
    }
    const leadMins = a.levelLeads.reduce((s, l) => s + (l.endMin - l.startMin + 1), 0);
    if (leadMins >= 2) notes.push(`レベル先行していた時間は合計約${leadMins}分。レベル差がある間が仕掛け時です。`);
    if (a.coreTiming) {
      const d = Math.round((a.coreTiming.oppFirst - a.coreTiming.myFirst) / 1000);
      if (d > 30) notes.push(`最初のコアアイテム完成が対面より${Math.round(d / 60)}分${Math.abs(d % 60)}秒早く、アイテムパワースパイクで有利な時間帯がありました。`);
      else if (d < -30) notes.push(`対面の方がコアアイテム完成が早く (差 ${Math.round(-d / 60)}分${Math.abs(d % 60)}秒)、その間は無理な交戦を避けるべき時間帯でした。`);
    }

    return `
      ${rows || `<p class="empty">${esc(oppChamp ? oppChamp.name : a.opp.championName)} をキル圏内と推定できる時間帯はありませんでした (お互い近くにいた時間帯のみ判定)。</p>`}
      ${notes.length ? `<ul class="tips-list">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <p class="skill-note">推定モデル: 約3秒の交戦で スキル (AD×2.1 + AP×2.3) + 通常攻撃2.5秒分 を、
      その時点の対面の物理/魔法防御で軽減して計算。1分ごとのスナップショットに基づく目安です。</p>`;
  }

  function itemEffectsHtml(a) {
    if (!a.corePurchases.length) return '<p class="empty">完成アイテムの購入が記録されていません。</p>';
    const rows = a.corePurchases.map((p) => {
      const it = p.item;
      const delta = p.dmgBefore > 20 ? Math.round((p.dmgAfter - p.dmgBefore) / p.dmgBefore * 100) : null;
      return `
        <div class="item-effect-row">
          <img src="${DDragon.itemIcon(p.itemId)}" alt="">
          <div class="item-effect-body">
            <div><strong>${esc(it ? it.name : `アイテム ${p.itemId}`)}</strong>
              <span class="item-effect-time">${fmtClock(p.ts)} 完成</span>
              ${delta != null ? `<span class="delta-chip ${delta >= 0 ? 'delta-up' : 'delta-down'}">ダメージ/分 ${delta >= 0 ? '+' : ''}${delta}%</span>` : ''}
            </div>
            ${it ? `<p>${esc(it.plaintext || stripTags(it.description).slice(0, 110))}</p>` : ''}
            <p class="item-effect-dmg">対チャンピオンダメージ: 完成前 ${Math.round(p.dmgBefore).toLocaleString()}/分 → 完成後 ${Math.round(p.dmgAfter).toLocaleString()}/分</p>
          </div>
        </div>`;
    }).join('');
    const timing = a.coreTiming ? (() => {
      const d = Math.round((a.coreTiming.oppFirst - a.coreTiming.myFirst) / 1000);
      const label = d >= 0 ? `対面より ${Math.floor(Math.abs(d) / 60)}分${Math.abs(d) % 60}秒 早い` : `対面より ${Math.floor(Math.abs(d) / 60)}分${Math.abs(d) % 60}秒 遅い`;
      return `<p class="skill-note">最初のコアアイテム完成: あなた ${fmtClock(a.coreTiming.myFirst)} / 対面 ${fmtClock(a.coreTiming.oppFirst)} (${label})</p>`;
    })() : '';
    return rows + timing;
  }

  function deathReviewHtml(a) {
    if (!a.myDeaths.length) return '<p class="empty">デスなし。素晴らしい生存力です。</p>';
    return a.myDeaths.map((d, i) => {
      const advice = [];
      if (d.earlyGank) advice.push('序盤のガンクによるデスです。ミニマップの確認と川の視界を意識しましょう。');
      if (d.solo) advice.push('味方から離れた単独デスです。視界のない場所で1人にならない位置取りを心がけましょう。');
      if (d.unspentGold >= 1300) advice.push(`未使用ゴールド ${d.unspentGold.toLocaleString()}G を抱えたままのデスです。先に買い物をしていればステータス差で勝てた可能性があります。`);
      if (!advice.length) advice.push('集団戦の中でのデスです。フォーカスされない位置取りと下がるタイミングを振り返りましょう。');
      return `
        <div class="death-row">
          <span class="death-num">${i + 1}</span>
          <div>
            <div class="death-head">
              <strong>${fmtClock(d.ts)}</strong>
              ${d.killerName ? ` — ${esc(d.killerName)} にキルされた` : ''}
              ${d.earlyGank ? '<span class="flag-chip">序盤ガンク</span>' : ''}
              ${d.solo ? '<span class="flag-chip">単独デス</span>' : ''}
              ${d.unspentGold >= 1300 ? `<span class="flag-chip">未使用 ${d.unspentGold.toLocaleString()}G</span>` : ''}
            </div>
            <p class="death-advice">${advice.map(esc).join(' ')}</p>
          </div>
        </div>`;
    }).join('');
  }

  function reviewHtml(match, a) {
    const myChamp = findChampion(a.me.championName);
    const oppChamp = a.opp ? findChampion(a.opp.championName) : null;
    const teamKills = match.info.participants
      .filter((p) => p.teamId === a.me.teamId)
      .reduce((s, p) => s + (p.kills || 0), 0);
    const kp = teamKills ? Math.min(100, Math.round((a.me.kills + a.me.assists) / teamKills * 100)) : 0;

    return `
      <section class="panel">
        <a class="back-link" href="#/mydata">← マイデータへ戻る</a>
        <div class="review-head">
          <div class="review-vs">
            ${myChamp ? `<img src="${DDragon.championIcon(myChamp)}" alt="">` : ''}
            <div>
              <h3>${esc(myChamp ? myChamp.name : a.me.championName)}
                <span class="${a.me.win ? 'txt-win' : 'txt-loss'}">${a.me.win ? '勝利' : '敗北'}</span></h3>
              <span class="rank-line">${a.me.kills} / ${a.me.deaths} / ${a.me.assists} · キル関与 ${kp}%
                · ${MyData.QUEUE_LABELS[match.info.queueId] || 'その他'} · ${Math.round(match.info.gameDuration / 60)}分</span>
            </div>
          </div>
          ${a.opp ? `
          <div class="review-vs review-opp">
            <span class="vs-label">対面</span>
            ${oppChamp ? `<img src="${DDragon.championIcon(oppChamp)}" alt="">` : ''}
            <strong>${esc(oppChamp ? oppChamp.name : a.opp.championName)}</strong>
          </div>` : ''}
        </div>
        <p class="skill-note">タイムラインAPI (1分ごとのスナップショット + 全イベント) による分析です。
        バースト計算は簡易モデルによる<strong>推定</strong>で、スキルの命中などフレーム単位の操作は対象外です。</p>
      </section>

      <section class="panel">
        <h3>キルチャンス分析 <span class="badge badge-auto">推定</span></h3>
        ${killWindowsHtml(a)}
      </section>

      <section class="panel">
        <h3>アイテム効果分析</h3>
        ${itemEffectsHtml(a)}
      </section>

      <section class="panel">
        <h3>マクロ分析</h3>
        <div class="build-grid">
          <div class="build-col">
            <h4>マップ上の動き</h4>
            ${reviewMapSvg(a)}
          </div>
          <div class="build-col">
            <h4>対面とのゴールド差</h4>
            ${goldChartSvg(a)}
            <div class="team-stats review-stats">
              <span class="team-stat">オブジェクト関与 <strong>${a.objectives.near}/${a.objectives.total}</strong></span>
              <span class="team-stat">ワード設置 <strong>${a.wards.placed}</strong></span>
              <span class="team-stat">ワード破壊 <strong>${a.wards.killed}</strong></span>
              <span class="team-stat">キル関与 <strong>${kp}%</strong></span>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>デスレビュー <span class="badge badge-auto">自動診断</span></h3>
        ${deathReviewHtml(a)}
      </section>`;
  }

  // ---------------- 起動 ----------------

  document.getElementById('nav-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) location.hash = `#/${btn.dataset.view}`;
  });
  window.addEventListener('hashchange', route);

  DDragon.load()
    .then(() => {
      document.getElementById('version-badge').textContent = `パッチ ${DDragon.state.version}`;
      route();
    })
    .catch((err) => {
      main.innerHTML = `
        <div class="error-box">
          <h3>データの取得に失敗しました</h3>
          <p>Data Dragon (ddragon.leagueoflegends.com) に接続できませんでした。
          ネットワーク接続を確認して再読み込みしてください。</p>
          <pre>${esc(err.message)}</pre>
        </div>`;
      document.getElementById('version-badge').textContent = 'オフライン';
    });
})();
