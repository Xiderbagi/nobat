(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const T = D.t;
  const $ = (id) => document.getElementById(id);
  const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const state = { date: null, time: null, info: null };

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter((k) => k != null));
    return n;
  };
  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await res.json().catch(() => ({ error: 'error' }));
    if (!res.ok) throw new Error(data.error || 'error');
    return data;
  }
  const chosen = () => [...$('svcs').querySelectorAll('input:checked')];
  const staffId = () => (document.querySelector('input[name="staff"]:checked') || {}).value || '';
  function showError(code) { const e = $('err'); e.textContent = T[code] || T.error; e.hidden = false; }

  async function load(date) {
    const ids = chosen().map((i) => i.value).join(',');
    const info = await api(`/api/p/salons/${D.clinicId}/times?services=${ids}&staff=${staffId()}${date ? '&date=' + date : state.date ? '&date=' + state.date : ''}`);
    state.info = info; state.date = info.date;
    if (!info.times.includes(state.time)) state.time = null;
    render();
  }

  function render() {
    const info = state.info;
    $('days').replaceChildren(...info.days.map((d, i) => el('button', {
      type: 'button', class: 'day', 'aria-pressed': String(d.date === state.date), disabled: !d.open, onclick: () => load(d.date)
    }, el('span', {}, i === 0 ? T.today : T[WEEK[d.weekday]]), el('b', {}, String(Number(d.date.slice(8)))), d.open ? null : el('small', {}, T.closed))));
    const picked = chosen();
    if (!picked.length) { $('pick').replaceChildren(el('p', { class: 'muted' }, T.needService)); $('form').hidden = true; $('summary').hidden = true; return; }
    $('pick').replaceChildren(info.times.length
      ? el('div', { class: 'slots' }, ...info.times.map((tm) => el('button', { type: 'button', class: 'slot', 'aria-pressed': String(state.time === tm), onclick: () => { state.time = tm; render(); $('name').focus(); } }, tm)))
      : el('p', { class: 'muted' }, T.noTimes));
    const price = picked.reduce((a, i) => a + Number(i.dataset.price), 0);
    $('summary').hidden = false;
    $('summary').replaceChildren(el('b', {}, `${T.total}: ${price.toLocaleString('en-US')} ${T.iqd} · ${info.minutes} ${T.minutes}`), state.time ? el('span', { dir: 'ltr' }, `${state.date} · ${state.time}`) : '');
    $('form').hidden = !state.time;
  }

  $('svcs').addEventListener('change', () => load().catch(() => showError('error')));
  $('staff').addEventListener('change', () => load().catch(() => showError('error')));

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
      const r = await api('/api/p/salon-bookings', {
        clinicId: D.clinicId, staffId: staffId(), serviceIds: chosen().map((i) => Number(i.value)), date: state.date, time: state.time,
        name: $('name').value, phone: $('phone').value, code: $('code').value, lang: D.lang
      });
      location.href = `/t/${r.token}`;
    } catch (err) {
      showError(err.message);
      if (err.message === 'slotTaken') load();
      btn.disabled = false;
    }
  });

  load().catch(() => showError('error'));
})();
