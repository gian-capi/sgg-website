/**
 * One-shot importer: reads the existing static site and populates SQLite.
 *
 * Run with:  npm run import
 * Safe to re-run — every upsert is keyed on slug.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';
import { config, siteExists } from '../lib/config.js';
import { db, setSetting } from '../lib/db.js';

const SITE = config.siteRoot;
const log = (...a) => console.log('  ', ...a);

const read = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const load = (rel) => cheerio.load(read(rel), { decodeEntities: false });

/** Strip a leading "../" so stored paths are always site-root relative. */
const rootRel = (p) => String(p || '').replace(/^(\.\.\/)+/, '');

/** Collapse whitespace in extracted copy. */
const txt = ($el) => $el.text().replace(/\s+/g, ' ').trim();

/**
 * Turn <br>-separated markup into newline-separated plain text.
 * Uses a sentinel so incidental newlines from source indentation collapse as
 * whitespace and only real <br> tags become line breaks.
 */
const BR_TOKEN = '@@SGG_BR@@';

function multiline($, el) {
  if (!el) return '';
  const html = $(el).html() || '';
  return cheerio
    .load(html.replace(/<br\s*\/?>/gi, BR_TOKEN), { decodeEntities: false })
    .root()
    .text()
    .split(BR_TOKEN)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "August 21, 2026" -> "2026-08-21" */
function parseLongDate(s) {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(s || '');
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- artists ---

function importArtists() {
  const $ = load('artists.html');

  const upsert = db.prepare(`
    INSERT INTO artists (slug, name, specialty, bio, card_image, hero_image, meta_description,
                         page_title, status, featured, featured_image, sort_order, updated_at)
    VALUES (@slug, @name, @specialty, @bio, @card_image, @hero_image, @meta_description,
            @page_title, 'active', @featured, @featured_image, @sort_order, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name, specialty = excluded.specialty, bio = excluded.bio,
      card_image = excluded.card_image, hero_image = excluded.hero_image,
      meta_description = excluded.meta_description, page_title = excluded.page_title,
      featured = excluded.featured,
      featured_image = excluded.featured_image, sort_order = excluded.sort_order,
      updated_at = datetime('now')
  `);

  // Which artists appear in the homepage "Featured Artists" rail, and with which card art.
  const $home = load('index.html');
  const featured = new Map();
  $home('#artists a.artist-card').each((_, el) => {
    const slug = path.basename($home(el).attr('href') || '', '.html');
    featured.set(slug, rootRel($home(el).find('img').attr('src')));
  });

  // Upsert on (artist_id, image_path) so existing rows keep their id, and the
  // page views / artwork opens that reference them survive a re-import.
  const artworkUpsert = db.prepare(`
    INSERT INTO artworks (artist_id, title, image_path, thumb_path, sort_order, in_catalogue, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(artist_id, image_path) DO UPDATE SET
      title = excluded.title, thumb_path = excluded.thumb_path,
      sort_order = excluded.sort_order, in_catalogue = 1, updated_at = datetime('now')
  `);

  let n = 0;
  let works = 0;

  $('a.artist-card').each((i, el) => {
    const href = $(el).attr('href') || '';
    const slug = path.basename(href, '.html');
    const name = txt($(el).find('p.display'));
    const cardImage = rootRel($(el).find('img').attr('src'));

    // The subtitle is a specialty for represented artists, or "N works" otherwise.
    const sub = txt($(el).find('p').eq(1));
    const specialty = /^\d+\s+works?$/i.test(sub) ? '' : sub;

    // Pull the richer detail from the artist's own page when it exists.
    let bio = '';
    let heroImage = '';
    let metaDescription = '';
    let pageTitle = '';
    const detailRel = path.join('artist', `${slug}.html`);

    if (fs.existsSync(path.join(SITE, detailRel))) {
      const $a = load(detailRel);
      metaDescription = $a('meta[name="description"]').attr('content') || '';
      pageTitle = $a('title').text();
      heroImage = rootRel($a('img.artist-hero-photo').attr('src'));

      // Bios run to several paragraphs; keep them all, separated by a blank line.
      const paragraphs = $a('h1.display')
        .first()
        .parent()
        .find('p.copy')
        .map((_, p) => txt($a(p)))
        .get()
        .filter((t) => t && !/^Biography coming soon/i.test(t));
      bio = paragraphs.join('\n\n');
    }

    upsert.run({
      slug,
      name,
      specialty,
      bio,
      card_image: cardImage,
      hero_image: heroImage,
      meta_description: metaDescription,
      page_title: pageTitle,
      featured: featured.has(slug) ? 1 : 0,
      featured_image: featured.get(slug) || '',
      sort_order: i,
    });
    n += 1;

    // Catalogue: sync from the artist page, keeping ids stable.
    if (fs.existsSync(path.join(SITE, detailRel))) {
      const artistId = getArtistIdBySlug(slug);
      const $a = load(detailRel);
      const seen = [];
      $a('figure[data-lb-src]').each((j, fig) => {
        const full = rootRel($a(fig).attr('data-lb-src'));
        const thumb = rootRel($a(fig).find('img').attr('src'));
        const title = txt($a(fig).find('figcaption'));
        artworkUpsert.run(artistId, title, full, thumb, j);
        seen.push(full);
        works += 1;
      });
      // Drop catalogue rows whose image is no longer on the page. Release-only
      // pieces live outside the catalogue, so they are never pruned here.
      const placeholders = seen.map(() => '?').join(',') || "''";
      db.prepare(
        `DELETE FROM artworks
          WHERE artist_id = ? AND in_catalogue = 1 AND is_release = 0
            AND image_path NOT IN (${placeholders})`
      ).run(artistId, ...seen);
    }
  });

  log(`artists: ${n}, catalogue works: ${works}`);
}

const getArtistIdBySlug = (slug) => db.prepare('SELECT id FROM artists WHERE slug = ?').get(slug)?.id ?? null;
const getGalleryIdBySlug = (slug) => db.prepare('SELECT id FROM galleries WHERE slug = ?').get(slug)?.id ?? null;

// -------------------------------------------------------------- galleries ---

function importGalleries() {
  const $home = load('index.html');

  const upsert = db.prepare(`
    INSERT INTO galleries (slug, brand, name, location, address, short_address, phone, email,
                           hours, instagram_url, facebook_url, logo, page_title, meta_description,
                           sort_order, updated_at)
    VALUES (@slug, @brand, @name, @location, @address, @short_address, @phone, @email,
            @hours, @instagram_url, @facebook_url, @logo, @page_title, @meta_description,
            @sort_order, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      brand = excluded.brand, name = excluded.name, location = excluded.location,
      address = excluded.address, short_address = excluded.short_address, phone = excluded.phone,
      email = excluded.email, hours = excluded.hours, instagram_url = excluded.instagram_url,
      facebook_url = excluded.facebook_url, logo = excluded.logo,
      page_title = excluded.page_title, meta_description = excluded.meta_description,
      sort_order = excluded.sort_order, updated_at = datetime('now')
  `);

  // Homepage cards carry the 2-line short address used in the galleries
  // carousel, and their order is the order the galleries are presented in.
  const shortAddr = new Map();
  const homeOrder = [];
  $home('#galleries a.gallery-card').each((_, el) => {
    const slug = path.basename($home(el).attr('href') || '', '.html');
    shortAddr.set(slug, multiline($home, $home(el).find('p.text-white\\/65').get(0)));
    homeOrder.push(slug);
  });

  const files = fs
    .readdirSync(path.join(SITE, 'gallery'))
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => {
      const ia = homeOrder.indexOf(path.basename(a, '.html'));
      const ib = homeOrder.indexOf(path.basename(b, '.html'));
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  let photos = 0;
  let cons = 0;

  files.forEach((file, i) => {
    const slug = path.basename(file, '.html');
    const $ = load(path.join('gallery', file));

    const logo = rootRel($('h1.display').first().prev('img').attr('src'));
    const name = txt($('h1.display').first());
    const location = txt($('h1.display').first().nextAll('p.mono').first());

    // Each detail block is labelled by a small uppercase mono heading.
    const block = (label) => {
      let found = null;
      $('p.mono').each((_, el) => {
        if (txt($(el)).toLowerCase() === label.toLowerCase()) found = $(el);
      });
      return found;
    };

    const address = multiline($, block('Location')?.next('p').get(0));
    const hours = multiline($, block('Hours')?.next()?.next('p').get(0) || block('Hours')?.nextAll('p').get(0));

    const phone = txt($('a[href^="tel:"]').first());
    const email = txt($('a[href^="mailto:"]').first()) || 'info@signaturegalleries.com';

    upsert.run({
      slug,
      brand: /signature/i.test(logo) ? 'signature' : 'wyland',
      name,
      location,
      address,
      short_address: shortAddr.get(slug) || '',
      phone,
      email,
      hours,
      instagram_url: $('a[href*="instagram.com"]').first().attr('href') || '',
      facebook_url: $('a[href*="facebook.com"]').first().attr('href') || '',
      logo,
      page_title: $('title').text(),
      meta_description: $('meta[name="description"]').attr('content') || '',
      sort_order: i,
    });

    const gid = getGalleryIdBySlug(slug);

    db.prepare('DELETE FROM gallery_photos WHERE gallery_id = ?').run(gid);
    const photoIns = db.prepare('INSERT INTO gallery_photos (gallery_id, path, sort_order) VALUES (?, ?, ?)');
    // Galleries with several photos use a carousel; a single-photo gallery
    // renders one plain image in the same slot.
    const photoEls = $('.gcar-track img').length
      ? $('.gcar-track img')
      : $(`img[src*="images/galleries/${slug}/"]`).first();
    photoEls.each((j, img) => {
      photoIns.run(gid, rootRel($(img).attr('src')), j);
      photos += 1;
    });

    db.prepare('DELETE FROM consultants WHERE gallery_id = ?').run(gid);
    const conIns = db.prepare(
      'INSERT INTO consultants (gallery_id, name, title, email, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $('a.consultant-email').each((j, a) => {
      const $card = $(a).closest('.card');
      conIns.run(
        gid,
        txt($card.find('p.display')),
        txt($card.find('p.mono')),
        txt($(a)),
        rootRel($card.find('img').attr('src')), // empty when the card uses the blank avatar
        j
      );
      cons += 1;
    });
  });

  log(`galleries: ${files.length}, photos: ${photos}, consultants: ${cons}`);
}

// ----------------------------------------------------------------- events ---

function importEvents() {
  const files = fs.readdirSync(path.join(SITE, 'event')).filter((f) => f.endsWith('.html'));

  const upsert = db.prepare(`
    INSERT INTO events (slug, title, start_date, end_date, location, gallery_id, artist_id,
                        banner_image, description, schedule, page_title, meta_description,
                        sort_order, updated_at)
    VALUES (@slug, @title, @start_date, @end_date, @location, @gallery_id, @artist_id,
            @banner_image, @description, @schedule, @page_title, @meta_description,
            @sort_order, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title, start_date = excluded.start_date, end_date = excluded.end_date,
      location = excluded.location, gallery_id = excluded.gallery_id, artist_id = excluded.artist_id,
      banner_image = excluded.banner_image, description = excluded.description,
      schedule = excluded.schedule, page_title = excluded.page_title,
      meta_description = excluded.meta_description,
      sort_order = excluded.sort_order, updated_at = datetime('now')
  `);

  // The homepage event cards state each show's date and location in a single line.
  const $home = load('index.html');
  const meta = new Map();
  $home('#events a.card').each((_, el) => {
    const slug = path.basename($home(el).attr('href') || '', '.html');
    const line = txt($home(el).find('p.mono'));
    const [datePart, locPart] = line.split('·').map((s) => s.trim());
    meta.set(slug, { date: parseLongDate(datePart), location: locPart || '' });
  });

  files.forEach((file, i) => {
    const slug = path.basename(file, '.html');
    const $ = load(path.join('event', file));

    const artistHref = $('a[href^="../artist/"]').first().attr('href') || '';
    const galleryHref = $('a[href^="../gallery/"]').first().attr('href') || '';

    const m = meta.get(slug) || {};
    const chip = $('.datechip-lg');
    const chipDate = parseLongDate(`${txt(chip.find('.m'))} ${txt(chip.find('.d'))}, ${txt(chip.find('.y'))}`);

    upsert.run({
      slug,
      title: txt($('h1.display').first()),
      start_date: m.date || chipDate || '',
      end_date: null,
      location: m.location || '',
      gallery_id: getGalleryIdBySlug(path.basename(galleryHref, '.html')),
      artist_id: getArtistIdBySlug(path.basename(artistHref, '.html')),
      banner_image: rootRel($('.event-hero img').attr('src')),
      description: txt($('h1.display').first().nextAll('p.copy').first()),
      schedule: $('h1.display')
        .first()
        .nextAll('ul')
        .first()
        .find('li')
        .map((_, li) => txt($(li)))
        .get()
        .join('\n'),
      page_title: $('title').text(),
      meta_description: $('meta[name="description"]').attr('content') || '',
      sort_order: i,
    });
  });

  log(`events: ${files.length}`);
}

// ------------------------------------------------- homepage: hero + faq + releases ---

function importHomepage() {
  const $ = load('index.html');

  // --- hero slides ---------------------------------------------------------
  db.prepare('DELETE FROM hero_slides').run();
  const slideIns = db.prepare(`
    INSERT INTO hero_slides (kind, eyebrow, headline, body, cta_label, cta_href,
                             cta2_label, cta2_href, image, config, sort_order)
    VALUES (@kind, @eyebrow, @headline, @body, @cta_label, @cta_href,
            @cta2_label, @cta2_href, @image, @config, @sort_order)
  `);

  const KINDS = ['welcome', 'event', 'releases', 'statement'];

  $('.hero-slide').each((i, el) => {
    const $s = $(el);
    const $heading = $s.find('h1.display, h2.display').first();
    const buttons = $s.find('a.btn-pill, a.btn-ghost');

    // Keep each image's alt text alongside its path so republishing preserves it.
    const imgList = (sel) =>
      $s.find(sel).map((_, im) => ({ src: rootRel($(im).attr('src')), alt: $(im).attr('alt') || '' })).get();

    const cfg = {};
    if (KINDS[i] === 'welcome') {
      cfg.logos = imgList('.logo-row img');
      cfg.rotator = imgList('.art-rotator img');
    }
    if (KINDS[i] === 'event') {
      cfg.detail = $s
        .find('.hair p')
        .map((_, p) => $(p).html().trim())
        .get();
    }
    if (KINDS[i] === 'releases') {
      cfg.grid = imgList('.grid img');
    }
    if (KINDS[i] === 'statement') {
      cfg.caption = $s.find('p.mono').last().html()?.trim() || '';
    }
    const heroImg = $s.find('> img').get(0) || $s.find('.hidden.lg\\:flex img').get(0);
    if (heroImg) cfg.imageAlt = $(heroImg).attr('alt') || '';

    slideIns.run({
      kind: KINDS[i] || 'standard',
      eyebrow: txt($s.find('p.mono.text-\\[\\.7rem\\]').first()),
      headline: multiline($, $heading.get(0)),
      body: txt($s.find('p.copy').first()),
      cta_label: txt(buttons.eq(0)),
      cta_href: buttons.eq(0).attr('href') || '',
      cta2_label: txt(buttons.eq(1)),
      cta2_href: buttons.eq(1).attr('href') || '',
      image: rootRel($s.find('> img').attr('src') || $s.find('.hidden.lg\\:flex img').attr('src')),
      config: JSON.stringify(cfg),
      sort_order: i,
    });
  });

  // --- new releases carousel ----------------------------------------------
  // Slots reference artworks living under images/artwork/. Attach them to the
  // matching artist and flag them as releases.
  db.prepare('UPDATE artworks SET is_release = 0, release_order = 0').run();
  let releases = 0;
  $('#releaseStage figure.slot').each((i, el) => {
    const $f = $(el);
    const title = ($f.attr('data-title') || '').replace(/&amp;/g, '&');
    const artistMeta = ($f.attr('data-artist') || '').split('·').map((s) => s.trim());
    const imagePath = rootRel($f.find('img').attr('src'));
    const artistName = artistMeta[0] || '';
    const artistId = db.prepare('SELECT id FROM artists WHERE name = ?').get(artistName)?.id ?? null;
    if (!artistId) return;

    const dims = artistMeta[artistMeta.length - 1] || '';
    const medium = artistMeta.length > 2 ? artistMeta[1] : '';

    const existing = db
      .prepare('SELECT id FROM artworks WHERE artist_id = ? AND image_path = ?')
      .get(artistId, imagePath);

    if (existing) {
      db.prepare(
        `UPDATE artworks SET title = ?, medium = ?, dimensions = ?, is_release = 1,
         release_order = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(title, medium, dims, i, existing.id);
    } else {
      // Carousel-only pieces: they must not appear in the artist's catalogue grid.
      db.prepare(
        `INSERT INTO artworks (artist_id, title, medium, dimensions, image_path, thumb_path,
                               is_release, release_order, sort_order, in_catalogue, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0, datetime('now'))`
      ).run(artistId, title, medium, dims, imagePath, imagePath, i, 1000 + i);
    }
    releases += 1;
  });

  // --- FAQ accordion -------------------------------------------------------
  db.prepare('DELETE FROM faqs').run();
  const faqIns = db.prepare('INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)');
  $('.acc-item').each((i, el) => {
    // Answers may contain links, so keep the inner HTML rather than plain text.
    const answer = ($(el).find('.acc-panel-inner').html() || '')
      .replace(/\s+/g, ' ')
      .trim();
    faqIns.run(txt($(el).find('.acc-btn span')), answer, i);
  });

  // --- site-wide copy that the admin should own ---------------------------
  setSetting('site_title', $('title').text());
  setSetting('site_description', $('meta[name="description"]').attr('content') || '');
  setSetting('footer_heading', txt($('footer h2.display')));
  setSetting('footer_body', txt($('footer p.copy').first()));
  setSetting('contact_email', 'info@signaturegalleries.com');
  setSetting('instagram_url', $('footer a[href*="instagram.com"]').attr('href') || '');
  setSetting('facebook_url', $('footer a[href*="facebook.com"]').attr('href') || '');
  setSetting('releases_heading', txt($('#releases h2.display')));
  setSetting('releases_body', txt($('#releases p.copy').first()));
  setSetting('artists_heading', txt($('#artists h2.display')));
  setSetting('artists_body', txt($('#artists p.copy').first()));
  setSetting('events_heading', txt($('#events h2.display')));
  setSetting('galleries_heading', txt($('#galleries h2.display')));
  setSetting('galleries_body', txt($('#galleries p.copy').first()));
  setSetting('credit_name', txt($('footer p').last().find('span')));

  log(`hero slides: ${$('.hero-slide').length}, releases: ${releases}, faqs: ${$('.acc-item').length}`);
}

// ------------------------------------------------------------------- main ---

export function runImport() {
  if (!siteExists()) {
    throw new Error(`No index.html found at SITE_ROOT: ${config.siteRoot}`);
  }
  console.log(`Importing site from ${config.siteRoot}`);
  db.transaction(() => {
    importArtists();
    importGalleries();
    importEvents();
    importHomepage();
    setSetting('last_import_at', new Date().toISOString());
    setSetting('content_dirty', '0');
  })();
  console.log('Import complete.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runImport();
}
