import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SESSION_SECRET = 'sgg-dev-secret-change-me';

/**
 * Fails fast on misconfiguration that would otherwise surface as a confusing
 * runtime error (a silently-wrong port, an unwritable DB path) or a silent
 * security gap (a stock session secret in production). Runs before the
 * database is opened, so a bad DB_PATH is caught here instead of as a raw
 * better-sqlite3 stack trace.
 */
export function checkEnv(config) {
  const problems = [];
  const warnings = [];

  if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
    problems.push(`PORT must be a valid port number (got "${process.env.PORT}").`);
  }

  if (config.nodeEnv === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === DEFAULT_SESSION_SECRET) {
      problems.push(
        'SESSION_SECRET must be set to a unique, random value in production. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    if (config.publicOrigin.startsWith('http://localhost')) {
      warnings.push(
        'PUBLIC_ORIGIN still points at localhost while NODE_ENV=production — analytics on the live site will not reach this server.'
      );
    }
    if (config.trackingOrigins.includes('*')) {
      warnings.push(
        'TRACKING_ORIGINS is "*" — any site on the internet can post into your analytics tables. Lock this down to your real domain(s).'
      );
    }
  }

  const dbDir = path.dirname(config.dbPath);
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    fs.accessSync(dbDir, fs.constants.W_OK);
  } catch (err) {
    problems.push(
      `Cannot write to the database directory (${dbDir}): ${err.message}. ` +
        'Set DB_PATH to a writable, persistent location (e.g. a mounted disk).'
    );
  }

  for (const warning of warnings) console.warn(`  [env] warning: ${warning}`);

  if (problems.length) {
    console.error('\nFatal configuration problem(s):');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exit(1);
  }
}
