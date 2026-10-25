import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { hashSecret, localParts, addDays } from '../src/util.js';
import { cancelInfo, isLate, bookingBlock, noShowCount } from '../src/policy.js';

process.env.NODE_ENV = 'test';

let server, base, db, owner;
let n = 0;
// A time booking that starts `hoursAhead` hours from now (Kurdistan time).
function bookAt(hoursAhead, patientId = 1, status = 'booked') {
  const at = localParts(new Date(Date.now() + hoursAhead * 3600e3));
  const tok = `tok${++n}`;
  db.prepare(`INSERT INTO bookings (clinic_id, doctor_id, patient_id, date, time, duration_min, queue_no, status, token, lang) VALUES (1, 1, ?, ?, ?, 15, ?, ?, ?, 'en')`).run(patientId, at.date, at.time, n, status, tok);
  return db.prepare('SELECT * FROM bookings WHERE token = ?').get(tok);
}
const clinic = () => db.prepare('SELECT * FROM clinics WHERE id = 1').get();

before(async () => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO clinics (id, name, slug, kind, phone) VALUES (1, 'Shifa', 'shifa', 'clinic', '0750 111 2222')").run();
  db.prepare("INSERT INTO doctors (id, clinic_id, name, mode, slot_minutes) VALUES (1, 1, 'Dr. A', 'time', 15)").run();
  for (let wd = 0; wd < 7; wd++) db.prepare("INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (1, ?, '00:00', '23:59')").run(wd);
  db.prepare("INSERT INTO users (clinic_id, name, email, password_hash, role, lang) VALUES (1, 'Owner', 'owner@test', ?, 'owner', 'en')").run(hashSecret('password123'));
  db.prepare("INSERT INTO patients (id, clinic_id, name, phone) VALUES (1, 1, 'Aram', '+9647500000001'), (2, 1, 'Rozh', '+9647500000002')").run();
  server = createApp(db, { baseUrl: 'http://test', dev: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@test', password: 'password123' }) });
  owner = res.headers.get('set-cookie').split(';')[0];
});
after(() => server.close());

const post = async (path, body, cookie) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body || {}) });
  return { status: res.status, data: await res.json() };
};

test('customers can cancel online until 24 hours before, then must call', async () => {
  const early = bookAt(30);
  const late = bookAt(5);
  assert.equal(cancelInfo(db, early, clinic()).canCancel, true);
  assert.equal(cancelInfo(db, late, clinic()).tooLate, true);

  const t = await (await fetch(`${base}/api/p/t/${late.token}`)).json();
  assert.equal(t.canCancel, false);
  assert.equal(t.cancelClosed, true);
  assert.equal(t.phone, '0750 111 2222');
  const refused = await post(`/api/p/t/${late.token}/cancel`);
  assert.equal(refused.status, 409);
  assert.equal(refused.data.error, 'cancelTooLate');
  assert.equal((await post(`/api/p/t/${early.token}/cancel`)).status, 200);

  // The ticket page shows the rules and a call button.
  const page = await (await fetch(`${base}/t/${late.token}?lang=en`)).text();
  assert.ok(page.includes('We hold your time for 15 minutes'));
  assert.ok(page.includes('href="tel:07501112222"'));
});

test('the owner can change the rules, and 0 hours means cancel any time', async () => {
  assert.equal((await fetch(base + '/api/s/policy', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: owner }, body: JSON.stringify({ cancelHours: 0, lateMinutes: 10, noShowLimit: 2, note: 'Bring your ID' }) })).status, 200);
  const c = clinic();
  assert.deepEqual([c.cancel_hours, c.late_minutes, c.noshow_limit, c.policy_note], [0, 10, 2, 'Bring your ID']);
  assert.equal(cancelInfo(db, bookAt(1), c).canCancel, true);
  assert.ok((await (await fetch(`${base}/c/shifa?lang=en`)).text()).includes('Bring your ID'));
  // Odd values fall back to the defaults.
  await fetch(base + '/api/s/policy', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: owner }, body: JSON.stringify({ cancelHours: 7, lateMinutes: 999, noShowLimit: 3 }) });
  assert.deepEqual([clinic().cancel_hours, clinic().late_minutes], [24, 15]);
});

test('a booking counts as late after the hold time', () => {
  assert.equal(isLate(db, bookAt(-0.2), clinic()), false); // 12 minutes late, held 15
  assert.equal(isLate(db, bookAt(-0.5), clinic()), true);
});

test('no-shows: a message each time, online booking stops at the limit, the clinic can forgive', async () => {
  const day = (await (await fetch(`${base}/api/s/day?doctorId=1`, { headers: { Cookie: owner } })).json());
  assert.ok(Array.isArray(day.rows));

  for (let i = 0; i < 3; i++) {
    const b = bookAt(-1 - i, 2);
    const r = await post(`/api/s/bookings/${b.id}/status`, { status: 'no_show' }, owner);
    assert.equal(r.data.warned, true);
  }
  assert.equal(noShowCount(db, 2), 3);
  const msgs = db.prepare("SELECT body FROM messages WHERE kind = 'no-show' ORDER BY id").all().map((m) => m.body);
  assert.equal(msgs.length, 3);
  assert.match(msgs[0], /After 2 more missed visits/);
  assert.match(msgs[2], /online booking is paused/);
  assert.equal(bookingBlock(db, clinic(), '+9647500000002'), 'blocked');

  // Online booking is refused with a clear reason.
  const otp = await post('/api/p/otp', { phone: '0750 000 0002', lang: 'en' });
  const tomorrow = addDays(localParts().date, 1);
  const refused = await post('/api/p/bookings', { doctorId: 1, date: tomorrow, time: '09:00', name: 'Rozh', phone: '0750 000 0002', code: otp.data.devCode, lang: 'en' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.error, 'bookingBlocked');

  // Staff see the warning on the patient file and in the day list.
  const file = (await (await fetch(`${base}/api/s/patients/2`, { headers: { Cookie: owner } })).json()).standing;
  assert.deepEqual([file.noShows, file.blocked], [3, true]);

  // "Allow again" clears the count, so they can book online.
  const allowed = await post('/api/s/patients/2/booking', { action: 'allow' }, owner);
  assert.equal(allowed.data.standing.blocked, false);
  assert.equal(allowed.data.standing.noShows, 0);
  assert.equal(bookingBlock(db, clinic(), '+9647500000002'), null);

  // A manual stop works too.
  await post('/api/s/patients/2/booking', { action: 'stop' }, owner);
  assert.equal(bookingBlock(db, clinic(), '+9647500000002'), 'blocked');
  await post('/api/s/patients/2/booking', { action: 'allow' }, owner);
});

test('a number banned by Nobat cannot book online anywhere', async () => {
  db.prepare("INSERT INTO banned_phones (phone, reason) VALUES ('+9647500000009', 'test')").run();
  assert.equal(bookingBlock(db, clinic(), '+9647500000009'), 'banned');
  const otp = await post('/api/p/otp', { phone: '0750 000 0009', lang: 'en' });
  const r = await post('/api/p/bookings', { doctorId: 1, date: addDays(localParts().date, 1), time: '09:15', name: 'X', phone: '0750 000 0009', code: otp.data.devCode, lang: 'en' });
  assert.equal(r.data.error, 'bookingBanned');
});
