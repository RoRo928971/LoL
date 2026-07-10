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
  const ui = { champSearch: '', champRole: '', itemSearch: '' };

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
    document.querySelectorAll('#nav-tabs .tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === (view === 'champion' ? 'champions' : view));
    });
    if (view === 'champion' && param) renderChampionDetail(decodeURIComponent(param));
    else if (view === 'items') renderItems();
    else if (view === 'runes') renderRunes();
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

    const draw = () => {
      const def = Archetypes.DEFS[archetypeKey];
      const runePage = Recommend.buildRunePage(DDragon.state.runeTrees, def);
      const itemSet = Recommend.buildItemSet(DDragon.state.items, def);

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
            <label class="archetype-select">プレイスタイル:
              <select id="archetype-select">
                ${Object.entries(Archetypes.DEFS).map(([key, d]) =>
                  `<option value="${key}" ${key === archetypeKey ? 'selected' : ''}>${d.label}</option>`).join('')}
              </select>
            </label>
          </div>

          <div class="build-grid">
            <div class="build-col">
              <h4>ルーン構成</h4>
              ${runePageHtml(runePage)}
            </div>
            <div class="build-col">
              <h4>アイテムビルド</h4>
              ${itemSetHtml(itemSet)}
            </div>
          </div>
        </section>

        ${detail ? spellsHtml(detail) : ''}`;

      document.getElementById('archetype-select').addEventListener('change', (e) => {
        archetypeKey = e.target.value; draw();
        document.getElementById('main').scrollIntoView();
      });
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

  function renderRunes() {
    main.innerHTML = `
      <section class="rune-catalog">
        ${DDragon.state.runeTrees.map((tree) => `
          <div class="rune-tree-card">
            <div class="tree-head big">
              <img src="${DDragon.runeIcon(tree.icon)}" alt="">
              <span>${esc(tree.name)}</span>
            </div>
            ${tree.slots.map((slot, i) => `
              <div class="rune-slot-row ${i === 0 ? 'keystone-row' : ''}">
                ${slot.runes.map((r) => runeHtml(r, i === 0)).join('')}
              </div>`).join('')}
          </div>`).join('')}
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
