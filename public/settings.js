(() => {
  const { D, tr, api, el, toast } = window.Nobat;
  const root = document.getElementById('settings');
  const salon = D.kind === 'salon';
  const ORDER = [6, 0, 1, 2, 3, 4, 5]; // the working week in Kurdistan starts on Saturday
  let S = null;

  const field = (label, input, hint) => el('label', {}, label, input, hint ? el('span', { class: 'muted small' }, hint) : null);
  const input = (id, value, attrs = {}) => el('input', { id, value: value ?? '', ...attrs });
  const val = (id) => document.getElementById(id);

  async function load() { S = await api('/api/s/settings'); render(); }
  async function save(path, method, body, done) {
    try { await api(path, method, body); toast(done || tr('saved')); await load(); } catch (err) { toast(err.message); }
  }

  function clinicForm() {
    const c = S.clinic;
    const url = `${S.baseUrl}/c/${c.slug}`;
    return el('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); save('/api/s/clinic', 'PUT', { name: val('c_name').value, city: val('c_city').value, address: val('c_address').value, phone: val('c_phone').value }); } },
      el('h2', {}, tr('clinicSection')),
      el('div', { class: 'grid2' }, field(tr('cName'), input('c_name', c.name, { maxlength: 80 })), field(tr('cCity'), input('c_city', c.city, { maxlength: 40 })),
        field(tr('cAddress'), input('c_address', c.address, { maxlength: 120 })), field(tr('cPhone'), input('c_phone', c.phone, { maxlength: 20, dir: 'ltr' }))),
      el('p', { class: 'muted small' }, tr('bookHere'), ' ', el('a', { href: `/c/${c.slug}`, target: '_blank', rel: 'noopener', dir: 'ltr' }, url), '. ', tr('qrHint'), ' ', el('a', { href: '/app/poster' }, tr('poster'))),
      el('button', { class: 'btn primary' }, tr('save')));
  }

  function doctorForm(d) {
    const p = `d${d.id || 'new'}_`;
    const has = (wd) => d.schedules.find((s) => s.weekday === wd);
    const rows = ORDER.map((wd) => {
      const s = has(wd);
      return el('tr', {},
        el('td', {}, el('label', { class: 'check' }, el('input', { type: 'checkbox', id: `${p}on${wd}`, checked: !!s }), tr('wd' + wd))),
        el('td', {}, input(`${p}from${wd}`, s ? s.start_time : (salon ? '10:00' : '16:00'), { type: 'time' })),
        el('td', {}, input(`${p}to${wd}`, s ? s.end_time : (salon ? '20:00' : '21:00'), { type: 'time' })));
    });
    const v = (k) => val(p + k);
    const clinicFields = salon ? [] : [
      field(tr('fee'), input(p + 'fee', d.fee_iqd, { type: 'number', min: 0, step: 1000 })),
      field(tr('howBook'), el('select', { id: p + 'mode' }, el('option', { value: 'queue', selected: d.mode === 'queue' }, tr('modeQueue')), el('option', { value: 'time', selected: d.mode === 'time' }, tr('modeTime')))),
      field(tr('slotMin'), input(p + 'slot', d.slot_minutes, { type: 'number', min: 5, max: 120 }), tr('slotHint')),
      field(tr('avgMin'), input(p + 'avg', d.avg_minutes, { type: 'number', min: 2, max: 120 }), tr('avgHint'))
    ];
    return el('form', { class: 'card stack', onsubmit: (e) => {
      e.preventDefault();
      const schedules = ORDER.filter((wd) => v('on' + wd).checked).map((wd) => ({ weekday: wd, start_time: v('from' + wd).value, end_time: v('to' + wd).value }));
      save('/api/s/doctors', 'POST', {
        id: d.id, name: v('name').value, specialty: v('spec').value, fee_iqd: salon ? 0 : v('fee').value, mode: salon ? 'time' : v('mode').value,
        slot_minutes: salon ? 15 : v('slot').value, avg_minutes: salon ? 30 : v('avg').value, daily_limit: v('limit').value, active: v('active').checked, schedules,
        serviceIds: salon ? [...root.querySelectorAll('.' + p + 'svc:checked')].map((i) => Number(i.value)) : undefined
      });
    } },
      el('h2', {}, d.id ? d.name : tr('addProvider')),
      el('div', { class: 'grid2' },
        field(tr('name'), input(p + 'name', d.name, { maxlength: 80 })),
        field(tr('specialty'), input(p + 'spec', d.specialty, { maxlength: 60, placeholder: tr('specialtyPh') })),
        ...clinicFields,
        field(tr('dailyLimit'), input(p + 'limit', d.daily_limit, { type: 'number', min: 1, max: 500 }))),
      el('div', { class: 'tablewrap' }, el('table', { class: 'sched' }, el('thead', {}, el('tr', {}, el('th', {}, tr('workDay')), el('th', {}, tr('from')), el('th', {}, tr('to')))), el('tbody', {}, rows))),
      salon && S.services.length ? el('fieldset', { class: 'svcpick' }, el('legend', {}, tr('doesServices')),
        el('div', { class: 'checks' }, S.services.map((sv) => el('label', { class: 'check' }, el('input', { type: 'checkbox', class: p + 'svc', value: sv.id, checked: (d.serviceIds || []).includes(sv.id) }), sv.name))),
        el('span', { class: 'muted small' }, tr('doesServicesHint'))) : null,
      el('label', { class: 'check' }, el('input', { type: 'checkbox', id: p + 'active', checked: d.active !== 0 }), tr('taking')),
      el('button', { class: 'btn primary' }, d.id ? tr('save') : tr('add')));
  }

  function servicesCard() {
    const row = (s) => {
      const p = `s${s.id || 'new'}_`;
      const v = (k) => val(p + k);
      return el('form', { class: 'svcrow', onsubmit: (e) => {
        e.preventDefault();
        save('/api/s/services', 'POST', { id: s.id, name: v('name').value, price_iqd: v('price').value, minutes: v('min').value, rebook_weeks: v('rebook').value, active: v('active').checked });
      } },
        field(tr('sName'), input(p + 'name', s.name, { maxlength: 60 })),
        field(tr('sPrice'), input(p + 'price', s.price_iqd, { type: 'number', min: 0, step: 1000 })),
        field(tr('sMinutes'), input(p + 'min', s.minutes, { type: 'number', min: 5, max: 480, step: 5 })),
        field(tr('sRebook'), input(p + 'rebook', s.rebook_weeks, { type: 'number', min: 0, max: 52 }), tr('sRebookHint')),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', id: p + 'active', checked: s.active !== 0 }), tr('sActive')),
        el('button', { class: 'btn ' + (s.id ? 'ghost' : 'primary') }, s.id ? tr('save') : tr('addService')));
    };
    return el('section', { class: 'card stack' }, el('h2', {}, tr('servicesTitle')), ...S.services.map(row), row({ id: null, name: '', price_iqd: 25000, minutes: 60, rebook_weeks: 0, active: 1 }));
  }

  function usersCard() {
    const roleName = (u) => tr(u.role === 'owner' ? 'roleOwner' : u.role === 'doctor' ? 'roleDoctor' : 'roleReception');
    const docName = (id) => (S.doctors.find((d) => d.id === id) || {}).name || '';
    return el('section', { class: 'card stack' }, el('h2', {}, tr('staffAccounts')),
      el('div', { class: 'tablewrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tr('name')), el('th', {}, tr('email')), el('th', {}, tr('role')))),
        el('tbody', {}, S.users.map((u) => el('tr', {}, el('td', {}, u.name), el('td', { dir: 'ltr' }, u.email), el('td', {}, roleName(u), u.doctor_id ? ` · ${docName(u.doctor_id)}` : '')))))),
      el('form', { class: 'stack', onsubmit: (e) => {
        e.preventDefault();
        save('/api/s/users', 'POST', { name: val('u_name').value, email: val('u_email').value, password: val('u_pass').value, role: val('u_role').value, doctorId: val('u_doc').value }, tr('accountAdded'));
      } },
        el('h3', {}, tr('addAccount')),
        el('div', { class: 'grid2' }, field(tr('name'), input('u_name', '', { maxlength: 60 })), field(tr('email'), input('u_email', '', { type: 'email', dir: 'ltr' })),
          field(tr('password'), input('u_pass', '', { type: 'password', minlength: 8, autocomplete: 'new-password', dir: 'ltr' }), tr('passwordHint')),
          field(tr('role'), el('select', { id: 'u_role' }, el('option', { value: 'reception' }, tr('roleReception')), el('option', { value: 'doctor' }, tr('roleDoctor')), el('option', { value: 'owner' }, tr('roleOwner')))),
          field(tr('linked'), el('select', { id: 'u_doc' }, el('option', { value: '' }, tr('none')), S.doctors.map((d) => el('option', { value: d.id }, d.name))))),
        el('p', { class: 'muted small' }, tr('notesPrivate')),
        el('button', { class: 'btn ghost' }, tr('addAccount'))));
  }

  function render() {
    const blank = { id: null, name: '', specialty: '', fee_iqd: 25000, mode: 'queue', slot_minutes: 15, avg_minutes: 10, daily_limit: 40, active: 1,
      schedules: [6, 0, 1, 2, 3, 4].map((wd) => ({ weekday: wd, start_time: salon ? '10:00' : '16:00', end_time: salon ? '20:00' : '21:00' })) };
    root.replaceChildren(...[el('h1', {}, tr('settings')), clinicForm(), salon ? servicesCard() : null,
      el('h2', { class: 'section' }, tr('providers')), ...S.doctors.map(doctorForm), doctorForm(blank), usersCard()].filter(Boolean));
  }

  load().catch((e) => toast(e.message));
})();
