(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const T = D.t;
  const $ = (id) => document.getElementById(id);
  const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const state = { date: null, time: null, info: null };

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await res.json().catch(() => ({ error: 'error' }));
    if (!res.ok) throw new Error(data.error || 'error');
    return data;
  }
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter((k) => k != null));
    return n;
  };
  function showError(code) { const e = $('err'); e.textContent = T[code] || T.error; e.hidden = false; }

  async function load(date) {
    const info = await api(`/api/p/doctors/${D.doctorId}/day${date ? '?date=' + date : ''}`);
    state.info = info; state.date = info.date; state.time = null;
    render();
  }

  function render() {
    const info = state.info;
    $('days').replaceChildren(...info.days.map((d, i) => el('button', {
      type: 'button', class: 'day', 'aria-pressed': String(d.date === state.date), disabled: !d.open,
      onclick: () => load(d.date)
    }, el('span', {}, i === 0 ? T.today : T[WEEK[d.weekday]]), el('b', {}, String(Number(d.date.slice(8)))), d.open ? null : el('small', {}, T.closed))));

    const pick = $('pick');
    const open = info.days.some((d) => d.date === state.date && d.open);
    if (!open) { pick.replaceChildren(el('p', { class: 'muted' }, T.closed)); $('form').hidden = true; return; }
    if (info.mode === 'time') {
      const free = info.slots.filter((s) => s.free);
      if (!free.length) { pick.replaceChildren(el('p', { class: 'muted' }, T.noSlots)); $('form').hidden = true; return; }
      pick.replaceChildren(el('div', { class: 'slots' }, ...info.slots.map((s) => el('button', {
        type: 'button', class: 'slot', disabled: !s.free, 'aria-pressed': String(state.time === s.time),
        onclick: () => { state.time = s.time; render(); $('name').focus(); }
      }, s.time))));
      $('form').hidden = !state.time;
    } else {
      const q = info.queue;
      if (q.full) { pick.replaceChildren(el('p', { class: 'muted' }, T.full)); $('form').hidden = true; return; }
      pick.replaceChildren(el('div', { class: 'qbox' }, el('span', {}, T.nextNumber), el('b', { class: 'qno' }, '#' + q.next), el('span', { class: 'muted' }, `${T.expected}: ~${q.expected}`)));
      $('form').hidden = false;
    }
  }

  $('sendCode').addEventListener('click', async () => {
    $('err').hidden = true;
    const btn = $('sendCode'); btn.disabled = true;
    try {
      const r = await api('/api/p/otp', { phone: $('phone').value, lang: D.lang });
      $('codeMsg').textContent = `${T.codeSent} ${r.phone}` + (r.devCode ? ` (test mode code: ${r.devCode})` : '');
      $('codeBox').hidden = false; $('code').focus();
    } catch (e) { showError(e.message); }
    finally { setTimeout(() => { btn.disabled = false; }, 15000); }
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('err').hidden = true;
    const btn = $('confirm'); btn.disabled = true;
    try {
      const r = await api('/api/p/bookings', { doctorId: D.doctorId, date: state.date, time: state.time, name: $('name').value, phone: $('phone').value, code: $('code').value, lang: D.lang });
      location.href = `/t/${r.token}`;
    } catch (err) {
      showError(err.message);
      if (err.message === 'slotTaken') load(state.date);
      btn.disabled = false;
    }
  });

  load().catch(() => showError('error'));
})();
