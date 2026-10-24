(() => {
  const { D, tr, api, el, toast, today } = window.Nobat;
  const $ = (id) => document.getElementById(id);
  const salon = D.kind === 'salon';
  const CLS = { booked: '', arrived: 'warn', in_room: 'accent', done: 'good', no_show: 'bad' };
  let data = null;

  const remember = (k, v) => { try { localStorage.setItem('nobat.' + k, v); } catch { /* private mode */ } };
  const recall = (k) => { try { return localStorage.getItem('nobat.' + k); } catch { return null; } };

  $('date').value = today();
  if (!salon && recall('doctor') && [...$('doctor').options].some((o) => o.value === recall('doctor'))) $('doctor').value = recall('doctor');

  function links() {
    const doc = salon ? '' : $('doctor').value;
    $('publicLink').href = salon ? `/c/${D.clinicSlug}` : `/c/${D.clinicSlug}/d/${doc}`;
    $('posterLink').href = salon ? '/app/poster' : `/app/poster/${doc}`;
  }

  async function load() {
    if (!salon && !$('doctor')?.value) { $('rows').replaceChildren(el('tr', {}, el('td', { colspan: 6, class: 'muted' }, tr('addProviderFirst')))); return; }
    data = await api(`/api/s/day?date=${$('date').value}` + (salon ? '' : `&doctorId=${$('doctor').value}`));
    links();
    render();
  }

  async function setStatus(id, status) {
    try { await api(`/api/s/bookings/${id}/status`, 'POST', { status }); await load(); } catch (e) { toast(e.message); }
  }

  function actionsFor(r) {
    const a = [];
    if (r.status === 'booked') a.push(['aArrived', 'arrived'], ['aNoShow', 'no_show']);
    if (r.status === 'arrived') a.push(salon ? ['aStart', 'in_room'] : ['aNoShow', 'no_show']);
    if (salon && r.status === 'in_room') a.push(['aDone', 'done']);
    if (r.status === 'no_show') a.push(['aBack', 'arrived']);
    return el('td', { class: 'actions' }, a.map(([label, s]) => el('button', { type: 'button', class: 'btn ghost small', onclick: () => setStatus(r.id, s) }, tr(label))));
  }

  function who(r) {
    const name = r.patientId ? el('a', { href: `/app/patients/${r.patientId}` }, el('b', {}, r.name)) : el('b', {}, r.name);
    return el('td', {}, name, r.phone ? el('div', { class: 'muted small', dir: 'ltr' }, r.phone) : null, r.source === 'walkin' ? el('div', { class: 'muted small' }, tr('walkin')) : null);
  }

  function render() {
    const rows = data.rows;
    const count = (s) => rows.filter((r) => r.status === s).length;
    $('kpis').replaceChildren(...[['kBooked', rows.length], ['kWaiting', count('booked') + count('arrived')], ['kSeen', count('done')], ['kNoShow', count('no_show')]]
      .map(([a, b]) => el('div', { class: 'kpi' }, el('span', {}, tr(a)), el('b', {}, String(b)))));

    const empty = [el('tr', {}, el('td', { colspan: 6, class: 'muted' }, tr('noneBooked')))];
    $('rows').replaceChildren(...(rows.length ? rows.map((r) => salon
      ? el('tr', { class: r.status === 'in_room' ? 'cur' : '' },
        el('td', { class: 'num', dir: 'ltr' }, r.time || '–'), who(r), el('td', {}, r.services || ''), el('td', {}, r.staff),
        el('td', {}, el('span', { class: 'pill ' + CLS[r.status] }, tr('st_' + r.status))), actionsFor(r))
      : el('tr', { class: r.status === 'in_room' ? 'cur' : '' },
        el('td', { class: 'num' }, String(r.queueNo)), who(r), el('td', { class: 'num', dir: 'ltr' }, r.time || '–'),
        el('td', {}, el('span', { class: 'pill ' + CLS[r.status] }, tr('st_' + r.status))), actionsFor(r))) : empty));

    if (salon) {
      const box = $('wServices');
      if (!box.childElementCount) box.replaceChildren(...data.services.map((s) => el('label', { class: 'check' }, el('input', { type: 'checkbox', value: s.id }), `${s.name} · ${s.minutes}′`)));
      if (!$('wTime').value) {
        const d = new Date(Date.now() + 15 * 60000);
        const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).split(':');
        $('wTime').value = `${hm[0]}:${String(Math.ceil(Number(hm[1]) / 15) * 15 % 60).padStart(2, '0')}`;
      }
      return;
    }
    const cur = rows.find((r) => r.status === 'in_room');
    const waiting = rows.filter((r) => r.status === 'booked' || r.status === 'arrived');
    $('now').replaceChildren(
      el('h2', {}, tr('inRoom')),
      cur ? el('div', { class: 'nowrow' }, el('span', { class: 'bignum' }, String(cur.queueNo)), el('b', {}, cur.name)) : el('p', { class: 'muted' }, tr('nobodyYet')),
      el('button', { type: 'button', class: 'btn primary big', disabled: !waiting.length && !cur, onclick: next }, waiting.length ? tr('callNext', { n: waiting[0].queueNo }) : cur ? tr('finishLast') : tr('noneWaiting')),
      el('p', { class: 'muted small' }, tr('nearHint')));
  }

  async function next() {
    try {
      const r = await api('/api/s/next', 'POST', { doctorId: $('doctor').value, date: $('date').value });
      toast(r.called ? tr('called', { n: r.called.queueNo, name: r.called.name }) : tr('lastDone'));
      await load();
    } catch (e) { toast(e.message); }
  }

  $('walkin').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = { date: $('date').value, name: $('wName').value, phone: $('wPhone').value };
      if (salon) {
        Object.assign(body, { staffId: $('wStaff').value, time: $('wTime').value, serviceIds: [...$('wServices').querySelectorAll('input:checked')].map((i) => Number(i.value)) });
        const r = await api('/api/s/walkin', 'POST', body);
        toast(tr('bookingAdded', { time: `${r.time} · ${r.staff}` }));
      } else {
        const r = await api('/api/s/walkin', 'POST', { ...body, doctorId: $('doctor').value });
        toast(tr('addedAs', { n: r.queueNo }));
      }
      $('wName').value = ''; $('wPhone').value = '';
      await load();
    } catch (err) { toast(err.message); }
  });
  $('doctor')?.addEventListener('change', () => { remember('doctor', $('doctor').value); load(); });
  $('date').addEventListener('change', load);

  load().catch((e) => toast(e.message));
  setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 20000);
})();
