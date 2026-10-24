// Booking and queue rules. Every function takes the database first and is synchronous.
import { tx } from './db.js';
import { addDays, fromMinutes, localParts, toMinutes, token, weekdayOf } from './util.js';

export const BOOKING_DAYS = 7; // how far ahead patients can book
const ACTIVE = "('booked', 'arrived', 'in_room')";

export class BookingError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function getDoctor(db, id) {
  return db.prepare('SELECT * FROM doctors WHERE id = ? AND active = 1').get(id);
}

export function hoursFor(db, doctorId, date) {
  return db.prepare('SELECT start_time, end_time FROM schedules WHERE doctor_id = ? AND weekday = ? ORDER BY start_time').all(doctorId, weekdayOf(date));
}

// The days a patient can choose, with whether the doctor works that day.
export function bookableDays(db, doctorId, now = new Date()) {
  const today = localParts(now).date;
  return Array.from({ length: BOOKING_DAYS }, (_, i) => {
    const date = addDays(today, i);
    return { date, weekday: weekdayOf(date), open: hoursFor(db, doctorId, date).length > 0 };
  });
}

function isBookableDate(db, doctor, date, now) {
  return bookableDays(db, doctor.id, now).some((d) => d.date === date && d.open);
}

// Free time slots for a time-based doctor. Past slots today are left out.
export function freeSlots(db, doctor, date, now = new Date()) {
  const local = localParts(now);
  const taken = new Set(db.prepare(`SELECT time FROM bookings WHERE doctor_id = ? AND date = ? AND time IS NOT NULL AND status != 'cancelled'`).all(doctor.id, date).map((r) => r.time));
  const out = [];
  for (const h of hoursFor(db, doctor.id, date)) {
    for (let m = toMinutes(h.start_time); m + doctor.slot_minutes <= toMinutes(h.end_time); m += doctor.slot_minutes) {
      const time = fromMinutes(m);
      if (date === local.date && m <= toMinutes(local.time)) continue;
      out.push({ time, free: !taken.has(time) });
    }
  }
  return out;
}

// For a queue doctor: the next number and when that patient will roughly be seen.
export function queuePreview(db, doctor, date, now = new Date()) {
  const hours = hoursFor(db, doctor.id, date);
  if (!hours.length) return null;
  const count = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE doctor_id = ? AND date = ? AND status != 'cancelled'`).get(doctor.id, date).n;
  const next = nextQueueNo(db, doctor.id, date);
  const local = localParts(now);
  let startMin = toMinutes(hours[0].start_time);
  if (date === local.date) startMin = Math.max(startMin, toMinutes(local.time));
  const ahead = orderedWaiting(db, doctor.id, date).length;
  return { next, full: count >= doctor.daily_limit, expected: fromMinutes(Math.min(startMin + ahead * doctor.avg_minutes, 23 * 60 + 59)) };
}

function nextQueueNo(db, doctorId, date) {
  return db.prepare('SELECT COALESCE(MAX(queue_no), 0) + 1 AS n FROM bookings WHERE doctor_id = ? AND date = ?').get(doctorId, date).n;
}

// Time bookings are called by time, queue bookings by number. Walk-ins (no time) come after timed patients.
const ORDER = "COALESCE(b.time, '99:99'), b.queue_no";

// Waiting patients in the order they will be called. Time bookings go by time, queue bookings by number.
export function orderedWaiting(db, doctorId, date) {
  return db.prepare(`SELECT b.* FROM bookings b WHERE b.doctor_id = ? AND b.date = ? AND b.status IN ('booked', 'arrived') ORDER BY ${ORDER}`).all(doctorId, date);
}

export function findOrCreatePatient(db, clinicId, name, phone) {
  const existing = db.prepare('SELECT * FROM patients WHERE clinic_id = ? AND phone = ?').get(clinicId, phone);
  if (existing) {
    if (existing.name !== name) db.prepare('UPDATE patients SET name = ? WHERE id = ?').run(name, existing.id);
    return existing.id;
  }
  return Number(db.prepare('INSERT INTO patients (clinic_id, name, phone) VALUES (?, ?, ?)').run(clinicId, name, phone).lastInsertRowid);
}

// Creates an online booking. Throws BookingError with a code the page can translate.
export function createBooking(db, { doctor, date, time, name, phone, lang }, now = new Date()) {
  if (!isBookableDate(db, doctor, date, now)) throw new BookingError('closed');
  return tx(db, () => {
    const dup = db.prepare(`SELECT b.token FROM bookings b JOIN patients p ON p.id = b.patient_id WHERE b.doctor_id = ? AND b.date = ? AND p.phone = ? AND b.status IN ${ACTIVE}`).get(doctor.id, date, phone);
    if (dup) return getBookingByToken(db, dup.token);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE doctor_id = ? AND date = ? AND status != 'cancelled'`).get(doctor.id, date).n;
    if (count >= doctor.daily_limit) throw new BookingError('full');
    let slot = null;
    if (doctor.mode === 'time') {
      const s = freeSlots(db, doctor, date, now).find((x) => x.time === time);
      if (!s || !s.free) throw new BookingError('slotTaken');
      slot = time;
    }
    const patientId = findOrCreatePatient(db, doctor.clinic_id, name, phone);
    const tok = token();
    db.prepare('INSERT INTO bookings (clinic_id, doctor_id, patient_id, date, time, queue_no, source, token, lang) VALUES (?, ?, ?, ?, ?, ?, \'online\', ?, ?)')
      .run(doctor.clinic_id, doctor.id, patientId, date, slot, nextQueueNo(db, doctor.id, date), tok, lang);
    return getBookingByToken(db, tok);
  });
}

