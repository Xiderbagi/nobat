// Cancellation, lateness and no-show rules. Each clinic picks its own numbers in Settings; these are the defaults.
import { hoursFor } from './queue.js';

export const CANCEL_HOURS = [0, 2, 6, 12, 24, 48];
export const LATE_MINUTES = [5, 10, 15, 20, 30];
export const NOSHOW_LIMITS = [0, 2, 3, 4, 5]; // 0 = never stop online booking

export function policyOf(clinic) {
  return {
    cancelHours: clinic.cancel_hours ?? 24,
    lateMinutes: clinic.late_minutes ?? 15,
    noShowLimit: clinic.noshow_limit ?? 3,
    note: clinic.policy_note || '',
    phone: clinic.phone || ''
  };
}

// When the visit starts, in milliseconds. Queue bookings have no time, so the doctor's first hour that day is used.
export function startsAt(db, booking) {
  const time = booking.time || (hoursFor(db, booking.doctor_id, booking.date)[0] || {}).start_time || '00:00';
  return Date.parse(`${booking.date}T${time}:00+03:00`); // Kurdistan Region time, no daylight saving
}

// Whether the customer can still cancel online, and until when.
export function cancelInfo(db, booking, clinic, now = Date.now()) {
  const p = policyOf(clinic);
  const deadline = startsAt(db, booking) - p.cancelHours * 3600e3;
  const open = booking.status === 'booked';
  return { canCancel: open && now < deadline, deadline, tooLate: open && now >= deadline };
}

// A booked (not yet arrived) time booking is late once the hold time after its start has passed.
export function isLate(db, booking, clinic, now = Date.now()) {
  return booking.status === 'booked' && Boolean(booking.time) && now > startsAt(db, booking) + policyOf(clinic).lateMinutes * 60e3;
}

// Missed visits that still count (a clinic can forgive them, which starts the count again).
export function noShowCount(db, patientId) {
  if (!patientId) return 0;
  return db.prepare(`SELECT COUNT(*) AS n FROM bookings b JOIN patients p ON p.id = b.patient_id
    WHERE b.patient_id = ? AND b.status = 'no_show' AND (p.noshow_cleared_at IS NULL OR COALESCE(b.no_show_at, '') > p.noshow_cleared_at)`).get(patientId).n;
}

export const isBanned = (db, phone) => Boolean(phone && db.prepare('SELECT 1 FROM banned_phones WHERE phone = ?').get(phone));

// Why this phone cannot book online at this clinic, or null. 'banned' = stopped by Nobat everywhere.
export function bookingBlock(db, clinic, phone) {
  if (isBanned(db, phone)) return 'banned';
  const pt = db.prepare('SELECT id, blocked FROM patients WHERE clinic_id = ? AND phone = ?').get(clinic.id, phone);
  if (!pt) return null;
  if (pt.blocked) return 'blocked';
  const limit = policyOf(clinic).noShowLimit;
  return limit > 0 && noShowCount(db, pt.id) >= limit ? 'blocked' : null;
}

// One line about a patient's record for staff: missed count, and whether online booking is stopped.
export function patientStanding(db, clinic, patient) {
  if (!patient) return { noShows: 0, blocked: false, banned: false };
  const noShows = noShowCount(db, patient.id);
  const limit = policyOf(clinic).noShowLimit;
  return { noShows, blocked: Boolean(patient.blocked) || (limit > 0 && noShows >= limit), manual: Boolean(patient.blocked), banned: isBanned(db, patient.phone), limit };
}
