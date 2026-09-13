#!/usr/bin/env node
// Full-page screenshots for the reference-comparison loop.
//
//   node tools/shot.js index.html                  -> shots/index.desktop.png + index.mobile.png
//   node tools/shot.js artist/2wild.html shots/v2  -> writes into shots/v2/
//   node tools/shot.js index.html --sections       -> also captures each section separately
//   node tools/shot.js index.html --only=mobile    -> one viewport
//
// Animations and transitions are disabled so repeat runs are pixel-stable.

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');

// track.js beacons to the Admin Manager on localhost:4000. When that backend
// isn't running the request hangs and the page never reaches network idle, so
// analytics and third-party embeds are blocked outright.
const BLOCKED = [/^https?:\/\/localhost:/, /\/collect\b/, /google-analytics|googletagmanager|facebook\.net/];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const positional = args.filter((a) => !a.startsWith('--'));
const target = positional[0];
const outDir = positional[1] || 'shots';
const wantSections = flags.includes('--sections');
const only = (flags.find((f) => f.startsWith('--only=')) || '').split('=')[1];

if (!target) {
  console.error('usage: node tools/shot.js <page.html|url> [outDir] [--sections] [--only=desktop|mobile]');
  process.exit(1);
}
if (only && !VIEWPORTS[only]) {
  console.error(`unknown viewport "${only}" — expected desktop or mobile`);
  process.exit(1);
}

const url = /^https?:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const name = path.basename(target).replace(/\.html?$/, '') || 'page';
const viewports = only ? { [only]: VIEWPORTS[only] } : VIEWPORTS;

// Pull in lazy-loaded images, then settle back at the top. Every wait here is
// bounded: files under images/ are Dropbox online-only placeholders, so a decode
// can stall indefinitely while Dropbox materializes them.
async function settle(page, budgetMs = 20000) {
  await page
    .evaluate(async (budget) => {
      const deadline = Date.now() + budget;
      const capped = (p) =>
        Promise.race([p, new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())))]);

      await capped(
        new Promise((resolve) => {
          let y = 0;
          const step = () => {
            window.scrollTo(0, y);
            y += window.innerHeight;
            if (y < document.body.scrollHeight && Date.now() < deadline) setTimeout(step, 60);
            else {
              window.scrollTo(0, 0);
              setTimeout(resolve, 200);
            }
          };
          step();
        })
      );

      await capped(document.fonts.ready);
      await capped(
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map((img) => new Promise((r) => { img.onload = img.onerror = r; }))
        )
      );
    }, budgetMs)
    .catch((err) => console.error(`  settle: ${err.message.split('\n')[0]} — capturing anyway`));
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000 });
  const written = [];

  try {
    for (const [label, viewport] of Object.entries(viewports)) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (BLOCKED.some((re) => re.test(req.url()))) req.abort();
        else req.continue();
      });

      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.addStyleTag({
        content: `*,*::before,*::after{animation:none!important;transition:none!important;
                  scroll-behavior:auto!important;caret-color:transparent!important}`,
      });
      // Best-effort: a stray pending request shouldn't fail the capture.
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
      await settle(page);

      const file = path.join(outDir, `${name}.${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      written.push(file);

      if (wantSections) {
        const blocks = await page.$$('section, header, footer, main > div[id]');
        for (let i = 0; i < blocks.length; i++) {
          const box = await blocks[i].boundingBox();
          if (!box || box.height < 40) continue; // skip slivers and hidden blocks
          const id = await blocks[i].evaluate((el) => el.id || el.tagName.toLowerCase());
          const sectionFile = path.join(outDir, `${name}.${label}.${String(i).padStart(2, '0')}-${id}.png`);
          await blocks[i].screenshot({ path: sectionFile });
          written.push(sectionFile);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  for (const f of written) {
    console.log(`${f}  (${(fs.statSync(f).size / 1024).toFixed(0)} KB)`);
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
