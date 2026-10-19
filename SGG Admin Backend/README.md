# Signature Gallery Group — Admin & Analytics Manager

A lightweight, Shopify-style admin for the SGG static website. Manage artists,
artworks, events and galleries in a database; press **Publish** to regenerate
the static site; track traffic, interest and inquiries from the live pages.

```
SGG Admin Backend/          this project — Express + SQLite + a vanilla-JS admin
SGG Website/                the live static site the publisher writes to
```

---

## Quick start

```bash
npm install
cp .env.example .env          # then edit SITE_ROOT and SESSION_SECRET
npm run import                # read the existing website into the database
npm run seed -- you@example.com "Your Name"   # prints a generated password
npm start                     # http://localhost:4000
```

Sign in, change your password under **Settings**, and you are running.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the admin server |
| `npm run dev` | Same, restarting on file changes |
| `npm run import` | Re-read the static site into the database |
| `npm run publish` | Publish from the command line (`-- --dry` to render only) |
| `npm run verify` | Diff every rendered page against the current site files |
| `npm run smoke` | Headless-browser check of all 12 admin screens |
| `npm run seed` | Create the first owner account |
| `npm run backup:db` | Snapshot the SQLite database (`-- --keep 30` to retain more) |
| `npm run deploy:install` | Install the launchd service + nightly backup |

---

## How publishing works

The database is the source of truth. Publishing renders every page from
templates in `src/publisher/templates/` and writes them into `SITE_ROOT`:

```
index.html · artists.html · artist/*.html (56) · event/*.html (6)
gallery/*.html (5) · assets/track.js
```

Before writing, every file it is about to overwrite is copied to
`backups/<timestamp>/`. Each written file is then read back and compared, because
Dropbox's virtual filesystem has been observed to drop writes silently — a
mismatch fails the publish rather than leaving the site half-updated.

Pages whose record no longer exists (a deleted artist, say) are removed.

**Fidelity.** `npm run verify` renders every page and structurally diffs it
against what is on disk — tag, every attribute, and text, ignoring formatting.
It was used to build the templates: 68 of 69 pages regenerate content-identical
to the originals. See *Known differences* below.

### Restoring a publish

Every publish records its backup folder (visible under **Settings → Publish
history**). To roll back:

```bash
node -e "import('./src/publisher/publish.js').then(m => \
  console.log(m.restoreBackup('backups/2026-08-11T12-21-37')))"
```

---

## Analytics

Publishing writes `assets/track.js` into the site and links it from every page.
It is first-party and cookie-free: a random visitor id in `localStorage`, a
session id in `sessionStorage`, posted to this server's `/collect` endpoints.

It records:

- **pageviews**, classified to the artist / event / gallery the page is about
- **artwork opens** — lightbox opens, the strongest interest signal on the site
- **phone taps, email taps, CTA clicks, outbound links**
- **newsletter sign-ups** — the footer form now posts here instead of doing nothing

For data to flow, `PUBLIC_ORIGIN` must be an address the published site can
reach. On localhost that is fine for testing; once the site is hosted, point
`PUBLIC_ORIGIN` at the admin server's public URL, set `TRACKING_ORIGINS` to the
site's origin, re-publish, and the snippet updates itself.

**Event conversion** is the share of an event page's distinct visitors who took
an action signalling intent (call, email, CTA). Each visitor counts once, so the
rate stays within 0–100%.

---

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | Admin server port (default 4000) |
| `SITE_ROOT` | Absolute path to the live site. Defaults to `../SGG Website` |
| `SESSION_SECRET` | Signs session cookies — set a long random value |
| `PUBLIC_ORIGIN` | This server's public URL, baked into the tracker |
| `TRACKING_ORIGINS` | Comma-separated origins allowed to post analytics, or `*` |
| `NODE_ENV` | `production` enables secure cookies (requires HTTPS) |
| `DB_PATH` | Override the SQLite file location (default `data/sgg.db`) |
| `BACKUP_ROOT` | Override where pre-publish backups go (default `backups/`) |

Both projects sit side by side inside `SGG Parent Directory`, so the built-in
`SITE_ROOT` default resolves correctly and the `.env` entry is belt-and-braces.
If you ever move either folder, update `SITE_ROOT` — publishing into a path
that does not exist creates it silently rather than failing.

---

## Production deployment

The publisher writes HTML straight into `SITE_ROOT` on the local filesystem, so
the admin server has to run on the machine that holds the website folder. It is
installed as a launchd user agent:

```bash
cp .env.production .env     # then fill in the TODO values
./deploy/install.sh
```

`install.sh` refuses to install if `SITE_ROOT` has no `index.html` in it,
rewrites the plists with this machine's absolute paths, marks the data
directories `com.dropbox.ignored`, and waits for `/healthz` to answer.

| File | Purpose |
|---|---|
| `deploy/co.sgg.admin.plist` | Runs `server.js` at login, restarts on exit |
| `deploy/co.sgg.admin.backup.plist` | Nightly SQLite snapshot at 03:15 |
| `deploy/backup-db.js` | The snapshot itself — online backup + integrity check |
| `deploy/install.sh` · `uninstall.sh` | Install / remove both agents |

