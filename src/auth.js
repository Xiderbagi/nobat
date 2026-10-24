import { checkSecret, token } from './util.js';

const SESSION_DAYS = 30;
const COOKIE = 'nobat_session';

export function login(db, email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  // Check a dummy hash when the user is missing so both cases take the same time.
  const ok = checkSecret(password, user ? user.password_hash : '00:00');
  if (!user || !ok) return null;
  const id = token(24);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, user.id, Date.now() + SESSION_DAYS * 864e5);
  return { id, user };
}

export function logout(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function sessionCookie(id, secure) {
  return `${COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export const clearCookie = `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

function readCookie(req) {
  const m = /(?:^|;\s*)nobat_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}

// Express middleware: puts the signed-in user (with clinic) on req.user, or null.
export function loadUser(db) {
  return (req, _res, next) => {
    req.user = null;
    const id = readCookie(req);
    if (id) {
      const row = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.clinic_id, s.id AS session_id, s.expires_at
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(id);
      if (row && row.expires_at > Date.now()) req.user = row;
    }
    next();
  };
}

export function requireUser(kind) {
  return (req, res, next) => {
    if (!req.user) return kind === 'page' ? res.redirect('/login') : res.status(401).json({ error: 'Sign in again.' });
    next();
  };
}

export function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') return res.status(403).json({ error: 'Only the clinic owner can change settings.' });
  next();
}
