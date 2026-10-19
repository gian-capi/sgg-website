/**
 * Image browsing and upload. Files are written straight into the live site's
 * images/ tree so that published pages reference them without a copy step.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../lib/config.js';
import { requireRole } from '../lib/auth.js';
import { logActivity } from '../lib/db.js';

const media = express.Router();
const IMAGES = path.join(config.siteRoot, 'images');

/** Reject any path that tries to escape the site's images/ directory. */
function safeSubdir(sub) {
  const clean = String(sub || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const abs = path.resolve(IMAGES, clean);
  if (abs !== IMAGES && !abs.startsWith(IMAGES + path.sep)) {
    throw new Error('Path escapes the images directory');
  }
  return { abs, rel: path.relative(IMAGES, abs).split(path.sep).join('/') };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|avif|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only JPEG, PNG, WebP, AVIF or GIF images are accepted'), ok);
  },
});

/** List folders and images under images/<sub>. */
media.get('/', (req, res) => {
  let target;
  try {
    target = safeSubdir(req.query.dir);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!fs.existsSync(target.abs)) return res.status(404).json({ error: 'Folder not found' });

  const entries = fs.readdirSync(target.abs, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const files = entries
    .filter((e) => e.isFile() && /\.(jpe?g|png|webp|avif|gif)$/i.test(e.name))
    .map((e) => {
      const rel = path.posix.join('images', target.rel, e.name);
      const { size, mtime } = fs.statSync(path.join(target.abs, e.name));
      return { name: e.name, path: rel, size, modified: mtime.toISOString() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ dir: target.rel, folders, files });
});

/** Upload one or more images into images/<dir>, optionally making thumbnails. */
media.post('/upload', requireRole('editor'), upload.array('files', 20), async (req, res) => {
  let target;
  try {
    target = safeSubdir(req.body.dir);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  fs.mkdirSync(target.abs, { recursive: true });

  const makeThumbs = req.body.thumbs === 'true' || req.body.thumbs === true;
  const written = [];

  for (const file of req.files || []) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image';

    // Never clobber an existing file.
    let name = `${base}${ext}`;
    let n = 1;
    while (fs.existsSync(path.join(target.abs, name))) {
      n += 1;
      name = `${base}-${n}${ext}`;
    }

    fs.writeFileSync(path.join(target.abs, name), file.buffer);
    const rel = path.posix.join('images', target.rel, name);
    const entry = { path: rel, name };

    if (makeThumbs) {
      const thumbDir = path.join(target.abs, 'thumb');
      fs.mkdirSync(thumbDir, { recursive: true });
      await sharp(file.buffer)
        .resize(420, 420, { fit: 'cover' })
        .jpeg({ quality: 82 })
        .toFile(path.join(thumbDir, name.replace(/\.[^.]+$/, '.jpg')));
      entry.thumb = path.posix.join('images', target.rel, 'thumb', name.replace(/\.[^.]+$/, '.jpg'));
    }

    written.push(entry);
  }

  logActivity(req.user.id, 'upload', 'media', null, `Uploaded ${written.length} image(s) to images/${target.rel}`);
  res.json({ ok: true, files: written });
});

export default media;
