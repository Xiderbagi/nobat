import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'reception')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT '',
  fee_iqd INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'queue' CHECK (mode IN ('time', 'queue')),
  slot_minutes INTEGER NOT NULL DEFAULT 15,
  avg_minutes INTEGER NOT NULL DEFAULT 10,
  daily_limit INTEGER NOT NULL DEFAULT 40,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (clinic_id, phone)
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  patient_id INTEGER REFERENCES patients(id),
  walkin_name TEXT,
  date TEXT NOT NULL,
  time TEXT,
  queue_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'arrived', 'in_room', 'done', 'no_show', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'walkin')),
  token TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL DEFAULT 'ckb',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  called_at TEXT,
  reminded_at TEXT,
  near_alert_at TEXT,
  UNIQUE (doctor_id, date, queue_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings (doctor_id, date, time) WHERE time IS NOT NULL AND status != 'cancelled';
CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER,
  booking_id INTEGER,
  to_phone TEXT NOT NULL,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Each entry upgrades the database by one step; PRAGMA user_version counts the steps applied.
// Never edit an entry once it has shipped; add a new one at the end.
const MIGRATIONS = [
  // 1: salons, patient files, doctor accounts, staff language
  `
  CREATE TABLE users_v2 (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'reception', 'doctor')),
    doctor_id INTEGER REFERENCES doctors(id),
    lang TEXT NOT NULL DEFAULT 'ckb',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO users_v2 (id, clinic_id, name, email, password_hash, role, created_at)
    SELECT id, clinic_id, name, email, password_hash, role, created_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_v2 RENAME TO users;

  ALTER TABLE clinics ADD COLUMN kind TEXT NOT NULL DEFAULT 'clinic' CHECK (kind IN ('clinic', 'salon'));

  ALTER TABLE patients ADD COLUMN birth_year INTEGER;
  ALTER TABLE patients ADD COLUMN allergies TEXT NOT NULL DEFAULT '';
  ALTER TABLE patients ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  ALTER TABLE patients ADD COLUMN follow_up_date TEXT;
  ALTER TABLE patients ADD COLUMN follow_up_sent_at TEXT;

  CREATE TABLE visit_notes (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    booking_id INTEGER REFERENCES bookings(id),
    author_id INTEGER REFERENCES users(id),
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX visit_notes_patient ON visit_notes (patient_id);

  ALTER TABLE bookings ADD COLUMN duration_min INTEGER;
  ALTER TABLE bookings ADD COLUMN rebook_sent_at TEXT;

  CREATE TABLE services (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    price_iqd INTEGER NOT NULL DEFAULT 0,
    minutes INTEGER NOT NULL DEFAULT 30,
    rebook_weeks INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE booking_services (
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    PRIMARY KEY (booking_id, service_id)
  );
  `,
  // 2: which services each salon staff member does (no rows = everything)
  `
  CREATE TABLE staff_services (
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    PRIMARY KEY (doctor_id, service_id)
  );
  `,
  // 3: how each patient wants their messages
  `
  ALTER TABLE patients ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms'));
  `,
  // 4: your admin screen: admin accounts, clinic status, payments
  `
  ALTER TABLE clinics ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'off'));
  ALTER TABLE clinics ADD COLUMN trial_ends TEXT;
  ALTER TABLE clinics ADD COLUMN paid_until TEXT;
  ALTER TABLE clinics ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';
  CREATE TABLE admins (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE admin_sessions (
    id TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'IQD')),
    method TEXT NOT NULL,
    paid_until TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    admin_id INTEGER REFERENCES admins(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  // 5: search and map, featured (paid) placement, reviews
  `
  ALTER TABLE doctors ADD COLUMN category TEXT;
  ALTER TABLE clinics ADD COLUMN tags TEXT NOT NULL DEFAULT '';
  ALTER TABLE clinics ADD COLUMN lat REAL;
  ALTER TABLE clinics ADD COLUMN lng REAL;
  ALTER TABLE clinics ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE clinics ADD COLUMN featured_until TEXT;
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    doctor_id INTEGER REFERENCES doctors(id),
    booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
    a1 INTEGER NOT NULL CHECK (a1 BETWEEN 1 AND 5),
    a2 INTEGER NOT NULL CHECK (a2 BETWEEN 1 AND 5),
    a3 INTEGER NOT NULL CHECK (a3 BETWEEN 1 AND 5),
    a4 INTEGER NOT NULL CHECK (a4 BETWEEN 1 AND 5),
    overall REAL NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    lang TEXT NOT NULL DEFAULT 'ckb',
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX reviews_clinic ON reviews (clinic_id, hidden);
  `,
  // 6: photos for clinics and salons, photos for the site's own pages, an "about" text
  `
  ALTER TABLE clinics ADD COLUMN about TEXT NOT NULL DEFAULT '';
  CREATE TABLE photos (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    file TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('cover', 'gallery')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX photos_clinic ON photos (clinic_id, kind);
  CREATE TABLE site_photos (
    key TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('PRAGMA foreign_keys = OFF');
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Writes a consistent copy of the database to another file (safe while the app is running).
export function backupTo(db, file) {
  db.prepare('VACUUM INTO ?').run(file);
}

// Runs fn inside a transaction; rolls back if it throws.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
