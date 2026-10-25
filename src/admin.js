// Your private admin screen at /admin: add clinics, see how each is doing, record payments, switch clinics on or off.
// English only: it is for the business owner, not for clinics.
import express from 'express';
import QRCode from 'qrcode';
import { tx } from './db.js';
import { createClinic, ClinicError, tempPassword } from './clinics.js';
import { addDays, checkSecret, esc, hashSecret, isIsoDate, localParts, token } from './util.js';
import { page, posterPage } from './views.js';

const COOKIE = 'nobat_admin';
const SESSION_DAYS = 14;
const METHODS = ['Cash', 'FIB', 'FastPay', 'Zain Cash', 'Bank transfer'];

const ERRORS = {
  needName: 'Enter the clinic name.', needOwner: "Enter the owner's name.", badEmail: 'Enter a valid email for the owner.',
  emailTaken: 'That email already has an account. Use another email.', badKind: 'Choose clinic or salon.', shortPassword: 'The password needs at least 8 characters.'
};

const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true" class="logo"><rect width="40" height="40" rx="11" fill="currentColor"/><rect x="17" y="9" width="6" height="22" rx="2" fill="#fff"/><rect x="9" y="17" width="22" height="6" rx="2" fill="#fff"/><circle cx="30" cy="30" r="6" fill="#f08a6f"/></svg>';

function shell(admin, title, main, notice) {
  const body = `<header class="top"><div class="wrap row">
    <a class="brand" href="/admin">${LOGO}<span><b>Nobat admin</b><small>${esc(admin.name)}</small></span></a>
    <nav class="tabs"><a href="/admin">Clinics</a><a href="/admin/clinics/new">+ Add clinic</a></nav>
    <form method="post" action="/admin/logout"><button class="btn ghost small">Sign out</button></form></div></header>
  <main class="wrap stack">${notice ? `<p class="note ok" role="status">${esc(notice)}</p>` : ''}${main}</main>`;
  return page({ title: `${title} · Nobat admin`, body, manifest: '/manifest.webmanifest' });
}

// What a clinic's row says about it, and whether it needs attention.
export function clinicState(c, today) {
  if (c.status === 'off') return { label: 'Switched off', cls: 'bad', alert: false };
  if (c.status === 'trial') {
    if (c.trial_ends && c.trial_ends < today) return { label: `Trial ended ${c.trial_ends}`, cls: 'bad', alert: true };
    const left = c.trial_ends ? Math.round((Date.parse(c.trial_ends) - Date.parse(today)) / 864e5) : null;
    return { label: left == null ? 'Free trial' : `Free trial · ${left} days left`, cls: 'warn', alert: left != null && left <= 7 };
  }
  if (!c.paid_until) return { label: 'Active · no payment yet', cls: 'warn', alert: true };
  if (c.paid_until < today) return { label: `Payment due since ${c.paid_until}`, cls: 'bad', alert: true };
  return { label: `Paid until ${c.paid_until}`, cls: 'good', alert: false };
}

