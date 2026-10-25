(() => {
  const { D, tr, api, el, toast } = window.Nobat;
  const root = document.getElementById('file');
  const ST = { booked: 'st_booked', arrived: 'st_arrived', in_room: 'st_in_room', done: 'st_done', no_show: 'st_no_show', cancelled: 'st_cancelled' };
  let F = null;

  const field = (label, input, hint) => el('label', {}, label, input, hint ? el('span', { class: 'muted small' }, hint) : null);
  const val = (id) => document.getElementById(id).value;

  async function load() { F = await api(`/api/s/patients/${D.patientId}`); render(); }

  function details() {
    const p = F.patient;
    const extra = F.canReadNotes ? [
      field(tr('allergies'), el('input', { id: 'f_allergies', value: p.allergies || '', maxlength: 300 })),
      field(tr('generalNotes'), el('textarea', { id: 'f_notes', rows: 3, maxlength: 2000 }, p.notes || ''))
    ] : [];
    return el('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const body = { name: val('f_name'), birth_year: val('f_birth'), follow_up_date: val('f_follow') };
      if (F.canReadNotes) Object.assign(body, { allergies: val('f_allergies'), notes: val('f_notes') });
      try { await api(`/api/s/patients/${p.id}`, 'PUT', body); toast(tr('saved')); await load(); } catch (err) { toast(err.message); }
    } },
      el('div', { class: 'grid2' },
        field(tr('name'), el('input', { id: 'f_name', value: p.name, maxlength: 60 })),
        field(tr('mobile'), el('input', { value: p.phone, disabled: true, dir: 'ltr' })),
        field(tr('birth'), el('input', { id: 'f_birth', type: 'number', min: 1900, max: new Date().getFullYear(), value: p.birth_year || '' })),
        field(tr('followUp'), el('input', { id: 'f_follow', type: 'date', value: p.follow_up_date || '' }), tr('followUpHint')),
        ...extra),
      el('button', { class: 'btn primary' }, tr('saveDetails')));
  }

  function visitsCard() {
    const notesFor = (bookingId) => (F.notes || []).filter((n) => n.booking_id === bookingId);
    const loose = (F.notes || []).filter((n) => !n.booking_id || !F.visits.some((v) => v.id === n.booking_id));
    const note = (n) => el('div', { class: 'note-item' }, el('p', { dir: 'auto' }, n.note), el('span', { class: 'muted small' }, `${n.created_at} UTC · ${tr('by')} ${n.author || '—'}`));
    const lastDone = F.visits.find((v) => v.status === 'done') || F.visits[0];
    const add = F.canReadNotes ? el('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      try { await api(`/api/s/patients/${F.patient.id}/notes`, 'POST', { note: val('n_text'), bookingId: lastDone ? lastDone.id : null }); toast(tr('noteSaved')); await load(); } catch (err) { toast(err.message); }
    } },
      el('h3', {}, tr('addNote')), el('textarea', { id: 'n_text', rows: 4, placeholder: tr('notePh'), maxlength: 4000 }), el('button', { class: 'btn primary' }, tr('saveNote'))) : el('p', { class: 'muted small' }, tr('notesPrivate'));
    return el('section', { class: 'card stack' }, el('h2', {}, `${tr('visits')} · ${tr('nVisits', { n: F.visits.filter((v) => v.status === 'done').length })}`), add,
      F.visits.length ? el('div', { class: 'visits' }, F.visits.map((v) => el('div', { class: 'visit' + (v.status === 'done' ? ' done' : '') },
        el('div', { class: 'row' }, el('b', { dir: 'ltr' }, `${v.date}${v.time ? ' ' + v.time : ''}`), el('span', { class: 'muted' }, v.doctor + (v.services ? ` · ${v.services}` : '')), el('span', { class: 'pill' }, tr(ST[v.status] || v.status))),
        notesFor(v.id).map(note)))) : el('p', { class: 'muted' }, tr('noVisits')),
      loose.map(note));
  }

  // Missed visits and online booking: stop, allow again, or forgive with one tap.
  function standingCard() {
    const s = F.standing;
    const act = (action) => async () => {
      try { F.standing = (await api(`/api/s/patients/${F.patient.id}/booking`, 'POST', { action })).standing; toast(tr('saved')); render(); } catch (e) { toast(e.message); }
    };
    const btn = (label, action, cls = 'btn ghost small') => el('button', { type: 'button', class: cls, onclick: act(action) }, tr(label));
    return el('section', { class: 'card stack standing' + (s.blocked || s.banned ? ' stopped' : s.noShows ? ' warned' : '') },
      el('h2', {}, tr('standingTitle')),
      el('p', {}, s.noShows === 1 ? tr('standingMissedOne') : s.noShows ? tr('standingMissed', { n: s.noShows }) : tr('standingOk')),
      s.banned ? el('p', { class: 'muted small' }, tr('standingBanned')) : null,
      s.blocked ? el('p', {}, el('b', {}, tr('standingStopped'))) : s.limit ? el('p', { class: 'muted small' }, tr('standingLimit', { limit: s.limit })) : null,
      el('div', { class: 'row' },
        s.blocked ? btn('allowBooking', 'allow', 'btn primary small') : btn('stopBooking', 'stop'),
        s.noShows && !s.blocked ? btn('forgive', 'forgive') : null),
      s.noShows && !s.blocked ? el('p', { class: 'muted small' }, tr('forgiveHint')) : null);
  }

  function render() {
    root.replaceChildren(el('a', { href: '/app/patients', class: 'back' }, tr('allPatients')), el('h1', {}, F.patient.name), standingCard(), el('div', { class: 'split' }, visitsCard(), details()));
  }

  load().catch((e) => toast(e.message));
})();
