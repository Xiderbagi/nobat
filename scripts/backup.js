// Saves a copy of the database to data/backups (or BACKUP_DIR) and keeps the last 14 copies.
// Run it once a day, for example from a cron job:  npm run backup
// Copy the backups somewhere else too (another server or cloud storage), in case the disk is lost.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, backupTo } from '../src/db.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const dbFile = process.env.DB_FILE || join(ROOT, 'data', 'nobat.db');
const dir = process.env.BACKUP_DIR || join(dirname(dbFile), 'backups');
const KEEP = 14;

mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = join(dir, `nobat-${stamp}.db`);
backupTo(openDb(dbFile), target);
const old = readdirSync(dir).filter((f) => /^nobat-.*\.db$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) rmSync(join(dir, f));
console.log(`Backup saved: ${target}${old.length ? ` (removed ${old.length} old)` : ''}`);
