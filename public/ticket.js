(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const T = D.t;
  const box = document.getElementById('ticket');
  const cancelBtn = document.getElementById('cancel');
  let timer;

  const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; n.append(...kids); return n; };

  function render(s) {
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
    const meta = el('div', 'meta', `${T.date}: ${s.date}` + (s.time ? ` · ${T.time}: ${s.time}` : ''));
    box.replaceChildren(nums, el('p', 'eta', line), meta);
    cancelBtn.hidden = !['booked', 'arrived'].includes(s.status);
    if (['done', 'cancelled'].includes(s.status)) clearInterval(timer);
  }

  async function refresh() {
    try {
      const res = await fetch(`/api/p/t/${D.token}`);
      if (res.ok) render(await res.json());
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
