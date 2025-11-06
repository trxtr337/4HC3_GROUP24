/* =========================================================
   Grocery Smart — Vertical Prototype
   SCRIPT (aligned with 4HC3 lectures)

   Principles in code:
   - L4 UCD: vertical slice, clear steps → each screen is a region we toggle
   - L5 Usability: safety (disabled states), efficiency (few taps), feedback
   - L13 Perception: live status announcements, focus management
   - L14 Gestalt: consistent component rendering (cards/tags)
   - L15 Memory/Cognition: ≤7 suggestions; predictable placement
   - Accessibility: ARIA roles, aria-live, focus-visible, keyboardability

   NOTE:
   • Existing functionality kept intact. Only additions & small extensions.
========================================================= */

(() => {
  'use strict';

  /* -----------------------------
     0) Safe element selectors
  ----------------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* -----------------------------
     1) App State (mock data)
  ----------------------------- */
  const LS_KEYS = {
    priceSource: 'gs_price_source_mode',
    sortMode:    'gs_sort_mode',
    radiusKm:    'gs_radius_km',
    recents:     'gs_recent_labels'
  };

  const state = {
    activeScreen: 'home',
    activeItem: null,          // catalog id string
    offers: [],                // current offers for activeItem
    selectedOffer: null,       // offer object chosen in sheet
    priceSourceMode: 0,        // 0: Preferred, 1: Last paid, 2: Blended
    today: new Date('2025-11-06'), // fixed date for demo; change to new Date() if desired

    // NEW: UI prefs & telemetry
    sortMode: 'score',
    radiusKm: 5,
    recentLabels: ['Chicken Breast (per lb)','Milk 2L (2%)','Eggs — 12 pack'],
    telemetry: { chip_click:0, popular_click:0, offer_open:0, confirm_done:0 }
  };

  // restore prefs from localStorage if present
  try {
    const s = localStorage.getItem(LS_KEYS.sortMode);
    const r = localStorage.getItem(LS_KEYS.radiusKm);
    const p = localStorage.getItem(LS_KEYS.priceSource);
    const rec = localStorage.getItem(LS_KEYS.recents);
    if (s) state.sortMode = s;
    if (r) state.radiusKm = clamp(parseInt(r,10), 1, 10);
    if (p) state.priceSourceMode = clamp(parseInt(p,10), 0, 2);
    if (rec) {
      const arr = JSON.parse(rec);
      if (Array.isArray(arr) && arr.length) state.recentLabels = arr.slice(0,7);
    }
  } catch {}

  const CATALOG = [
    { id: 'chicken-breast', label: 'Chicken Breast (per lb)' },
    { id: 'ground-chicken', label: 'Ground Chicken (per lb)' },
    { id: 'milk-2l',        label: 'Milk 2L (2%)' },
    { id: 'apples',         label: 'Apples (Honeycrisp, per lb)' },
    { id: 'rice-5kg',       label: 'Rice 5kg' },
    { id: 'eggs-dozen',     label: 'Eggs — 12 pack' },
    { id: 'tomato-sauce',   label: 'Tomato sauce 680ml' },
  ];

  const OFFERS = {
    'chicken-breast': [
      {store:'Metro',    distance:0.6, price:9.49,  expiry:'2025-11-09', source:'Metro API',   address:'123 King St W'},
      {store:'Sobeys',   distance:0.4, price:9.95,  expiry:'2025-11-08', source:'Flipp',       address:'45 Bay St'},
      {store:'Walmart',  distance:1.3, price:10.49, expiry:'2025-11-10', source:'Walmart API', address:'999 Main St'},
      {store:'Fortinos', distance:2.2, price:9.79,  expiry:'2025-11-07', source:'Fortinos',    address:'210 Locke St'},
    ],
    'ground-chicken': [
      {store:'Walmart',  distance:1.3, price:6.99, expiry:'2025-11-10', source:'Walmart API', address:'999 Main St'},
      {store:'Metro',    distance:0.6, price:7.49, expiry:'2025-11-09', source:'Metro API',   address:'123 King St W'},
    ],
    'milk-2l': [
      {store:'Walmart',  distance:1.3, price:4.19, expiry:'2025-11-15', source:'Walmart API',  address:'999 Main St'},
      {store:'Fortinos', distance:2.2, price:4.29, expiry:'2025-11-11', source:'Fortinos',     address:'210 Locke St'},
      {store:'Metro',    distance:0.6, price:4.59, expiry:'2025-11-10', source:'Metro API',    address:'123 King St W'},
    ],
    'apples': [
      {store:'Fortinos', distance:2.2, price:2.19, expiry:'2025-11-12', source:'Fortinos', address:'210 Locke St'},
      {store:'Sobeys',   distance:0.4, price:2.29, expiry:'2025-11-13', source:'Flipp',    address:'45 Bay St'},
    ],
    'rice-5kg': [
      {store:'Metro',    distance:0.6, price:12.99, expiry:'2025-11-17', source:'Metro API', address:'123 King St W'},
    ],
    'eggs-dozen': [
      {store:'Sobeys',   distance:0.4, price:3.59, expiry:'2025-11-10', source:'Flipp',       address:'45 Bay St'},
      {store:'Walmart',  distance:1.3, price:3.69, expiry:'2025-11-10', source:'Walmart API', address:'999 Main St'},
    ],
    'tomato-sauce': [
      {store:'Metro',    distance:0.6, price:2.49, expiry:'2025-11-08', source:'Metro API',   address:'123 King St W'},
      {store:'Walmart',  distance:1.3, price:2.59, expiry:'2025-11-12', source:'Walmart API', address:'999 Main St'},
    ],
  };

  /* -----------------------------
     2) Utility helpers
  ----------------------------- */
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const daysLeft = (dateStr) => {
    // positive if in future, 0 if today/past
    const ms = new Date(dateStr).getTime() - state.today.getTime();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  };

  const announce = (msg) => {
    const live = $('#live-status');
    if (!live) return;
    // clear first to ensure screen readers re-announce
    live.textContent = '';
    setTimeout(() => { live.textContent = msg; }, 20);
  };

  const priceSourceLabel = (mode) => ([
    'Preferred store (Metro)',
    'Last paid price (user receipts)',
    'Blended (average across stores)'
  ])[mode % 3];

  const getCatalogItemByLabel = (label) =>
    CATALOG.find(c => c.label.toLowerCase() === String(label).toLowerCase());

  const savePrefs = () => {
    try {
      localStorage.setItem(LS_KEYS.priceSource, String(state.priceSourceMode));
      localStorage.setItem(LS_KEYS.sortMode, state.sortMode);
      localStorage.setItem(LS_KEYS.radiusKm, String(state.radiusKm));
      localStorage.setItem(LS_KEYS.recents, JSON.stringify(state.recentLabels.slice(0,7)));
    } catch {}
  };

  const pushRecentLabel = (label) => {
    const L = String(label || '').trim();
    if (!L) return;
    // move to front, uniq
    state.recentLabels = [L, ...state.recentLabels.filter(x => x !== L)].slice(0,7);
    savePrefs();
  };

  /* -----------------------------
     3) Screens (show/hide logic)
  ----------------------------- */
  const screens = () => ({
    home:     $('#home'),
    menu:     $('#deals-menu'),
    search:   $('#search'),
    results:  $('#results'),
    confirm:  $('#confirm'),
    about:    $('#about')
  });

  const showScreen = (name) => {
    const all = screens();
    Object.entries(all).forEach(([key, el]) => {
      if (!el) return;
      const isActive = key === name;
      el.hidden = !isActive;
      if (isActive) {
        state.activeScreen = key;
        // move focus to region title for accessibility
        const title = el.querySelector('h2, h3');
        (title || el).setAttribute('tabindex', '-1');
        (title || el).focus({ preventScroll: true });
      }
    });
    // sync hash (so back/forward works gracefully)
    const mapOut = { menu:'deals-menu' };
    const hash = (name in mapOut) ? mapOut[name] : name;
    history.replaceState(null, '', `#${hash}`);
  };

  /* -----------------------------
     4) Navigation wiring
  ----------------------------- */
  const handleScreenLink = (e) => {
    const a = e.currentTarget;
    if (!(a instanceof HTMLElement)) return;
    const href = a.getAttribute('href') || a.dataset.go;
    if (!href || !href.startsWith('#')) return;
    e.preventDefault();
    const id = href.slice(1);
    // map hash id back to screen key
    const map = { 'home':'home', 'deals-menu':'menu', 'search':'search', 'results':'results', 'confirm':'confirm', 'about':'about' };
    const target = map[id] || 'home';

    // ADDED: allow sample results when link is inside .cart-banner
    const allowSampleResults = !!a.closest('.cart-banner') || a.getAttribute('data-allow-sample') === 'true';

    // guard: if results without selection → go to search,
    // unless it's allowed to show sample results (resume trip scenario)
    if (target === 'results' && !state.activeItem) {
      if (allowSampleResults) {
        showSampleResults(); // ADDED
        return;
      }
      showScreen('search');
      announce('Please pick an item first.');
      return;
    }
    showScreen(target);
  };

  const bindNav = () => {
    $$('[data-screen-link], [data-go]').forEach(el => {
      el.addEventListener('click', handleScreenLink);
    });

    // Deep-link support on load or hash change
    const applyHash = () => {
      const raw = (location.hash || '#home').slice(1);
      const map = { 'home':'home', 'deals-menu':'menu', 'search':'search', 'results':'results', 'confirm':'confirm', 'about':'about' };
      const target = map[raw] || 'home';
      if (target === 'results' && !state.activeItem) return showScreen('search');
      showScreen(target);
    };
    window.addEventListener('hashchange', applyHash);
    applyHash();
  };

  /* -----------------------------
     5) Search & Suggestions (≤ 7)
  ----------------------------- */
  const search = {
    input: $('#q'),
    listboxWrap: $('#suggestions'),
    listbox: $('#suggest-list'),
    continueBtn: $('#search .btn-primary[type="submit"]'),
    exampleBtn:  $('#search [data-example]'),
    form: $('#search form.search-form'),
    selected: null, // catalog item object
  };

  const clearSuggestions = () => {
    if (!search.listbox) return;
    search.listbox.innerHTML = '';
    search.listboxWrap && (search.listboxWrap.hidden = true);
    search.input && search.input.setAttribute('aria-expanded', 'false');
  };

  const renderSuggestions = (term) => {
    if (!search.listbox || !search.listboxWrap || !search.input) return;
    const t = String(term || '').trim().toLowerCase();
    if (!t) { clearSuggestions(); setContinueEnabled(false); search.selected = null; return; }
    const items = CATALOG.filter(c => c.label.toLowerCase().includes(t)).slice(0, 7);

    if (!items.length) { clearSuggestions(); setContinueEnabled(false); search.selected = null; return; }

    search.listbox.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.role = 'option';
      li.id = `sug-${i}`;
      li.tabIndex = 0;
      li.textContent = item.label;
      li.addEventListener('click', () => chooseSuggestion(item));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chooseSuggestion(item);
        }
      });
      search.listbox.appendChild(li);
    });
    search.listboxWrap.hidden = false;
    search.input.setAttribute('aria-expanded', 'true');
  };

  const chooseSuggestion = (item) => {
    search.selected = item;
    if (search.input) search.input.value = item.label;
    clearSuggestions();
    setContinueEnabled(true);
  };

  const setContinueEnabled = (enabled) => {
    if (!search.continueBtn) return;
    search.continueBtn.disabled = !enabled;
    search.continueBtn.setAttribute('aria-disabled', String(!enabled));
  };

  const bindSearch = () => {
    if (!search.input) return;

    search.input.addEventListener('input', (e) => {
      renderSuggestions(e.currentTarget.value);
    });

    search.form && search.form.addEventListener('submit', (e) => {
      e.preventDefault();
      proceedToResults();
    });

    search.exampleBtn && search.exampleBtn.addEventListener('click', (e) => {
      const label = e.currentTarget.getAttribute('data-example') || '';
      const item = getCatalogItemByLabel(label) || CATALOG[0];
      chooseSuggestion(item);
      proceedToResults();
    });
  };

  // ADDED: shared helper to compute and render offers for item id
  const prepareOffersFor = (itemId) => {
    const offers = (OFFERS[itemId] || []).map(o => ({ ...o }));
    offers.forEach(o => { o._score = o.price + (o.distance * 0.25); });
    applySort(offers, state.sortMode);
    state.offers = offers;
  };

  const proceedToResults = () => {
    // fallback: if user typed exact match without selecting from listbox
    if (!search.selected && search.input) {
      const typed = getCatalogItemByLabel(search.input.value);
      if (typed) search.selected = typed;
    }
    if (!search.selected) return;

    state.activeItem = search.selected.id;

    // обновим “recent”
    pushRecentLabel(search.selected.label);

    // skeleton loading → имитация запроса (WoZ)
    showScreen('results');
    showSkeletonResults();

    // имитация 400–700мс
    const delay = 400 + Math.floor(Math.random()*300);
    setTimeout(() => {
      // prepare offers
      prepareOffersFor(state.activeItem); // ADDED (reused)
      // inject query label
      const qLabel = $('#query-label');
      if (qLabel) qLabel.textContent = search.selected.label;

      // update results
      renderResults();
      announce(`Showing best deals for ${search.selected.label}.`);
    }, delay);
  };

  /* -----------------------------
     6) Results Rendering (+ toolbar)
  ----------------------------- */
  const resultsEls = {
    tagBest:   $('#tag-best'),
    tagWarn:   $('#tag-warn'),
    list:      $('#store-list'),
    provenance: $('#provenance'),
    changeSourceBtn: $('#change-source'),
    // toolbar
    sort:      $('#sort-select'),
    radius:    $('#radius'),
    radiusLabel: $('#radius-label')
  };

  const filteredByRadius = (offers) =>
    offers.filter(o => o.distance <= (resultsEls.radius ? Number(resultsEls.radius.value || state.radiusKm) : state.radiusKm));

  const applySort = (arr, mode) => {
    if (!arr) return;
    if (mode === 'price')        arr.sort((a,b)=> a.price - b.price);
    else if (mode === 'distance')arr.sort((a,b)=> a.distance - b.distance);
    else if (mode === 'expiry')  arr.sort((a,b)=> daysLeft(a.expiry) - daysLeft(b.expiry));
    else                         arr.sort((a,b)=> (a.price + a.distance*0.25) - (b.price + b.distance*0.25)); // score
  };

  const showSkeletonResults = () => {
    if (!resultsEls.list) return;
    resultsEls.list.innerHTML = '';
    for (let i=0;i<4;i++){
      const li = document.createElement('li');
      li.className = 'store-card compact';
      li.innerHTML = `
        <div class="skel-card skel">
          <div class="skel-title"></div>
          <div class="skel-line" style="width:80%"></div>
        </div>
      `;
      resultsEls.list.appendChild(li);
    }
  };

  const renderResults = () => {
    const offersBase = state.offers || [];
    if (!resultsEls.list) return;

    // Header tags
    if (resultsEls.tagBest) resultsEls.tagBest.hidden = (offersBase.length === 0);
    const anySoon = offersBase.some(o => daysLeft(o.expiry) <= 2);
    if (resultsEls.tagWarn) resultsEls.tagWarn.hidden = !anySoon;

    // Provenance label
    if (resultsEls.provenance) {
      resultsEls.provenance.textContent = `Prices based on ${priceSourceLabel(state.priceSourceMode)}. Last sync: 2h ago.`;
    }

    // radius display (синхронизируем)
    if (resultsEls.radiusLabel && resultsEls.radius) {
      resultsEls.radiusLabel.textContent = `${resultsEls.radius.value || state.radiusKm} km`;
    }

    // Apply radius filter and sort
    const offers = filteredByRadius([...offersBase]);
    applySort(offers, state.sortMode);

    // List
    resultsEls.list.innerHTML = '';
    if (!offers.length) {
      const li = document.createElement('li');
      li.className = 'store-card';
      li.innerHTML = `<div><h4>No offers found</h4><div class="meta">Try another item, increase radius, or change your price source.</div></div>`;
      resultsEls.list.appendChild(li);
      return;
    }

    const best = offers[0];

    offers.forEach((o) => {
      const li = document.createElement('li');
      li.className = 'store-card' + (o === best ? ' best' : '');

      // LEFT block (store + meta)
      const left = document.createElement('div');
      const h4   = document.createElement('h4');
      h4.textContent = o.store;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const dleft = daysLeft(o.expiry);
      meta.innerHTML = `Distance: ${o.distance.toFixed(1)} km • Valid until <strong>${o.expiry}</strong> (${dleft} day${dleft !== 1 ? 's' : ''} left)`;

      left.appendChild(h4);
      left.appendChild(meta);

      // RIGHT block (price + tags)
      const right = document.createElement('div');
      const price = document.createElement('div');
      price.className = 'price';
      price.textContent = `$${o.price.toFixed(2)}`;

      const tagRow = document.createElement('div');
      tagRow.className = 'tag-row';

      const src = document.createElement('span');
      src.className = 'tag';
      src.textContent = `Source: ${o.source}`;
      tagRow.appendChild(src);

      if (o === best) {
        const bestTag = document.createElement('span');
        bestTag.className = 'tag tag-best';
        bestTag.textContent = 'Best deal';
        tagRow.appendChild(bestTag);
      }
      if (dleft <= 2) {
        const warnTag = document.createElement('span');
        warnTag.className = 'tag tag-warn';
        warnTag.textContent = 'Expires soon';
        tagRow.appendChild(warnTag);
      }

      right.appendChild(price);
      right.appendChild(tagRow);

      // Make whole card clickable (button-like)
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `${o.store}, price ${o.price.toFixed(2)}, ${o.distance.toFixed(1)} kilometers away, valid until ${o.expiry}`);
      li.addEventListener('click', () => { state.telemetry.offer_open++; openSheet(o); });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.telemetry.offer_open++;
          openSheet(o);
        }
      });

      li.appendChild(left);
      li.appendChild(right);
      resultsEls.list.appendChild(li);
    });
  };

  // Price source toggle
  const bindProvenanceToggle = () => {
    if (!resultsEls.changeSourceBtn) return;
    resultsEls.changeSourceBtn.addEventListener('click', () => {
      state.priceSourceMode = (state.priceSourceMode + 1) % 3;
      savePrefs();
      renderResults();
      announce(`Price source changed to ${priceSourceLabel(state.priceSourceMode)}.`);
    });
  };

  // Toolbar bindings
  const bindResultsTools = () => {
    if (resultsEls.sort) {
      // init from state
      resultsEls.sort.value = state.sortMode;
      resultsEls.sort.addEventListener('change', () => {
        state.sortMode = resultsEls.sort.value;
        savePrefs();
        renderResults();
      });
    }
    if (resultsEls.radius && resultsEls.radiusLabel) {
      // init from state
      resultsEls.radius.value = String(state.radiusKm);
      resultsEls.radiusLabel.textContent = `${state.radiusKm} km`;
      resultsEls.radius.addEventListener('input', () => {
        state.radiusKm = clamp(Number(resultsEls.radius.value), 1, 10);
        resultsEls.radiusLabel.textContent = `${state.radiusKm} km`;
        savePrefs();
        renderResults();
      });
    }
  };

  /* -----------------------------
     7) Details Sheet (modal)
  ----------------------------- */
  const sheet = {
    backdrop: $('#sheet-backdrop'),
    title:    $('#sheet-title'),
    desc:     $('#sheet-desc'),
    address:  $('#sheet-address'),
    expiry:   $('#sheet-expiry'),
    source:   $('#sheet-source'),
    rows:     $('#price-rows'),
    markBtn:  $('#mark-dest'),
    closeBtn: $('#close-sheet'),
    lastFocus: null, // for focus return
  };

  const openSheet = (offer) => {
    state.selectedOffer = offer;
    if (!sheet.backdrop) return;

    // Populate fields
    sheet.title && (sheet.title.textContent = `${offer.store} • $${offer.price.toFixed(2)}`);
    sheet.address && (sheet.address.textContent = offer.address);
    sheet.expiry && (sheet.expiry.textContent = `Valid until ${offer.expiry}`);
    sheet.source && (sheet.source.textContent = offer.source);

    // Add a small, realistic breakdown table (same as HTML plan)
    const upsell = [
      { label: 'Item',         price: offer.price },
      { label: 'Milk 2L',      price: 4.29 },
      { label: 'Apples (lb)',  price: 2.19 },
    ];
    sheet.rows && (sheet.rows.innerHTML = upsell
      .map(x => `
        <tr>
          <td>${x.label}</td>
          <td><strong>$${x.price.toFixed(2)}</strong></td>
        </tr>
      `).join(''));

    // Show
    sheet.backdrop.hidden = false;
    sheet.backdrop.setAttribute('aria-hidden', 'false');

    // Save last focus and move focus into dialog (accessibility)
    sheet.lastFocus = document.activeElement;
    (sheet.markBtn || sheet.closeBtn || sheet.title).focus({ preventScroll: true });

    // Close when clicking backdrop outside the sheet
    sheet.backdrop.addEventListener('click', backdropCloseHandler);
    document.addEventListener('keydown', escCloseHandler);
  };

  const closeSheet = () => {
    if (!sheet.backdrop) return;
    sheet.backdrop.hidden = true;
    sheet.backdrop.setAttribute('aria-hidden', 'true');

    document.removeEventListener('keydown', escCloseHandler);
    sheet.backdrop.removeEventListener('click', backdropCloseHandler);

    // restore focus
    if (sheet.lastFocus && typeof sheet.lastFocus.focus === 'function') {
      sheet.lastFocus.focus({ preventScroll: true });
    }
    state.selectedOffer = null;
  };

  const backdropCloseHandler = (e) => {
    if (e.target === sheet.backdrop) {
      closeSheet();
    }
  };
  const escCloseHandler = (e) => {
    if (e.key === 'Escape') closeSheet();
  };

  const bindSheet = () => {
    sheet.closeBtn && sheet.closeBtn.addEventListener('click', closeSheet);

    sheet.markBtn && sheet.markBtn.addEventListener('click', () => {
      if (!state.selectedOffer) return;

      // Compute comparative savings (best vs next best)
      const best = state.offers[0];
      const next = state.offers[1] || best;
      const sel  = state.selectedOffer;
      const savings = Math.max(0, (next.price - sel.price));

      // Fill confirmation values
      const destName = $('#dest-name');
      const destDist = $('#dest-distance');
      const destPrice= $('#dest-price');
      const destSave = $('#dest-savings');
      const destSaveCopy = $('#dest-savings-copy');

      destName  && (destName.textContent  = sel.store);
      destDist  && (destDist.textContent  = `${sel.distance.toFixed(1)} km`);
      destPrice && (destPrice.textContent = `$${sel.price.toFixed(2)}`);
      destSave  && (destSave.textContent  = `$${savings.toFixed(2)}`);
      destSaveCopy && (destSaveCopy.textContent = `$${savings.toFixed(2)}`);

      state.telemetry.confirm_done++;
      closeSheet();
      showScreen('confirm');
      announce(`Trip saved. Destination ${sel.store}. Estimated savings ${savings.toFixed(2)} dollars.`);
    });
  };

  /* -----------------------------
     8) Home Widgets (Quick start)
  ----------------------------- */
  const home = {
    chips: $('#recent-chips'),
    popularList: $('#popular-list')
  };

  const renderHomeWidgets = () => {
    // chips
    if (home.chips) {
      home.chips.innerHTML = '';
      state.recentLabels.slice(0,7).forEach(label=>{
        const chip = document.createElement('button');
        chip.type='button'; chip.className='chip';
        chip.textContent = label;
        chip.dataset.label = label;
        chip.addEventListener('click', ()=>{
          state.telemetry.chip_click++;
          const item = getCatalogItemByLabel(label) || CATALOG[0];
          chooseSuggestion(item);
          proceedToResults();
        });
        chip.addEventListener('keydown', (e)=>{
          if (e.key==='Enter' || e.key===' ') { e.preventDefault(); chip.click(); }
        });
        home.chips.appendChild(chip);
      });
    }

    // popular near you (take best offer for first N catalog items)
    if (home.popularList) {
      const items = CATALOG.slice(0,5).map(c=>{
        const offers = (OFFERS[c.id]||[]).map(o=>({...o, _score:o.price+o.distance*0.25}));
        offers.sort((a,b)=>a._score - b._score);
        return offers[0] ? {label:c.label, offer:offers[0]} : null;
      }).filter(Boolean).slice(0,3);

      home.popularList.innerHTML='';
      items.forEach(({label,offer})=>{
        const li = document.createElement('li');
        li.className='popular-item';
        li.innerHTML = `
          <div>
            <strong>${label}</strong>
            <div class="meta">${offer.store} • ${offer.distance.toFixed(1)} km • until ${offer.expiry}</div>
          </div>
          <div class="price">$${offer.price.toFixed(2)}</div>
        `;
        li.tabIndex=0;
        li.setAttribute('role','button');
        li.addEventListener('click', ()=>{
          state.telemetry.popular_click++;
          const item = getCatalogItemByLabel(label) || CATALOG[0];
          chooseSuggestion(item);
          proceedToResults();
        });
        li.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); li.click(); }});
        home.popularList.appendChild(li);
      });
    }
  };

  /* -----------------------------
     9) Hotkeys (QoL)
  ----------------------------- */
  const bindHotkeys = () => {
    document.addEventListener('keydown', (e)=>{
      // '/' → focus search
      if (e.key === '/' && state.activeScreen !== 'search') {
        e.preventDefault();
        showScreen('search');
        search.input && search.input.focus();
      }
      // '[' or ']' → change price source
      if ((e.key === '[' || e.key === ']') && state.activeScreen === 'results') {
        e.preventDefault();
        state.priceSourceMode = (state.priceSourceMode + (e.key === ']' ? 1 : 2)) % 3;
        savePrefs();
        renderResults();
        announce(`Price source changed to ${priceSourceLabel(state.priceSourceMode)}.`);
      }
      // 'Escape' handled also for sheet (already bound), no conflict
    });
  };

  /* -----------------------------
     10) App Init
  ----------------------------- */
  const init = () => {
    bindNav();
    bindSearch();

    // Ensure the details sheet starts hidden
    if (sheet.backdrop) {
      sheet.backdrop.hidden = true;
      sheet.backdrop.setAttribute('aria-hidden', 'true');
    }

    bindProvenanceToggle();
    bindResultsTools();
    bindSheet();
    bindHotkeys();

    // Initial continue disabled (safety)
    setContinueEnabled(false);

    // Render Home widgets
    renderHomeWidgets();

    // If landing directly on results/confirm without context, reset to proper screen
    const valid = new Set(['home', 'menu', 'search', 'results', 'confirm', 'about']);
    if (!valid.has(state.activeScreen)) showScreen('home');

    // If deep-linked to results without item, redirect to search
    if (state.activeScreen === 'results' && !state.activeItem) showScreen('search');
  };

  // ADDED: show sample results (used by Resume trip)
  function showSampleResults(){
    const sample = CATALOG[0]; // Chicken Breast
    state.activeItem = sample.id;

    showScreen('results');
    showSkeletonResults();

    const delay = 350 + Math.floor(Math.random()*250);
    setTimeout(()=>{
      prepareOffersFor(state.activeItem);
      const qLabel = $('#query-label');
      if (qLabel) qLabel.textContent = sample.label;
      renderResults();
      announce(`Showing sample results for ${sample.label}.`);
    }, delay);
  }

  // Wait for DOM content
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();

})();
