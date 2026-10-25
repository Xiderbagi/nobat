// Sets a new password for a staff account (for example when someone forgets theirs).
//   npm run set-password -- --email you@example.com --password "a-new-password"
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb } from '../src/db.js';
import { hashSecret } from '../src/util.js';

const { values: o } = parseArgs({ options: { email: { type: 'string' }, password: { type: 'string' } } });
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'nobat.db'));

if (!o.email || !o.password) throw new Error('Use: npm run set-password -- --email you@example.com --password "a-new-password"');
if (o.password.length < 8) throw new Error('The password needs at least 8 characters.');
const email = o.email.trim().toLowerCase();
const r = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hashSecret(o.password), email);
if (!r.changes) {
  console.log(`No account for ${email}. Accounts: ${db.prepare('SELECT email FROM users ORDER BY email').all().map((u) => u.email).join(', ') || 'none'}`);
  process.exit(1);
}
db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(email);
console.log(`New password set for ${email}. They can sign in now.`);
