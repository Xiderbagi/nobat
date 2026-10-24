// Creates a clinic with its owner account and (optionally) a sample doctor.
//   npm run seed                      → demo clinic, owner demo@nobat.app / demo12345
//   npm run seed -- --name "Shifa Clinic" --email owner@shifa.iq --password "a-strong-password" --no-demo-doctor
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb } from '../src/db.js';
import { hashSecret, slugify } from '../src/util.js';

const { values: o } = parseArgs({
  options: {
    name: { type: 'string', default: 'Demo Clinic' },
    city: { type: 'string', default: 'Erbil' },
    email: { type: 'string', default: 'demo@nobat.app' },
    password: { type: 'string', default: 'demo12345' },
    owner: { type: 'string', default: 'Clinic owner' },
    'no-demo-doctor': { type: 'boolean', default: false }
  }
});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'nobat.db'));

if (o.password.length < 8) throw new Error('The password needs at least 8 characters.');
if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(o.email.toLowerCase())) {
  console.log(`An account for ${o.email} already exists. Nothing changed.`);
  process.exit(0);
}

let slug = slugify(o.name);
for (let i = 2; db.prepare('SELECT 1 FROM clinics WHERE slug = ?').get(slug); i++) slug = `${slugify(o.name)}-${i}`;
const clinicId = Number(db.prepare('INSERT INTO clinics (name, slug, city) VALUES (?, ?, ?)').run(o.name, slug, o.city).lastInsertRowid);
db.prepare('INSERT INTO users (clinic_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, \'owner\')').run(clinicId, o.owner, o.email.toLowerCase(), hashSecret(o.password));

if (!o['no-demo-doctor']) {
  const add = db.prepare('INSERT INTO doctors (clinic_id, name, specialty, fee_iqd, mode, slot_minutes, avg_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const hours = db.prepare('INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
  const queueDoc = Number(add.run(clinicId, 'Dr. Shilan Ahmed', "Children's doctor", 25000, 'queue', 15, 8).lastInsertRowid);
  const timeDoc = Number(add.run(clinicId, 'Dr. Karzan Omar', 'Dentist', 20000, 'time', 20, 20).lastInsertRowid);
  for (const wd of [6, 0, 1, 2, 3, 4]) { hours.run(queueDoc, wd, '16:00', '21:00'); hours.run(timeDoc, wd, '15:00', '20:00'); }
}

console.log(`Created "${o.name}". Sign in at /login with ${o.email}. Patients book at /c/${slug}`);