export function adminRouter(db, { baseUrl, secure }) {
  const r = express.Router();
  r.use(express.urlencoded({ extended: false, limit: '20kb' }));

  const readCookie = (req) => (new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`).exec(req.headers.cookie || '') || [])[1];
  const cookie = (id, maxAge) => `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  r.use((req, _res, next) => {
    req.admin = null;
    const id = readCookie(req);
    if (id) {
      const row = db.prepare('SELECT a.id, a.name, a.email, s.id AS session_id, s.expires_at FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id = ?').get(id);
      if (row && row.expires_at > Date.now()) req.admin = row;
    }
    next();
  });

  function loginPage(res, error, status = 200) {
    const hasAdmin = db.prepare('SELECT 1 FROM admins LIMIT 1').get();
    const body = `<main class="wrap narrow stack login">
      <div class="brand big">${LOGO}<span><b>Nobat admin</b><small>Only for the business owner</small></span></div>
      ${hasAdmin ? `<form class="card stack" method="post" action="/admin/login">
        <label>Email<input name="email" type="email" autocomplete="username" dir="ltr" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" dir="ltr" required></label>
        <button class="btn primary big">Sign in</button>
        ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
      </form>` : `<section class="card stack"><h2>No admin account yet</h2>
        <p>Create yours once in the Render Shell, then come back here:</p>
        <pre class="code-box">npm run create-admin -- --name "Your Name" --email you@example.com --password "a-long-password"</pre></section>`}
    </main>`;
    res.status(status).send(page({ title: 'Nobat admin', body }));
  }

  r.post('/login', (req, res) => {
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(req.body.email || '').trim().toLowerCase());
    const ok = checkSecret(req.body.password, admin ? admin.password_hash : '00:00');
    if (!admin || !ok) return loginPage(res, 'Wrong email or password.', 401);
    const id = token(24);
    db.prepare('INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)').run(id, admin.id, Date.now() + SESSION_DAYS * 864e5);
    res.set('Set-Cookie', cookie(id, SESSION_DAYS * 86400)).redirect(303, '/admin');
  });

  r.use((req, res, next) => (req.admin ? next() : loginPage(res)));

  r.post('/logout', (req, res) => {
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(req.admin.session_id);
    res.set('Set-Cookie', cookie('', 0)).redirect(303, '/admin');
  });

  // ---------- All clinics ----------
  r.get('/', (req, res) => {
    const today = localParts().date;
    const month = today.slice(0, 7);
    const clinics = db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM bookings b WHERE b.clinic_id = c.id AND b.status != 'cancelled' AND substr(b.date, 1, 7) = ?) AS month_bookings,
        (SELECT MAX(created_at) FROM bookings b WHERE b.clinic_id = c.id) AS last_booking,
        (SELECT name FROM users u WHERE u.clinic_id = c.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS owner
      FROM clinics c ORDER BY c.created_at DESC`).all(month);
    const income = db.prepare("SELECT currency, SUM(amount) AS total FROM payments WHERE substr(created_at, 1, 7) = ? GROUP BY currency").all(month);
    const count = (s) => clinics.filter((c) => c.status === s).length;
    const paidUp = clinics.filter((c) => c.status === 'active' && c.paid_until && c.paid_until >= today).length;
    const due = clinics.filter((c) => c.status === 'active' && (!c.paid_until || c.paid_until < today)).length;
    const idle = (c) => !c.last_booking || c.last_booking.slice(0, 10) < addDays(today, -7);
    const rows = clinics.map((c) => {
      const st = clinicState(c, today);
      return `<tr class="link-row${st.alert || (c.status !== 'off' && idle(c)) ? ' attn' : ''}">
        <td><a href="/admin/clinics/${c.id}"><b>${esc(c.name)}</b></a><div class="muted small">${c.kind === 'salon' ? 'Salon' : 'Clinic'} · ${esc(c.city)} · ${esc(c.owner || '')}</div></td>
        <td class="num" data-label="Bookings this month">${c.month_bookings}</td>
        <td class="nowrap" data-label="Last booking">${c.last_booking ? esc(c.last_booking.slice(0, 10)) : '<span class="muted">never</span>'}${c.status !== 'off' && idle(c) ? ' <span class="pill warn">Not using it</span>' : ''}</td>
        <td><span class="pill ${st.cls}">${esc(st.label)}</span>${c.featured_until && c.featured_until >= today ? ` <span class="pill accent">★ Featured to ${esc(c.featured_until)}</span>` : ''}</td></tr>`;
    }).join('');
    const main = `
      <div class="row"><h1>Your clinics</h1><span class="grow"></span><a class="btn primary" href="/admin/clinics/new">+ Add clinic</a></div>
      <div class="kpis">
        <div class="kpi"><span>Paid up</span><b>${paidUp}</b></div>
        <div class="kpi"><span>On free trial</span><b>${count('trial')}</b></div>
        <div class="kpi"><span>Payment due</span><b>${due}</b>${count('off') ? `<small class="muted">${count('off')} switched off</small>` : ''}</div>
        <div class="kpi"><span>Received this month</span><b class="money">${income.length ? income.map((i) => `${i.total.toLocaleString('en-US')} ${i.currency}`).join(' + ') : '0'}</b></div>
      </div>
      <section class="card"><div class="tablewrap"><table class="cards-on-phone">
        <thead><tr><th>Clinic</th><th>Bookings this month</th><th>Last booking</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">No clinics yet. Add your first one.</td></tr>'}</tbody>
      </table></div></section>
      <p class="muted small">Rows marked in color need attention: a trial ending, a payment due, or a clinic that hasn't had a booking in 7 days.</p>`;
    res.send(shell(req.admin, 'Clinics', main, NOTICES[req.query.ok]));
  });

  // ---------- Add a clinic ----------
  function newForm(req, res, values = {}, error) {
    const v = (k, d = '') => esc(values[k] ?? d);
    const main = `<h1>Add a clinic or salon</h1>
      <form class="card stack" method="post" action="/admin/clinics">
        <div class="grid2">
          <label>Name<input name="name" value="${v('name')}" maxlength="80" required placeholder="Shifa Clinic"></label>
          <label>City<input name="city" value="${v('city', 'Erbil')}" maxlength="40"></label>
          <label>Type<select name="kind"><option value="clinic" ${values.kind !== 'salon' ? 'selected' : ''}>Clinic</option><option value="salon" ${values.kind === 'salon' ? 'selected' : ''}>Salon or barber</option></select></label>
          <label>Clinic phone<input name="phone" value="${v('phone')}" maxlength="20" dir="ltr"></label>
          <label>Owner's name<input name="owner" value="${v('owner')}" maxlength="60" required placeholder="Dr. Hemin Rasul"></label>
          <label>Owner's email (used to sign in)<input name="email" type="email" value="${v('email')}" dir="ltr" required></label>
          <label>Owner's screen language<select name="lang">${[['ckb', 'Kurdish'], ['ar', 'Arabic'], ['en', 'English']].map(([k, n]) => `<option value="${k}" ${(values.lang || 'ckb') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Start with<select name="plan"><option value="trial" ${values.plan !== 'active' ? 'selected' : ''}>Free trial</option><option value="active" ${values.plan === 'active' ? 'selected' : ''}>Paying from today</option></select></label>
          <label>Free trial length (days)<input name="trialDays" type="number" min="1" max="90" value="${v('trialDays', '30')}"></label>
        </div>
        <label class="check"><input type="checkbox" name="demo" value="1" ${values.demo ? 'checked' : ''}> Add example doctors (or staff and services) to show how it works. They can delete them later.</label>
        ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
        <button class="btn primary big">Create clinic</button>
      </form>`;
    res.status(error ? 400 : 200).send(shell(req.admin, 'Add clinic', main));
  }

  r.get('/clinics/new', (req, res) => newForm(req, res));

  r.post('/clinics', (req, res) => {
    const b = req.body;
    const trialDays = Math.min(90, Math.max(1, Math.round(Number(b.trialDays) || 30)));
    try {
      const out = createClinic(db, { name: b.name, city: b.city, kind: b.kind, phone: b.phone, owner: b.owner, email: b.email, lang: b.lang, demo: b.demo === '1', status: b.plan === 'active' ? 'active' : 'trial', trialDays });
      const link = `${baseUrl}/c/${out.slug}`;
      const main = `<h1>${esc(b.name)} is ready</h1>
        <section class="card stack">
          <p>Give the owner these details. They should change the password after signing in.</p>
          <div class="handover">
            <div><span>Sign in at</span><b dir="ltr">${esc(baseUrl)}/login</b></div>
            <div><span>Email</span><b dir="ltr">${esc(String(b.email).trim().toLowerCase())}</b></div>
            <div><span>Temporary password</span><b dir="ltr" class="pw">${esc(out.password)}</b></div>
            <div><span>Patients book at</span><b dir="ltr">${esc(link)}</b></div>
          </div>
          <p class="muted small">Write the password down now. It is not shown again, but you can always make a new one from the clinic's page.</p>
          <div class="row"><a class="btn primary" href="/admin/clinics/${out.clinicId}/poster">Print their QR poster</a><a class="btn ghost" href="/admin/clinics/${out.clinicId}">Open clinic</a><a class="btn ghost" href="/admin">All clinics</a></div>
        </section>
        <section class="card stack"><h2>Next, sit with the owner for 10 minutes</h2>
          <ol><li>They sign in and change the password (Settings → Staff accounts).</li><li>They add their ${b.kind === 'salon' ? 'staff, working hours and services' : 'doctors and working hours'}.</li><li>They add accounts for reception${b.kind === 'salon' ? '' : ' and doctors'}.</li><li>You put the QR poster in the waiting room and on the door.</li></ol></section>`;
      res.send(shell(req.admin, 'Clinic created', main));
    } catch (err) {
      if (err instanceof ClinicError) return newForm(req, res, b, ERRORS[err.code] || 'Check the form and try again.');
      throw err;
    }
  });

  // ---------- One clinic ----------
  const getClinic = (id) => db.prepare('SELECT * FROM clinics WHERE id = ?').get(Number(id));

  function clinicPage(req, res, c, notice) {
    const today = localParts().date;
    const month = today.slice(0, 7);
    const st = clinicState(c, today);
    const stats = db.prepare(`SELECT
        (SELECT COUNT(*) FROM bookings WHERE clinic_id = ? AND status != 'cancelled' AND substr(date, 1, 7) = ?) AS month_bookings,
        (SELECT COUNT(*) FROM bookings WHERE clinic_id = ? AND status != 'cancelled') AS all_bookings,
        (SELECT COUNT(*) FROM bookings WHERE clinic_id = ? AND status = 'no_show' AND substr(date, 1, 7) = ?) AS month_no_shows,
        (SELECT COUNT(*) FROM patients WHERE clinic_id = ?) AS patients,
        (SELECT COUNT(*) FROM doctors WHERE clinic_id = ? AND active = 1) AS staff,
        (SELECT MAX(created_at) FROM bookings WHERE clinic_id = ?) AS last_booking`).get(c.id, month, c.id, c.id, month, c.id, c.id, c.id);
    const users = db.prepare('SELECT id, name, email, role FROM users WHERE clinic_id = ? ORDER BY role, name').all(c.id);
    const payments = db.prepare('SELECT * FROM payments WHERE clinic_id = ? ORDER BY id DESC').all(c.id);
    const nextUntil = addDays(c.paid_until && c.paid_until > today ? c.paid_until : today, 30);
    const featured = c.featured_until && c.featured_until >= today;
    const reviews = db.prepare('SELECT * FROM reviews WHERE clinic_id = ? ORDER BY id DESC LIMIT 50').all(c.id);
    const rating = db.prepare('SELECT COUNT(*) AS n, AVG(overall) AS avg FROM reviews WHERE clinic_id = ? AND hidden = 0').get(c.id);
    const roleName = { owner: 'Owner', reception: 'Reception', doctor: c.kind === 'salon' ? 'Staff member' : 'Doctor' };
    const main = `
      <a class="back" href="/admin">← All clinics</a>
      <div class="row"><h1>${esc(c.name)}</h1><span class="pill ${st.cls}">${esc(st.label)}</span></div>
      <p class="muted">${c.kind === 'salon' ? 'Salon' : 'Clinic'} · ${esc(c.city)} · added ${esc(c.created_at.slice(0, 10))} · <a href="/c/${esc(c.slug)}" target="_blank" rel="noopener" dir="ltr">${esc(baseUrl)}/c/${esc(c.slug)}</a></p>
      <div class="kpis">
        <div class="kpi"><span>Bookings this month</span><b>${stats.month_bookings}</b></div>
        <div class="kpi"><span>No-shows this month</span><b>${stats.month_no_shows}</b></div>
        <div class="kpi"><span>Patients / customers</span><b>${stats.patients}</b></div>
        <div class="kpi"><span>Last booking</span><b class="money">${stats.last_booking ? esc(stats.last_booking.slice(0, 10)) : 'never'}</b></div>
      </div>
      <div class="split">
        <div class="stack">
          <section class="card stack"><h2>Record a payment</h2>
            <form method="post" action="/admin/clinics/${c.id}/payments" class="stack">
              <div class="grid2">
                <label>Amount<input name="amount" type="number" min="1" step="1" required></label>
                <label>Currency<select name="currency"><option>USD</option><option>IQD</option></select></label>
                <label>Paid with<select name="method">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></label>
                <label>Paid until<input name="paid_until" type="date" value="${nextUntil}" required></label>
              </div>
              <label>Note (optional)<input name="note" maxlength="200" placeholder="Pro plan, November"></label>
              <button class="btn primary">Save payment</button>
            </form>
            <div class="tablewrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Paid with</th><th>Until</th><th>Note</th></tr></thead><tbody>
              ${payments.map((p) => `<tr><td class="nowrap">${esc(p.created_at.slice(0, 10))}</td><td class="num nowrap">${p.amount.toLocaleString('en-US')} ${p.currency}</td><td>${esc(p.method)}</td><td class="nowrap">${esc(p.paid_until)}</td><td>${esc(p.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No payments yet.</td></tr>'}
            </tbody></table></div>
          </section>
          <section class="card stack"><h2>Reviews ${rating.n ? `<span class="muted small">${rating.avg.toFixed(1)} ★ from ${rating.n}</span>` : ''}</h2>
            ${reviews.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>By</th><th>Stars</th><th>Comment</th><th></th></tr></thead><tbody>
              ${reviews.map((rv) => `<tr class="${rv.hidden ? 'faded' : ''}"><td class="nowrap">${esc(rv.created_at.slice(0, 10))}</td><td>${esc(rv.author)}</td><td class="nowrap">${rv.overall.toFixed(1)} ★</td><td dir="auto">${esc(rv.comment)}</td>
                <td class="actions"><form method="post" action="/admin/reviews/${rv.id}/${rv.hidden ? 'show' : 'hide'}"><button class="btn ghost small">${rv.hidden ? 'Show' : 'Hide'}</button></form></td></tr>`).join('')}
            </tbody></table></div><p class="muted small">Hide only reviews that are abusive or not about a real visit. Hidden reviews don't count in the rating.</p>` : '<p class="muted">No reviews yet.</p>'}
          </section>
          <section class="card stack"><h2>Staff accounts</h2>
            <div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
              ${users.map((u) => `<tr><td>${esc(u.name)}</td><td dir="ltr">${esc(u.email)}</td><td>${roleName[u.role] || u.role}</td>
                <td class="actions"><form method="post" action="/admin/users/${u.id}/reset"><button class="btn ghost small">New password</button></form></td></tr>`).join('')}
            </tbody></table></div>
          </section>
        </div>
        <aside class="stack">
          <section class="card stack"><h2>Status</h2>
            ${c.status === 'off'
              ? `<p>Staff can't sign in and patients can't book. Their data is kept.</p>
                 <form method="post" action="/admin/clinics/${c.id}/status"><input type="hidden" name="status" value="active"><button class="btn primary big">Switch on</button></form>`
              : `<form method="post" action="/admin/clinics/${c.id}/status" class="stack"><input type="hidden" name="status" value="off">
                 <p class="muted small">Switching off stops staff signing in and patients booking. Nothing is deleted, and you can switch it back on any time.</p>
                 <button class="btn danger">Switch off</button></form>`}
            ${c.status === 'trial' ? `<form method="post" action="/admin/clinics/${c.id}/trial" class="row"><label class="inline">Trial ends <input type="date" name="trial_ends" value="${esc(c.trial_ends || today)}"></label><button class="btn ghost small">Change</button></form>` : ''}
          </section>
          <section class="card stack"><h2>Featured in search ${featured ? '<span class="pill accent">★ On</span>' : ''}</h2>
            <p class="muted small">Featured clinics show first in search, marked "Featured". Charge for it and record the payment on the left.</p>
            <form method="post" action="/admin/clinics/${c.id}/featured" class="stack">
              <label>Featured until<input type="date" name="featured_until" value="${esc(featured ? c.featured_until : addDays(today, 30))}"></label>
              <div class="row"><button class="btn primary small">${featured ? 'Change date' : 'Make featured'}</button>${featured ? '<button class="btn ghost small" name="stop" value="1">Stop featuring</button>' : ''}</div>
            </form>
          </section>
          <section class="card stack"><h2>Quick links</h2>
            <a class="btn ghost" href="/admin/clinics/${c.id}/poster">QR poster</a>
            <a class="btn ghost" href="/c/${esc(c.slug)}" target="_blank" rel="noopener">Their booking page ↗</a>
          </section>
          <form class="card stack" method="post" action="/admin/clinics/${c.id}/note"><h2>Your notes</h2>
            <textarea name="note" rows="4" maxlength="2000" placeholder="Who you spoke to, what they asked for, when to visit">${esc(c.admin_note)}</textarea>
            <button class="btn ghost">Save note</button></form>
        </aside>
      </div>`;
    res.send(shell(req.admin, c.name, main, notice));
  }

  const NOTICES = { paid: 'Payment saved.', on: 'Clinic switched on.', off: 'Clinic switched off.', note: 'Note saved.', trial: 'Trial date changed.', featured: 'Featured placement updated.', review: 'Review updated.' };

  r.post('/clinics/:id/featured', (req, res) => {
    const c = getClinic(req.params.id);
    if (!c) return res.redirect(303, '/admin');
    const until = req.body.stop ? null : isIsoDate(req.body.featured_until) ? req.body.featured_until : c.featured_until;
    db.prepare('UPDATE clinics SET featured_until = ? WHERE id = ?').run(until, c.id);
    res.redirect(303, `/admin/clinics/${c.id}?ok=featured`);
  });

  r.post('/reviews/:id/:action', (req, res) => {
    const rv = db.prepare('SELECT * FROM reviews WHERE id = ?').get(Number(req.params.id));
    if (!rv || !['hide', 'show'].includes(req.params.action)) return res.redirect(303, '/admin');
    db.prepare('UPDATE reviews SET hidden = ? WHERE id = ?').run(req.params.action === 'hide' ? 1 : 0, rv.id);
    res.redirect(303, `/admin/clinics/${rv.clinic_id}?ok=review`);
  });

  r.get('/clinics/:id', (req, res) => {
    const c = getClinic(req.params.id);
    if (!c) return res.redirect(303, '/admin');
    clinicPage(req, res, c, NOTICES[req.query.ok]);
  });

  r.post('/clinics/:id/status', (req, res) => {
    const c = getClinic(req.params.id);
    if (!c) return res.redirect(303, '/admin');
    if (req.body.status === 'off') {
      tx(db, () => {
        db.prepare("UPDATE clinics SET status = 'off' WHERE id = ?").run(c.id);
        db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE clinic_id = ?)').run(c.id);
      });
      return res.redirect(303, `/admin/clinics/${c.id}?ok=off`);
    }
    // Switching back on returns a clinic to its trial if the trial is still running, otherwise to paying.
    const back = c.trial_ends && c.trial_ends >= localParts().date && !c.paid_until ? 'trial' : 'active';
    db.prepare('UPDATE clinics SET status = ? WHERE id = ?').run(back, c.id);
    res.redirect(303, `/admin/clinics/${c.id}?ok=on`);
  });

  r.post('/clinics/:id/trial', (req, res) => {
    const c = getClinic(req.params.id);
    if (c && isIsoDate(req.body.trial_ends)) db.prepare('UPDATE clinics SET trial_ends = ? WHERE id = ?').run(req.body.trial_ends, c.id);
    res.redirect(303, c ? `/admin/clinics/${c.id}?ok=trial` : '/admin');
  });

  r.post('/clinics/:id/note', (req, res) => {
    const c = getClinic(req.params.id);
    if (c) db.prepare('UPDATE clinics SET admin_note = ? WHERE id = ?').run(String(req.body.note || '').slice(0, 2000), c.id);
    res.redirect(303, c ? `/admin/clinics/${c.id}?ok=note` : '/admin');
  });

  r.post('/clinics/:id/payments', (req, res) => {
    const c = getClinic(req.params.id);
    if (!c) return res.redirect(303, '/admin');
    const amount = Math.round(Number(req.body.amount));
    const currency = req.body.currency === 'IQD' ? 'IQD' : 'USD';
    const method = METHODS.includes(req.body.method) ? req.body.method : 'Cash';
    if (!(amount > 0) || !isIsoDate(req.body.paid_until)) return clinicPage(req, res.status(400), c, 'Enter an amount and a "paid until" date.');
    tx(db, () => {
      db.prepare('INSERT INTO payments (clinic_id, amount, currency, method, paid_until, note, admin_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(c.id, amount, currency, method, req.body.paid_until, String(req.body.note || '').slice(0, 200), req.admin.id);
      // A payment makes the clinic a paying one; it also switches a clinic back on.
      db.prepare("UPDATE clinics SET paid_until = MAX(COALESCE(paid_until, ''), ?), status = 'active' WHERE id = ?").run(req.body.paid_until, c.id);
    });
    res.redirect(303, `/admin/clinics/${c.id}?ok=paid`);
  });

  // Shows the new password once on the page (never in the address bar).
  r.post('/users/:id/reset', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
    if (!u) return res.redirect(303, '/admin');
    const pass = tempPassword();
    tx(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(pass), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    });
    clinicPage(req, res, getClinic(u.clinic_id), `New password for ${u.email}: ${pass}. Give it to them now; it isn't shown again.`);
  });

  r.get('/clinics/:id/poster', async (req, res, next) => {
    try {
      const c = getClinic(req.params.id);
      if (!c) return res.redirect(303, '/admin');
      const url = `${baseUrl}/c/${c.slug}`;
      const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#121a2bff', light: '#ffffffff' } });
      res.send(posterPage(c, null, url, svg));
    } catch (err) { next(err); }
  });

  return r;
}
