import express from 'express';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { config, ROOT, siteExists } from './src/lib/config.js';
import { db } from './src/lib/db.js';
import { SqliteStore } from './src/lib/session-store.js';
import { verifyCredentials, requirePage } from './src/lib/auth.js';
import api from './src/routes/api.js';
import collect from './src/routes/collect.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: 'sgg.sid',
    store: new SqliteStore({ ttlMs: config.sessionMaxAgeMs }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: config.sessionMaxAgeMs,
    },
  })
);

// Public analytics + form ingest (CORS handled inside).
app.use('/collect', collect);

app.get('/healthz', (req, res) =>
  res.json({ ok: true, siteRoot: config.siteRoot, siteFound: siteExists() })
);

// ------------------------------------------------------------------ auth ---

app.get('/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/');
  res.sendFile(path.join(ROOT, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = verifyCredentials(email, password);
  if (!user) {
    return res.status(401).sendFile(path.join(ROOT, 'public', 'login-failed.html'));
  }
  req.session.userId = user.id;
  const next = typeof req.body.next === 'string' && req.body.next.startsWith('/') ? req.body.next : '/';
  res.redirect(next);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ------------------------------------------------------------- admin app ---

app.use('/api', api);

// Serve the live site's images so the admin can preview media it manages.
app.use('/site-images', express.static(path.join(config.siteRoot, 'images'), { maxAge: '1h' }));

app.use('/assets', express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));

app.get('/', requirePage, (req, res) => res.sendFile(path.join(ROOT, 'public', 'admin.html')));
app.get(/^\/(dashboard|artists|artworks|releases|events|galleries|homepage|inquiries|reports|media|settings|users|publish)(\/.*)?$/,
  requirePage,
  (req, res) => res.sendFile(path.join(ROOT, 'public', 'admin.html'))
);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---------------------------------------------------------------- start ---

const owners = db.prepare("SELECT COUNT(*) n FROM users WHERE active = 1").get().n;
if (owners === 0) {
  console.warn('\n  No admin users exist yet. Create one with:  npm run seed\n');
}
if (!siteExists()) {
  console.warn(`\n  Warning: no index.html found at SITE_ROOT (${config.siteRoot}).`);
  console.warn('  Set SITE_ROOT in .env to the folder holding the live website.\n');
}

app.listen(config.port, () => {
  console.log(`SGG Admin  →  http://localhost:${config.port}`);
  console.log(`Publishing to: ${config.siteRoot}`);
});
