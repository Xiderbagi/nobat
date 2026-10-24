import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, tx } from './db.js';
import { pickLang, t } from './i18n.js';
import { send, isLiveMessaging } from './notify.js';
import { clearCookie, loadUser, login, logout, requireOwner, requireUser, sessionCookie } from './auth.js';
import {
  BookingError, addWalkIn, bookableDays, callNext, createBooking, dayList, dueReminders, freeSlots, getBooking,
  getBookingByToken, getDoctor, markReminded, queuePreview, setStatus, ticketStatus
} from './queue.js';
import { checkSecret, displayPhone, hashSecret, isClock, isIsoDate, localParts, normalizePhone, otpCode } from './util.js';
import * as views from './views.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OTP_TTL = 10 * 60 * 1000;
const OTP_MAX_SENDS = 3;

export function createApp(db, { baseUrl = process.env.BASE_URL || 'http://localhost:3000', dev = process.env.NODE_ENV !== 'production' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '20kb' }));
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    });
    next();
  });
  app.use('/static', express.static(join(ROOT, 'public'), { maxAge: dev ? 0 : '1h' }));
  app.use(loadUser(db));

  const langOf = (req) => pickLang(req.query.lang || /(?:^|;\s*)nobat_lang=(\w+)/.exec(req.headers.cookie || '')?.[1]);
  const rememberLang = (req, res, lang) => { if (req.query.lang) res.append('Set-Cookie', `nobat_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`); };
  const link = (b) => `${baseUrl}/t/${b.token}`;
  const when = (b) => `${b.date}${b.time ? ' ' + b.time : ''}`;
  const clinicBySlug = (slug) => db.prepare('SELECT * FROM clinics WHERE slug = ?').get(slug);
  const ownDoctor = (req, id) => db.prepare('SELECT * FROM doctors WHERE id = ? AND clinic_id = ?').get(Number(id), req.user.clinic_id);
  const ownBooking = (req, id) => { const b = getBooking(db, Number(id)); return b && b.clinic_id === req.user.clinic_id ? b : null; };

  function notifyBooking(b, kind, extra = {}) {
    const to = b.patient_phone;
    if (!to) return;
    const key = { confirmed: 'msgConfirmed', reminder: 'msgReminder', near: 'msgNear', turn: 'msgTurn' }[kind];
    const body = t(b.lang, key, { clinic: b.clinic_name, doctor: b.doctor_name, when: when(b), no: b.queue_no, link: link(b), ...extra });
    send(db, { clinicId: b.clinic_id, bookingId: b.id, to, kind, body });
  }

  // ---------- Patient pages ----------
  app.get('/', (_req, res) => res.redirect('/login'));

  app.get('/c/:slug', (req, res) => {
    const clinic = clinicBySlug(req.params.slug);
    if (!clinic) return res.status(404).send('Clinic not found');
    const lang = langOf(req); rememberLang(req, res, lang);
    const doctors = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? AND active = 1 ORDER BY name').all(clinic.id);
    res.send(views.clinicPage(clinic, doctors, lang));
  });

  app.get('/c/:slug/d/:id', (req, res) => {
    const clinic = clinicBySlug(req.params.slug);
    const doctor = clinic && getDoctor(db, Number(req.params.id));
    if (!doctor || doctor.clinic_id !== clinic.id) return res.status(404).send('Doctor not found');
    const lang = langOf(req); rememberLang(req, res, lang);
    res.send(views.bookingPage(clinic, doctor, lang, dev));
  });

  app.get('/t/:token', (req, res) => {
    const b = getBookingByToken(db, req.params.token);
    if (!b) return res.status(404).send('Booking not found');
    const lang = req.query.lang ? langOf(req) : b.lang; rememberLang(req, res, lang);
    res.send(views.ticketPage(b, lang));
  });

  // ---------- Patient API ----------
  app.get('/api/p/doctors/:id/day', (req, res) => {
    const doctor = getDoctor(db, Number(req.params.id));
    if (!doctor) return res.status(404).json({ error: 'not found' });
    const days = bookableDays(db, doctor.id);
    const date = isIsoDate(req.query.date) ? req.query.date : (days.find((d) => d.open) || days[0]).date;
    const open = days.some((d) => d.date === date && d.open);
    res.json({
      mode: doctor.mode, days, date,
      slots: open && doctor.mode === 'time' ? freeSlots(db, doctor, date) : [],
      queue: open && doctor.mode === 'queue' ? queuePreview(db, doctor, date) : null
    });
  });

  app.post('/api/p/otp', (req, res, next) => sendOtp(req, res).catch(next));
  async function sendOtp(req, res) {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: 'badPhone' });
    const now = Date.now();
    const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
    const inWindow = row && now - row.window_start < OTP_TTL;
    if (inWindow && row.sent_count >= OTP_MAX_SENDS) return res.status(429).json({ error: 'tooMany' });
    const code = otpCode();
    db.prepare(`INSERT INTO otps (phone, code_hash, expires_at, attempts, sent_count, window_start) VALUES (?, ?, ?, 0, 1, ?)
      ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
      sent_count = ${inWindow ? 'sent_count + 1' : '1'}, window_start = ${inWindow ? 'window_start' : 'excluded.window_start'}`)
      .run(phone, hashSecret(code), now + OTP_TTL, now);
    await send(db, { to: phone, kind: 'code', body: t(pickLang(req.body.lang), 'msgCode', { code }) });
    res.json({ ok: true, phone: displayPhone(phone), ...(dev ? { devCode: code } : {}) });
  }

  function useOtp(phone, code) {
    const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
    if (!row || row.expires_at < Date.now() || row.attempts >= 5) return false;
    if (!checkSecret(String(code || ''), row.code_hash)) {
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone);
      return false;
    }
    db.prepare('UPDATE otps SET expires_at = 0 WHERE phone = ?').run(phone);
    return true;
  }

  app.post('/api/p/bookings', (req, res) => {
    const { doctorId, date, time, code } = req.body;
    const name = String(req.body.name || '').trim().slice(0, 60);
    const phone = normalizePhone(req.body.phone);
    const lang = pickLang(req.body.lang);
    const doctor = getDoctor(db, Number(doctorId));
    if (!doctor || !isIsoDate(date) || (doctor.mode === 'time' && !isClock(time))) return res.status(400).json({ error: 'error' });
    if (!name) return res.status(400).json({ error: 'needName' });
    if (!phone) return res.status(400).json({ error: 'badPhone' });
    if (!useOtp(phone, code)) return res.status(400).json({ error: 'badCode' });
    try {
      const b = createBooking(db, { doctor, date, time, name, phone, lang });
      notifyBooking(b, 'confirmed');
      res.json({ token: b.token });
    } catch (err) {
      if (err instanceof BookingError) return res.status(409).json({ error: err.code });
      throw err;
    }
  });

  app.get('/api/p/t/:token', (req, res) => {
    const b = getBookingByToken(db, req.params.token);
    if (!b) return res.status(404).json({ error: 'not found' });
    res.json(ticketStatus(db, b));
  });

  app.post('/api/p/t/:token/cancel', (req, res) => {
    const b = getBookingByToken(db, req.params.token);
    if (!b) return res.status(404).json({ error: 'not found' });
    if (!['booked', 'arrived'].includes(b.status)) return res.status(409).json({ error: 'error' });
    setStatus(db, b, 'cancelled');
    res.json({ ok: true });
  });

  // ---------- Staff ----------
  app.get('/login', (req, res) => (req.user ? res.redirect('/app') : res.send(views.loginPage())));

  app.post('/api/login', (req, res) => {
    const s = login(db, req.body.email, req.body.password);
    if (!s) return res.status(401).json({ error: 'Wrong email or password.' });
    res.set('Set-Cookie', sessionCookie(s.id, baseUrl.startsWith('https'))).json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    if (req.user) logout(db, req.user.session_id);
    res.set('Set-Cookie', clearCookie).json({ ok: true });
  });

  const withClinic = (req) => {
    const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(req.user.clinic_id);
    req.user.clinic_name = clinic.name;
    return clinic;
  };

  app.get('/app', requireUser('page'), (req, res) => {
    const clinic = withClinic(req);
    const doctors = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? AND active = 1 ORDER BY name').all(clinic.id);
    res.send(views.receptionPage(req.user, clinic, doctors, isLiveMessaging()));
  });

  app.get('/app/messages', requireUser('page'), (req, res) => {
    withClinic(req);
    const rows = db.prepare('SELECT * FROM messages WHERE clinic_id = ? ORDER BY id DESC LIMIT 200').all(req.user.clinic_id);
    res.send(views.messagesPage(req.user, rows));
  });

  app.get('/app/settings', requireUser('page'), (req, res) => {
    if (req.user.role !== 'owner') return res.redirect('/app');
    withClinic(req);
    res.send(views.settingsPage(req.user));
  });

  const api = express.Router();
  api.use(requireUser('api'));

  api.get('/day', (req, res) => {
    const doctor = ownDoctor(req, req.query.doctorId);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
    const date = isIsoDate(req.query.date) ? req.query.date : localParts().date;
    const rows = dayList(db, doctor.id, date).map((b) => ({
      id: b.id, queueNo: b.queue_no, time: b.time, status: b.status, source: b.source, name: b.patient_name, phone: b.patient_phone ? displayPhone(b.patient_phone) : null
    }));
    res.json({ date, doctor: { id: doctor.id, name: doctor.name, mode: doctor.mode }, rows });
  });

  api.post('/next', (req, res) => {
    const doctor = ownDoctor(req, req.body.doctorId);
    if (!doctor || !isIsoDate(req.body.date)) return res.status(400).json({ error: 'Choose a doctor and a day.' });
    const { called, near, nearAhead } = callNext(db, doctor.id, req.body.date);
    if (called) notifyBooking(called, 'turn');
    if (near) notifyBooking(near, 'near', { n: nearAhead });
    res.json({ called: called ? { queueNo: called.queue_no, name: called.patient_name } : null });
  });

  api.post('/bookings/:id/status', (req, res) => {
    const b = ownBooking(req, req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found.' });
    try {
      setStatus(db, b, String(req.body.status));
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof BookingError) return res.status(409).json({ error: 'That change is not possible for this patient.' });
      throw err;
    }
  });

  api.post('/walkin', (req, res) => {
    const doctor = ownDoctor(req, req.body.doctorId);
    const name = String(req.body.name || '').trim().slice(0, 60);
    const phone = req.body.phone ? normalizePhone(req.body.phone) : null;
    if (!doctor || !isIsoDate(req.body.date)) return res.status(400).json({ error: 'Choose a doctor and a day.' });
    if (!name) return res.status(400).json({ error: 'Enter the patient\'s name.' });
    if (req.body.phone && !phone) return res.status(400).json({ error: 'That mobile number is not valid. Use the format 0750 123 4567.' });
    const b = addWalkIn(db, doctor, req.body.date, name, phone);
    res.json({ queueNo: b.queue_no });
  });

  // ---------- Owner settings ----------
  api.get('/settings', requireOwner, (req, res) => {
    const clinic = db.prepare('SELECT id, name, slug, city, address, phone FROM clinics WHERE id = ?').get(req.user.clinic_id);
    const doctors = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? ORDER BY active DESC, name').all(clinic.id)
      .map((d) => ({ ...d, schedules: db.prepare('SELECT weekday, start_time, end_time FROM schedules WHERE doctor_id = ? ORDER BY weekday, start_time').all(d.id) }));
    const users = db.prepare('SELECT id, name, email, role FROM users WHERE clinic_id = ? ORDER BY role, name').all(clinic.id);
    res.json({ clinic, doctors, users, baseUrl });
  });

  api.put('/clinic', requireOwner, (req, res) => {
    const f = (k, n) => String(req.body[k] || '').trim().slice(0, n);
    if (!f('name', 80)) return res.status(400).json({ error: 'Enter the clinic name.' });
    db.prepare('UPDATE clinics SET name = ?, city = ?, address = ?, phone = ? WHERE id = ?').run(f('name', 80), f('city', 40), f('address', 120), f('phone', 20), req.user.clinic_id);
    res.json({ ok: true });
  });

  api.post('/doctors', requireOwner, (req, res) => {
    const b = req.body;
    const name = String(b.name || '').trim().slice(0, 80);
    const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const schedules = Array.isArray(b.schedules) ? b.schedules : [];
    if (!name) return res.status(400).json({ error: 'Enter the doctor\'s name.' });
    for (const s of schedules) {
      if (!(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 && isClock(s.start_time) && isClock(s.end_time) && s.start_time < s.end_time)) {
        return res.status(400).json({ error: 'Each working day needs a start time before its end time.' });
      }
    }
    const values = [name, String(b.specialty || '').trim().slice(0, 60), int(b.fee_iqd, 0, 10_000_000, 0), b.mode === 'time' ? 'time' : 'queue',
      int(b.slot_minutes, 5, 120, 15), int(b.avg_minutes, 2, 120, 10), int(b.daily_limit, 1, 500, 40), b.active === false ? 0 : 1];
    const id = tx(db, () => {
      let doctorId = Number(b.id) || null;
      if (doctorId) {
        if (!ownDoctor(req, doctorId)) throw Object.assign(new Error('nf'), { status: 404 });
        db.prepare('UPDATE doctors SET name = ?, specialty = ?, fee_iqd = ?, mode = ?, slot_minutes = ?, avg_minutes = ?, daily_limit = ?, active = ? WHERE id = ?').run(...values, doctorId);
        db.prepare('DELETE FROM schedules WHERE doctor_id = ?').run(doctorId);
      } else {
        doctorId = Number(db.prepare('INSERT INTO doctors (name, specialty, fee_iqd, mode, slot_minutes, avg_minutes, daily_limit, active, clinic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...values, req.user.clinic_id).lastInsertRowid);
      }
      const ins = db.prepare('INSERT INTO schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
      for (const s of schedules) ins.run(doctorId, s.weekday, s.start_time, s.end_time);
      return doctorId;
    });
    res.json({ id });
  });

  api.post('/users', requireOwner, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a name and a valid email.' });
    if (password.length < 8) return res.status(400).json({ error: 'The password needs at least 8 characters.' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Someone already uses that email.' });
    db.prepare('INSERT INTO users (clinic_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(req.user.clinic_id, name, email, hashSecret(password), req.body.role === 'owner' ? 'owner' : 'reception');
    res.json({ ok: true });
  });

  app.use('/api/s', api);

  app.use((err, _req, res, _next) => {
    if (err.status === 404) return res.status(404).json({ error: 'Not found.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'error' });
    console.error(err);
    res.status(500).json({ error: 'error' });
  });

  return app;
}

// Sends tomorrow's reminders once it's evening in Kurdistan (after 6 PM).
export function startReminders(db, baseUrl) {
  const run = () => {
    if (localParts().time < '18:00') return;
    for (const b of dueReminders(db)) {
      markReminded(db, b.id);
      const body = t(b.lang, 'msgReminder', { clinic: b.clinic_name, doctor: b.doctor_name, when: `${b.date}${b.time ? ' ' + b.time : ''}`, no: b.queue_no, link: `${baseUrl}/t/${b.token}` });
      send(db, { clinicId: b.clinic_id, bookingId: b.id, to: b.patient_phone, kind: 'reminder', body });
    }
  };
  run();
  return setInterval(run, 5 * 60 * 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'nobat.db'));
  const port = Number(process.env.PORT) || 3000;
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  createApp(db, { baseUrl }).listen(port, () => console.log(`Nobat running on ${baseUrl}`));
  startReminders(db, baseUrl);
}
