(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const T = D.t;
  const box = document.getElementById('ticket');
  const cancelBtn = document.getElementById('cancel');
  let timer;

  const ltr = (text) => { const b = document.createElement('bdi'); b.dir = 'ltr'; b.textContent = text; return b; };
  const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; n.append(...kids); return n; };

  function renderSalon(s) {
    box.className = 'ticket' + (s.status === 'done' ? ' turn' : ['cancelled', 'no_show'].includes(s.status) ? ' over' : '');
    const line = s.status === 'cancelled' ? T.cancelled : s.status === 'done' ? T.finished : s.status === 'no_show' ? T.missed : T.bookedTitle;
    box.replaceChildren(
      el('p', 'eta', line),
      el('div', 'nums', el('div', '', el('span', '', T.time), el('b', 'ltr', s.time || '–')), el('div', '', el('span', '', T.with), el('b', 'small-b', s.staff))),
      el('div', 'meta', `${T.date}: `, ltr(s.date), s.services ? ` · ${s.services}` : ''));
    cancelBtn.hidden = !['booked', 'arrived'].includes(s.status);
  }

  function render(s) {
    if (s.salon) return renderSalon(s);
    box.className = 'ticket' + (s.status === 'in_room' ? ' turn' : ['done', 'cancelled', 'no_show'].includes(s.status) ? ' over' : '');
    const nums = el('div', 'nums',
      el('div', '', el('span', '', T.yourNumber), el('b', '', String(s.queueNo))),
      el('div', '', el('span', '', T.nowServing), el('b', '', s.nowServing == null ? '–' : String(s.nowServing))));
    let line;
    if (s.status === 'in_room') line = T.yourTurn;
    else if (s.status === 'done') line = T.finished;
    else if (s.status === 'cancelled') line = T.cancelled;
    else if (s.status === 'no_show') line = T.missed;
    else if (s.nowServing == null && s.ahead === 0) line = T.notStarted;
    else line = `${s.ahead} ${T.ahead} · ${T.aboutMin.replace('{m}', s.minutes)}`;
    const meta = el('div', 'meta', `${T.date}: `, ltr(s.date), s.time ? ` · ${T.time}: ` : '', s.time ? ltr(s.time) : '');
    box.replaceChildren(nums, el('p', 'eta', line), meta);
    cancelBtn.hidden = !['booked', 'arrived'].includes(s.status);
    if (['done', 'cancelled'].includes(s.status)) clearInterval(timer);
  }

  // After the visit: rate it on four points, plus an optional comment.
  const form = document.getElementById('review');
  const picked = {};
  let formShown = false;
  function showReview(s) {
    if (s.reviewed && !formShown) { form.hidden = true; return; }
    if (!s.canReview || formShown) return;
    formShown = true;
    form.hidden = false;
    const rows = D.points.map((p) => {
      const btns = [1, 2, 3, 4, 5].map((n) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'star'; b.textContent = '★'; b.setAttribute('aria-label', `${p.name}: ${n}`);
        b.addEventListener('click', () => { picked[p.key] = n; [...b.parentNode.children].forEach((x, i) => x.classList.toggle('on', i < n)); });
        return b;
      });
      const row = el('div', 'rate-row', el('span', '', p.name));
      const group = el('span', 'stars-input', ...btns);
      group.setAttribute('role', 'group'); group.setAttribute('aria-label', p.name);
      row.append(group);
      return row;
    });
    const comment = document.createElement('textarea');
    comment.rows = 3; comment.maxLength = 1000; comment.id = 'rcomment';
    const err = el('p', 'err'); err.hidden = true; err.setAttribute('role', 'alert');
    const send = el('button', 'btn primary big', T.sendReview);
    form.replaceChildren(el('h2', '', T.rateVisit), el('p', 'muted small', T.rateHint), ...rows, el('label', '', T.yourComment, comment), err, send);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (D.points.some((p) => !picked[p.key])) { err.textContent = T.needStars; err.hidden = false; return; }
      send.disabled = true;
      const res = await fetch(`/api/p/t/${D.token}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...picked, comment: comment.value, lang: D.lang }) });
      if (res.ok) form.replaceChildren(el('p', 'thanks', T.thanksReview));
      else { err.textContent = T.error; err.hidden = false; send.disabled = false; }
    });
  }

  async function refresh() {
    try {
      const res = await fetch(`/api/p/t/${D.token}`);
      if (res.ok) { const s = await res.json(); render(s); showReview(s); }
    } catch { /* offline: try again on the next tick */ }
  }

  let confirming = false;
  cancelBtn.addEventListener('click', async () => {
    if (!confirming) { confirming = true; cancelBtn.textContent = T.cancel + ' ?'; cancelBtn.classList.add('danger'); return; }
    const res = await fetch(`/api/p/t/${D.token}/cancel`, { method: 'POST' });
    if (res.ok) refresh();
  });

  refresh();
  timer = setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
