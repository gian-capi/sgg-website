/**
 * Browser smoke test: signs in and visits every admin screen, failing on any
 * console error, page error, or failed request.
 *
 *   node src/lib/smoke-test.js [email] [password]
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { config, ROOT } from './config.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = `http://localhost:${config.port}`;

const SCREENS = [
  'dashboard', 'reports', 'inquiries', 'artists', 'artworks',
  'releases', 'events', 'galleries', 'homepage', 'media', 'settings', 'users',
];

const [, , email = 'info@capicotto.co', password = process.env.SMOKE_PASSWORD] = process.argv;

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === BASE) {
      problems.push(`http ${r.status()}: ${r.url()}`);
    }
  });

  // --- sign in ---
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')]);

  const signedIn = await page.$('[data-view]');
  if (!signedIn) throw new Error('Sign-in failed — admin shell did not render');
  console.log('  signed in OK');

  // --- visit every screen ---
  const results = [];
  for (const screen of SCREENS) {
    const before = problems.length;
    await page.goto(`${BASE}/${screen}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 700));

    const info = await page.evaluate(() => {
      const v = document.querySelector('[data-view]');
      return {
        html: (v?.innerHTML || '').length,
        title: document.querySelector('[data-page-title]')?.textContent || '',
        spinner: !!v?.querySelector('.spin'),
        cards: v?.querySelectorAll('.card').length || 0,
        errorBox: v?.textContent?.includes('Request failed') || false,
      };
    });

    const isEmpty = info.html < 200 || info.spinner;
    results.push({ screen, ...info, newProblems: problems.length - before });
    console.log(
      `  ${isEmpty ? 'EMPTY  ' : 'ok     '} ${screen.padEnd(11)} ` +
        `${String(info.cards).padStart(3)} cards  ${String(info.html).padStart(7)} bytes` +
        (problems.length - before ? `  (+${problems.length - before} problems)` : '')
    );
    if (isEmpty) problems.push(`screen "${screen}" rendered empty or stuck loading`);
  }

  await page.screenshot({ path: path.join(ROOT, 'smoke-dashboard.png'), fullPage: false });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ROOT, 'smoke-dashboard.png'), fullPage: false });

  await browser.close();

  console.log('');
  if (problems.length) {
    console.log(`  ${problems.length} problem(s):`);
    [...new Set(problems)].slice(0, 25).forEach((p) => console.log('   -', p));
    process.exitCode = 1;
  } else {
    console.log('  No console errors, page errors, or failed requests.');
  }
  return results;
}

run().catch((err) => {
  console.error('Smoke test failed:', err.message);
  process.exitCode = 1;
});
