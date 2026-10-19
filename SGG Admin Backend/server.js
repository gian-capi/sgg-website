import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/lib/config.js';
import { requirePage, verifyCredentials } from './src/lib/auth.js';
import apiRouter from './src/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static admin files directly and via /assets mapping
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public')));

// Configure session middleware
app.use(
  session({
    secret: config.sessionSecret || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

// Process POST /login form submissions
app.post('/login', async (req, res) => {
  const { email, password, next } = req.body;
  const user = await verifyCredentials(email, password);

  if (!user) {
    return res.redirect('/login.html?error=invalid');
  }

  req.session.userId = user.id;

  req.session.save((err) => {
    if (err) {
      console.error('[ERROR] Session save failed:', err);
      return res.status(500).send('Session save error');
    }
    const redirectTarget = next && next.startsWith('/') ? next : '/';
    return res.redirect(redirectTarget);
  });
});

// Mount API routes
app.use('/api', apiRouter);

// Serve live site static files if configured
if (config.siteRoot) {
  app.use(express.static(config.siteRoot));
}

// Protected root URL -> serves admin.html
app.get('/', requirePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
