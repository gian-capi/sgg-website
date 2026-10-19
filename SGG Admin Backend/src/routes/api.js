import express from 'express';
import { config } from '../lib/config.js';
import { db, markDirty, getSetting, setSetting, logActivity } from '../lib/db.js';
import { requireAuth, requireRole, createUser, changePassword, ROLES, getUserById } from '../lib/auth.js';
import { crudRouter, slugify, uniqueSlug } from '../lib/crud.js';
import { runImport } from '../importer/import-site.js';
import { publishSite } from '../publisher/publish.js';
import reportsRouter from './reports.js';
import mediaRouter from './media.js';

const api = express.Router();
api.use(requireAuth);

const editor = requireRole('editor');
const owner = requireRole('owner');

// ------------------------------------------------------------------ me ---

api.get('/me', (req, res) => res.json(req.user));

api.post('/me/password', (req, res) => {
  const { password } = req.body;
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  changePassword(req.user.id, password);
  res.json({ ok: true });
});

// -------------------------------------------------------------- artists ---

api.use(
  '/artists',
  crudRouter({
    table: 'artists',
    label: 'artist',
    fields: [
      'slug', 'name', 'specialty', 'bio', 'card_image', 'hero_image', 'meta_description',
      'status', 'featured', 'featured_label', 'featured_image', 'sort_order',
    ],
    listQuery: `
      SELECT a.*,
             (SELECT COUNT(*) FROM artworks w WHERE w.artist_id = a.id AND w.status = 'active') AS work_count,
             (SELECT COUNT(*) FROM events e WHERE e.artist_id = a.id) AS event_count
      FROM artists a ORDER BY a.sort_order, a.name`,
    beforeWrite: (d, { id, isCreate }) => {
      if (isCreate && !d.slug) d.slug = slugify(d.name);
      if (d.slug) d.slug = uniqueSlug('artists', slugify(d.slug), id ?? null);
      if (d.featured !== undefined) d.featured = d.featured ? 1 : 0;
      return d;
    },
  })
);

/** Catalogue for one artist. */
api.get('/artists/:id/artworks', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM artworks WHERE artist_id = ? ORDER BY sort_order, id')
      .all(req.params.id)
  );
});

// ------------------------------------------------------------- artworks ---

api.use(
  '/artworks',
  crudRouter({
    table: 'artworks',
    label: 'artwork',
    fields: [
      'artist_id', 'title', 'medium', 'dimensions', 'image_path', 'thumb_path',
      'is_release', 'release_order', 'sort_order', 'status', 'in_catalogue',
    ],
    listQuery: `
      SELECT w.*, a.name AS artist_name, a.slug AS artist_slug
      FROM artworks w JOIN artists a ON a.id = w.artist_id
      ORDER BY a.name, w.sort_order, w.id`,
    beforeWrite: (d) => {
      if (d.is_release !== undefined) d.is_release = d.is_release ? 1 : 0;
      if (d.in_catalogue !== undefined) d.in_catalogue = d.in_catalogue ? 1 : 0;
      if (d.image_path && !d.thumb_path) d.thumb_path = d.image_path;
      return d;
    },
  })
);

