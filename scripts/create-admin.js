// Creates your admin account for the admin screen at /admin (or sets a new password if it exists).
//   npm run create-admin -- --name "Your Name" --email you@example.com --password "a-long-password"
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb } from '../src/db.js';
import { hashSecret } from '../src/util.js';
import { cleanTyped } from '../src/admin.js';

const { values: o } = parseArgs({ options: { name: { type: 'string', default: 'Admin' }, email: { type: 'string' }, password: { type: 'string' } } });
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'nobat.db'));

if (!o.email || !o.password) { console.log('Use: npm run create-admin -- --name "Your Name" --email you@example.com --password "a-long-password"'); process.exit(1); }
o.password = cleanTyped(o.password);
if (o.password.length < 10) { console.log('Use at least 10 characters for the admin password.'); process.exit(1); }
const email = cleanTyped(o.email).toLowerCase();
const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ?, name = ? WHERE id = ?').run(hashSecret(o.password), o.name, existing.id);
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(existing.id);
  console.log(`Admin password updated for ${email}. Sign in at /admin`);
} else {
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)').run(o.name, email, hashSecret(o.password));
  console.log(`Admin account created for ${email}. Sign in at /admin`);
}
