import session from 'express-session';
import { db } from './db.js';

/**
 * Minimal session store on top of the existing better-sqlite3 handle.
 * Replaces connect-sqlite3, which dragged in the vulnerable `sqlite3` stack.
 */
export class SqliteStore extends session.Store {
  constructor({ ttlMs = 1000 * 60 * 60 * 12 } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.stmts = {
      get: db.prepare('SELECT data, expires FROM sessions WHERE sid = ?'),
      set: db.prepare(
        `INSERT INTO sessions (sid, expires, data) VALUES (@sid, @expires, @data)
         ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data`
      ),
      destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      touch: db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      clear: db.prepare('DELETE FROM sessions'),
      length: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires > ?'),
      prune: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
      all: db.prepare('SELECT sid, data FROM sessions WHERE expires > ?'),
    };

    this.pruneTimer = setInterval(() => this.prune(), 1000 * 60 * 15);
    this.pruneTimer.unref?.();
  }

  expiryFor(sess) {
    const cookieExpires = sess?.cookie?.expires;
    if (cookieExpires) return new Date(cookieExpires).getTime();
    return Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.stmts.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires <= Date.now()) {
        this.stmts.destroy.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.stmts.set.run({ sid, expires: this.expiryFor(sess), data: JSON.stringify(sess) });
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.stmts.touch.run(this.expiryFor(sess), sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.stmts.destroy.run(sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  clear(cb) {
    try {
      this.stmts.clear.run();
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  length(cb) {
    try {
      cb(null, this.stmts.length.get(Date.now()).n);
    } catch (err) {
      cb(err);
    }
  }

  all(cb) {
    try {
      cb(null, this.stmts.all.all(Date.now()).map((r) => JSON.parse(r.data)));
    } catch (err) {
      cb(err);
    }
  }

  prune() {
    try {
      this.stmts.prune.run(Date.now());
    } catch {
      /* best effort */
    }
  }
}