/** The New Releases carousel, in carousel order. */
api.get('/releases', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT w.*, a.name AS artist_name, a.slug AS artist_slug
         FROM artworks w JOIN artists a ON a.id = w.artist_id
         WHERE w.is_release = 1 AND w.status = 'active'
         ORDER BY w.release_order, w.id`
      )
      .all()
  );
});

api.post('/releases/reorder', editor, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const clear = db.prepare('UPDATE artworks SET is_release = 0');
  const set = db.prepare('UPDATE artworks SET is_release = 1, release_order = ? WHERE id = ?');
  db.transaction(() => {
    clear.run();
    ids.forEach((id, i) => set.run(i, id));
  })();
  markDirty();
  logActivity(req.user.id, 'update', 'releases', null, `Set ${ids.length} new releases`);
  res.json({ ok: true, count: ids.length });
});

// ------------------------------------------------------------ galleries ---

api.use(
  '/galleries',
  crudRouter({
    table: 'galleries',
    label: 'gallery',
    fields: [
      'slug', 'brand', 'name', 'location', 'address', 'short_address', 'phone', 'email',
      'hours', 'instagram_url', 'facebook_url', 'logo', 'status', 'sort_order',
    ],
    listQuery: `
      SELECT g.*,
             (SELECT COUNT(*) FROM consultants c WHERE c.gallery_id = g.id) AS consultant_count,
             (SELECT COUNT(*) FROM gallery_photos p WHERE p.gallery_id = g.id) AS photo_count,
             (SELECT COUNT(*) FROM events e WHERE e.gallery_id = g.id) AS event_count
      FROM galleries g ORDER BY g.sort_order, g.name`,
    beforeWrite: (d, { id, isCreate }) => {
      if (isCreate && !d.slug) d.slug = slugify(`${d.brand || 'gallery'}-${d.location || d.name}`);
      if (d.slug) d.slug = uniqueSlug('galleries', slugify(d.slug), id ?? null);
      return d;
    },
  })
);

api.get('/galleries/:id/photos', (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery_photos WHERE gallery_id = ? ORDER BY sort_order, id').all(req.params.id));
});

api.put('/galleries/:id/photos', editor, (req, res) => {
  const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
  db.transaction(() => {
    db.prepare('DELETE FROM gallery_photos WHERE gallery_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO gallery_photos (gallery_id, path, sort_order) VALUES (?, ?, ?)');
    paths.forEach((p, i) => ins.run(req.params.id, p, i));
  })();
  markDirty();
  res.json({ ok: true, count: paths.length });
});

api.get('/galleries/:id/consultants', (req, res) => {
  res.json(db.prepare('SELECT * FROM consultants WHERE gallery_id = ? ORDER BY sort_order, id').all(req.params.id));
});

api.put('/galleries/:id/consultants', editor, (req, res) => {
  const list = Array.isArray(req.body.consultants) ? req.body.consultants : [];
  db.transaction(() => {
    db.prepare('DELETE FROM consultants WHERE gallery_id = ?').run(req.params.id);
    const ins = db.prepare(
      'INSERT INTO consultants (gallery_id, name, title, email, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    list.forEach((c, i) =>
      ins.run(req.params.id, c.name || '', c.title || 'Art Consultant', c.email || '', c.photo || '', i)
    );
  })();
  markDirty();
  logActivity(req.user.id, 'update', 'gallery', Number(req.params.id), `Updated ${list.length} consultants`);
  res.json({ ok: true, count: list.length });
});

// --------------------------------------------------------------- events ---

api.use(
  '/events',
  crudRouter({
    table: 'events',
    label: 'event',
    fields: [
      'slug', 'title', 'start_date', 'end_date', 'location', 'gallery_id', 'artist_id',
      'banner_image', 'description', 'schedule', 'status', 'sort_order',
    ],
    listQuery: `
      SELECT e.*, a.name AS artist_name, a.slug AS artist_slug,
             g.name AS gallery_name, g.slug AS gallery_slug, g.phone AS gallery_phone
      FROM events e
      LEFT JOIN artists a ON a.id = e.artist_id
      LEFT JOIN galleries g ON g.id = e.gallery_id
      ORDER BY e.start_date`,
    beforeWrite: (d, { id, isCreate }) => {
      if (isCreate && !d.slug) d.slug = slugify(d.title);
      if (d.slug) d.slug = uniqueSlug('events', slugify(d.slug), id ?? null);
      return d;
    },
  })
);

// ---------------------------------------------------- hero slides & FAQ ---

api.use(
  '/hero-slides',
  crudRouter({
    table: 'hero_slides',
    label: 'hero slide',
    fields: [
      'kind', 'eyebrow', 'headline', 'body', 'cta_label', 'cta_href',
      'cta2_label', 'cta2_href', 'image', 'config', 'active', 'sort_order',
    ],
    beforeWrite: (d) => {
      if (d.active !== undefined) d.active = d.active ? 1 : 0;
      if (d.config && typeof d.config !== 'string') d.config = JSON.stringify(d.config);
      return d;
    },
  })
);

api.use(
  '/faqs',
  crudRouter({
    table: 'faqs',
    label: 'FAQ',
    fields: ['question', 'answer', 'active', 'sort_order'],
    beforeWrite: (d) => {
      if (d.active !== undefined) d.active = d.active ? 1 : 0;
      return d;
    },
  })
);

// ------------------------------------------------------------ inquiries ---

api.get('/inquiries', (req, res) => {
  const { status, type, q } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (type) { where.push('type = ?'); params.push(type); }
  if (q) { where.push('(email LIKE ? OR name LIKE ? OR message LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `SELECT * FROM inquiries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...params));
});