```bash
launchctl print gui/$(id -u)/co.sgg.admin   # status
tail -f logs/admin.log                      # output
./deploy/uninstall.sh                       # stop and remove
```

### Database persistence

The database is a single file at `data/sgg.db`, running in WAL mode. Three
things keep it intact:

1. **Dropbox never touches it.** `data/`, `data-backups/` and `logs/` are marked
   `com.dropbox.ignored`. Dropbox syncing a live SQLite file mid-write is a
   known way to corrupt one, and `install.sh` re-applies the flag every run.
2. **Snapshots use SQLite's online backup API**, not `cp`. In WAL mode a plain
   file copy of a running database leaves committed data behind in `sgg.db-wal`;
   the backup API produces a self-contained file with no sidecars, safely while
   the server is running.
3. **Every snapshot is verified before it counts.** `backup-db.js` reopens the
   file it just wrote and runs `PRAGMA integrity_check`; a failed snapshot is
   discarded and the previous ones are kept rather than rotated out.

```bash
npm run backup:db              # snapshot now, keep the last 14
npm run backup:db -- --keep 30 # keep the last 30
```

To restore, stop the agent, drop a snapshot in as `data/sgg.db` (delete any
stale `-wal` / `-shm` sidecars), and start it again:

```bash
launchctl bootout gui/$(id -u)/co.sgg.admin
rm -f data/sgg.db data/sgg.db-wal data/sgg.db-shm
cp data-backups/sgg-<timestamp>.db data/sgg.db
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.sgg.admin.plist
```

### Going live

While the admin is served over plain HTTP on localhost, leave `NODE_ENV` as
`development` — `production` turns on `Secure` session cookies, which browsers
will not send over `http://`, locking you out of the admin. Once the site has a
real domain and the admin is behind HTTPS:

1. Point `PUBLIC_ORIGIN` at the admin's public URL.
2. Set `TRACKING_ORIGINS` to the site's origins — leaving it `*` lets any page
   on the internet write into your analytics tables.
3. Set `NODE_ENV=production`.
4. `npm run publish` — the tracker snippet rewrites itself with the new origin.

---

## Roles

| Role | Can do |
|---|---|
| `owner` | Everything, including managing the team and re-importing |
| `editor` | Edit all content, upload media, publish |
| `viewer` | Read-only — reports and content, no changes |

The last active owner cannot be demoted, disabled or deleted.

---

## Project layout

```
server.js                  Express app, auth routes, static serving
src/lib/
  config.js                environment and paths
  db.js                    schema, additive migrations, settings helpers
  auth.js                  bcrypt credentials, session guards, roles
  session-store.js         SQLite session store (avoids the vulnerable sqlite3 dep)
  crud.js                  REST router factory used by most resources
  seed-admin.js            first-account bootstrap
  smoke-test.js            headless-browser check of every screen
src/routes/
  api.js                   authenticated JSON API
  collect.js               public analytics + form ingest (CORS)
  reports.js               reporting queries
  media.js                 image browsing and upload
src/importer/import-site.js   static site -> database
src/publisher/
  render-all.js            renders every page into memory
  publish.js               backup, write, verify, prune
  verify.js                fidelity harness
  tracker.js               builds assets/track.js
  templates/*.ejs          page templates
public/                    the admin UI (no build step)
```

### Data model notes

- **Artworks** are identified by `(artist_id, image_path)`. Re-importing updates
  rows in place rather than renumbering them, so analytics that reference
  artwork ids survive a re-import.
- `in_catalogue` separates catalogue pieces from carousel-only releases, which
  live under `images/artwork/` and are not part of an artist's grid.
- `bio` stores paragraphs separated by a blank line; each becomes its own `<p>`.
- Multi-line fields (`address`, `hours`, `headline`) use one line per row and
  render as `<br>`.

---

## Known differences from the original site

Publishing reproduces the original markup with two deliberate changes and one
cosmetic one:

1. **The newsletter form is wired up.** It previously did nothing
   (`onsubmit="return false;"`). It now posts to the admin and shows a
   confirmation message. This adds one hidden `<p>` per page.
2. **A tracker script tag** is added before `</body>` on every page.
3. `event/oryan-lake-tahoe.html` — the artist blurb on the "Featuring" card is
   truncated at a 420-character word boundary. The original generator cut this
   one about 12 characters earlier; both end mid-sentence with an ellipsis, so
   the rendered result is materially the same.

Everything else — all 68 other pages — regenerates content-identical, including
`loading="lazy"` thresholds, image `alt` text, and per-page titles and meta
descriptions.

---

## Operational notes

- `node_modules/`, `data/`, `backups/` and `uploads/` are marked
  `com.dropbox.ignored` so Dropbox does not sync them. If you clone this
  elsewhere, re-apply with `xattr -w com.dropbox.ignored 1 <dir>`.
- The SQLite database lives at `data/sgg.db` (WAL mode). Back it up by copying
  `data/` while the server is stopped.
- Sessions last 12 hours and roll forward on activity.
