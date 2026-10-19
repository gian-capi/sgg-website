import bcrypt from 'bcryptjs';
import { db, logActivity } from './db.js';

export const ROLES = ['owner', 'editor', 'viewer'];

/** Rank used for "at least this role" checks. */
const RANK = { viewer: 1, editor: 2, owner: 3 };

export function createUser({ email, password, name = '', role = 'editor' }) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);
  const hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run(email.toLowerCase().trim(), hash, name, role);
  return getUserById(info.lastInsertRowid);
}

export function getUserById(id) {
  return db.prepare('SELECT id, email, name, role, active, last_login_at, created_at FROM users WHERE id = ?').get(id);
}

export function verifyCredentials(email, password) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
  // Always run a hash comparison so timing does not reveal whether the email exists.
  const hash = row?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = bcrypt.compareSync(String(password || ''), hash);
  if (!row || !ok || !row.active) return null;
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.id);
  logActivity(row.id, 'login', 'user', row.id, `${row.email} signed in`);
  return getUserById(row.id);
}

export function changePassword(userId, newPassword) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 12), userId);
}

/** Gate an HTML page behind a session; redirects to the login screen. */
export function requirePage(req, res, next) {
  if (req.session?.userId) {
    req.user = getUserById(req.session.userId);
    if (req.user?.active) return next();
  }
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

/** Gate a JSON endpoint behind a session. */
export function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not signed in' });
  req.user = getUserById(req.session.userId);
  if (!req.user?.active) return res.status(401).json({ error: 'Account disabled' });
  next();
}

/** Gate a JSON endpoint behind a minimum role. Use after requireAuth. */
export function requireRole(minRole) {
  return (req, res, next) => {
    const have = RANK[req.user?.role] || 0;
    if (have < (RANK[minRole] || 99)) {
      return res.status(403).json({ error: `Requires ${minRole} access` });
    }
    next();
  };
}