api.put('/inquiries/:id', editor, (req, res) => {
  const { status, notes } = req.body;
  const row = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found' });
  db.prepare(
    `UPDATE inquiries SET status = COALESCE(?, status), notes = COALESCE(?, notes),
     updated_at = datetime('now') WHERE id = ?`
  ).run(status ?? null, notes ?? null, row.id);
  logActivity(req.user.id, 'update', 'inquiry', row.id, `Inquiry ${row.email} → ${status || row.status}`);
  res.json(db.prepare('SELECT * FROM inquiries WHERE id = ?').get(row.id));
});

api.delete('/inquiries/:id', editor, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

api.get('/inquiries/export.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  const cols = ['id', 'created_at', 'type', 'status', 'name', 'email', 'message', 'source_path', 'notes'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  res.type('text/csv').attachment('sgg-inquiries.csv').send(csv);
});

// ------------------------------------------------------------- settings ---

api.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

api.put('/settings', editor, (req, res) => {
  const entries = Object.entries(req.body || {});
  db.transaction(() => entries.forEach(([k, v]) => setSetting(k, v)))();
  if (entries.some(([k]) => k !== 'content_dirty')) markDirty();
  logActivity(req.user.id, 'update', 'settings', null, `Updated ${entries.length} settings`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- users ---

api.get('/users', owner, (req, res) => {
  res.json(db.prepare('SELECT id, email, name, role, active, last_login_at, created_at FROM users ORDER BY id').all());
});

api.post('/users', owner, (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
  try {
    const user = createUser({ email, password, name, role: role || 'editor' });
    logActivity(req.user.id, 'create', 'user', user.id, `Added ${user.email} (${user.role})`);
    res.status(201).json(user);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'That email already exists' });
    throw err;
  }
});

api.put('/users/:id', owner, (req, res) => {
  const { name, role, active, password } = req.body;
  const target = getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
  // Never let the last active owner lock everyone out.
  if (target.role === 'owner' && (role && role !== 'owner' || active === 0)) {
    const owners = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'owner' AND active = 1").get().n;
    if (owners <= 1) return res.status(400).json({ error: 'Cannot demote or disable the last owner' });
  }
  db.prepare('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?')
    .run(name ?? null, role ?? null, active === undefined ? null : (active ? 1 : 0), target.id);
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    changePassword(target.id, password);
  }
  res.json(getUserById(target.id));
});

api.delete('/users/:id', owner, (req, res) => {
  const target = getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (target.role === 'owner') {
    const owners = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'owner' AND active = 1").get().n;
    if (owners <= 1) return res.status(400).json({ error: 'Cannot delete the last owner' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  logActivity(req.user.id, 'delete', 'user', target.id, `Removed ${target.email}`);
  res.json({ ok: true });
});

// --------------------------------------------------- publish and import ---

api.get('/publish/status', (req, res) => {
  res.json({
    dirty: getSetting('content_dirty', '0') === '1',
    lastPublishAt: getSetting('last_publish_at', ''),
    lastImportAt: getSetting('last_import_at', ''),
    history: db.prepare('SELECT * FROM publishes ORDER BY id DESC LIMIT 10').all(),
  });
});

api.post('/publish', editor, async (req, res) => {
  try {
    const result = await publishSite({ userId: req.user.id, dryRun: Boolean(req.body?.dryRun) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: config.nodeEnv === 'development' ? err.stack : undefined });
  }
});

api.post('/import', owner, (req, res) => {
  try {
    runImport();
    logActivity(req.user.id, 'import', 'site', null, 'Re-imported content from the static site');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.get('/activity', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT l.*, u.name AS user_name, u.email AS user_email
         FROM activity_log l LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id DESC LIMIT 100`
      )
      .all()
  );
});

api.use('/reports', reportsRouter);
api.use('/media', mediaRouter);

export default api;
