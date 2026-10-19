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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static admin panel assets (login.html, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Configure session store
app.use(
  session({
    secret: config.sessionSecret || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
  })
);

// Handle POST /login form submissions
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await verifyCredentials(email, password);

  if (!user) {
    return res.status(401).redirect('/login.html?error=invalid');
  }

  req.session.userId = user.id;
  const nextUrl = req.query.next || '/';
  return res.redirect(nextUrl);
});

// Mount API routes
app.use('/api', apiRouter);

// Serve live site static files if configured
if (config.siteRoot) {
  app.use(express.static(config.siteRoot));
}

// Protected root URL -> serves admin index.html
app.get('/', requirePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
