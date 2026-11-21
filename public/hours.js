(() => {
  const { D, tr, api, el, toast, today } = window.Nobat;
  const root = document.getElementById('hours');
  const salon = D.kind === 'salon';
  const ORDER = [6, 0, 1, 2, 3, 4, 5]; // the working week in Kurdistan starts on Saturday
  let H = null;

  const field = (label, input, hint) => el('label', {}, label, input, hint ? el('span', { class: 'muted small' }, hint) : null);
  const $ = (id) => document.getElementById(id);

  async function load() { H = await api('/api/s/hours'); render(); }

  // Opening hours: a row per day, open or closed, with an optional second time (for clinics open morning and evening).
  function openingCard() {
    const can = H.canEditHours;
    const first = salon ? ['10:00', '20:00'] : ['09:00', '21:00'];
    const rows = ORDER.map((wd) => {
      const day = H.hours.filter((h) => h.weekday === wd);
      const open = H.hoursOn ? day.length > 0 : wd !== 5; // new clinics: Friday closed
      const [a, b] = [day[0] || { start_time: first[0], end_time: first[1] }, day[1]];
      const second = el('span', { class: 'shift2', id: `s2_${wd}`, hidden: !b },
        el('input', { type: 'time', id: `f2_${wd}`, value: b ? b.start_time : '17:00', disabled: !can }), '–',
        el('input', { type: 'time', id: `t2_${wd}`, value: b ? b.end_time : '21:00', disabled: !can }));
      const toggle = el('button', { type: 'button', class: 'btn ghost small', disabled: !can, onclick: () => {
        second.hidden = !second.hidden; toggle.textContent = tr(second.hidden ? 'addShift' : 'removeShift');
      } }, tr(b ? 'removeShift' : 'addShift'));
      return el('tr', {},
        el('td', {}, el('label', { class: 'check' }, el('input', { type: 'checkbox', id: `on_${wd}`, checked: open, disabled: !can }), tr('wd' + wd))),
        el('td', { class: 'times' },
          el('input', { type: 'time', id: `f1_${wd}`, value: a.start_time, disabled: !can }), '–',
          el('input', { type: 'time', id: `t1_${wd}`, value: a.end_time, disabled: !can }), second),
        el('td', {}, toggle));
    });
    return el('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const hours = [];
      for (const wd of ORDER) {
        if (!$(`on_${wd}`).checked) continue;
        hours.push({ weekday: wd, start_time: $(`f1_${wd}`).value, end_time: $(`t1_${wd}`).value });
        if (!$(`s2_${wd}`).hidden) hours.push({ weekday: wd, start_time: $(`f2_${wd}`).value, end_time: $(`t2_${wd}`).value });
      }
      try { await api('/api/s/hours', 'PUT', { on: $('useOpening').checked, hours }); toast(tr('saved')); await load(); } catch (err) { toast(err.message); }
    } },
      el('h2', {}, tr('openingTitle')), el('p', { class: 'muted small' }, tr('openingHint')),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', id: 'useOpening', checked: H.hoursOn || !H.hours.length, disabled: !can }), el('b', {}, tr('useOpening'))),
      el('div', { class: 'tablewrap' }, el('table', { class: 'sched opening-edit' }, el('tbody', {}, rows))),
      can ? el('button', { class: 'btn primary' }, tr('save')) : el('p', { class: 'muted small' }, tr('onlyOwnerHours')));
  }

  // Block time off: who, which days, all day or some hours, and why.
  function timeOffCard() {
    const who = H.ownDoctor ? null : el('select', { id: 'o_who' }, el('option', { value: '' }, tr('wholeClinic')), H.doctors.map((d) => el('option', { value: d.id }, d.name)));
    const times = el('div', { class: 'grid2', id: 'o_times', hidden: true },
      field(tr('fromTime'), el('input', { type: 'time', id: 'o_st', value: '13:00' })),
      field(tr('toTime'), el('input', { type: 'time', id: 'o_et', value: '15:00' })));
    const result = el('div', { id: 'o_result' });
    const allDay = el('input', { type: 'checkbox', id: 'o_all', checked: true, onchange: () => { times.hidden = allDay.checked; } });
    return el('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/s/timeoff', 'POST', {
          doctorId: who ? who.value || null : H.ownDoctor, dateFrom: $('o_from').value, dateTo: $('o_to').value,
          allDay: allDay.checked, startTime: $('o_st').value, endTime: $('o_et').value, reason: $('o_reason').value
        });
        toast(tr('offSaved'));
        $('o_reason').value = '';
        H = await api('/api/s/hours');
        document.getElementById('plannedCard').replaceWith(plannedCard());
        result.replaceChildren(...(r.affected.length ? [el('div', { class: 'note warn stack' }, el('b', {}, tr('affectedTitle')),
          el('ul', {}, r.affected.map((x) => el('li', {}, el('span', { dir: 'ltr' }, `${x.date}${x.time ? ' ' + x.time : ''}`), ` · ${x.name} · `,
            x.phone ? el('a', { href: `tel:${x.phone.replace(/\s/g, '')}`, dir: 'ltr' }, x.phone) : '', ` · ${x.doctor}`))))] : []));
      } catch (err) { toast(err.message); }
    } },
      el('h2', {}, tr('timeOffTitle')), el('p', { class: 'muted small' }, tr('timeOffHint')),
      el('div', { class: 'grid2' },
        who ? field(tr('whoOff'), who) : null,
        field(tr('fromDate'), el('input', { type: 'date', id: 'o_from', value: today(), min: today(), onchange: (e) => { if ($('o_to').value < e.target.value) $('o_to').value = e.target.value; } })),
        field(tr('toDate'), el('input', { type: 'date', id: 'o_to', value: today(), min: today() }))),
      el('label', { class: 'check' }, allDay, tr('allDayLabel')),
      times,
      field(tr('reasonLabel'), el('input', { id: 'o_reason', maxlength: 100, placeholder: tr('reasonPh') })),
      el('button', { class: 'btn primary' }, tr('blockBtn')),
      result);
  }

  function plannedCard() {
    const remove = (id) => async () => {
      try { await api(`/api/s/timeoff/${id}`, 'DELETE'); toast(tr('offRemoved')); H = await api('/api/s/hours'); document.getElementById('plannedCard').replaceWith(plannedCard()); } catch (err) { toast(err.message); }
    };
    return el('section', { class: 'card stack', id: 'plannedCard' }, el('h2', {}, tr('plannedOff')),
      H.timeOff.length ? el('ul', { class: 'offlist' }, H.timeOff.map((o) => el('li', {},
        el('div', {}, el('b', { dir: 'ltr' }, o.date_from + (o.date_to !== o.date_from ? ` – ${o.date_to}` : '')), ' · ',
          o.start_time ? el('span', { dir: 'ltr' }, `${o.start_time}–${o.end_time}`) : tr('allDayShort'),
          el('div', { class: 'muted small' }, [o.doctor || tr('wholeClinic'), o.reason].filter(Boolean).join(' · '))),
        !H.ownDoctor || o.doctor_id === H.ownDoctor ? el('button', { type: 'button', class: 'btn ghost small', onclick: remove(o.id) }, tr('removeBtn')) : null)))
        : el('p', { class: 'muted' }, tr('noTimeOff')));
  }

  function render() {
    root.replaceChildren(el('h1', {}, tr('hoursTab')), timeOffCard(), plannedCard(), openingCard());
  }

  load().catch((e) => toast(e.message));
})();
