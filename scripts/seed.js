// Creates a clinic or salon with its owner account (the admin screen at /admin does the same).
//   npm run seed                      → demo clinic, owner demo@nobat.app / demo12345
//   npm run seed -- --name "Shifa Clinic" --email owner@shifa.iq --password "a-strong-password" --no-demo-doctor
//   npm run seed -- --kind salon --name "Lana Beauty" --email lana@example.com --password "a-strong-password"
// --lang sets the owner's screen language (ckb, ar or en).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb } from '../src/db.js';
import { createClinic, ClinicError } from '../src/clinics.js';

const { values: o } = parseArgs({
  options: {
    name: { type: 'string', default: 'Demo Clinic' },
    city: { type: 'string', default: 'Erbil' },
    email: { type: 'string', default: 'demo@nobat.app' },
    password: { type: 'string', default: 'demo12345' },
    owner: { type: 'string', default: 'Clinic owner' },
    kind: { type: 'string', default: 'clinic' },
    lang: { type: 'string', default: 'en' },
    'no-demo-doctor': { type: 'boolean', default: false }
  }
});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'nobat.db'));

try {
  const { slug } = createClinic(db, { ...o, demo: !o['no-demo-doctor'], status: 'active' });
  console.log(`Created "${o.name}". Sign in at /login with ${o.email}. Patients book at /c/${slug}`);
} catch (err) {
  if (!(err instanceof ClinicError)) throw err;
  const why = { emailTaken: `An account for ${o.email} already exists. Nothing changed.`, shortPassword: 'The password needs at least 8 characters.', badKind: '--kind must be clinic or salon.', badEmail: 'That email is not valid.' };
  console.log(why[err.code] || err.code);
  process.exit(err.code === 'emailTaken' ? 0 : 1);
}
