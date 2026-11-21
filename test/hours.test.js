import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { hashSecret, localParts, addDays } from '../src/util.js';
import { hoursFor, freeSlots, bookableDays, getDoctor } from '../src/queue.js';
import { categoriesFor } from '../src/directory.js';

process.env.NODE_ENV = 'test';

let server, base, db, owner, desk, doc;
const day = addDays(localParts().date, 2); // a day in the booking window, never "today"

before(async () => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO clinics (id, name, slug, kind, phone) VALUES (1, 'Shifa', 'shifa', 'clinic', '0750 111 2222')").run();
  db.prepare("INSERT INTO doctors (id, clinic_id, name, mode, slot_minutes) VALUES (1, 1, 'Dr. A', 'time', 30), (2, 1, 'Dr. B', 'time', 30)").run();
  for (let wd = 0; wd < 7; wd++) db.prepare("INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (1, ?, '08:00', '20:00'), (2, ?, '08:00', '20:00')").run(wd, wd);
  const pw = hashSecret('password123');
  const user = db.prepare('INSERT INTO users (clinic_id, name, email, password_hash, role, doctor_id, lang) VALUES (1, ?, ?, ?, ?, ?, ?)');
  user.run('Owner', 'owner@t', pw, 'owner', null, 'en');
  user.run('Desk', 'desk@t', pw, 'reception', null, 'en');
  user.run('Dr. B', 'drb@t', pw, 'doctor', 2, 'en');
  db.prepare("INSERT INTO patients (id, clinic_id, name, phone) VALUES (1, 1, 'Aram', '+9647500000001')").run();
  db.prepare("INSERT INTO bookings (clinic_id, doctor_id, patient_id, date, time, duration_min, queue_no, status, token) VALUES (1, 1, 1, ?, '13:30', 30, 1, 'booked', 'tk1')").run(day);
  server = createApp(db, { baseUrl: 'http://test', dev: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email) => (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'password123' }) })).headers.get('set-cookie').split(';')[0];
  [owner, desk, doc] = [await login('owner@t'), await login('desk@t'), await login('drb@t')];
});
after(() => server.close());

const call = async (path, method, body, cookie) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};

test('opening hours limit every doctor; only the owner can change them', async () => {
  assert.equal((await call('/api/s/hours', 'PUT', { hours: [] }, desk)).status, 403);
  assert.equal((await call('/api/s/hours', 'PUT', { on: true, hours: [] }, owner)).data.error, 'hoursNeedOne');
  const wd = new Date(day + 'T12:00:00Z').getUTCDay();
  const r = await call('/api/s/hours', 'PUT', { on: true, hours: [{ weekday: wd, start_time: '09:00', end_time: '12:00' }, { weekday: wd, start_time: '16:00', end_time: '18:00' }] }, owner);
  assert.equal(r.status, 200);
  assert.deepEqual(hoursFor(db, 1, day), [{ start_time: '09:00', end_time: '12:00' }, { start_time: '16:00', end_time: '18:00' }]);
  // Other weekdays are closed now.
  assert.deepEqual(hoursFor(db, 1, addDays(day, 1)), []);
  assert.equal(bookableDays(db, 1).find((d) => d.date === addDays(day, 1)).open, false);
  // Customers see the hours on the clinic page.
  assert.match(await (await fetch(base + '/c/shifa?lang=en')).text(), /Opening hours[\s\S]*09:00–12:00/);
  // Turning them off removes the limit again.
  await call('/api/s/hours', 'PUT', { on: false, hours: [] }, owner);
  assert.deepEqual(hoursFor(db, 1, day), [{ start_time: '08:00', end_time: '20:00' }]);
});

test('time off: a break blocks only those hours, for one doctor; staff are told who already booked', async () => {
  const r = await call('/api/s/timeoff', 'POST', { doctorId: 1, dateFrom: day, dateTo: day, allDay: false, startTime: '13:00', endTime: '15:00', reason: 'Lunch' }, desk);
  assert.equal(r.status, 200);
  assert.equal(r.data.affected.length, 1);
  assert.equal(r.data.affected[0].name, 'Aram');
  const times = freeSlots(db, getDoctor(db, 1), day).map((s) => s.time);
  assert.ok(times.includes('12:30') && times.includes('15:00'));
  assert.ok(!times.includes('13:00') && !times.includes('14:30'));
  // Dr. B is not affected.
  assert.ok(freeSlots(db, getDoctor(db, 2), day).some((s) => s.time === '13:30'));
});

test('time off: a whole-clinic holiday closes the days and shows on the clinic page', async () => {
  const hol = addDays(day, 2);
  const r = await call('/api/s/timeoff', 'POST', { dateFrom: hol, dateTo: addDays(hol, 1), reason: 'Eid holiday' }, owner);
  assert.equal(r.status, 200);
  for (const id of [1, 2]) assert.equal(bookableDays(db, id).find((d) => d.date === hol).open, false);
  const page = await (await fetch(base + '/c/shifa?lang=en')).text();
  assert.match(page, /Closed on these days[\s\S]*Eid holiday/);
  const list = (await (await fetch(base + '/api/s/hours', { headers: { Cookie: owner } })).json()).timeOff;
  const id = list.find((o) => o.reason === 'Eid holiday').id;
  assert.equal((await call(`/api/s/timeoff/${id}`, 'DELETE', null, owner)).status, 200);
  assert.equal(bookableDays(db, 1).find((d) => d.date === hol).open, true);
});

test('time off: bad dates are refused, and a doctor can only block their own time', async () => {
  assert.equal((await call('/api/s/timeoff', 'POST', { dateFrom: day, dateTo: addDays(day, -1) }, owner)).data.error, 'offBadDates');
  assert.equal((await call('/api/s/timeoff', 'POST', { dateFrom: day, allDay: false, startTime: '15:00', endTime: '14:00' }, owner)).data.error, 'offBadTimes');
  await call('/api/s/timeoff', 'POST', { doctorId: 1, dateFrom: addDays(day, 3) }, doc);
  const row = db.prepare('SELECT doctor_id FROM time_off ORDER BY id DESC').get();
  assert.equal(row.doctor_id, 2); // saved for Dr. B, not Dr. A
  const deskEntry = db.prepare("SELECT id FROM time_off WHERE doctor_id = 1").get();
  assert.equal((await call(`/api/s/timeoff/${deskEntry.id}`, 'DELETE', null, doc)).status, 404);
});

test('each clinic specialty has a usual visit length', () => {
  const cats = Object.fromEntries(categoriesFor('en').map((c) => [c.key, c.minutes]));
  assert.deepEqual(cats.dentist, [30, 20]);
  assert.deepEqual(cats.gp, [15, 10]);
  assert.equal(cats.barber_men, undefined); // salons set minutes per service instead
});
