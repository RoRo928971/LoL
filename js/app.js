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
  const ui = { champSearch: '', champRole: '', itemSearch: '', opponentId: '' };

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
    else if (view === 'mydata') renderMyData();
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
