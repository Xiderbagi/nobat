import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { hashSecret, normalizePhone, localParts, addDays, weekdayOf } from '../src/util.js';
import { callNext, createBooking, getDoctor, freeSlots } from '../src/queue.js';

process.env.NODE_ENV = 'test';

function setup() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO clinics (id, name, slug, city) VALUES (1, 'Test Clinic', 'test', 'Erbil')").run();
  db.prepare("INSERT INTO clinics (id, name, slug, city) VALUES (2, 'Other Clinic', 'other', 'Duhok')").run();
  db.prepare("INSERT INTO users (clinic_id, name, email, password_hash, role) VALUES (1, 'Owner', 'owner@test.iq', ?, 'owner')").run(hashSecret('password123'));
  db.prepare("INSERT INTO users (clinic_id, name, email, password_hash, role) VALUES (2, 'Other', 'other@test.iq', ?, 'reception')").run(hashSecret('password123'));
  db.prepare("INSERT INTO doctors (id, clinic_id, name, mode, avg_minutes, daily_limit) VALUES (1, 1, 'Dr. Queue', 'queue', 10, 3)").run();
  db.prepare("INSERT INTO doctors (id, clinic_id, name, mode, slot_minutes) VALUES (2, 1, 'Dr. Time', 'time', 30)").run();
  // Both doctors work every day, all day, so tests don't depend on the clock.
  for (const id of [1, 2]) for (let wd = 0; wd < 7; wd++) db.prepare("INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, '00:00', '23:59')").run(id, wd);
  return db;
}

test('normalizes Iraqi mobile numbers', () => {
  assert.equal(normalizePhone('0750 123 4567'), '+9647501234567');
  assert.equal(normalizePhone('+964 750 123 4567'), '+9647501234567');
  assert.equal(normalizePhone('009647501234567'), '+9647501234567');
  assert.equal(normalizePhone('7501234567'), '+9647501234567');
  assert.equal(normalizePhone('066 222 3333'), null);
  assert.equal(normalizePhone('12345'), null);
});

test('queue numbers, call next and the "come now" alert', () => {
  const db = setup();
  const doctor = getDoctor(db, 1);
  const date = addDays(localParts().date, 1);
  const a = createBooking(db, { doctor, date, name: 'A', phone: '+9647500000001', lang: 'en' });
  const b = createBooking(db, { doctor, date, name: 'B', phone: '+9647500000002', lang: 'en' });
  const c = createBooking(db, { doctor, date, name: 'C', phone: '+9647500000003', lang: 'en' });
  assert.deepEqual([a.queue_no, b.queue_no, c.queue_no], [1, 2, 3]);
  // Booking again with the same phone returns the same booking instead of a second one.
  assert.equal(createBooking(db, { doctor, date, name: 'A', phone: '+9647500000001', lang: 'en' }).id, a.id);
  // Daily limit is 3.
  assert.throws(() => createBooking(db, { doctor, date, name: 'D', phone: '+9647500000004', lang: 'en' }), { code: 'full' });

  const first = callNext(db, 1, date);
  assert.equal(first.called.id, a.id);
  assert.equal(first.near.id, c.id); // 2 places behind the called patient
  const second = callNext(db, 1, date);
  assert.equal(second.called.id, b.id);
  assert.equal(second.near, null);
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(a.id).status, 'done');
});

test('time slots cannot be double-booked', () => {
  const db = setup();
  const doctor = getDoctor(db, 2);
  const date = addDays(localParts().date, 2);
  const slot = freeSlots(db, doctor, date)[0].time;
  createBooking(db, { doctor, date, time: slot, name: 'A', phone: '+9647500000001', lang: 'en' });
  assert.throws(() => createBooking(db, { doctor, date, time: slot, name: 'B', phone: '+9647500000002', lang: 'en' }), { code: 'slotTaken' });
  assert.equal(freeSlots(db, doctor, date).find((s) => s.time === slot).free, false);
});

test('days outside the schedule are closed', () => {
  const db = setup();
  const date = addDays(localParts().date, 3);
  db.prepare('DELETE FROM schedules WHERE doctor_id = 1 AND weekday = ?').run(weekdayOf(date));
  assert.throws(() => createBooking(db, { doctor: getDoctor(db, 1), date, name: 'A', phone: '+9647500000001', lang: 'en' }), { code: 'closed' });
});

