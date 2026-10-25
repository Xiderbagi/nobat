(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const T = D.t;
  const $ = (id) => document.getElementById(id);
  const state = { q: '', cat: '', kind: '', lat: null, lng: null, view: 'list', results: [] };
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

  function renderCats() {
    const cats = D.categories.filter((c) => !state.kind || c.kind === state.kind);
    $('cats').replaceChildren(...cats.map((c) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(state.cat === c.key),
      onclick: () => { state.cat = state.cat === c.key ? '' : c.key; renderCats(); load(); }
    }, c.name)));
  }

  function card(r) {
    const meta = [r.kind === 'salon' ? T.salonsTab : null, [r.address, r.city].filter(Boolean).join(', '), r.distanceKm != null ? tr('kmAway', { km: r.distanceKm }) : null].filter(Boolean).join(' · ');
    return el('article', { class: 'card result' + (r.featured ? ' featured' : '') },
      el('div', { class: 'row' },
        el('a', { href: bookUrl(r), class: 'rname' }, el('b', {}, r.name)),
        r.featured ? el('span', { class: 'pill accent' }, '★ ' + T.featured) : null,
        el('span', { class: 'grow' }),
        r.rating.count ? el('span', { class: 'rating' }, el('span', { class: 'stars', 'aria-hidden': 'true' }, stars(r.rating.overall)), ` ${r.rating.overall.toFixed(1)} (${r.rating.count})`) : null),
      el('p', { class: 'muted small' }, meta),
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
      L.circleMarker([r.lat, r.lng], { radius: r.featured ? 11 : 8, color: '#ffffff', weight: 2, fillColor: r.featured ? '#d9573a' : '#1f5fbf', fillOpacity: 1 }).bindPopup(popup).addTo(layer);
      pts.push([r.lat, r.lng]);
    }
    if (state.lat != null) {
      L.circleMarker([state.lat, state.lng], { radius: 7, color: '#1f5fbf', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }).addTo(layer);
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
