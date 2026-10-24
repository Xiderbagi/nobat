(() => {
  const { api, el, toast } = window.Nobat;
  const D = JSON.parse(document.getElementById('data').textContent);
  const $ = (id) => document.getElementById(id);
  const LABEL = { booked: 'Booked', arrived: 'Arrived', in_room: 'In room', done: 'Seen', no_show: 'No-show' };
  const CLS = { booked: '', arrived: 'warn', in_room: 'accent', done: 'good', no_show: 'bad' };
  let data = null;

  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
  const remember = (k, v) => { try { localStorage.setItem('nobat.' + k, v); } catch { /* private mode */ } };
  const recall = (k) => { try { return localStorage.getItem('nobat.' + k); } catch { return null; } };

  $('date').value = today();
  if (recall('doctor') && [...$('doctor').options].some((o) => o.value === recall('doctor'))) $('doctor').value = recall('doctor');

  async function load() {
    if (!$('doctor').value) { $('rows').replaceChildren(el('tr', {}, el('td', { colspan: 5, class: 'muted' }, 'Add a doctor under Settings first.'))); return; }
    data = await api(`/api/s/day?doctorId=${$('doctor').value}&date=${$('date').value}`);
    $('publicLink').href = `/c/${D.clinicSlug}/d/${data.doctor.id}`;
    render();
  }

  async function setStatus(id, status) {
    try { await api(`/api/s/bookings/${id}/status`, 'POST', { status }); await load(); } catch (e) { toast(e.message); }
  }

  function render() {
    const rows = data.rows;
    const count = (s) => rows.filter((r) => r.status === s).length;
    $('kpis').replaceChildren(...[['Booked', rows.length], ['Waiting', count('booked') + count('arrived')], ['Seen', count('done')], ['No-shows', count('no_show')]]
      .map(([a, b]) => el('div', { class: 'kpi' }, el('span', {}, a), el('b', {}, String(b)))));

    $('rows').replaceChildren(...(rows.length ? rows.map((r) => {
      const actions = [];
      if (r.status === 'booked') actions.push(['Arrived', 'arrived'], ['No-show', 'no_show']);
      if (r.status === 'arrived') actions.push(['No-show', 'no_show']);
      if (r.status === 'no_show') actions.push(['Came back', 'arrived']);
      return el('tr', { class: r.status === 'in_room' ? 'cur' : '' },
        el('td', { class: 'num' }, String(r.queueNo)),
        el('td', {}, el('b', {}, r.name), r.phone ? el('div', { class: 'muted small', dir: 'ltr' }, r.phone) : null, r.source === 'walkin' ? el('div', { class: 'muted small' }, 'Walk-in') : null),
        el('td', { class: 'num' }, r.time || '–'),
        el('td', {}, el('span', { class: 'pill ' + CLS[r.status] }, LABEL[r.status])),
        el('td', { class: 'actions' }, actions.map(([label, s]) => el('button', { type: 'button', class: 'btn ghost small', onclick: () => setStatus(r.id, s) }, label))));
    }) : [el('tr', {}, el('td', { colspan: 5, class: 'muted' }, 'No patients booked for this day yet.'))]));

    const cur = rows.find((r) => r.status === 'in_room');
    const waiting = rows.filter((r) => r.status === 'booked' || r.status === 'arrived');
    $('now').replaceChildren(
      el('h2', {}, 'In the room now'),
      cur ? el('div', { class: 'nowrow' }, el('span', { class: 'bignum' }, String(cur.queueNo)), el('b', {}, cur.name)) : el('p', { class: 'muted' }, 'Nobody yet.'),
      el('button', { type: 'button', class: 'btn primary big', disabled: !waiting.length && !cur, onclick: next }, waiting.length ? `Call next patient (#${waiting[0].queueNo})` : cur ? 'Finish this patient' : 'No one waiting'),
      el('p', { class: 'muted small' }, 'Calling the next patient also messages the person 2 places behind, so they leave home on time.'));
  }

  async function next() {
    try {
      const r = await api('/api/s/next', 'POST', { doctorId: $('doctor').value, date: $('date').value });
      toast(r.called ? `Called #${r.called.queueNo} ${r.called.name}.` : 'The last patient is finished.');
      await load();
    } catch (e) { toast(e.message); }
  }

  $('walkin').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/s/walkin', 'POST', { doctorId: $('doctor').value, date: $('date').value, name: $('wName').value, phone: $('wPhone').value });
      toast(`Added as number ${r.queueNo}.`);
      $('walkin').reset();
      await load();
    } catch (err) { toast(err.message); }
  });
  $('doctor').addEventListener('change', () => { remember('doctor', $('doctor').value); load(); });
  $('date').addEventListener('change', load);

  load().catch((e) => toast(e.message));
  setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 20000);
})();
