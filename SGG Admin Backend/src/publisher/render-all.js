/**
 * Renders every page of the site from the database into memory.
 * Returns Map<relative path, file contents>. Shared by publish and verify.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';
import { buildTracker } from './tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(__dirname, 'templates');

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const parts = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return { y, m, d };
};

export const fmt = {
  mon: (iso) => MONTHS_SHORT[parts(iso).m - 1] || '',
  day: (iso) => String(parts(iso).d || '').padStart(2, '0'),
  year: (iso) => String(parts(iso).y || ''),
  longDate: (iso) => {
    const { y, m, d } = parts(iso);
    return m ? `${MONTHS_LONG[m - 1]} ${d}, ${y}` : '';
  },
  tel: (phone) => String(phone || '').replace(/\D/g, ''),
  /** Render newline-separated stored text as <br>-separated HTML. */
  br: (text) => String(text || '').split('\n').map(esc).join('<br>'),
  /** "Joseph Capicotto · charcoal-pastel · 18x24"" for the releases carousel. */
  releaseMeta: (w) => [w.artist_name, w.medium, w.dimensions].filter(Boolean).join(' · '),
};

export const mailto = (email) =>
  `mailto:${email}?subject=Enquiry%20for%20Signature%20Gallery%20Group&amp;body=Hello%20Signature%20Gallery%20Group%2C%0D%0A%0D%0A`;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Trim long copy to a word boundary, as the event "Featuring" card does. */
export function excerpt(text, limit = 420) {
  const s = String(text || '');
  if (s.length <= limit) return s;
  return s.slice(0, limit).replace(/\s+\S*$/, '') + '…';
}

function loadSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return {
    site_title: 'Signature Gallery Group — Original Fine Art',
    site_description: '',
    footer_heading: 'Join Us',
    footer_body: '',
    contact_email: 'info@signaturegalleries.com',
    instagram_url: '',
    facebook_url: '',
    releases_heading: 'New Releases',
    releases_body: '',
    artists_heading: 'Featured Artists',
    artists_body: '',
    events_heading: 'Upcoming Art Shows',
    galleries_heading: 'Our Art Galleries',
    galleries_body: '',
    credit_name: 'Giancarlo Capicotto',
    ...Object.fromEntries(rows.map((r) => [r.key, r.value])),
  };
}

function render(tpl, data) {
  const file = path.join(TPL, tpl);
  return ejs.render(fs.readFileSync(file, 'utf8'), data, { filename: file });
}

export function renderAll() {
  const s = loadSettings();
  const base = { s, fmt, mailto, year: new Date().getFullYear() };
  const today = todayISO();

  const artists = db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM artworks w
                WHERE w.artist_id = a.id AND w.status='active' AND w.in_catalogue = 1) AS work_count
       FROM artists a WHERE a.status = 'active' ORDER BY a.sort_order, a.name`
    )
    .all();

  const galleries = db
    .prepare("SELECT * FROM galleries WHERE status = 'active' ORDER BY sort_order, name")
    .all()
    .map((g) => ({
      ...g,
      photo:
        db.prepare('SELECT path FROM gallery_photos WHERE gallery_id = ? ORDER BY sort_order LIMIT 1').get(g.id)
          ?.path || '',
    }));

  const events = db
    .prepare(
      `SELECT e.* FROM events e WHERE e.status = 'published' ORDER BY e.start_date`
    )
    .all();

  const upcoming = events.filter((e) => e.start_date >= today);

  const releases = db
    .prepare(
      `SELECT w.*, a.name AS artist_name FROM artworks w JOIN artists a ON a.id = w.artist_id
       WHERE w.is_release = 1 AND w.status = 'active' ORDER BY w.release_order, w.id`
    )
    .all();

  const slides = db
    .prepare('SELECT * FROM hero_slides WHERE active = 1 ORDER BY sort_order, id')
    .all()
    .map((sl) => {
      let cfgObj = {};
      try {
        cfgObj = JSON.parse(sl.config || '{}');
      } catch {
        cfgObj = {};
      }
      return { ...sl, cfgObj };
    });

  const faqs = db.prepare('SELECT * FROM faqs WHERE active = 1 ORDER BY sort_order, id').all();
  const featured = artists.filter((a) => a.featured);

  const outputs = new Map();

  outputs.set(
    'index.html',
    render('index.ejs', {
      ...base,
      prefix: '',
      slides,
      releases,
      featuredRows: chunk(featured, 5),
      events: upcoming,
      galleries,
      faqs,
    })
  );

  outputs.set('artists.html', render('artists.ejs', { ...base, prefix: '', artists }));

  for (const a of artists) {
    outputs.set(
      path.posix.join('artist', `${a.slug}.html`),
      render('artist.ejs', {
        ...base,
        prefix: '../',
        a,
        bioParagraphs: String(a.bio || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        // Release-only pieces live in the homepage carousel, not the catalogue.
        works: db
          .prepare(
            "SELECT * FROM artworks WHERE artist_id = ? AND status = 'active' AND in_catalogue = 1 ORDER BY sort_order, id"
          )
          .all(a.id),
        events: upcoming.filter((e) => e.artist_id === a.id),
        moreArtists: artists.filter((o) => o.id !== a.id).slice(0, 12),
      })
    );
  }

  for (const e of events) {
    const artist = e.artist_id ? artists.find((a) => a.id === e.artist_id) : null;
    const gallery = e.gallery_id ? galleries.find((g) => g.id === e.gallery_id) : null;
    outputs.set(
      path.posix.join('event', `${e.slug}.html`),
      render('event.ejs', {
        ...base,
        prefix: '../',
        e,
        schedule: String(e.schedule || '').split('\n').filter(Boolean),
        artist,
        // The Featuring card shows the opening paragraph, trimmed to fit.
        artistBioIntro: excerpt(String(artist?.bio || '').split(/\n{2,}/)[0] || ''),
        gallery,
        galleryPhoto: gallery?.photo || '',
        featuredWorks: artist
          ? db
              .prepare(
                "SELECT * FROM artworks WHERE artist_id = ? AND status='active' AND in_catalogue = 1 ORDER BY sort_order LIMIT 4"
              )
              .all(artist.id)
          : [],
        otherEvents: upcoming.filter((o) => o.id !== e.id).slice(0, 3),
      })
    );
  }

  for (const g of galleries) {
    outputs.set(
      path.posix.join('gallery', `${g.slug}.html`),
      render('gallery.ejs', {
        ...base,
        prefix: '../',
        g,
        photos: db.prepare('SELECT * FROM gallery_photos WHERE gallery_id = ? ORDER BY sort_order, id').all(g.id),
        consultants: db.prepare('SELECT * FROM consultants WHERE gallery_id = ? ORDER BY sort_order, id').all(g.id),
        events: upcoming.filter((e) => e.gallery_id === g.id),
        others: galleries.filter((o) => o.id !== g.id),
      })
    );
  }

  outputs.set(path.posix.join('assets', 'track.js'), buildTracker(config.publicOrigin));

  return outputs;
}
