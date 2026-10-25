import express from 'express';
import QRCode from 'qrcode';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, tx } from './db.js';
import { pickLang, t } from './i18n.js';
import { pickStaffLang } from './staff-i18n.js';
import { send, isLiveMessaging, canChooseChannel } from './notify.js';
import { clearCookie, loadUser, login, logout, requireOwner, requireUser, sessionCookie } from './auth.js';
import {
  BookingError, activeServices, addWalkIn, bookableDays, callNext, createBooking, createSalonBooking, dayList, dueFollowUps, dueRebooks,
  dueReminders, freeSlots, getBooking, getBookingByToken, getDoctor, markFollowUpSent, markRebookSent, markReminded, queuePreview,
  salonDay, salonTimes, setStatus, ticketStatus
} from './queue.js';
import { checkSecret, displayPhone, hashSecret, isClock, isIsoDate, localParts, normalizePhone, otpCode } from './util.js';
import * as views from './views.js';
import { adminRouter } from './admin.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OTP_TTL = 10 * 60 * 1000;
const OTP_MAX_SENDS = 3;
const LANG_COOKIE = /(?:^|;\s*)nobat_lang=(\w+)/;

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
  app.use('/admin', adminRouter(db, { baseUrl, secure: baseUrl.startsWith('https') }));
  app.use(loadUser(db));

  const cookieLang = (req) => LANG_COOKIE.exec(req.headers.cookie || '')?.[1];
  const langOf = (req) => pickLang(req.query.lang || cookieLang(req));
  const rememberLang = (req, res, lang) => { if (req.query.lang) res.append('Set-Cookie', `nobat_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`); };
  const link = (b) => `${baseUrl}/t/${b.token}`;
  const when = (b) => `${b.date}${b.time ? ' ' + b.time : ''}`;
  const clinicBySlug = (slug) => db.prepare('SELECT * FROM clinics WHERE slug = ?').get(slug);
  // A doctor patients can book: active, and their clinic not switched off.
  const bookableDoctor = (id) => { const d = getDoctor(db, id); return d && db.prepare("SELECT 1 FROM clinics WHERE id = ? AND status != 'off'").get(d.clinic_id) ? d : null; };
  const unavailable = (res, clinic, lang) => res.status(403).send(views.unavailablePage(clinic, lang));
  const clinicOf = (req) => db.prepare('SELECT * FROM clinics WHERE id = ?').get(req.user.clinic_id);
  const ownDoctor = (req, id) => db.prepare('SELECT * FROM doctors WHERE id = ? AND clinic_id = ?').get(Number(id), req.user.clinic_id);
  const ownBooking = (req, id) => { const b = getBooking(db, Number(id)); return b && b.clinic_id === req.user.clinic_id ? b : null; };
  const ownPatient = (req, id) => db.prepare('SELECT * FROM patients WHERE id = ? AND clinic_id = ?').get(Number(id), req.user.clinic_id);
  const canReadNotes = (req) => req.user.role === 'owner' || req.user.role === 'doctor';
  const bookingLink = (clinic) => `${baseUrl}/c/${clinic.slug}`;

  function notifyBooking(b, kind, extra = {}) {
    const to = b.patient_phone;
    if (!to || b.clinic_status === 'off') return;
    const salon = b.clinic_kind === 'salon';
    const key = { confirmed: salon ? 'msgConfirmedSalon' : 'msgConfirmed', reminder: salon ? 'msgReminderSalon' : 'msgReminder', near: 'msgNear', turn: 'msgTurn' }[kind];
    const body = t(b.lang, key, { clinic: b.clinic_name, doctor: b.doctor_name, when: when(b), no: b.queue_no, link: link(b), services: b.service_names || '', ...extra });
    send(db, { clinicId: b.clinic_id, bookingId: b.id, to, kind, body, channel: b.patient_channel });
  }

  // ---------- Install as an app (home screen icon) ----------
  const ICONS = [
    { src: '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/static/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ];
  const manifest = (res, m) => res.type('application/manifest+json').send(JSON.stringify({
    display: 'standalone', background_color: '#edf1f6', theme_color: '#1f5fbf', icons: ICONS, ...m
  }));
  // Staff app: opens on the Today screen.
  app.get('/manifest.webmanifest', (_req, res) => manifest(res, { id: '/app', name: 'Nobat', short_name: 'Nobat', start_url: '/app', scope: '/' }));
  // Patient app for one clinic or salon: opens on its booking page.
  app.get('/c/:slug/manifest.webmanifest', (req, res) => {
    const clinic = clinicBySlug(req.params.slug);
    if (!clinic) return res.status(404).json({ error: 'error' });
    manifest(res, { id: `/c/${clinic.slug}`, name: clinic.name, short_name: clinic.name.slice(0, 12), start_url: `/c/${clinic.slug}`, scope: `/c/${clinic.slug}` });
  });
  // The service worker must be served from the site root to cover every page.
  app.get('/sw.js', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(join(ROOT, 'public', 'sw.js')));

  app.get('/healthz', (_req, res) => { db.prepare('SELECT 1').get(); res.json({ ok: true }); });

  // ---------- Patient / customer pages ----------
  app.get('/', (_req, res) => res.redirect('/login'));

  app.get('/c/:slug', (req, res) => {
    const clinic = clinicBySlug(req.params.slug);
    if (!clinic) return res.status(404).send('Not found');
    const lang = langOf(req); rememberLang(req, res, lang);
    if (clinic.status === 'off') return unavailable(res, clinic, lang);
    const staff = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? AND active = 1 ORDER BY name').all(clinic.id);
    if (clinic.kind === 'salon') return res.send(views.salonPage(clinic, staff, activeServices(db, clinic.id), lang, dev, canChooseChannel()));
    res.send(views.clinicPage(clinic, staff, lang));
  });

  app.get('/c/:slug/d/:id', (req, res) => {
    const clinic = clinicBySlug(req.params.slug);
    const doctor = clinic && getDoctor(db, Number(req.params.id));
    if (!doctor || doctor.clinic_id !== clinic.id) return res.status(404).send('Not found');
    if (clinic.kind === 'salon') return res.redirect(`/c/${clinic.slug}`);
    const lang = langOf(req); rememberLang(req, res, lang);
    if (clinic.status === 'off') return unavailable(res, clinic, lang);
    res.send(views.bookingPage(clinic, doctor, lang, dev, canChooseChannel()));
  });

  app.get('/t/:token', (req, res) => {
    const b = getBookingByToken(db, req.params.token);
    if (!b) return res.status(404).send('Not found');
    const lang = req.query.lang ? langOf(req) : b.lang; rememberLang(req, res, lang);
    res.send(views.ticketPage(b, lang));
  });

  // ---------- Patient API ----------
  app.get('/api/p/doctors/:id/day', (req, res) => {
    const doctor = bookableDoctor(Number(req.params.id));
    if (!doctor) return res.status(404).json({ error: 'error' });
    const days = bookableDays(db, doctor.id);
    const date = isIsoDate(req.query.date) ? req.query.date : (days.find((d) => d.open) || days[0]).date;
    const open = days.some((d) => d.date === date && d.open);
    res.json({
      mode: doctor.mode, days, date,
      slots: open && doctor.mode === 'time' ? freeSlots(db, doctor, date) : [],
      queue: open && doctor.mode === 'queue' ? queuePreview(db, doctor, date) : null
    });
  });

  // Salon: which days are open and which start times are free for these services and person.
  app.get('/api/p/salons/:id/times', (req, res) => {
    const clinic = db.prepare("SELECT * FROM clinics WHERE id = ? AND kind = 'salon' AND status != 'off'").get(Number(req.params.id));
    if (!clinic) return res.status(404).json({ error: 'error' });
    const staffId = Number(req.query.staff) || null;
    const ids = String(req.query.services || '').split(',').map(Number).filter(Boolean);
    const services = activeServices(db, clinic.id, ids);
    const minutes = services.reduce((a, s) => a + s.minutes, 0);
    const staff = db.prepare('SELECT id FROM doctors WHERE clinic_id = ? AND active = 1').all(clinic.id).filter((d) => !staffId || d.id === staffId);
    const perStaff = staff.map((d) => bookableDays(db, d.id));
    const days = (perStaff[0] || bookableDays(db, 0)).map((d, i) => ({ ...d, open: perStaff.some((p) => p.at(i).open) }));
    const date = isIsoDate(req.query.date) ? req.query.date : (days.find((d) => d.open) || days[0]).date;
    const open = days.some((d) => d.date === date && d.open);
    res.json({ days, date, minutes, times: open && minutes ? salonTimes(db, clinic.id, staffId, date, minutes, new Date(), services.map((x) => x.id)).map((x) => x.time) : [] });
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

  // Checks the shared contact fields. Returns an error key, or null when all is fine.
  function contactError(body, phone) {
    if (!String(body.name || '').trim()) return 'needName';
    if (!phone) return 'badPhone';
    if (!useOtp(phone, body.code)) return 'badCode';
    return null;
  }

  app.post('/api/p/bookings', (req, res) => {
    const { doctorId, date, time } = req.body;
    const name = String(req.body.name || '').trim().slice(0, 60);
    const phone = normalizePhone(req.body.phone);
    const lang = pickLang(req.body.lang);
    const doctor = bookableDoctor(Number(doctorId));
    if (!doctor || !isIsoDate(date) || (doctor.mode === 'time' && !isClock(time))) return res.status(400).json({ error: 'error' });
    const err = contactError(req.body, phone);
    if (err) return res.status(400).json({ error: err });
    try {
      const b = createBooking(db, { doctor, date, time, name, phone, lang, channel: req.body.channel });
      notifyBooking(b, 'confirmed');
      res.json({ token: b.token });
    } catch (e) {
      if (e instanceof BookingError) return res.status(409).json({ error: e.code });
      throw e;
    }
  });

  app.post('/api/p/salon-bookings', (req, res) => {
    const { clinicId, date, time } = req.body;
    const clinic = db.prepare("SELECT * FROM clinics WHERE id = ? AND kind = 'salon' AND status != 'off'").get(Number(clinicId));
    const serviceIds = (Array.isArray(req.body.serviceIds) ? req.body.serviceIds : []).map(Number).filter(Boolean);
    const phone = normalizePhone(req.body.phone);
    if (!clinic || !isIsoDate(date) || !isClock(time)) return res.status(400).json({ error: 'error' });
    if (!serviceIds.length) return res.status(400).json({ error: 'needService' });
    const err = contactError(req.body, phone);
    if (err) return res.status(400).json({ error: err });
    try {
      const b = createSalonBooking(db, { clinicId: clinic.id, staffId: Number(req.body.staffId) || null, serviceIds, date, time, name: String(req.body.name).trim().slice(0, 60), phone, lang: pickLang(req.body.lang), channel: req.body.channel });
      notifyBooking(b, 'confirmed');
      res.json({ token: b.token });
    } catch (e) {
      if (e instanceof BookingError) return res.status(409).json({ error: e.code });
      throw e;
    }
  });

  app.get('/api/p/t/:token', (req, res) => {
    const b = getBookingByToken(db, req.params.token);
    if (!b) return res.status(404).json({ error: 'error' });
    res.json({ ...ticketStatus(db, b), salon: b.clinic_kind === 'salon', staff: b.doctor_name, services: b.service_names });
  });

  app.post('/api/p/t/:token/cancel', (req, res) => {
    const b = getBookingByToken(db, req.params.token);
    if (!b) return res.status(404).json({ error: 'error' });
    if (!['booked', 'arrived'].includes(b.status)) return res.status(409).json({ error: 'error' });
    setStatus(db, b, 'cancelled');
    res.json({ ok: true });
  });

  // ---------- Staff sign in ----------
  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/app');
    const lang = pickStaffLang(req.query.lang || cookieLang(req));
    rememberLang(req, res, lang);
    res.send(views.loginPage(lang));
  });

  app.post('/api/login', (req, res) => {
    const s = login(db, req.body.email, req.body.password);
    if (!s) return res.status(401).json({ error: 'wrongLogin' });
    if (s.off) return res.status(403).json({ error: 'clinicOff' });
    res.set('Set-Cookie', sessionCookie(s.id, baseUrl.startsWith('https'))).json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    if (req.user) logout(db, req.user.session_id);
    res.set('Set-Cookie', clearCookie).json({ ok: true });
  });

  // ---------- Staff pages ----------
  const staffPage = (render) => [requireUser('page'), (req, res) => {
    const clinic = clinicOf(req);
    req.user.clinic_name = clinic.name;
    render(req, res, clinic);
  }];

  app.get('/app', ...staffPage((req, res, clinic) => {
    const doctors = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? AND active = 1 ORDER BY name').all(clinic.id);
    res.send(views.receptionPage(req.user, clinic, doctors, isLiveMessaging()));
  }));
  app.get('/app/messages', ...staffPage((req, res, clinic) => {
    res.send(views.messagesPage(req.user, clinic, db.prepare('SELECT * FROM messages WHERE clinic_id = ? ORDER BY id DESC LIMIT 200').all(clinic.id)));
  }));
  app.get('/app/settings', ...staffPage((req, res, clinic) => {
    if (req.user.role !== 'owner') return res.redirect('/app');
    res.send(views.settingsPage(req.user, clinic));
  }));
  app.get('/app/patients', ...staffPage((req, res, clinic) => res.send(views.patientsPage(req.user, clinic))));
  app.get('/app/patients/:id', ...staffPage((req, res, clinic) => {
    if (!ownPatient(req, req.params.id)) return res.redirect('/app/patients');
    res.send(views.patientFilePage(req.user, clinic, Number(req.params.id)));
  }));

  // A printable poster with a QR code to the booking page (the whole salon, or one doctor).
  app.get('/app/poster/:doctorId?', requireUser('page'), (req, res, next) => (async () => {
    const clinic = clinicOf(req);
    const doctor = req.params.doctorId && clinic.kind !== 'salon' ? ownDoctor(req, req.params.doctorId) : null;
    const url = doctor ? `${bookingLink(clinic)}/d/${doctor.id}` : bookingLink(clinic);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#121a2bff', light: '#ffffffff' } });
    res.send(views.posterPage(clinic, doctor, url, svg));
  })().catch(next));

  // ---------- Staff API ----------
  const api = express.Router();
  api.use(requireUser('api'));

  api.post('/lang', (req, res) => {
    db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(pickStaffLang(req.body.lang), req.user.id);
    res.json({ ok: true });
  });

  const rowOut = (b) => ({
    id: b.id, queueNo: b.queue_no, time: b.time, duration: b.duration_min, status: b.status, source: b.source, name: b.patient_name,
    phone: b.patient_phone ? displayPhone(b.patient_phone) : null, patientId: b.patient_id, staff: b.doctor_name, services: b.service_names
  });

  api.get('/day', (req, res) => {
    const clinic = clinicOf(req);
    const date = isIsoDate(req.query.date) ? req.query.date : localParts().date;
    if (clinic.kind === 'salon') return res.json({ date, rows: salonDay(db, clinic.id, date).map(rowOut), services: activeServices(db, clinic.id) });
    const doctor = ownDoctor(req, req.query.doctorId);
    if (!doctor) return res.status(404).json({ error: 'addProviderFirst' });
    res.json({ date, doctor: { id: doctor.id, name: doctor.name, mode: doctor.mode }, rows: dayList(db, doctor.id, date).map(rowOut) });
  });

  api.post('/next', (req, res) => {
    const doctor = ownDoctor(req, req.body.doctorId);
    if (!doctor || !isIsoDate(req.body.date)) return res.status(400).json({ error: 'errGeneric' });
    const { called, near, nearAhead } = callNext(db, doctor.id, req.body.date);
    if (called) notifyBooking(called, 'turn');
    if (near) notifyBooking(near, 'near', { n: nearAhead });
    res.json({ called: called ? { queueNo: called.queue_no, name: called.patient_name } : null });
  });

  api.post('/bookings/:id/status', (req, res) => {
    const b = ownBooking(req, req.params.id);
    if (!b) return res.status(404).json({ error: 'errGeneric' });
    try {
      setStatus(db, b, String(req.body.status));
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof BookingError) return res.status(409).json({ error: 'errGeneric' });
      throw e;
    }
  });

  api.post('/walkin', (req, res) => {
    const clinic = clinicOf(req);
    const name = String(req.body.name || '').trim().slice(0, 60);
    const phone = req.body.phone ? normalizePhone(req.body.phone) : null;
    if (!isIsoDate(req.body.date)) return res.status(400).json({ error: 'errGeneric' });
    if (!name) return res.status(400).json({ error: 'needProviderName' });
    if (req.body.phone && !phone) return res.status(400).json({ error: 'badPhone' });
    if (clinic.kind === 'salon') {
      const serviceIds = (Array.isArray(req.body.serviceIds) ? req.body.serviceIds : []).map(Number).filter(Boolean);
      if (!serviceIds.length) return res.status(400).json({ error: 'needService' });
      if (!isClock(req.body.time)) return res.status(400).json({ error: 'errGeneric' });
      try {
        const b = createSalonBooking(db, { clinicId: clinic.id, staffId: Number(req.body.staffId) || null, serviceIds, date: req.body.date, time: req.body.time, name, phone, source: 'walkin', checkDays: false, channel: req.body.channel });
        notifyBooking(b, 'confirmed');
        return res.json({ time: b.time, staff: b.doctor_name });
      } catch (e) {
        if (e instanceof BookingError) return res.status(409).json({ error: e.code === 'closed' ? 'notWorking' : e.code === 'needService' ? 'needService' : 'slotBusy' });
        throw e;
      }
    }
    const doctor = ownDoctor(req, req.body.doctorId);
    if (!doctor) return res.status(400).json({ error: 'errGeneric' });
    res.json({ queueNo: addWalkIn(db, doctor, req.body.date, name, phone, req.body.channel).queue_no });
  });

  // ---------- Patient files ----------
  api.get('/patients', (req, res) => {
    const q = String(req.query.q || '').trim();
    const digits = q.replace(/\D/g, '').replace(/^0/, '');
    const rows = db.prepare(`SELECT p.id, p.name, p.phone,
        (SELECT MAX(date) FROM bookings b WHERE b.patient_id = p.id AND b.status = 'done') AS last_visit,
        (SELECT COUNT(*) FROM bookings b WHERE b.patient_id = p.id AND b.status = 'done') AS visits
      FROM patients p WHERE p.clinic_id = ? AND (? = '' OR p.name LIKE ? OR (? != '' AND p.phone LIKE ?))
      ORDER BY COALESCE(last_visit, p.created_at) DESC LIMIT 100`).all(req.user.clinic_id, q, `%${q}%`, digits, `%${digits}%`);
    res.json({ rows: rows.map((r) => ({ ...r, phone: displayPhone(r.phone) })) });
  });

  api.get('/patients/:id', (req, res) => {
    const p = ownPatient(req, req.params.id);
    if (!p) return res.status(404).json({ error: 'errGeneric' });
    const visits = db.prepare(`SELECT b.id, b.date, b.time, b.status, d.name AS doctor,
        (SELECT group_concat(s.name, ' + ') FROM booking_services bs JOIN services s ON s.id = bs.service_id WHERE bs.booking_id = b.id) AS services
      FROM bookings b JOIN doctors d ON d.id = b.doctor_id WHERE b.patient_id = ? ORDER BY b.date DESC, b.time DESC LIMIT 100`).all(p.id);
    const notes = canReadNotes(req) ? db.prepare(`SELECT n.id, n.note, n.booking_id, n.created_at, u.name AS author FROM visit_notes n
      LEFT JOIN users u ON u.id = n.author_id WHERE n.patient_id = ? ORDER BY n.id DESC`).all(p.id) : null;
    res.json({
      patient: { id: p.id, name: p.name, phone: displayPhone(p.phone), channel: p.channel, birth_year: p.birth_year, allergies: canReadNotes(req) ? p.allergies : null, notes: canReadNotes(req) ? p.notes : null, follow_up_date: p.follow_up_date },
      visits, notes, canReadNotes: canReadNotes(req)
    });
  });

  api.put('/patients/:id', (req, res) => {
    const p = ownPatient(req, req.params.id);
    if (!p) return res.status(404).json({ error: 'errGeneric' });
    const name = String(req.body.name || '').trim().slice(0, 60) || p.name;
    const year = Number(req.body.birth_year);
    const birth = Number.isInteger(year) && year > 1900 && year <= new Date().getFullYear() ? year : null;
    const follow = isIsoDate(req.body.follow_up_date) ? req.body.follow_up_date : null;
    if (['whatsapp', 'sms'].includes(req.body.channel)) db.prepare('UPDATE patients SET channel = ? WHERE id = ?').run(req.body.channel, p.id);
    if (canReadNotes(req)) {
      db.prepare('UPDATE patients SET name = ?, birth_year = ?, allergies = ?, notes = ?, follow_up_date = ?, follow_up_sent_at = CASE WHEN follow_up_date IS ? THEN follow_up_sent_at ELSE NULL END WHERE id = ?')
        .run(name, birth, String(req.body.allergies || '').slice(0, 300), String(req.body.notes || '').slice(0, 2000), follow, follow, p.id);
    } else {
      db.prepare('UPDATE patients SET name = ?, birth_year = ?, follow_up_date = ?, follow_up_sent_at = CASE WHEN follow_up_date IS ? THEN follow_up_sent_at ELSE NULL END WHERE id = ?')
        .run(name, birth, follow, follow, p.id);
    }
    res.json({ ok: true });
  });

  api.post('/patients/:id/notes', (req, res) => {
    if (!canReadNotes(req)) return res.status(403).json({ error: 'notAllowed' });
    const p = ownPatient(req, req.params.id);
    if (!p) return res.status(404).json({ error: 'errGeneric' });
    const note = String(req.body.note || '').trim().slice(0, 4000);
    if (!note) return res.status(400).json({ error: 'noteEmpty' });
    const booking = req.body.bookingId ? ownBooking(req, req.body.bookingId) : null;
    db.prepare('INSERT INTO visit_notes (clinic_id, patient_id, booking_id, author_id, note) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.clinic_id, p.id, booking && booking.patient_id === p.id ? booking.id : null, req.user.id, note);
    res.json({ ok: true });
  });

  // ---------- Owner settings ----------
  api.get('/settings', requireOwner, (req, res) => {
    const clinic = db.prepare('SELECT id, name, slug, city, address, phone, kind FROM clinics WHERE id = ?').get(req.user.clinic_id);
    const doctors = db.prepare('SELECT * FROM doctors WHERE clinic_id = ? ORDER BY active DESC, name').all(clinic.id)
      .map((d) => ({ ...d, schedules: db.prepare('SELECT weekday, start_time, end_time FROM schedules WHERE doctor_id = ? ORDER BY weekday, start_time').all(d.id),
        serviceIds: db.prepare('SELECT service_id FROM staff_services WHERE doctor_id = ?').all(d.id).map((r) => r.service_id) }));
    const users = db.prepare('SELECT id, name, email, role, doctor_id FROM users WHERE clinic_id = ? ORDER BY role, name').all(clinic.id);
    const services = db.prepare('SELECT * FROM services WHERE clinic_id = ? ORDER BY active DESC, name').all(clinic.id);
    res.json({ clinic, doctors, users, services, baseUrl });
  });

  api.put('/clinic', requireOwner, (req, res) => {
    const f = (k, n) => String(req.body[k] || '').trim().slice(0, n);
    if (!f('name', 80)) return res.status(400).json({ error: 'needProviderName' });
    db.prepare('UPDATE clinics SET name = ?, city = ?, address = ?, phone = ? WHERE id = ?').run(f('name', 80), f('city', 40), f('address', 120), f('phone', 20), req.user.clinic_id);
    res.json({ ok: true });
  });

  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  api.post('/doctors', requireOwner, (req, res) => {
    const b = req.body;
    const name = String(b.name || '').trim().slice(0, 80);
    const schedules = Array.isArray(b.schedules) ? b.schedules : [];
    if (!name) return res.status(400).json({ error: 'needProviderName' });
    for (const s of schedules) {
      if (!(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 && isClock(s.start_time) && isClock(s.end_time) && s.start_time < s.end_time)) {
        return res.status(400).json({ error: 'badHours' });
      }
    }
    const salon = clinicOf(req).kind === 'salon';
    const values = [name, String(b.specialty || '').trim().slice(0, 60), int(b.fee_iqd, 0, 10_000_000, 0), salon || b.mode === 'time' ? 'time' : 'queue',
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
      if (salon && Array.isArray(b.serviceIds)) {
        const own = new Set(db.prepare('SELECT id FROM services WHERE clinic_id = ?').all(req.user.clinic_id).map((r) => r.id));
        db.prepare('DELETE FROM staff_services WHERE doctor_id = ?').run(doctorId);
        const link = db.prepare('INSERT INTO staff_services (doctor_id, service_id) VALUES (?, ?)');
        for (const id of new Set(b.serviceIds.map(Number))) if (own.has(id)) link.run(doctorId, id);
      }
      return doctorId;
    });
    res.json({ id });
  });

  api.post('/services', requireOwner, (req, res) => {
    const b = req.body;
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'needServiceName' });
    const values = [name, int(b.price_iqd, 0, 10_000_000, 0), int(b.minutes, 5, 480, 30), int(b.rebook_weeks, 0, 52, 0), b.active === false ? 0 : 1];
    if (b.id) {
      const r = db.prepare('UPDATE services SET name = ?, price_iqd = ?, minutes = ?, rebook_weeks = ?, active = ? WHERE id = ? AND clinic_id = ?').run(...values, Number(b.id), req.user.clinic_id);
      if (!r.changes) return res.status(404).json({ error: 'errGeneric' });
      return res.json({ id: Number(b.id) });
    }
    res.json({ id: Number(db.prepare('INSERT INTO services (name, price_iqd, minutes, rebook_weeks, active, clinic_id) VALUES (?, ?, ?, ?, ?, ?)').run(...values, req.user.clinic_id).lastInsertRowid) });
  });

  api.post('/users', requireOwner, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = ['owner', 'reception', 'doctor'].includes(req.body.role) ? req.body.role : 'reception';
    const doctor = role === 'doctor' && req.body.doctorId ? ownDoctor(req, req.body.doctorId) : null;
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'needAccount' });
    if (password.length < 8) return res.status(400).json({ error: 'shortPassword' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'emailTaken' });
    db.prepare('INSERT INTO users (clinic_id, name, email, password_hash, role, doctor_id, lang) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.clinic_id, name, email, hashSecret(password), role, doctor ? doctor.id : null, req.user.lang);
    res.json({ ok: true });
  });

  app.use('/api/s', api);

  app.use((err, _req, res, _next) => {
    if (err.status === 404) return res.status(404).json({ error: 'errGeneric' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'error' });
    console.error(err);
    res.status(500).json({ error: 'error' });
  });

  return app;
}

