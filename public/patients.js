(() => {
  const { tr, api, el, toast } = window.Nobat;
  const q = document.getElementById('q');
  const rows = document.getElementById('rows');
  let timer;

  async function load() {
    const data = await api(`/api/s/patients?q=${encodeURIComponent(q.value)}`);
    rows.replaceChildren(...(data.rows.length ? data.rows.map((p) => el('tr', { class: 'link', onclick: () => { location.href = `/app/patients/${p.id}`; } },
      el('td', {}, el('a', { href: `/app/patients/${p.id}` }, el('b', {}, p.name))),
      el('td', { dir: 'ltr', class: 'nowrap' }, p.phone),
      el('td', { dir: 'ltr' }, p.last_visit || '–'),
      el('td', { class: 'num' }, String(p.visits)))) : [el('tr', {}, el('td', { colspan: 4, class: 'muted' }, tr('noPatients')))]));
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load().catch((e) => toast(e.message)), 250); });
  load().catch((e) => toast(e.message));
})();
