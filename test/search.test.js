import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { search, distanceKm } from '../src/directory.js';
import { categoriesForText } from '../src/categories.js';
import { addDays, localParts } from '../src/util.js';

process.env.NODE_ENV = 'test';

function setup() {
  const db = openDb(':memory:');
  const clinic = db.prepare('INSERT INTO clinics (id, name, slug, city, kind, lat, lng, tags, featured_until, status, listed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  clinic.run(1, 'Shifa Clinic', 'shifa', 'Erbil', 'clinic', 36.19, 44.01, '', null, 'active', 1);           // central Erbil
  clinic.run(2, 'Ankawa Dental', 'ankawa', 'Erbil', 'clinic', 36.23, 43.99, '', null, 'active', 1);        // ~5 km north
  clinic.run(3, 'Duhok Kids', 'duhok', 'Duhok', 'clinic', 36.86, 42.99, '', null, 'active', 1);            // ~115 km away
  clinic.run(4, 'Kaka Barber', 'kaka', 'Erbil', 'salon', 36.20, 44.02, 'barber_men', null, 'active', 1);
  clinic.run(5, 'Closed Clinic', 'closed', 'Erbil', 'clinic', 36.19, 44.01, '', null, 'off', 1);
  clinic.run(6, 'Hidden Clinic', 'hidden', 'Erbil', 'clinic', 36.19, 44.01, '', null, 'active', 0);
  const doc = db.prepare('INSERT INTO doctors (clinic_id, name, specialty, category) VALUES (?, ?, ?, ?)');
  doc.run(1, 'Dr. Shilan', "Children's doctor", 'children');
  doc.run(1, 'Dr. Karzan', 'Dentist', 'dentist');
  doc.run(2, 'Dr. Aras', 'Dentist', 'dentist');
  doc.run(3, 'Dr. Nyan', 'Kids', 'children');
  doc.run(4, 'Kaka', 'Barber', null);
  doc.run(5, 'Dr. Off', '', 'dentist');
  doc.run(6, 'Dr. Hidden', '', 'dentist');
  return db;
}

test('words in English, Kurdish and Arabic find the right categories', () => {
  assert.ok(categoriesForText('teeth').includes('dentist'));
  assert.ok(categoriesForText('ددان').includes('dentist'));
  assert.ok(categoriesForText('أسنان').includes('dentist'));
  assert.ok(categoriesForText('kids').includes('children'));
  assert.ok(categoriesForText('منداڵان').includes('children'));
  assert.ok(categoriesForText('barber').includes('barber_men'));
  assert.deepEqual(categoriesForText(''), []);
});

test('distance is about right', () => {
  const km = distanceKm(36.19, 44.01, 36.86, 42.99); // Erbil → Duhok
  assert.ok(km > 100 && km < 130, String(km));
});

test('search by category shows only matching doctors, skips switched-off and hidden clinics', () => {
  const db = setup();
  const dentists = search(db, { cat: 'dentist' });
  assert.deepEqual(dentists.map((r) => r.slug).sort(), ['ankawa', 'shifa']);
  const shifa = dentists.find((r) => r.slug === 'shifa');
  assert.deepEqual(shifa.doctors.map((d) => d.name), ['Dr. Karzan']); // not the children's doctor
  assert.deepEqual(search(db, { q: 'teeth' }).map((r) => r.slug).sort(), ['ankawa', 'shifa']);
  assert.deepEqual(search(db, { cat: 'barber_men' }).map((r) => r.slug), ['kaka']);
  assert.deepEqual(search(db, { kind: 'salon' }).map((r) => r.slug), ['kaka']);
  assert.ok(search(db, { q: 'Shifa' }).some((r) => r.slug === 'shifa'));
});

test('near me puts the closest first, and featured clinics go on top', () => {
  const db = setup();
  const near = search(db, { cat: 'children', lat: 36.86, lng: 42.99 }); // standing in Duhok
  assert.deepEqual(near.map((r) => r.slug), ['duhok', 'shifa']);
  assert.ok(near[0].distanceKm < 1 && near[1].distanceKm > 100);
  db.prepare('UPDATE clinics SET featured_until = ? WHERE id = 1').run(addDays(localParts().date, 10));
  const paid = search(db, { cat: 'children', lat: 36.86, lng: 42.99 });
  assert.deepEqual(paid.map((r) => r.slug), ['shifa', 'duhok']);
  assert.equal(paid[0].featured, true);
  db.prepare('UPDATE clinics SET featured_until = ? WHERE id = 1').run(addDays(localParts().date, -1)); // expired
  assert.equal(search(db, { cat: 'children', lat: 36.86, lng: 42.99 })[0].slug, 'duhok');
});

// ---------- Reviews through HTTP ----------
let server, base, db;
before(async () => {
  db = setup();
  db.prepare("INSERT INTO patients (id, clinic_id, name, phone) VALUES (1, 1, 'Aram Karim', '+9647500000001')").run();
  db.prepare("INSERT INTO bookings (id, clinic_id, doctor_id, patient_id, date, queue_no, status, token) VALUES (1, 1, 1, 1, '2026-10-01', 1, 'done', 'done-token'), (2, 1, 1, 1, '2030-01-01', 2, 'booked', 'future-token')").run();
  server = createApp(db, { baseUrl: 'http://test', dev: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('only a finished visit can be reviewed, once; ratings show in search and on the clinic page', async () => {
  assert.equal((await post('/api/p/t/future-token/review', { a1: 5, a2: 5, a3: 5, a4: 5 })).status, 409);
  assert.equal((await post('/api/p/t/done-token/review', { a1: 5, a2: 0, a3: 5, a4: 5 })).status, 400);
  const before = await (await fetch(base + '/api/p/t/done-token')).json();
  assert.equal(before.canReview, true);
  assert.equal((await post('/api/p/t/done-token/review', { a1: 4, a2: 5, a3: 5, a4: 3, comment: 'Short wait, kind doctor.' })).status, 200);
  assert.equal((await post('/api/p/t/done-token/review', { a1: 1, a2: 1, a3: 1, a4: 1 })).status, 409);
  assert.equal((await (await fetch(base + '/api/p/t/done-token')).json()).canReview, false);

  const results = (await (await fetch(base + '/api/p/search?cat=children')).json()).results;
  const shifa = results.find((r) => r.slug === 'shifa');
  assert.deepEqual([shifa.rating.count, shifa.rating.overall], [1, 4.3]);
  const page = await (await fetch(base + '/c/shifa?lang=en')).text();
  assert.match(page, /Short wait, kind doctor\./);
  assert.match(page, />Aram</); // first name only

  db.prepare('UPDATE reviews SET hidden = 1').run();
  const hidden = (await (await fetch(base + '/api/p/search?cat=children')).json()).results.find((r) => r.slug === 'shifa');
  assert.equal(hidden.rating.count, 0);
});

test('home page is the search page', async () => {
  const html = await (await fetch(base + '/?lang=ckb')).text();
  assert.match(html, /id="searchForm"/);
  assert.match(html, /dir="rtl"/);
  assert.equal((await fetch(base + '/static/vendor/leaflet/leaflet.js')).status, 200);
  const res = await fetch(base + '/api/p/search?lat=abc&lng=44');
  assert.equal(res.status, 200); // bad numbers are ignored, not an error
});
