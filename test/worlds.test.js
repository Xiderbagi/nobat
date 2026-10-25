import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { hashSecret } from '../src/util.js';

process.env.NODE_ENV = 'test';

// A tiny file that starts like a JPEG is enough for the server's check.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

let server, base, db, uploads;
before(async () => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO clinics (id, name, slug, kind, listed, tags) VALUES (1, 'Shifa Clinic', 'shifa', 'clinic', 1, ''), (2, 'Lavender Spa', 'lavender', 'salon', 1, 'spa'), (3, 'Kaka Barber', 'kaka', 'salon', 1, 'barber_men')").run();
  db.prepare("INSERT INTO doctors (clinic_id, name, specialty, category) VALUES (1, 'Dr. Aras', 'Dentist', 'dentist'), (2, 'Nask', 'Massage', null), (3, 'Kaka', 'Barber', null)").run();
  db.prepare("INSERT INTO users (clinic_id, name, email, password_hash, role, lang) VALUES (2, 'Owner', 'spa@test', ?, 'owner', 'en')").run(hashSecret('password123'));
  uploads = mkdtempSync(join(tmpdir(), 'nobat-up-'));
  server = createApp(db, { baseUrl: 'http://test', dev: true, uploads }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(uploads, { recursive: true, force: true }); });

const html = async (path) => (await fetch(base + path)).text();

test('the opening page has only the three big choices, plus policy and support links', async () => {
  const page = await html('/?lang=en');
  assert.equal((page.match(/class="door /g) || []).length, 3);
  assert.ok(page.includes('href="/clinics?lang=en"'));
  assert.ok(page.includes('href="/beauty?lang=en"'));
  assert.ok(page.includes('href="/beauty?cat=spa&amp;lang=en"'));
  assert.ok(page.includes('<b>Spa and wellness</b>'));
  assert.ok(page.includes('href="/policy?lang=en"') && page.includes('href="/support?lang=en"'));
  assert.ok(!page.includes('id="searchForm"'));
});

test('cancellation policy and support desk pages work, and a support message reaches the admin', async () => {
  assert.ok((await html('/policy?lang=en')).includes('Cancellation policy'));
  assert.ok((await html('/support?lang=ar')).includes('مكتب الدعم'));
  const post = (body) => fetch(base + '/support', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  assert.equal((await post({ name: '', phone: '0750 123 4567', message: 'hi', lang: 'en' })).status, 400);
  const ok = await post({ name: 'Aram', phone: '0750 123 4567', topic: 'blocked', message: 'My booking stopped', lang: 'en' });
  assert.equal(ok.status, 303);
  const row = db.prepare('SELECT * FROM support_requests').get();
  assert.equal(row.phone, '+9647501234567');
  assert.equal(row.topic, 'blocked');
});

test('clinics and beauty pages each show only their own kind', async () => {
  const clinics = await html('/clinics?lang=en');
  assert.ok(clinics.includes('"kind":"clinic"'));
  assert.ok(!clinics.includes('"key":"barber_men"'));
  assert.ok(!clinics.includes('class="beauty"'));

  const beauty = await html('/beauty?lang=en');
  assert.ok(beauty.includes('<body class="beauty">'));
  assert.ok(beauty.includes('"kind":"salon"'));
  assert.ok(!beauty.includes('"key":"dentist"'));
  for (const cat of ['barber_men', 'spa', 'salon_women']) assert.ok(beauty.includes(`data-cat="${cat}"`), cat);

  // A category in the link is chosen up front; a category from the other world is ignored.
  assert.ok((await html('/beauty?cat=spa')).includes('"cat":"spa"'));
  assert.ok((await html('/beauty?cat=dentist')).includes('"cat":""'));
  const spa = await fetch(base + '/spa', { redirect: 'manual' });
  assert.equal(spa.headers.get('location'), '/beauty?cat=spa');
});

test('spa search finds spas but not barbers', async () => {
  const { results } = await (await fetch(base + '/api/p/search?kind=salon&cat=spa')).json();
  assert.deepEqual(results.map((r) => r.slug), ['lavender']);
});

test('a cover photo shows on the business page and in search; site photos replace the drawings', async () => {
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'spa@test', password: 'password123' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const bad = await fetch(base + '/api/s/photos?kind=cover', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: Buffer.alloc(300, 7) });
  assert.equal(bad.status, 400);
  const up = await fetch(base + '/api/s/photos?kind=cover', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: jpeg });
  assert.equal(up.status, 200);
  const url = (await up.json()).photos.cover.url;
  assert.match(url, /^\/uploads\/[a-z0-9]{24}\.jpg$/);
  assert.equal((await fetch(base + url)).status, 200);

  const page = await html('/c/lavender');
  assert.ok(page.includes('class="cover has-photo"'));
  assert.ok(page.includes(`src="${url}"`));
  assert.ok(page.includes('<body class="beauty">'));
  const { results } = await (await fetch(base + '/api/p/search?kind=salon')).json();
  assert.equal(results.find((r) => r.slug === 'lavender').photo, url);
  assert.equal(results.find((r) => r.slug === 'kaka').photo, null);

  db.prepare("INSERT INTO site_photos (key, file, updated_at) VALUES ('beauty_spa', 'abcdefabcdefabcdefabcdef.jpg', 'now')").run();
  assert.ok((await html('/beauty')).includes('src="/uploads/abcdefabcdefabcdefabcdef.jpg"'));

  const id = (await (await fetch(base + '/api/s/settings', { headers: { Cookie: cookie } })).json()).photos.cover.id;
  assert.equal((await fetch(base + `/api/s/photos/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 200);
  assert.ok(!existsSync(join(uploads, url.split('/').pop())));
});
