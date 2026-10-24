import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

export const TZ = 'Asia/Baghdad'; // Kurdistan Region local time (UTC+3, no daylight saving)

// Iraqi mobile numbers: 07XX XXX XXXX locally, +964 7XX XXX XXXX internationally.
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('964')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^7[0-9]{9}$/.test(d) ? '+964' + d : null;
}

export function displayPhone(e164) {
  const d = String(e164 || '').replace(/^\+964/, '0');
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d;
}

// Local calendar date and clock time in the clinic's time zone.
export function localParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: weekdays[parts.weekday] };
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(isoDate) {
  return new Date(isoDate + 'T12:00:00Z').getUTCDay();
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const isClock = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function token(bytes = 18) {
  return randomBytes(bytes).toString('base64url');
}

export function otpCode() {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export function hashSecret(secret) {
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + scryptSync(String(secret), salt, 32).toString('hex');
}

export function checkSecret(secret, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = scryptSync(String(secret), Buffer.from(salt, 'hex'), 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'clinic';
}