// Background messages, checked every 5 minutes (Kurdistan time):
//   after 6 PM: tomorrow's visit reminders and follow-up reminders
//   after 10 AM: salon "book again" messages
export function runScheduled(db, baseUrl, now = new Date()) {
  const clock = localParts(now).time;
  if (clock >= '18:00') {
    for (const b of dueReminders(db, now)) {
      markReminded(db, b.id);
      if (b.clinic_status === 'off') continue;
      const salon = b.clinic_kind === 'salon';
      const body = t(b.lang, salon ? 'msgReminderSalon' : 'msgReminder', { clinic: b.clinic_name, doctor: b.doctor_name, when: salon ? b.time : `${b.date}${b.time ? ' ' + b.time : ''}`, no: b.queue_no, services: b.service_names || '', link: `${baseUrl}/t/${b.token}` });
      send(db, { clinicId: b.clinic_id, bookingId: b.id, to: b.patient_phone, kind: 'reminder', body, channel: b.patient_channel });
    }
    for (const p of dueFollowUps(db, now)) {
      markFollowUpSent(db, p.id);
      if (p.clinic_status === 'off') continue;
      send(db, { clinicId: p.clinic_id, to: p.phone, kind: 'follow-up', channel: p.channel, body: t(p.lang || 'ckb', 'msgFollowUp', { clinic: p.clinic_name, link: `${baseUrl}/c/${p.clinic_slug}` }) });
    }
  }
  if (clock >= '10:00') {
    for (const b of dueRebooks(db, now)) {
      markRebookSent(db, b.id);
      if (b.clinic_status === 'off') continue;
      send(db, { clinicId: b.clinic_id, bookingId: b.id, to: b.patient_phone, kind: 'rebook', channel: b.patient_channel, body: t(b.lang, 'msgRebook', { clinic: b.clinic_name, link: `${baseUrl}/c/${b.clinic_slug}` }) });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'nobat.db'));
  const port = Number(process.env.PORT) || 3000;
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  createApp(db, { baseUrl }).listen(port, () => console.log(`Nobat running on ${baseUrl}`));
  const tick = () => { try { runScheduled(db, baseUrl); } catch (err) { console.error('scheduled messages failed', err); } };
  tick();
  setInterval(tick, 5 * 60 * 1000);
}
