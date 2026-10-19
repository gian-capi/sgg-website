/**
 * Public ingest endpoints. Called by the tracker snippet baked into published
 * pages and by the site's own newsletter / contact forms. No session required.
 */
import express from 'express';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';

const collect = express.Router();

/** Allow the published site (wherever it is hosted) to post here. */
collect.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = config.trackingOrigins;
  if (allowed.includes('*')) res.set('Access-Control-Allow-Origin', '*');
  else if (origin && allowed.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/** Classify a site path into a page type plus the entity it refers to. */
function classify(rawPath) {
  const p = String(rawPath || '/').split('?')[0].replace(/^https?:\/\/[^/]+/, '');
  const file = p.split('/').filter(Boolean).pop() || 'index.html';
  const slug = file.replace(/\.html$/, '');

  if (/\/artist\//.test(p)) {
    const row = db.prepare('SELECT id FROM artists WHERE slug = ?').get(slug);
    return { page_type: 'artist', entity_type: 'artist', entity_id: row?.id ?? null };
  }
  if (/\/event\//.test(p)) {
    const row = db.prepare('SELECT id FROM events WHERE slug = ?').get(slug);
    return { page_type: 'event', entity_type: 'event', entity_id: row?.id ?? null };
  }
  if (/\/gallery\//.test(p)) {
    const row = db.prepare('SELECT id FROM galleries WHERE slug = ?').get(slug);
    return { page_type: 'gallery', entity_type: 'gallery', entity_id: row?.id ?? null };
  }
  if (slug === 'artists') return { page_type: 'artists', entity_type: '', entity_id: null };
  if (slug === 'index' || p === '/' || p === '') return { page_type: 'home', entity_type: '', entity_id: null };
  return { page_type: 'other', entity_type: '', entity_id: null };
}

function deviceOf(ua = '') {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

const clip = (s, n) => String(s ?? '').slice(0, n);

/** Pageview. Body: { path, referrer, vid, sid } */
collect.post('/view', (req, res) => {
  const { path: p, referrer, vid, sid } = req.body || {};
  const c = classify(p);
  db.prepare(
    `INSERT INTO page_views (path, page_type, entity_type, entity_id, referrer, visitor_id, session_id, device)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clip(p, 300), c.page_type, c.entity_type, c.entity_id,
    clip(referrer, 300), clip(vid, 64), clip(sid, 64), deviceOf(req.headers['user-agent'])
  );
  res.sendStatus(204);
});

/** Interaction. Body: { name, path, label, artwork, vid, sid } */
collect.post('/event', (req, res) => {
  const { name, path: p, label, artwork, vid, sid } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  let entityType = '';
  let entityId = null;

  // An artwork open is reported with the artwork's image path, which is unique.
  if (artwork) {
    const row = db.prepare('SELECT id FROM artworks WHERE image_path = ? OR thumb_path = ?').get(artwork, artwork);
    if (row) { entityType = 'artwork'; entityId = row.id; }
  }
  if (!entityId) {
    const c = classify(p);
    entityType = c.entity_type;
    entityId = c.entity_id;
  }

  db.prepare(
    `INSERT INTO interactions (name, path, entity_type, entity_id, label, visitor_id, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(clip(name, 40), clip(p, 300), entityType, entityId, clip(label, 200), clip(vid, 64), clip(sid, 64));
  res.sendStatus(204);
});

/** Newsletter / contact capture. Body: { email, name, message, type, path } */
collect.post('/inquiry', (req, res) => {
  const { email, name, message, type, path: p } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  const c = classify(p);
  db.prepare(
    `INSERT INTO inquiries (email, name, message, type, entity_type, entity_id, source_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clip(email, 200).toLowerCase(), clip(name, 120), clip(message, 4000),
    ['Newsletter', 'Contact', 'Artwork', 'Event'].includes(type) ? type : 'Newsletter',
    c.entity_type, c.entity_id, clip(p, 300)
  );
  res.json({ ok: true });
});

export default collect;
