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

export const CHANNELS = ['whatsapp', 'sms'];

// channel: how the patient wants messages ('whatsapp' or 'sms'); left as it was when not given.
export function findOrCreatePatient(db, clinicId, name, phone, channel) {
  const ch = CHANNELS.includes(channel) ? channel : null;
  const existing = db.prepare('SELECT * FROM patients WHERE clinic_id = ? AND phone = ?').get(clinicId, phone);
  if (existing) {
    db.prepare('UPDATE patients SET name = ?, channel = COALESCE(?, channel) WHERE id = ?').run(name, ch, existing.id);
    return existing.id;
  }
  return Number(db.prepare('INSERT INTO patients (clinic_id, name, phone, channel) VALUES (?, ?, ?, ?)').run(clinicId, name, phone, ch || 'whatsapp').lastInsertRowid);
}

// Creates an online booking. Throws BookingError with a code the page can translate.
export function createBooking(db, { doctor, date, time, name, phone, lang, channel }, now = new Date()) {
  if (!isBookableDate(db, doctor, date, now)) throw new BookingError('closed');
  return tx(db, () => {
    const dup = db.prepare(`SELECT b.token FROM bookings b JOIN patients p ON p.id = b.patient_id WHERE b.doctor_id = ? AND b.date = ? AND p.phone = ? AND b.status IN ${ACTIVE}`).get(doctor.id, date, phone);
    if (dup) {
      findOrCreatePatient(db, doctor.clinic_id, name, phone, channel);
      return getBookingByToken(db, dup.token);
    }
    const count = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE doctor_id = ? AND date = ? AND status != 'cancelled'`).get(doctor.id, date).n;
    if (count >= doctor.daily_limit) throw new BookingError('full');
    let slot = null;
    if (doctor.mode === 'time') {
      const s = freeSlots(db, doctor, date, now).find((x) => x.time === time);
      if (!s || !s.free) throw new BookingError('slotTaken');
      slot = time;
    }
    const patientId = findOrCreatePatient(db, doctor.clinic_id, name, phone, channel);
    const tok = token();
    db.prepare('INSERT INTO bookings (clinic_id, doctor_id, patient_id, date, time, duration_min, queue_no, source, token, lang) VALUES (?, ?, ?, ?, ?, ?, ?, \'online\', ?, ?)')
      .run(doctor.clinic_id, doctor.id, patientId, date, slot, slot ? doctor.slot_minutes : null, nextQueueNo(db, doctor.id, date), tok, lang);
    return getBookingByToken(db, tok);
  });
}

export function addWalkIn(db, doctor, date, name, phone, channel) {
  return tx(db, () => {
    const patientId = phone ? findOrCreatePatient(db, doctor.clinic_id, name, phone, channel) : null;
    const tok = token();
    db.prepare('INSERT INTO bookings (clinic_id, doctor_id, patient_id, walkin_name, date, queue_no, status, source, token) VALUES (?, ?, ?, ?, ?, ?, \'arrived\', \'walkin\', ?)')
      .run(doctor.clinic_id, doctor.id, patientId, patientId ? null : name, date, nextQueueNo(db, doctor.id, date), tok);
    return getBookingByToken(db, tok);
  });
}

const BOOKING_SELECT = `SELECT b.*, COALESCE(p.name, b.walkin_name, 'Walk-in') AS patient_name, p.phone AS patient_phone, p.channel AS patient_channel,
  d.name AS doctor_name, d.mode AS doctor_mode, d.avg_minutes, c.name AS clinic_name, c.slug AS clinic_slug, c.kind AS clinic_kind,
  (SELECT group_concat(s.name, ' + ') FROM booking_services bs JOIN services s ON s.id = bs.service_id WHERE bs.booking_id = b.id) AS service_names
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
  booked: ['arrived', 'in_room', 'cancelled', 'no_show'],
  arrived: ['booked', 'in_room', 'no_show', 'cancelled'],
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

// ---------- Salons: services, a chosen (or any) staff member, times that never overlap ----------
export const SALON_STEP = 15; // start times are offered every 15 minutes

export function activeServices(db, clinicId, ids) {
  const all = db.prepare('SELECT * FROM services WHERE clinic_id = ? AND active = 1 ORDER BY name').all(clinicId);
  return ids ? all.filter((s) => ids.includes(s.id)) : all;
}

// Active staff (or the one chosen) who do every one of these services. Staff with no services set do everything.
function staffFor(db, clinicId, staffId, serviceIds = []) {
  const all = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? AND active = 1 ORDER BY name').all(clinicId);
  const skills = db.prepare('SELECT service_id FROM staff_services WHERE doctor_id = ?');
  return all.filter((d) => {
    if (staffId && d.id !== staffId) return false;
    const does = skills.all(d.id).map((r) => r.service_id);
    return !does.length || serviceIds.every((id) => does.includes(id));
  });
}

// Busy periods for one staff member on one day, in minutes from midnight.
function busy(db, staffId, date) {
  return db.prepare(`SELECT time, COALESCE(duration_min, 30) AS dur FROM bookings
    WHERE doctor_id = ? AND date = ? AND time IS NOT NULL AND status NOT IN ('cancelled', 'no_show')`).all(staffId, date)
    .map((b) => [toMinutes(b.time), toMinutes(b.time) + b.dur]);
}

function fits(db, staff, date, start, minutes, busyList) {
  const end = start + minutes;
  const inHours = hoursFor(db, staff.id, date).some((h) => start >= toMinutes(h.start_time) && end <= toMinutes(h.end_time));
  return inHours && !busyList.some(([s, e]) => start < e && s < end);
}

// Start times when the chosen person (or anyone, when staffId is null) is free for the whole visit.
export function salonTimes(db, clinicId, staffId, date, minutes, now = new Date(), serviceIds = []) {
  const local = localParts(now);
  const people = staffFor(db, clinicId, staffId, serviceIds).map((d) => ({ d, busy: busy(db, d.id, date), hours: hoursFor(db, d.id, date) }));
  const out = [];
  const first = Math.min(...people.flatMap((p) => p.hours.map((h) => toMinutes(h.start_time))), 24 * 60);
  const last = Math.max(...people.flatMap((p) => p.hours.map((h) => toMinutes(h.end_time))), 0);
  for (let m = first; m + minutes <= last; m += SALON_STEP) {
    if (date === local.date && m <= toMinutes(local.time)) continue;
    const free = people.filter((p) => fits(db, p.d, date, m, minutes, p.busy)).map((p) => p.d.id);
    if (free.length) out.push({ time: fromMinutes(m), staff: free });
  }
  return out;
}

// Creates a salon booking (online or from the front desk). staffId null = first free person.
export function createSalonBooking(db, { clinicId, staffId, serviceIds, date, time, name, phone, lang = 'ckb', source = 'online', checkDays = true, channel }, now = new Date()) {
  const services = activeServices(db, clinicId, serviceIds);
  if (!services.length) throw new BookingError('needService');
  const minutes = services.reduce((a, s) => a + s.minutes, 0);
  return tx(db, () => {
    const start = toMinutes(time);
    const candidates = staffFor(db, clinicId, staffId, services.map((x) => x.id));
    if (checkDays && !candidates.some((d) => bookableDays(db, d.id, now).some((x) => x.date === date && x.open))) throw new BookingError('closed');
    const staff = candidates.find((d) => fits(db, d, date, start, minutes, busy(db, d.id, date)));
    if (!staff) throw new BookingError(candidates.some((d) => hoursFor(db, d.id, date).length) ? 'slotTaken' : 'closed');
    const patientId = phone ? findOrCreatePatient(db, clinicId, name, phone, channel) : null;
    const tok = token();
    const id = Number(db.prepare(`INSERT INTO bookings (clinic_id, doctor_id, patient_id, walkin_name, date, time, duration_min, queue_no, status, source, token, lang)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(clinicId, staff.id, patientId, patientId ? null : name, date, time, minutes,
      nextQueueNo(db, staff.id, date), 'booked', source, tok, lang).lastInsertRowid);
    const link = db.prepare('INSERT INTO booking_services (booking_id, service_id) VALUES (?, ?)');
    for (const s of services) link.run(id, s.id);
    return getBookingByToken(db, tok);
  });
}

// All of a salon's bookings for one day, across staff, in time order.
export function salonDay(db, clinicId, date) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.clinic_id = ? AND b.date = ? AND b.status != 'cancelled' ORDER BY b.time, d.name`).all(clinicId, date);
}

// Finished salon visits whose "book again" reminder is due today, for customers with nothing booked ahead.
export function dueRebooks(db, now = new Date()) {
  const today = localParts(now).date;
  return db.prepare(`${BOOKING_SELECT} WHERE b.status = 'done' AND b.rebook_sent_at IS NULL AND p.phone IS NOT NULL AND c.kind = 'salon'
    AND date(b.date, '+' || (SELECT MAX(s.rebook_weeks) * 7 FROM booking_services bs JOIN services s ON s.id = bs.service_id WHERE bs.booking_id = b.id) || ' days') <= ?
    AND (SELECT MAX(s.rebook_weeks) FROM booking_services bs JOIN services s ON s.id = bs.service_id WHERE bs.booking_id = b.id) > 0
    AND NOT EXISTS (SELECT 1 FROM bookings f WHERE f.patient_id = b.patient_id AND f.date >= ? AND f.status IN ${ACTIVE})`).all(today, today);
}

export function markRebookSent(db, id) {
  db.prepare(`UPDATE bookings SET rebook_sent_at = datetime('now') WHERE id = ?`).run(id);
}

// Patients whose follow-up visit is tomorrow and who have not been told yet.
export function dueFollowUps(db, now = new Date()) {
  const tomorrow = addDays(localParts(now).date, 1);
  return db.prepare(`SELECT p.*, c.name AS clinic_name, c.slug AS clinic_slug, (SELECT b.lang FROM bookings b WHERE b.patient_id = p.id ORDER BY b.id DESC LIMIT 1) AS lang FROM patients p JOIN clinics c ON c.id = p.clinic_id
    WHERE p.follow_up_date = ? AND (p.follow_up_sent_at IS NULL OR p.follow_up_sent_at < date('now', '-2 days'))`).all(tomorrow);
}

export function markFollowUpSent(db, id) {
  db.prepare(`UPDATE patients SET follow_up_sent_at = datetime('now') WHERE id = ?`).run(id);
}
