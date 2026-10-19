/** Reporting queries behind the dashboard and Reports screens. */
import express from 'express';
import { db } from '../lib/db.js';

const reports = express.Router();

/** Resolve ?days= into a SQLite datetime boundary. */
function since(req, fallback = 30) {
  const days = Math.min(Math.max(Number(req.query.days) || fallback, 1), 365);
  return { days, cutoff: `-${days} days` };
}

/** Headline numbers plus the change against the preceding equal-length window. */
reports.get('/overview', (req, res) => {
  const { days, cutoff } = since(req);
  const prev = `-${days * 2} days`;

  const scalar = (sql, ...p) => db.prepare(sql).get(...p).n;

  const views = scalar(`SELECT COUNT(*) n FROM page_views WHERE created_at >= datetime('now', ?)`, cutoff);
  const viewsPrev = scalar(
    `SELECT COUNT(*) n FROM page_views WHERE created_at >= datetime('now', ?) AND created_at < datetime('now', ?)`,
    prev, cutoff
  );
  const visitors = scalar(
    `SELECT COUNT(DISTINCT visitor_id) n FROM page_views WHERE created_at >= datetime('now', ?) AND visitor_id <> ''`,
    cutoff
  );
  const visitorsPrev = scalar(
    `SELECT COUNT(DISTINCT visitor_id) n FROM page_views
     WHERE created_at >= datetime('now', ?) AND created_at < datetime('now', ?) AND visitor_id <> ''`,
    prev, cutoff
  );
  const inquiries = scalar(`SELECT COUNT(*) n FROM inquiries WHERE created_at >= datetime('now', ?)`, cutoff);
  const inquiriesPrev = scalar(
    `SELECT COUNT(*) n FROM inquiries WHERE created_at >= datetime('now', ?) AND created_at < datetime('now', ?)`,
    prev, cutoff
  );
  const artworkOpens = scalar(
    `SELECT COUNT(*) n FROM interactions WHERE name = 'artwork_open' AND created_at >= datetime('now', ?)`,
    cutoff
  );
  const artworkOpensPrev = scalar(
    `SELECT COUNT(*) n FROM interactions WHERE name = 'artwork_open'
     AND created_at >= datetime('now', ?) AND created_at < datetime('now', ?)`,
    prev, cutoff
  );

  res.json({
    days,
    views: { value: views, previous: viewsPrev },
    visitors: { value: visitors, previous: visitorsPrev },
    inquiries: { value: inquiries, previous: inquiriesPrev },
    artworkOpens: { value: artworkOpens, previous: artworkOpensPrev },
    newInquiries: scalar(`SELECT COUNT(*) n FROM inquiries WHERE status = 'New'`),
    catalog: {
      artists: scalar(`SELECT COUNT(*) n FROM artists WHERE status = 'active'`),
      artworks: scalar(`SELECT COUNT(*) n FROM artworks WHERE status = 'active'`),
      events: scalar(`SELECT COUNT(*) n FROM events WHERE status = 'published'`),
      galleries: scalar(`SELECT COUNT(*) n FROM galleries WHERE status = 'active'`),
      upcomingEvents: scalar(`SELECT COUNT(*) n FROM events WHERE start_date >= date('now')`),
    },
  });
});

/** Daily traffic series for the trend chart. */
reports.get('/timeseries', (req, res) => {
  const { days, cutoff } = since(req);
  const rows = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
       FROM page_views WHERE created_at >= datetime('now', ?) GROUP BY day ORDER BY day`
    )
    .all(cutoff);
  const inq = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS inquiries
       FROM inquiries WHERE created_at >= datetime('now', ?) GROUP BY day`
    )
    .all(cutoff);
  const inqBy = Object.fromEntries(inq.map((r) => [r.day, r.inquiries]));

  // Emit a dense series so the chart has no gaps.
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const hit = rows.find((r) => r.day === d);
    out.push({ day: d, views: hit?.views || 0, visitors: hit?.visitors || 0, inquiries: inqBy[d] || 0 });
  }
  res.json(out);
});

/** Most viewed artists, with the interest signals they generated. */
reports.get('/top-artists', (req, res) => {
  const { cutoff } = since(req);
  res.json(
    db
      .prepare(
        `SELECT a.id, a.name, a.slug, a.card_image, a.specialty,
                COUNT(v.id) AS views,
                COUNT(DISTINCT v.visitor_id) AS visitors,
                (SELECT COUNT(*) FROM interactions i
                   JOIN artworks w ON w.id = i.entity_id
                  WHERE i.entity_type = 'artwork' AND w.artist_id = a.id
                    AND i.name = 'artwork_open' AND i.created_at >= datetime('now', ?)) AS artwork_opens,
                (SELECT COUNT(*) FROM inquiries q
                  WHERE q.entity_type = 'artist' AND q.entity_id = a.id
                    AND q.created_at >= datetime('now', ?)) AS inquiries
         FROM artists a
         LEFT JOIN page_views v
           ON v.entity_type = 'artist' AND v.entity_id = a.id AND v.created_at >= datetime('now', ?)
         GROUP BY a.id
         HAVING views > 0 OR artwork_opens > 0 OR inquiries > 0
         ORDER BY views DESC, artwork_opens DESC
         LIMIT 25`
      )
      .all(cutoff, cutoff, cutoff)
  );
});

