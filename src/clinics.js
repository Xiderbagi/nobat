// Creating a clinic or salon with its owner account. Used by the admin screen and scripts/seed.js.
import { randomInt } from 'node:crypto';
import { tx } from './db.js';
import { hashSecret, slugify } from './util.js';

export class ClinicError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Easy to read aloud and type: no 0/O, 1/l/I.
export function tempPassword(length = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('');
}

function uniqueSlug(db, name) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM clinics WHERE slug = ?').get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function addDemoStaff(db, clinicId, kind) {
  const hours = db.prepare('INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
  if (kind === 'salon') {
    const add = db.prepare("INSERT INTO doctors (clinic_id, name, specialty, mode, slot_minutes, avg_minutes) VALUES (?, ?, ?, 'time', 15, 30)");
    for (const [name, role] of [['Lana', 'Owner, color'], ['Shno', 'Hair'], ['Dilan', 'Nails']]) {
      const id = Number(add.run(clinicId, name, role).lastInsertRowid);
      for (let wd = 0; wd < 7; wd++) hours.run(id, wd, '10:00', '20:00');
    }
    const svc = db.prepare('INSERT INTO services (clinic_id, name, price_iqd, minutes, rebook_weeks) VALUES (?, ?, ?, ?, ?)');
    for (const row of [['Haircut and blow-dry', 25000, 60, 6], ['Hair color', 60000, 90, 6], ['Manicure', 15000, 45, 3], ['Eyebrows', 7000, 15, 3], ['Bridal makeup', 150000, 120, 0]]) svc.run(clinicId, ...row);
    return;
  }
  const add = db.prepare('INSERT INTO doctors (clinic_id, name, specialty, fee_iqd, mode, slot_minutes, avg_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const queueDoc = Number(add.run(clinicId, 'Dr. Shilan Ahmed', "Children's doctor", 25000, 'queue', 15, 8).lastInsertRowid);
  const timeDoc = Number(add.run(clinicId, 'Dr. Karzan Omar', 'Dentist', 20000, 'time', 20, 20).lastInsertRowid);
  for (const wd of [6, 0, 1, 2, 3, 4]) { hours.run(queueDoc, wd, '16:00', '21:00'); hours.run(timeDoc, wd, '15:00', '20:00'); }
}

// Returns { clinicId, slug, password }. When no password is given, a temporary one is made.
export function createClinic(db, { name, city = '', kind = 'clinic', owner, email, password, lang = 'ckb', phone = '', demo = false, status = 'trial', trialDays = 30 }) {
  name = String(name || '').trim().slice(0, 80);
  owner = String(owner || '').trim().slice(0, 60);
  email = String(email || '').trim().toLowerCase();
  if (!name) throw new ClinicError('needName');
  if (!owner) throw new ClinicError('needOwner');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ClinicError('badEmail');
  if (!['clinic', 'salon'].includes(kind)) throw new ClinicError('badKind');
  if (!['ckb', 'ar', 'en'].includes(lang)) lang = 'ckb';
  const pass = password || tempPassword();
  if (pass.length < 8) throw new ClinicError('shortPassword');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new ClinicError('emailTaken');
  return tx(db, () => {
    const slug = uniqueSlug(db, name);
    const trialEnds = status === 'trial' ? db.prepare("SELECT date('now', ?) AS d").get(`+${trialDays} days`).d : null;
    const clinicId = Number(db.prepare('INSERT INTO clinics (name, slug, city, kind, phone, status, trial_ends) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, slug, String(city).trim().slice(0, 40), kind, String(phone).trim().slice(0, 20), status, trialEnds).lastInsertRowid);
    db.prepare("INSERT INTO users (clinic_id, name, email, password_hash, role, lang) VALUES (?, ?, ?, ?, 'owner', ?)").run(clinicId, owner, email, hashSecret(pass), lang);
    if (demo) addDemoStaff(db, clinicId, kind);
    return { clinicId, slug, password: pass };
  });
}
