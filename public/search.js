(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const T = D.t;
  const $ = (id) => document.getElementById(id);
  const state = { q: '', cat: D.cat || '', kind: D.kind || '', lat: null, lng: null, view: 'list', results: [] };
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#0b8f7a';
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  let map = null;
  let layer = null;

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
    return n;
  };
  const tr = (key, vars) => { let s = T[key] || key; for (const [k, v] of Object.entries(vars || {})) s = s.split('{' + k + '}').join(String(v)); return s; };
  const stars = (v) => '★'.repeat(Math.round(v || 0)) + '☆'.repeat(5 - Math.round(v || 0));
  const bookUrl = (r, d) => (r.kind === 'clinic' && d ? `/c/${r.slug}/d/${d.id}` : `/c/${r.slug}`) + `?lang=${D.lang}`;

  // Choosing a category (a tile, or one of the Barbers / Spa / Women's salons cards) toggles it and shows the results.
  function pickCat(key) {
    state.cat = state.cat === key ? '' : key;
    renderCats(); load();
    $('results').scrollIntoView({ behavior: smooth(), block: 'start' });
  }

  function renderCats() {
    document.querySelectorAll('.mood').forEach((b) => b.setAttribute('aria-pressed', String(state.cat === b.dataset.cat)));
    const cats = D.categories.filter((c) => !state.kind || c.kind === state.kind);
    $('cats').replaceChildren(...cats.map((c) => {
      const icon = D.icons[c.key] || { tone: 'teal', svg: '' };
      const ic = el('span', { class: `cat-ic tone-${icon.tone}` });
      ic.innerHTML = icon.svg; // our own fixed icons
      return el('button', {
        type: 'button', class: 'cat-tile', 'aria-pressed': String(state.cat === c.key),
        onclick: () => pickCat(c.key)
      }, ic, c.name);
    }));
  }

  function card(r) {
    const meta = [r.kind === 'salon' ? T.salonsTab : null, [r.address, r.city].filter(Boolean).join(', '), r.distanceKm != null ? tr('kmAway', { km: r.distanceKm }) : null].filter(Boolean).join(' · ');
    const initials = r.name.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2);
    return el('article', { class: 'card result' + (r.featured ? ' featured' : '') },
      r.photo ? el('a', { href: bookUrl(r), class: 'result-photo', tabindex: '-1', 'aria-hidden': 'true' }, el('img', { src: r.photo, alt: '', loading: 'lazy' })) : null,
      el('div', { class: 'head' },
        el('span', { class: `av ${r.tone}` }, initials),
        el('div', { class: 'grow' },
          el('div', { class: 'row' }, el('a', { href: bookUrl(r), class: 'rname' }, r.name), r.featured ? el('span', { class: 'pill accent' }, '★ ' + T.featured) : null),
          el('p', { class: 'muted small' }, meta)),
        r.rating.count ? el('span', { class: 'rating' }, '★ ' + r.rating.overall.toFixed(1), el('span', { class: 'muted' }, ` (${r.rating.count})`)) : null),
      el('div', { class: 'tags' }, r.categories.slice(0, 4).map((k) => el('span', { class: 'pill' }, D.catNames[k] || k))),
      r.kind === 'clinic'
        ? el('div', { class: 'docs' }, r.doctors.map((d) => el('a', { class: 'docrow', href: bookUrl(r, d) },
          el('span', {}, el('b', {}, d.name), el('span', { class: 'muted small' }, ' · ' + (d.specialty || D.catNames[d.category] || ''))),
          el('span', { class: 'muted small nowrap' }, d.fee ? `${T.fromFee}: ${d.fee.toLocaleString('en-US')} ${T.iqd}` : ''),
          el('span', { class: 'btn primary small' }, T.bookBtn))))
        : el('div', { class: 'row' }, el('a', { class: 'btn primary small', href: bookUrl(r) }, T.bookBtn)),
      r.lat != null ? el('a', { class: 'small', href: `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`, target: '_blank', rel: 'noopener' }, '📍 ' + T.directions) : null);
  }

  function renderList() {
    $('results').replaceChildren(...(state.results.length ? state.results.map(card) : [el('p', { class: 'muted card' }, T.noResults)]));
  }

  function renderMap() {
    if (!window.L) return;
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false }).setView([36.19, 44.01], 8); // Kurdistan Region
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    }
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    const pts = [];
    for (const r of state.results.filter((x) => x.lat != null)) {
      const popup = el('div', { class: 'pop' }, el('b', {}, r.name), el('br'), r.rating.count ? `${stars(r.rating.overall)} ` : '', el('br'), el('a', { href: bookUrl(r) }, T.bookBtn));
      L.circleMarker([r.lat, r.lng], { radius: r.featured ? 11 : 8, color: '#ffffff', weight: 2, fillColor: r.featured ? '#d9573a' : accent, fillOpacity: 1 }).bindPopup(popup).addTo(layer);
      pts.push([r.lat, r.lng]);
    }
    if (state.lat != null) {
      L.circleMarker([state.lat, state.lng], { radius: 7, color: accent, weight: 3, fillColor: '#ffffff', fillOpacity: 1 }).addTo(layer);
      pts.push([state.lat, state.lng]);
    }
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 50);
  }

  function render() {
    $('map').hidden = state.view !== 'map';
    renderList();
    if (state.view === 'map') renderMap();
  }

  async function load() {
    const p = new URLSearchParams({ q: state.q, cat: state.cat, kind: state.kind });
    if (state.lat != null) { p.set('lat', state.lat); p.set('lng', state.lng); }
    try {
      const res = await fetch('/api/p/search?' + p);
      state.results = (await res.json()).results || [];
    } catch { state.results = []; }
    render();
  }

  $('searchForm').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('q').value.trim(); load(); });
  let typing;
  $('q').addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { state.q = $('q').value.trim(); load(); }, 300); });
  document.querySelectorAll('.kindtabs .chip').forEach((b) => b.addEventListener('click', () => {
    state.kind = b.dataset.kind; state.cat = '';
    document.querySelectorAll('.kindtabs .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderCats(); load();
  }));
  document.querySelectorAll('.viewtabs .chip').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    document.querySelectorAll('.viewtabs .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  document.querySelectorAll('.mood').forEach((b) => b.addEventListener('click', () => pickCat(b.dataset.cat)));
  $('near').addEventListener('click', () => {
    if (!navigator.geolocation) { $('status').textContent = T.locDenied; return; }
    $('status').textContent = T.locating;
    navigator.geolocation.getCurrentPosition((pos) => {
      state.lat = Math.round(pos.coords.latitude * 1e4) / 1e4; state.lng = Math.round(pos.coords.longitude * 1e4) / 1e4;
      $('status').textContent = ''; $('near').setAttribute('aria-pressed', 'true'); load();
    }, () => { $('status').textContent = T.locDenied; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  renderCats();
  load();
})();