// ---------- Through the HTTP API ----------
let server, base, db;
before(async () => {
  db = setup();
  server = createApp(db, { baseUrl: 'http://test', dev: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, cookie: res.headers.get('set-cookie') };
}

async function signIn(email) {
  const r = await call('/api/login', { method: 'POST', body: { email, password: 'password123' } });
  assert.equal(r.status, 200);
  return r.cookie.split(';')[0];
}

test('a patient books with an SMS code and follows the queue', async () => {
  const day = await call('/api/p/doctors/1/day');
  assert.equal(day.status, 200);
  assert.equal(day.data.mode, 'queue');

  assert.equal((await call('/api/p/otp', { method: 'POST', body: { phone: '123' } })).data.error, 'badPhone');
  const otp = await call('/api/p/otp', { method: 'POST', body: { phone: '0750 111 2222', lang: 'ckb' } });
  assert.equal(otp.status, 200);
  assert.match(otp.data.devCode, /^\d{4}$/);

  const wrong = await call('/api/p/bookings', { method: 'POST', body: { doctorId: 1, date: day.data.date, name: 'Aram', phone: '07501112222', code: otp.data.devCode === '0000' ? '1111' : '0000' } });
  assert.equal(wrong.data.error, 'badCode');

  const booked = await call('/api/p/bookings', { method: 'POST', body: { doctorId: 1, date: day.data.date, name: 'Aram', phone: '07501112222', code: otp.data.devCode, lang: 'ckb' } });
  assert.equal(booked.status, 200);
  const tok = booked.data.token;

  // The code only works once.
  const reuse = await call('/api/p/bookings', { method: 'POST', body: { doctorId: 1, date: day.data.date, name: 'Aram', phone: '07501112222', code: otp.data.devCode } });
  assert.equal(reuse.data.error, 'badCode');

  const ticket = await call(`/api/p/t/${tok}`);
  assert.equal(ticket.data.status, 'booked');
  assert.equal(ticket.data.queueNo, 1);

  const page = await call(`/t/${tok}`);
  assert.match(page.data, /dir="rtl"/);

  const msgs = db.prepare('SELECT kind, body FROM messages ORDER BY id').all();
  assert.deepEqual(msgs.map((m) => m.kind), ['code', 'confirmed']);
  assert.ok(!/\d{4}/.test(msgs[0].body), 'login codes are not stored');
  assert.ok(msgs[1].body.includes(`http://test/t/${tok}`));

  // Reception calls the patient in.
  const cookie = await signIn('owner@test.iq');
  const list = await call(`/api/s/day?doctorId=1&date=${day.data.date}`, { cookie });
  assert.equal(list.data.rows.length, 1);
  const next = await call('/api/s/next', { method: 'POST', body: { doctorId: 1, date: day.data.date }, cookie });
  assert.equal(next.data.called.queueNo, 1);
  assert.equal((await call(`/api/p/t/${tok}`)).data.status, 'in_room');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE kind = 'turn'").get().n, 1);

  // Walk-in without a phone gets the next number.
  const walk = await call('/api/s/walkin', { method: 'POST', body: { doctorId: 1, date: day.data.date, name: 'Walk-in Ali' }, cookie });
  assert.equal(walk.data.queueNo, 2);
});

test('staff only see their own clinic', async () => {
  const cookie = await signIn('other@test.iq');
  assert.equal((await call('/api/s/day?doctorId=1', { cookie })).status, 404);
  assert.equal((await call('/api/s/settings', { cookie })).status, 403);
  assert.equal((await call('/api/s/day?doctorId=1')).status, 401);
  assert.equal((await call('/app')).status, 302);
});

test('owner saves a doctor with working hours', async () => {
  const cookie = await signIn('owner@test.iq');
  const bad = await call('/api/s/doctors', { method: 'POST', cookie, body: { name: 'Dr. New', schedules: [{ weekday: 1, start_time: '20:00', end_time: '16:00' }] } });
  assert.equal(bad.status, 400);
  const ok = await call('/api/s/doctors', { method: 'POST', cookie, body: { name: 'Dr. New', specialty: 'Skin', fee_iqd: 30000, mode: 'time', schedules: [{ weekday: 6, start_time: '16:00', end_time: '21:00' }] } });
  assert.equal(ok.status, 200);
  const s = await call('/api/s/settings', { cookie });
  const d = s.data.doctors.find((x) => x.id === ok.data.id);
  assert.equal(d.schedules.length, 1);
  assert.equal(d.mode, 'time');
});

test('wrong password is refused', async () => {
  const r = await call('/api/login', { method: 'POST', body: { email: 'owner@test.iq', password: 'nope' } });
  assert.equal(r.status, 401);
});
