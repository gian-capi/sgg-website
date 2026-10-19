import express from 'express';
import { db, markDirty, logActivity } from './db.js';
import { requireRole } from './auth.js';

/** Turn a name into a URL slug. */
export function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Ensure a slug is unique within a table, appending -2, -3, ... as needed. */
export function uniqueSlug(table, base, ignoreId = null) {
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
  let slug = base || 'item';
  let n = 1;
  for (;;) {
    const row = stmt.get(slug);
    if (!row || row.id === ignoreId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/** Keep only known columns, so callers cannot write arbitrary fields. */
export function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (Object.hasOwn(body, f)) out[f] = body[f];
  }
  return out;
}

/**
 * Build a REST router for one table.
 *
 *   fields      writable column names
 *   listQuery   optional SQL returning the collection
 *   beforeWrite hook (data, {req, id, isCreate}) => data
 */
export function crudRouter({
  table,
  fields,
  label = table,
  listQuery = null,
  listParams = () => [],
  orderBy = 'sort_order, id',
  beforeWrite = (d) => d,
  afterWrite = () => {},
}) {
  const router = express.Router();
  const editor = requireRole('editor');

  router.get('/', (req, res) => {
    const rows = listQuery
      ? db.prepare(listQuery).all(...listParams(req))
      : db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: `${label} not found` });
    res.json(row);
  });

  router.post('/', editor, (req, res) => {
    const data = beforeWrite(pick(req.body, fields), { req, isCreate: true });
    const cols = Object.keys(data);
    if (!cols.length) return res.status(400).json({ error: 'No writable fields supplied' });
    const info = db
      .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => `@${c}`).join(',')})`)
      .run(data);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
    markDirty();
    logActivity(req.user.id, 'create', label, row.id, `Created ${label} “${row.name || row.title || row.id}”`);
    afterWrite(row, { req, isCreate: true });
    res.status(201).json(row);
  });

  router.put('/:id', editor, (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: `${label} not found` });

    const data = beforeWrite(pick(req.body, fields), { req, id: existing.id, isCreate: false });
    const cols = Object.keys(data);
    if (cols.length) {
      const sets = cols.map((c) => `${c} = @${c}`).join(', ');
      const hasUpdatedAt = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === 'updated_at');
      db.prepare(
        `UPDATE ${table} SET ${sets}${hasUpdatedAt ? ", updated_at = datetime('now')" : ''} WHERE id = @id`
      ).run({ ...data, id: existing.id });
    }
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(existing.id);
    markDirty();
    logActivity(req.user.id, 'update', label, row.id, `Updated ${label} “${row.name || row.title || row.id}”`);
    afterWrite(row, { req, isCreate: false });
    res.json(row);
  });

  router.delete('/:id', editor, (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: `${label} not found` });
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    markDirty();
    logActivity(req.user.id, 'delete', label, row.id, `Deleted ${label} “${row.name || row.title || row.id}”`);
    res.json({ ok: true });
  });

  /** Persist a drag-and-drop ordering: body = { ids: [...] } */
  router.post('/reorder', editor, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
    db.transaction(() => ids.forEach((id, i) => stmt.run(i, id)))();
    markDirty();
    res.json({ ok: true, count: ids.length });
  });

  return router;
}
