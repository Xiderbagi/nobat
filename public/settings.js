(() => {
  const { api, el, toast } = window.Nobat;
  const root = document.getElementById('settings');
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ORDER = [6, 0, 1, 2, 3, 4, 5]; // the working week in Kurdistan starts on Saturday
  let S = null;

  const field = (label, input, hint) => el('label', {}, label, input, hint ? el('span', { class: 'muted small' }, hint) : null);
  const input = (id, value, attrs = {}) => el('input', { id, value: value ?? '', ...attrs });

  async function load() { S = await api('/api/s/settings'); render(); }

  function clinicForm() {
    const c = S.clinic;
    return el('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const v = (id) => document.getElementById(id).value;
      try { await api('/api/s/clinic', 'PUT', { name: v('c_name'), city: v('c_city'), address: v('c_address'), phone: v('c_phone') }); toast('Clinic saved.'); } catch (err) { toast(err.message); }
    } },
      el('h2', {}, 'Clinic'),
      el('div', { class: 'grid2' }, field('Name', input('c_name', c.name, { maxlength: 80 })), field('City', input('c_city', c.city, { maxlength: 40 })),
        field('Address', input('c_address', c.address, { maxlength: 120 })), field('Phone', input('c_phone', c.phone, { maxlength: 20, dir: 'ltr' }))),
      el('p', { class: 'muted small' }, 'Patients book here: ', el('a', { href: `/c/${c.slug}`, target: '_blank', rel: 'noopener', dir: 'ltr' }, `${S.baseUrl}/c/${c.slug}`), '. Print this link as a QR code for the waiting room and add it to Instagram and Google Maps.'),
      el('button', { class: 'btn primary' }, 'Save clinic'));
  }

  function doctorForm(d) {
    const p = `d${d.id || 'new'}_`;
    const has = (wd) => d.schedules.find((s) => s.weekday === wd);
    const rows = ORDER.map((wd) => {
      const s = has(wd);
      return el('tr', {},
        el('td', {}, el('label', { class: 'check' }, el('input', { type: 'checkbox', id: `${p}on${wd}`, checked: !!s }), DAYS[wd])),
        el('td', {}, input(`${p}from${wd}`, s ? s.start_time : '16:00', { type: 'time' })),
        el('td', {}, input(`${p}to${wd}`, s ? s.end_time : '21:00', { type: 'time' })));
    });
    const v = (k) => document.getElementById(p + k);
    return el('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const schedules = ORDER.filter((wd) => v('on' + wd).checked).map((wd) => ({ weekday: wd, start_time: v('from' + wd).value, end_time: v('to' + wd).value }));
      try {
        await api('/api/s/doctors', 'POST', { id: d.id, name: v('name').value, specialty: v('spec').value, fee_iqd: v('fee').value, mode: v('mode').value,
          slot_minutes: v('slot').value, avg_minutes: v('avg').value, daily_limit: v('limit').value, active: v('active').checked, schedules });
        toast('Doctor saved.'); await load();
      } catch (err) { toast(err.message); }
    } },
      el('h2', {}, d.id ? d.name : 'Add a doctor'),
      el('div', { class: 'grid2' },
        field('Name', input(p + 'name', d.name, { maxlength: 80, placeholder: 'Dr. Shilan Ahmed' })),
        field('Specialty', input(p + 'spec', d.specialty, { maxlength: 60, placeholder: 'Children\'s doctor' })),
        field('Visit fee (IQD)', input(p + 'fee', d.fee_iqd, { type: 'number', min: 0, step: 1000 })),
        field('How patients book', el('select', { id: p + 'mode' }, el('option', { value: 'queue', selected: d.mode === 'queue' }, 'Queue number'), el('option', { value: 'time', selected: d.mode === 'time' }, 'Fixed times'))),
        field('Minutes per time slot', input(p + 'slot', d.slot_minutes, { type: 'number', min: 5, max: 120 }), 'Only used for fixed times.'),
        field('Average minutes per patient', input(p + 'avg', d.avg_minutes, { type: 'number', min: 2, max: 120 }), 'Used to tell patients how long they will wait.'),
        field('Most patients per day', input(p + 'limit', d.daily_limit, { type: 'number', min: 1, max: 500 }))),
      el('div', { class: 'tablewrap' }, el('table', { class: 'sched' }, el('thead', {}, el('tr', {}, el('th', {}, 'Working day'), el('th', {}, 'From'), el('th', {}, 'To'))), el('tbody', {}, rows))),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', id: p + 'active', checked: d.active !== 0 }), 'Taking bookings'),
      el('button', { class: 'btn primary' }, d.id ? 'Save doctor' : 'Add doctor'));
  }

  function usersCard() {
    return el('section', { class: 'card stack' }, el('h2', {}, 'Staff accounts'),
      el('div', { class: 'tablewrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Email'), el('th', {}, 'Role'))),
        el('tbody', {}, S.users.map((u) => el('tr', {}, el('td', {}, u.name), el('td', { dir: 'ltr' }, u.email), el('td', {}, u.role === 'owner' ? 'Owner' : 'Reception')))))),
      el('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const v = (id) => document.getElementById(id).value;
        try { await api('/api/s/users', 'POST', { name: v('u_name'), email: v('u_email'), password: v('u_pass'), role: v('u_role') }); toast('Account added. Give them the email and password.'); await load(); } catch (err) { toast(err.message); }
      } },
        el('h3', {}, 'Add an account'),
        el('div', { class: 'grid2' }, field('Name', input('u_name', '', { maxlength: 60 })), field('Email', input('u_email', '', { type: 'email', dir: 'ltr' })),
          field('Password', input('u_pass', '', { type: 'password', minlength: 8, autocomplete: 'new-password' }), 'At least 8 characters.'),
          field('Role', el('select', { id: 'u_role' }, el('option', { value: 'reception' }, 'Reception'), el('option', { value: 'owner' }, 'Owner')))),
        el('button', { class: 'btn ghost' }, 'Add account')));
  }

  function render() {
    const blank = { id: null, name: '', specialty: '', fee_iqd: 25000, mode: 'queue', slot_minutes: 15, avg_minutes: 10, daily_limit: 40, active: 1, schedules: [6, 0, 1, 2, 3, 4].map((wd) => ({ weekday: wd, start_time: '16:00', end_time: '21:00' })) };
    root.replaceChildren(el('h1', {}, 'Settings'), clinicForm(), el('h2', { class: 'section' }, 'Doctors'), ...S.doctors.map(doctorForm), doctorForm(blank), usersCard());
  }

  load().catch((e) => toast(e.message));
})();
