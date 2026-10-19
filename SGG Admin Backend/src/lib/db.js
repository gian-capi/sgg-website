import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'editor',   -- owner | editor | viewer
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS artists (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  specialty        TEXT NOT NULL DEFAULT '',
  bio              TEXT NOT NULL DEFAULT '',
  card_image       TEXT NOT NULL DEFAULT '',
  hero_image       TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'active',  -- active | archived
  featured         INTEGER NOT NULL DEFAULT 0,
  featured_label   TEXT NOT NULL DEFAULT 'Top Artist',
  featured_image   TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artists_status ON artists(status);

CREATE TABLE IF NOT EXISTS artworks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id    INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  medium       TEXT NOT NULL DEFAULT '',
  dimensions   TEXT NOT NULL DEFAULT '',
  image_path   TEXT NOT NULL DEFAULT '',
  thumb_path   TEXT NOT NULL DEFAULT '',
  is_release   INTEGER NOT NULL DEFAULT 0,
  release_order INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active',   -- active | archived
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_release ON artworks(is_release);

CREATE TABLE IF NOT EXISTS galleries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  brand         TEXT NOT NULL DEFAULT 'wyland',   -- wyland | signature
  name          TEXT NOT NULL,
  location      TEXT NOT NULL DEFAULT '',         -- "South Lake Tahoe, California"
  address       TEXT NOT NULL DEFAULT '',         -- newline separated lines
  short_address TEXT NOT NULL DEFAULT '',         -- 2-line form used on the homepage card
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT 'info@signaturegalleries.com',
  hours         TEXT NOT NULL DEFAULT '',         -- newline separated lines
  instagram_url TEXT NOT NULL DEFAULT '',
  facebook_url  TEXT NOT NULL DEFAULT '',
  logo          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gallery_photos ON gallery_photos(gallery_id);

CREATE TABLE IF NOT EXISTS consultants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT 'Art Consultant',
  email      TEXT NOT NULL DEFAULT '',
  photo      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_consultants_gallery ON consultants(gallery_id);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  start_date   TEXT NOT NULL,                     -- YYYY-MM-DD
  end_date     TEXT,
  location     TEXT NOT NULL DEFAULT '',          -- "Lake Tahoe"
  gallery_id   INTEGER REFERENCES galleries(id) ON DELETE SET NULL,
  artist_id    INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  banner_image TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  schedule     TEXT NOT NULL DEFAULT '',          -- newline separated session lines
  status       TEXT NOT NULL DEFAULT 'published', -- published | draft | archived
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(start_date);

CREATE TABLE IF NOT EXISTS hero_slides (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL DEFAULT 'standard',  -- welcome | event | releases | statement
  eyebrow    TEXT NOT NULL DEFAULT '',
  headline   TEXT NOT NULL DEFAULT '',          -- newline separated -> <br>
  body       TEXT NOT NULL DEFAULT '',
  cta_label  TEXT NOT NULL DEFAULT '',
  cta_href   TEXT NOT NULL DEFAULT '',
  cta2_label TEXT NOT NULL DEFAULT '',
  cta2_href  TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL DEFAULT '',
  config     TEXT NOT NULL DEFAULT '{}',         -- JSON: extra per-kind fields
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'Newsletter', -- Newsletter | Contact | Artwork | Event
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id   INTEGER,
  source_path TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'New',        -- New | Contacted | Closed
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at);

CREATE TABLE IF NOT EXISTS page_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT NOT NULL,
  page_type   TEXT NOT NULL DEFAULT 'other',   -- home | artists | artist | event | gallery | other
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id   INTEGER,
  referrer    TEXT NOT NULL DEFAULT '',
  visitor_id  TEXT NOT NULL DEFAULT '',
  session_id  TEXT NOT NULL DEFAULT '',
  device      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pv_entity ON page_views(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pv_type ON page_views(page_type);

CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,                   -- artwork_open | cta_click | phone_click | email_click | outbound
  path        TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id   INTEGER,
  label       TEXT NOT NULL DEFAULT '',
  visitor_id  TEXT NOT NULL DEFAULT '',
  session_id  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ix_created ON interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_ix_entity ON interactions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ix_name ON interactions(name);

CREATE TABLE IF NOT EXISTS publishes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'running', -- running | success | failed
  files_written INTEGER NOT NULL DEFAULT 0,
  backup_path TEXT NOT NULL DEFAULT '',
  log         TEXT NOT NULL DEFAULT '',
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id   INTEGER,
  summary     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
`);

/**
 * Additive migrations. Each entry is applied once, guarded by a column check,
 * so an existing database upgrades in place without losing data.
 */
function addColumn(table, column, definition) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Release artworks live under images/artwork/ and are shown only in the
// homepage carousel, not in the artist's catalogue grid.
addColumn('artworks', 'in_catalogue', 'INTEGER NOT NULL DEFAULT 1');

// Per-page SEO copy, imported from the existing pages so publishing preserves it.
addColumn('galleries', 'page_title', "TEXT NOT NULL DEFAULT ''");
addColumn('galleries', 'meta_description', "TEXT NOT NULL DEFAULT ''");
addColumn('events', 'page_title', "TEXT NOT NULL DEFAULT ''");
addColumn('events', 'meta_description', "TEXT NOT NULL DEFAULT ''");
addColumn('artists', 'page_title', "TEXT NOT NULL DEFAULT ''");

// Artworks are identified by their image path within an artist, so that
// re-importing updates rows in place instead of renumbering them — which
// would orphan the analytics that reference artwork ids.
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_identity
         ON artworks(artist_id, image_path)`);

/** Mark that published output is behind the database. */
export function markDirty() {
  setSetting('content_dirty', '1');
}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, String(value));
}

export function logActivity(userId, action, entityType, entityId, summary) {
  db.prepare(
    `INSERT INTO activity_log (user_id, action, entity_type, entity_id, summary)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId ?? null, action, entityType || '', entityId ?? null, summary || '');
}
