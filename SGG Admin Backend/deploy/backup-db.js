/**
 * Snapshots data/sgg.db into data-backups/.
 *
 * Uses SQLite's online backup API rather than copying the file. The database
 * runs in WAL mode, so a plain `cp sgg.db` while the server is up captures a
 * torn page set — the committed data sitting in sgg.db-wal is left behind. The
 * backup API walks the pages under a read lock and produces a single
 * self-contained file with no -wal or -shm sidecars.
 *
 *   node deploy/backup-db.js            # snapshot, keep the last 14
 *   node deploy/backup-db.js --keep 30  # keep the last 30
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config, ROOT } from '../src/lib/config.js';

const keepIndex = process.argv.indexOf('--keep');
const KEEP = keepIndex === -1 ? 14 : Math.max(1, Number(process.argv[keepIndex + 1]) || 14);

const outDir = process.env.DB_BACKUP_DIR || path.join(ROOT, 'data-backups');
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(config.dbPath)) {
  console.error(`No database at ${config.dbPath} — nothing to back up.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(outDir, `sgg-${stamp}.db`);

const db = new Database(config.dbPath, { readonly: true });
try {
  await db.backup(dest);
} finally {
  db.close();
}

// Verify the snapshot opens and passes an integrity check before we prune the
// older ones — a backup nobody has read is not a backup.
//
// The snapshot inherits journal_mode=WAL from the source, and merely opening a
// WAL database creates -wal/-shm sidecars next to it. Switch the copy to
// journal_mode=DELETE so what lands in data-backups/ is one self-contained
// file with nothing to leave behind or lose.
const check = new Database(dest);
const result = check.pragma('integrity_check', { simple: true });
check.pragma('journal_mode = DELETE');
check.close();

for (const sidecar of [`${dest}-wal`, `${dest}-shm`]) {
  if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
}

if (result !== 'ok') {
  fs.unlinkSync(dest);
  console.error(`Integrity check failed (${result}) — snapshot discarded, older backups kept.`);
  process.exit(1);
}

const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`${new Date().toISOString()}  backed up ${size} MB to ${dest}`);

// ------------------------------------------------------------------ prune ---
const snapshots = fs
  .readdirSync(outDir)
  .filter((f) => /^sgg-.*\.db$/.test(f))
  .sort()
  .reverse();

for (const stale of snapshots.slice(KEEP)) {
  for (const f of [stale, `${stale}-wal`, `${stale}-shm`]) {
    const abs = path.join(outDir, f);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  console.log(`  pruned ${stale}`);
}
console.log(`  ${Math.min(snapshots.length, KEEP)} snapshot(s) retained.`);
