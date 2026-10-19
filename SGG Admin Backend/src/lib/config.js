import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { checkEnv } from './env-check.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT, '.env') });

function resolveSiteRoot() {
  if (process.env.SITE_ROOT) return path.resolve(process.env.SITE_ROOT);
  // Default: sibling "SGG Website" folder next to this admin project.
  return path.resolve(ROOT, '..', 'SGG Website');
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'sgg-dev-secret-change-me',

  /** Absolute path to the live static website that Publish overwrites. */
  siteRoot: resolveSiteRoot(),
  /** Where timestamped pre-publish backups are stored. */
  backupRoot: process.env.BACKUP_ROOT || path.join(ROOT, 'backups'),

  dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'sgg.db'),
  uploadsDir: path.join(ROOT, 'uploads'),

  /**
   * Public origin of THIS admin server, baked into the tracker snippet that
   * published pages load. Must be reachable from wherever the site is hosted.
   */
  publicOrigin: (process.env.PUBLIC_ORIGIN || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),

  /** Origins allowed to POST analytics/inquiries (comma separated, or * ). */
  trackingOrigins: (process.env.TRACKING_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  sessionMaxAgeMs: 1000 * 60 * 60 * 12,
};

checkEnv(config);

for (const dir of [path.dirname(config.dbPath), config.uploadsDir, config.backupRoot]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function siteExists() {
  return fs.existsSync(path.join(config.siteRoot, 'index.html'));
}
