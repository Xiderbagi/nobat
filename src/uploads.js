// Photos uploaded by clinics and by the admin. Browsers resize them to a JPEG first; the server only accepts JPEG,
// checks the file really is one, and stores it under a random name in the uploads folder (next to the database).
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const MAX_BYTES = 3 * 1024 * 1024;
export const GALLERY_LIMIT = 12;
export const SITE_PHOTO_KEYS = ['clinics_hero', 'beauty_hero', 'beauty_barber', 'beauty_spa', 'beauty_salon'];

export function uploadsDir(dbFile) {
  const dir = process.env.UPLOADS_DIR || (dbFile === ':memory:' ? join(process.cwd(), 'data', 'test-uploads') : join(dirname(dbFile), 'uploads'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const isJpeg = (buf) => Buffer.isBuffer(buf) && buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
export const isSafeName = (name) => /^[a-z0-9]{24}\.jpg$/.test(name);

export function saveJpeg(dir, buf) {
  const name = `${randomBytes(12).toString('hex')}.jpg`;
  writeFileSync(join(dir, name), buf);
  return name;
}

export function removeFile(dir, name) {
  if (isSafeName(name) && existsSync(join(dir, name))) rmSync(join(dir, name));
}

export const photoUrl = (name) => (name ? `/uploads/${name}` : null);

// Cover photo and gallery for one clinic.
export function clinicPhotos(db, clinicId) {
  const rows = db.prepare('SELECT id, file, kind FROM photos WHERE clinic_id = ? ORDER BY kind, id').all(clinicId);
  const cover = rows.find((r) => r.kind === 'cover');
  return { cover: cover ? { id: cover.id, url: photoUrl(cover.file) } : null, gallery: rows.filter((r) => r.kind === 'gallery').map((r) => ({ id: r.id, url: photoUrl(r.file) })) };
}

export function sitePhotos(db) {
  return Object.fromEntries(db.prepare('SELECT key, file FROM site_photos').all().map((r) => [r.key, photoUrl(r.file)]));
}
