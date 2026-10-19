import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/lib/config.js';
import { requirePage } from './src/lib/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static admin panel assets (login.html, CSS, JS) from the public folder
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

// Serve live site static files if configured
if (config.siteRoot) {
  app.use(express.static(config.siteRoot));
}

// Redirect root URL to admin dashboard or login
app.get('/', requirePage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