export function addWalkIn(db, doctor, date, name, phone) {
  return tx(db, () => {
    const patientId = phone ? findOrCreatePatient(db, doctor.clinic_id, name, phone) : null;
    const tok = token();
    db.prepare('INSERT INTO bookings (clinic_id, doctor_id, patient_id, walkin_name, date, queue_no, status, source, token) VALUES (?, ?, ?, ?, ?, ?, \'arrived\', \'walkin\', ?)')
      .run(doctor.clinic_id, doctor.id, patientId, patientId ? null : name, date, nextQueueNo(db, doctor.id, date), tok);
    return getBookingByToken(db, tok);
  });
}

const BOOKING_SELECT = `SELECT b.*, COALESCE(p.name, b.walkin_name, 'Walk-in') AS patient_name, p.phone AS patient_phone,
  d.name AS doctor_name, d.mode AS doctor_mode, d.avg_minutes, c.name AS clinic_name, c.slug AS clinic_slug
  FROM bookings b JOIN doctors d ON d.id = b.doctor_id JOIN clinics c ON c.id = b.clinic_id LEFT JOIN patients p ON p.id = b.patient_id`;

export function getBookingByToken(db, tok) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.token = ?`).get(tok);
}

export function getBooking(db, id) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id);
}

export function dayList(db, doctorId, date) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.doctor_id = ? AND b.date = ? AND b.status != 'cancelled' ORDER BY ${ORDER}`).all(doctorId, date);
}

// What the patient's live page shows.
export function ticketStatus(db, booking) {
  const inRoom = db.prepare(`SELECT queue_no, time FROM bookings WHERE doctor_id = ? AND date = ? AND status = 'in_room'`).get(booking.doctor_id, booking.date);
  const waiting = orderedWaiting(db, booking.doctor_id, booking.date);
  const ahead = waiting.findIndex((b) => b.id === booking.id);
  return {
    status: booking.status,
    queueNo: booking.queue_no,
    time: booking.time,
    date: booking.date,
    nowServing: inRoom ? inRoom.queue_no : null,
    ahead: ahead < 0 ? 0 : ahead,
    minutes: ahead < 0 ? 0 : (ahead + (inRoom ? 1 : 0)) * booking.avg_minutes
  };
}

// Finishes whoever is in the room and calls the next waiting patient.
// Returns the called booking and the patient who should get the "come now" alert.
export function callNext(db, doctorId, date, nearAlertAt = 2) {
  return tx(db, () => {
    db.prepare(`UPDATE bookings SET status = 'done' WHERE doctor_id = ? AND date = ? AND status = 'in_room'`).run(doctorId, date);
    const waiting = orderedWaiting(db, doctorId, date);
    const next = waiting[0];
    if (!next) return { called: null, near: null };
    db.prepare(`UPDATE bookings SET status = 'in_room', called_at = datetime('now') WHERE id = ?`).run(next.id);
    const near = waiting[nearAlertAt] && !waiting[nearAlertAt].near_alert_at ? waiting[nearAlertAt] : null;
    if (near) db.prepare(`UPDATE bookings SET near_alert_at = datetime('now') WHERE id = ?`).run(near.id);
    return { called: getBooking(db, next.id), near: near ? getBooking(db, near.id) : null, nearAhead: nearAlertAt };
  });
}

const ALLOWED = {
  booked: ['arrived', 'cancelled', 'no_show'],
  arrived: ['booked', 'no_show', 'cancelled'],
  in_room: ['done', 'no_show'],
  no_show: ['arrived'],
  done: [],
  cancelled: []
};

export function setStatus(db, booking, status) {
  if (!(ALLOWED[booking.status] || []).includes(status)) throw new BookingError('badStatus');
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, booking.id);
  return getBooking(db, booking.id);
}

// Bookings for tomorrow that have not had their reminder yet.
export function dueReminders(db, now = new Date()) {
  const tomorrow = addDays(localParts(now).date, 1);
  return db.prepare(`${BOOKING_SELECT} WHERE b.date = ? AND b.status = 'booked' AND b.reminded_at IS NULL AND p.phone IS NOT NULL`).all(tomorrow);
}

export function markReminded(db, id) {
  db.prepare(`UPDATE bookings SET reminded_at = datetime('now') WHERE id = ?`).run(id);
}
