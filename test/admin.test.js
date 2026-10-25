import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { clinicState } from '../src/admin.js';
import { hashSecret } from '../src/util.js';

process.env.NODE_ENV = 'test';

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO admins (name, email, password_hash) VALUES ('Boss', 'boss@nobat.app', ?)").run(hashSecret('admin-password'));
  server = createApp(db, { baseUrl: 'http://test', dev: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function req(path, { method = 'GET', form, json, cookie } = {}) {
  const headers = { ...(cookie ? { Cookie: cookie } : {}) };
  let body;
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
  return { status: res.status, text: await res.text(), location: res.headers.get('location'), cookie: res.headers.get('set-cookie') };
}

async function adminCookie() {
  const r = await req('/admin/login', { method: 'POST', form: { email: 'boss@nobat.app', password: 'admin-password' } });
  assert.equal(r.status, 303);
  assert.match(r.cookie, /SameSite=Strict/);
  return r.cookie.split(';')[0];
}

test('admin screen is private', async () => {
  const page = await req('/admin');
  assert.match(page.text, /name="password"/); // shows sign-in, not the clinics
  assert.doesNotMatch(page.text, /Your clinics/);
  assert.equal((await req('/admin/login', { method: 'POST', form: { email: 'boss@nobat.app', password: 'nope' } })).status, 401);
  assert.equal((await req('/admin/clinics', { method: 'POST', form: { name: 'X' } })).text.includes('Create clinic'), false);
  // A clinic owner's sign-in does not open the admin screen.
  db.prepare("INSERT INTO clinics (id, name, slug) VALUES (99, 'Other', 'other')").run();
  db.prepare("INSERT INTO users (clinic_id, name, email, password_hash, role) VALUES (99, 'O', 'o@o.iq', ?, 'owner')").run(hashSecret('password123'));
  const staff = await req('/api/login', { method: 'POST', json: { email: 'o@o.iq', password: 'password123' } });
  assert.doesNotMatch((await req('/admin', { cookie: staff.cookie.split(';')[0] })).text, /Your clinics/);
});

test('admin adds a clinic, records a payment, resets a password and switches it off and on', async () => {
  const cookie = await adminCookie();
  const bad = await req('/admin/clinics', { method: 'POST', cookie, form: { name: 'Shifa Clinic', owner: 'Dr. Hemin', email: 'not-an-email' } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /valid email/);

  const made = await req('/admin/clinics', { method: 'POST', cookie, form: { name: 'Shifa Clinic', city: 'Erbil', kind: 'clinic', owner: 'Dr. Hemin', email: 'Hemin@Example.com', lang: 'ckb', plan: 'trial', trialDays: '14', demo: '1' } });
  assert.equal(made.status, 200);
  const pass = /class="pw">([a-z0-9]+)</.exec(made.text)[1];
  assert.equal(pass.length, 10);
  assert.match(made.text, /http:\/\/test\/c\/shifa-clinic/);
  const clinic = db.prepare("SELECT * FROM clinics WHERE slug = 'shifa-clinic'").get();
  assert.equal(clinic.status, 'trial');
  assert.ok(clinic.trial_ends);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM doctors WHERE clinic_id = ?').get(clinic.id).n, 2);

  // The owner can sign in with the temporary password (email is not case-sensitive).
  const owner = await req('/api/login', { method: 'POST', json: { email: 'hemin@example.com', password: pass } });
  assert.equal(owner.status, 200);
  const ownerCookie = owner.cookie.split(';')[0];
  assert.match((await req('/admin', { cookie })).text, /Shifa Clinic/);

  // Payment makes it a paying clinic.
  const paid = await req(`/admin/clinics/${clinic.id}/payments`, { method: 'POST', cookie, form: { amount: '60', currency: 'USD', method: 'FIB', paid_until: '2030-12-01', note: 'Pro plan' } });
  assert.equal(paid.status, 303);
  const afterPay = db.prepare('SELECT status, paid_until FROM clinics WHERE id = ?').get(clinic.id);
  assert.deepEqual({ ...afterPay }, { status: 'active', paid_until: '2030-12-01' });
  assert.match((await req('/admin', { cookie })).text, /60 USD/);

  // Switching off: staff are signed out and can't sign in, patients can't book.
  await req(`/admin/clinics/${clinic.id}/status`, { method: 'POST', cookie, form: { status: 'off' } });
  assert.equal((await req('/api/s/settings', { cookie: ownerCookie })).status, 401);
  const blocked = await req('/api/login', { method: 'POST', json: { email: 'hemin@example.com', password: pass } });
  assert.equal(blocked.status, 403);
  assert.match(blocked.text, /clinicOff/);
  const pageOff = await req('/c/shifa-clinic?lang=en');
  assert.equal(pageOff.status, 403);
  assert.match(pageOff.text, /not available/);
  const docId = db.prepare('SELECT id FROM doctors WHERE clinic_id = ? LIMIT 1').get(clinic.id).id;
  assert.equal((await req(`/api/p/doctors/${docId}/day`)).status, 404);

  // Switching on again: everything is back.
  await req(`/admin/clinics/${clinic.id}/status`, { method: 'POST', cookie, form: { status: 'on' } });
  assert.equal(db.prepare('SELECT status FROM clinics WHERE id = ?').get(clinic.id).status, 'active');
  assert.equal((await req('/c/shifa-clinic')).status, 200);

  // New password from the admin screen replaces the old one.
  const userId = db.prepare("SELECT id FROM users WHERE email = 'hemin@example.com'").get().id;
  const reset = await req(`/admin/users/${userId}/reset`, { method: 'POST', cookie });
  const newPass = /hemin@example\.com: ([a-z0-9]{10})\./.exec(reset.text)[1];
  assert.equal((await req('/api/login', { method: 'POST', json: { email: 'hemin@example.com', password: pass } })).status, 401);
  assert.equal((await req('/api/login', { method: 'POST', json: { email: 'hemin@example.com', password: newPass } })).status, 200);

  const poster = await req(`/admin/clinics/${clinic.id}/poster`, { cookie });
  assert.match(poster.text, /<svg[^>]*viewBox/);
});

test('status labels show what needs attention', () => {
  const today = '2026-10-25';
  assert.equal(clinicState({ status: 'trial', trial_ends: '2026-10-28' }, today).alert, true);
  assert.equal(clinicState({ status: 'trial', trial_ends: '2026-11-20' }, today).alert, false);
  assert.match(clinicState({ status: 'trial', trial_ends: '2026-10-20' }, today).label, /Trial ended/);
  assert.match(clinicState({ status: 'active', paid_until: '2026-10-01' }, today).label, /Payment due/);
  assert.equal(clinicState({ status: 'active', paid_until: '2026-11-25' }, today).cls, 'good');
  assert.equal(clinicState({ status: 'off' }, today).label, 'Switched off');
});

test('admin login can come from Render settings, and phone-keyboard quotes and spaces are ignored', async () => {
  const { ensureAdminFromEnv } = await import('../src/admin.js');
  const { openDb } = await import('../src/db.js');
  const fresh = openDb(':memory:');
  assert.equal(ensureAdminFromEnv(fresh, {}), null);
  assert.match(ensureAdminFromEnv(fresh, { ADMIN_EMAIL: 'Me@Gmail.com ', ADMIN_PASSWORD: 'short' }), /at least 8/);
  assert.match(ensureAdminFromEnv(fresh, { ADMIN_EMAIL: ' Me@Gmail.com', ADMIN_PASSWORD: '“NobatErbil2026”' }), /ready for me@gmail.com/);
  const { checkSecret } = await import('../src/util.js');
  assert.ok(checkSecret('NobatErbil2026', fresh.prepare("SELECT password_hash FROM admins WHERE email = 'me@gmail.com'").get().password_hash));
  // Changing the password in the settings resets it on the next start; only one account.
  ensureAdminFromEnv(fresh, { ADMIN_EMAIL: 'me@gmail.com', ADMIN_PASSWORD: 'AnotherPass99' });
  assert.equal(fresh.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 1);
  assert.ok(checkSecret('AnotherPass99', fresh.prepare('SELECT password_hash FROM admins').get().password_hash));
});
