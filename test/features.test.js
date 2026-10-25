import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp, runScheduled } from '../src/server.js';
import { hashSecret, localParts, addDays } from '../src/util.js';
import { createSalonBooking, salonTimes, dueRebooks, BookingError } from '../src/queue.js';

process.env.NODE_ENV = 'test';

// Evening and morning moments in Kurdistan time (UTC+3), used to trigger scheduled messages.
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+03:00`);

function setup() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO clinics (id, name, slug, kind) VALUES (1, 'Clinic', 'clinic', 'clinic'), (2, 'Salon', 'salon', 'salon'), (3, 'Other', 'other', 'clinic')").run();
  const user = db.prepare('INSERT INTO users (clinic_id, name, email, password_hash, role, lang) VALUES (?, ?, ?, ?, ?, ?)');
  const pw = hashSecret('password123');
  user.run(1, 'Owner', 'owner@c.iq', pw, 'owner', 'en');
  user.run(1, 'Reception', 'desk@c.iq', pw, 'reception', 'ckb');
  user.run(1, 'Dr. A', 'doc@c.iq', pw, 'doctor', 'en');
  user.run(2, 'Salon owner', 'owner@s.iq', pw, 'owner', 'en');
  user.run(3, 'Other', 'other@o.iq', pw, 'owner', 'en');
  db.prepare("INSERT INTO doctors (id, clinic_id, name, mode) VALUES (1, 1, 'Dr. A', 'queue')").run();
  db.prepare("INSERT INTO doctors (id, clinic_id, name, mode) VALUES (10, 2, 'Lana', 'time'), (11, 2, 'Shno', 'time')").run();
  for (let wd = 0; wd < 7; wd++) {
    db.prepare("INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (1, ?, '00:00', '23:59')").run(wd);
    db.prepare("INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (10, ?, '10:00', '12:00'), (11, ?, '10:00', '12:00')").run(wd, wd);
  }
  db.prepare("INSERT INTO services (id, clinic_id, name, price_iqd, minutes, rebook_weeks) VALUES (1, 2, 'Haircut', 25000, 60, 6), (2, 2, 'Eyebrows', 7000, 15, 0)").run();
  db.prepare("INSERT INTO patients (id, clinic_id, name, phone) VALUES (1, 1, 'Aram', '+9647500000001'), (2, 3, 'Other patient', '+9647500000009')").run();
  return db;
}

test('salon: visits never overlap and "anyone" picks the first free person', () => {
  const db = setup();
  const date = addDays(localParts().date, 1);
  const a = createSalonBooking(db, { clinicId: 2, staffId: 10, serviceIds: [1], date, time: '10:00', name: 'A', phone: '+9647500000001' });
  assert.equal(a.duration_min, 60);
  assert.equal(a.service_names, 'Haircut');
  // Lana is busy 10:00–11:00, so 10:30 with Lana fails...
  assert.throws(() => createSalonBooking(db, { clinicId: 2, staffId: 10, serviceIds: [2], date, time: '10:30', name: 'B', phone: '+9647500000002' }), BookingError);
  // ...but "anyone" at 10:30 goes to Shno.
  const b = createSalonBooking(db, { clinicId: 2, staffId: null, serviceIds: [1, 2], date, time: '10:30', name: 'B', phone: '+9647500000002' });
  assert.equal(b.doctor_name, 'Shno');
  assert.equal(b.duration_min, 75);
  // A visit must end before closing time (12:00).
  assert.throws(() => createSalonBooking(db, { clinicId: 2, staffId: 10, serviceIds: [1], date, time: '11:30', name: 'C', phone: '+9647500000003' }), BookingError);
  const lanaTimes = salonTimes(db, 2, 10, date, 60).map((x) => x.time);
  // Once Shno only does eyebrows, "anyone" for a haircut can't go to Shno.
  const date2 = addDays(date, 1);
  db.prepare('INSERT INTO staff_services (doctor_id, service_id) VALUES (11, 2)').run();
  createSalonBooking(db, { clinicId: 2, staffId: 10, serviceIds: [2], date: date2, time: '10:00', name: 'D', phone: '+9647500000004' }); // Lana busy 10:00-10:15
  assert.throws(() => createSalonBooking(db, { clinicId: 2, staffId: null, serviceIds: [1], date: date2, time: '10:00', name: 'E', phone: '+9647500000005' }), BookingError);
  assert.equal(createSalonBooking(db, { clinicId: 2, staffId: null, serviceIds: [2], date: date2, time: '10:00', name: 'F', phone: '+9647500000006' }).doctor_name, 'Shno');
  assert.ok(!salonTimes(db, 2, 11, date2, 60, new Date(), [1]).length, 'Shno offers no haircut times');
  assert.ok(!lanaTimes.includes('10:00') && !lanaTimes.includes('10:45') && lanaTimes.includes('11:00'));
});

test('salon: "book again" message goes out after the service\'s weeks, unless the customer already booked', () => {
  const db = setup();
  const visit = addDays(localParts().date, -42);
  db.prepare("INSERT INTO patients (id, clinic_id, name, phone) VALUES (5, 2, 'Shilan', '+9647500000005')").run();
  db.prepare("INSERT INTO bookings (id, clinic_id, doctor_id, patient_id, date, time, duration_min, queue_no, status, token) VALUES (50, 2, 10, 5, ?, '10:00', 60, 1, 'done', 'tok50')").run(visit);
  db.prepare('INSERT INTO booking_services (booking_id, service_id) VALUES (50, 1)').run();
  // A second customer who already has a visit booked ahead gets no reminder.
  db.prepare("INSERT INTO patients (id, clinic_id, name, phone) VALUES (6, 2, 'Rozh', '+9647500000006')").run();
  db.prepare("INSERT INTO bookings (id, clinic_id, doctor_id, patient_id, date, time, duration_min, queue_no, status, token) VALUES (60, 2, 11, 6, ?, '10:00', 60, 1, 'done', 'tok60')").run(visit);
  db.prepare("INSERT INTO bookings (id, clinic_id, doctor_id, patient_id, date, time, duration_min, queue_no, status, token) VALUES (61, 2, 11, 6, ?, '11:00', 60, 1, 'booked', 'tok61')").run(addDays(localParts().date, 2));
  db.prepare('INSERT INTO booking_services (booking_id, service_id) VALUES (60, 1)').run();
  assert.deepEqual(dueRebooks(db).map((b) => b.id), [50]);
  runScheduled(db, 'http://test', at(localParts().date, '10:30'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE kind = 'rebook'").get().n, 1);
  assert.deepEqual(dueRebooks(db), []); // only once
});

test('follow-up reminder is sent the evening before', () => {
  const db = setup();
  const today = localParts().date;
  db.prepare('UPDATE patients SET follow_up_date = ? WHERE id = 1').run(addDays(today, 1));
  runScheduled(db, 'http://test', at(today, '12:00'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE kind = 'follow-up'").get().n, 0);
  runScheduled(db, 'http://test', at(today, '18:30'));
  runScheduled(db, 'http://test', at(today, '18:35'));
  const msgs = db.prepare("SELECT body FROM messages WHERE kind = 'follow-up'").all();
  assert.equal(msgs.length, 1);
  assert.ok(msgs[0].body.includes('http://test/c/clinic'));
});

// ---------- Through HTTP ----------
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
  return { status: res.status, data };
}
async function signIn(email) {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'password123' }) });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('health check', async () => {
  assert.deepEqual((await call('/healthz')).data, { ok: true });
});

test('staff screens follow each person\'s language', async () => {
  const desk = await signIn('desk@c.iq');
  const page = await call('/app', { cookie: desk });
  assert.match(page.data, /dir="rtl"/);
  assert.match(page.data, /ئەمڕۆ/); // "Today" in Kurdish
  await call('/api/s/lang', { method: 'POST', body: { lang: 'en' }, cookie: desk });
  const again = await call('/app', { cookie: desk });
  assert.match(again.data, /dir="ltr"/);
  assert.match((await call('/login?lang=ar')).data, /dir="rtl"/);
});

test('patient files: reception sees visits, only doctors and owners see notes', async () => {
  const desk = await signIn('desk@c.iq');
  const doc = await signIn('doc@c.iq');
  const other = await signIn('other@o.iq');

  assert.equal((await call('/api/s/patients/1/notes', { method: 'POST', body: { note: 'x' }, cookie: desk })).status, 403);
  assert.equal((await call('/api/s/patients/1/notes', { method: 'POST', body: { note: '' }, cookie: doc })).data.error, 'noteEmpty');
  assert.equal((await call('/api/s/patients/1/notes', { method: 'POST', body: { note: 'Tonsillitis. Amoxicillin 500 mg for 7 days.' }, cookie: doc })).status, 200);
  await call('/api/s/patients/1', { method: 'PUT', body: { name: 'Aram', birth_year: 1990, allergies: 'Penicillin', follow_up_date: '2030-01-05' }, cookie: doc });

  const asDoc = (await call('/api/s/patients/1', { cookie: doc })).data;
  assert.equal(asDoc.notes.length, 1);
  assert.equal(asDoc.patient.allergies, 'Penicillin');
  assert.equal(asDoc.patient.follow_up_date, '2030-01-05');

  const asDesk = (await call('/api/s/patients/1', { cookie: desk })).data;
  assert.equal(asDesk.notes, null);
  assert.equal(asDesk.patient.allergies, null);
  // Reception saving the file must not wipe the doctor's medical fields.
  await call('/api/s/patients/1', { method: 'PUT', body: { name: 'Aram K', birth_year: 1990, follow_up_date: '2030-01-05' }, cookie: desk });
  assert.equal(db.prepare('SELECT allergies FROM patients WHERE id = 1').get().allergies, 'Penicillin');

  assert.equal((await call('/api/s/patients/1', { cookie: other })).status, 404);
  assert.equal((await call('/api/s/patients?q=Aram', { cookie: other })).data.rows.length, 0);
  assert.equal((await call('/api/s/patients?q=0750000', { cookie: desk })).data.rows.length, 1);
});

test('QR poster shows a QR code for the booking link', async () => {
  const owner = await signIn('owner@c.iq');
  const page = await call('/app/poster/1', { cookie: owner });
  assert.equal(page.status, 200);
  assert.match(page.data, /<svg[^>]*viewBox/);
  assert.match(page.data, /test\/c\/clinic\/d\/1/);
  assert.equal((await call('/app/poster/1')).status, 302);
});

test('salon: customer books online, desk adds a booking, owner manages services', async () => {
  const page = await call('/c/salon?lang=en');
  assert.match(page.data, /Haircut/);
  const date = addDays(localParts().date, 1);
  const times = await call(`/api/p/salons/2/times?services=1&staff=&date=${date}`);
  assert.equal(times.data.minutes, 60);
  assert.ok(times.data.times.includes('10:00'));

  const otp = await call('/api/p/otp', { method: 'POST', body: { phone: '0750 555 1234' } });
  const booked = await call('/api/p/salon-bookings', { method: 'POST', body: { clinicId: 2, staffId: 10, serviceIds: [1], date, time: '10:00', name: 'Sara', phone: '07505551234', code: otp.data.devCode, lang: 'en' } });
  assert.equal(booked.status, 200);
  const ticket = await call(`/api/p/t/${booked.data.token}`);
  assert.equal(ticket.data.salon, true);
  assert.equal(ticket.data.staff, 'Lana');
  assert.ok(db.prepare("SELECT body FROM messages WHERE kind = 'confirmed' ORDER BY id DESC").get().body.includes('Haircut'));

  const owner = await signIn('owner@s.iq');
  const busy = await call('/api/s/walkin', { method: 'POST', cookie: owner, body: { date, name: 'Walk', staffId: 10, serviceIds: [2], time: '10:15' } });
  assert.equal(busy.data.error, 'slotBusy');
  const ok = await call('/api/s/walkin', { method: 'POST', cookie: owner, body: { date, name: 'Walk', serviceIds: [2], time: '10:15' } });
  assert.equal(ok.data.staff, 'Shno');
  const day = await call(`/api/s/day?date=${date}`, { cookie: owner });
  assert.equal(day.data.rows.length, 2);

  const svc = await call('/api/s/services', { method: 'POST', cookie: owner, body: { name: 'Manicure', price_iqd: 15000, minutes: 45, rebook_weeks: 3 } });
  assert.equal(svc.status, 200);
  const otherOwner = await signIn('owner@c.iq');
  assert.equal((await call('/api/s/services', { method: 'POST', cookie: otherOwner, body: { id: svc.data.id, name: 'Hacked' } })).status, 404);
});

test('messages follow the patient\'s choice and fall back to the other channel', async () => {
  const { send } = await import('../src/notify.js');
  const db2 = openDb(':memory:');
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return String(url).includes('facebook') ? new Response('down', { status: 500 }) : new Response('{}'); };
  Object.assign(process.env, { SMS_URL: 'https://sms.example/send', WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_ID: '1', WHATSAPP_TEMPLATE: 'x' });
  try {
    assert.equal((await send(db2, { to: '+9647500000001', kind: 'turn', body: 'hi', channel: 'sms' })).channel, 'sms');
    const r = await send(db2, { to: '+9647500000001', kind: 'turn', body: 'hi', channel: 'whatsapp' });
    assert.deepEqual([r.channel, r.status], ['sms', 'sent']); // WhatsApp failed, SMS worked
    assert.ok(calls.some((u) => u.includes('facebook')));
    delete process.env.WHATSAPP_TOKEN; // SMS only: WhatsApp choice is ignored
    assert.equal((await send(db2, { to: '+9647500000001', kind: 'turn', body: 'hi', channel: 'whatsapp' })).channel, 'sms');
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ['SMS_URL', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_TEMPLATE']) delete process.env[k];
  }
});

test('the booking saves the patient\'s message choice', async () => {
  const otp = await call('/api/p/otp', { method: 'POST', body: { phone: '0750 777 8888' } });
  const day = await call('/api/p/doctors/1/day');
  const r = await call('/api/p/bookings', { method: 'POST', body: { doctorId: 1, date: day.data.date, name: 'Kani', phone: '07507778888', code: otp.data.devCode, channel: 'sms' } });
  assert.equal(r.status, 200);
  assert.equal(db.prepare("SELECT channel FROM patients WHERE phone = '+9647507778888'").get().channel, 'sms');
  assert.doesNotMatch((await call('/c/clinic/d/1')).data, /name="channel"/); // no choice shown until both are set up
});