/** Artworks ranked by lightbox opens — the clearest "interest" signal on the site. */
reports.get('/top-artworks', (req, res) => {
  const { cutoff } = since(req);
  res.json(
    db
      .prepare(
        `SELECT w.id, w.title, w.image_path, w.thumb_path, w.dimensions, w.medium, w.is_release,
                a.name AS artist_name, a.slug AS artist_slug,
                COUNT(i.id) AS opens, COUNT(DISTINCT i.visitor_id) AS visitors
         FROM artworks w
         JOIN artists a ON a.id = w.artist_id
         JOIN interactions i ON i.entity_type = 'artwork' AND i.entity_id = w.id
              AND i.name = 'artwork_open' AND i.created_at >= datetime('now', ?)
         GROUP BY w.id ORDER BY opens DESC LIMIT 25`
      )
      .all(cutoff)
  );
});

/**
 * Event performance. "Conversion" here is the share of event-page visitors who
 * took an action that indicates real intent — calling the gallery, emailing,
 * clicking through to the gallery page, or submitting an inquiry.
 */
reports.get('/events', (req, res) => {
  const { cutoff } = since(req);
  res.json(
    db
      .prepare(
        `SELECT e.id, e.title, e.slug, e.start_date, e.location, e.banner_image,
                a.name AS artist_name, g.name AS gallery_name,
                COUNT(DISTINCT v.id) AS views,
                COUNT(DISTINCT v.visitor_id) AS visitors,
                (SELECT COUNT(*) FROM interactions i
                  WHERE i.entity_type = 'event' AND i.entity_id = e.id
                    AND i.name IN ('phone_click','email_click','cta_click')
                    AND i.created_at >= datetime('now', ?)) AS actions,
                -- Distinct visitors who acted: the denominator of conversion,
                -- so the rate can never exceed 100%.
                (SELECT COUNT(DISTINCT i.visitor_id) FROM interactions i
                  WHERE i.entity_type = 'event' AND i.entity_id = e.id
                    AND i.name IN ('phone_click','email_click','cta_click')
                    AND i.visitor_id <> ''
                    AND i.created_at >= datetime('now', ?)) AS converting_visitors,
                (SELECT COUNT(*) FROM inquiries q
                  WHERE q.entity_type = 'event' AND q.entity_id = e.id
                    AND q.created_at >= datetime('now', ?)) AS inquiries
         FROM events e
         LEFT JOIN artists a ON a.id = e.artist_id
         LEFT JOIN galleries g ON g.id = e.gallery_id
         LEFT JOIN page_views v
           ON v.entity_type = 'event' AND v.entity_id = e.id AND v.created_at >= datetime('now', ?)
         GROUP BY e.id ORDER BY e.start_date`
      )
      .all(cutoff, cutoff, cutoff, cutoff)
  );
});

/** Gallery page performance. */
reports.get('/galleries', (req, res) => {
  const { cutoff } = since(req);
  res.json(
    db
      .prepare(
        `SELECT g.id, g.name, g.slug, g.location, g.brand,
                COUNT(DISTINCT v.id) AS views,
                COUNT(DISTINCT v.visitor_id) AS visitors,
                (SELECT COUNT(*) FROM interactions i
                  WHERE i.entity_type = 'gallery' AND i.entity_id = g.id
                    AND i.name = 'phone_click' AND i.created_at >= datetime('now', ?)) AS calls
         FROM galleries g
         LEFT JOIN page_views v
           ON v.entity_type = 'gallery' AND v.entity_id = g.id AND v.created_at >= datetime('now', ?)
         GROUP BY g.id ORDER BY views DESC`
      )
      .all(cutoff, cutoff)
  );
});

/** Traffic sources and device split. */
reports.get('/sources', (req, res) => {
  const { cutoff } = since(req);
  const referrers = db
    .prepare(
      `SELECT CASE
                WHEN referrer = '' THEN 'Direct'
                ELSE replace(replace(substr(referrer, instr(referrer,'//')+2), 'www.',''), '/', ' /')
              END AS source,
              COUNT(*) AS views
       FROM page_views WHERE created_at >= datetime('now', ?)
       GROUP BY source ORDER BY views DESC LIMIT 12`
    )
    .all(cutoff);
  const devices = db
    .prepare(
      `SELECT device, COUNT(*) AS views FROM page_views
       WHERE created_at >= datetime('now', ?) GROUP BY device ORDER BY views DESC`
    )
    .all(cutoff);
  const pages = db
    .prepare(
      `SELECT path, page_type, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
       FROM page_views WHERE created_at >= datetime('now', ?)
       GROUP BY path ORDER BY views DESC LIMIT 20`
    )
    .all(cutoff);
  res.json({ referrers, devices, pages });
});

export default reports;
