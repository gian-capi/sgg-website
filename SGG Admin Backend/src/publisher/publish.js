/**
 * Regenerates the static site from the database.
 *
 * Every publish first copies the files it is about to overwrite into
 * backups/<timestamp>/, so a bad publish is always recoverable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { db, setSetting, logActivity } from '../lib/db.js';
import { renderAll } from './render-all.js';

/** Delete generated pages whose source record is gone. */
function pruneOrphans(outputs) {
  const removed = [];
  for (const dir of ['artist', 'event', 'gallery']) {
    const abs = path.join(config.siteRoot, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs)) {
      if (!file.endsWith('.html')) continue;
      const rel = path.posix.join(dir, file);
      if (!outputs.has(rel)) {
        fs.unlinkSync(path.join(config.siteRoot, rel));
        removed.push(rel);
      }
    }
  }
  return removed;
}

export async function publishSite({ userId = null, dryRun = false } = {}) {
  const startedAt = Date.now();
  const publishId = db
    .prepare("INSERT INTO publishes (user_id, status) VALUES (?, 'running')")
    .run(userId ?? null).lastInsertRowid;

  const logLines = [];
  const say = (line) => logLines.push(line);

  try {
    const outputs = renderAll();
    say(`Rendered ${outputs.size} files.`);

    if (dryRun) {
      db.prepare(
        "UPDATE publishes SET status='success', files_written=0, log=?, finished_at=datetime('now') WHERE id=?"
      ).run(logLines.concat('Dry run — nothing written.').join('\n'), publishId);
      return { ok: true, dryRun: true, files: [...outputs.keys()], count: outputs.size, log: logLines };
    }

    // ----------------------------------------------------------- backup ---
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(config.backupRoot, stamp);
    let backedUp = 0;

    for (const rel of outputs.keys()) {
      const src = path.join(config.siteRoot, rel);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(backupDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      backedUp += 1;
    }
    say(`Backed up ${backedUp} existing files to ${backupDir}`);

    // ------------------------------------------------------------ write ---
    let written = 0;
    for (const [rel, contents] of outputs) {
      const dest = path.join(config.siteRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, contents, 'utf8');
      // Dropbox's virtual filesystem has been observed to drop writes silently,
      // so confirm each file landed before counting it.
      if (fs.readFileSync(dest, 'utf8') !== contents) {
        throw new Error(`Write verification failed for ${rel} — the file on disk does not match what was written`);
      }
      written += 1;
    }
    say(`Wrote ${written} files to ${config.siteRoot}`);

    const removed = pruneOrphans(outputs);
    if (removed.length) say(`Removed ${removed.length} orphaned page(s): ${removed.join(', ')}`);

    setSetting('content_dirty', '0');
    setSetting('last_publish_at', new Date().toISOString());

    db.prepare(
      "UPDATE publishes SET status='success', files_written=?, backup_path=?, log=?, finished_at=datetime('now') WHERE id=?"
    ).run(written, backupDir, logLines.join('\n'), publishId);
    logActivity(userId, 'publish', 'site', null, `Published ${written} files`);

    return { ok: true, count: written, backupPath: backupDir, removed, ms: Date.now() - startedAt, log: logLines };
  } catch (err) {
    db.prepare("UPDATE publishes SET status='failed', log=?, finished_at=datetime('now') WHERE id=?")
      .run(logLines.concat(`ERROR: ${err.message}`).join('\n'), publishId);
    throw err;
  }
}

/** Restore a previous publish from its backup folder. */
export function restoreBackup(backupDir) {
  if (!fs.existsSync(backupDir)) throw new Error('That backup no longer exists');
  let restored = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      const rel = path.relative(backupDir, abs);
      const dest = path.join(config.siteRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
      restored += 1;
    }
  };
  walk(backupDir);
  return { ok: true, restored };
}
