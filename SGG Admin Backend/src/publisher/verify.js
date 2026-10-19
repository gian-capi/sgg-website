/**
 * Fidelity harness: renders every page to memory and compares it against the
 * current file on disk at DOM level, ignoring formatting-only differences.
 *
 *   node src/publisher/verify.js            summary
 *   node src/publisher/verify.js index.html show the differing nodes
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';
import { config } from '../lib/config.js';
import { renderAll } from './render-all.js';

/**
 * A structural fingerprint of the document: one line per element, carrying
 * every attribute so that dropped attributes (loading, decoding, width…) are
 * caught, not just changed classes and text.
 */
function outline(html, { includeHead = true } = {}) {
  const $ = cheerio.load(html);
  const lines = [];

  if (includeHead) {
    lines.push(`title|${$('title').text().replace(/\s+/g, ' ').trim()}`);
    lines.push(`description|${($('meta[name="description"]').attr('content') || '').replace(/\s+/g, ' ').trim()}`);
  }

  $('body')
    .find('*')
    .each((_, el) => {
      const $el = $(el);
      const tag = el.tagName;
      if (tag === 'script' || tag === 'svg' || $el.closest('svg').length) return;

      const attrs = Object.entries($el.attr() || {})
        .map(([k, v]) => {
          let val = String(v ?? '');
          // Normalise things that carry no meaning for the rendered page.
          if (k === 'class') val = val.split(/\s+/).filter(Boolean).sort().join(' ');
          if (k === 'src' || k === 'href') val = val.replace(/^(\.\.\/)+/, '');
          if (k === 'style') val = val.replace(/\s+/g, '');
          return `${k}=${val.replace(/\s+/g, ' ').trim()}`;
        })
        .sort()
        .join(' ');

      const own = $el
        .contents()
        .filter((_, n) => n.type === 'text')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      lines.push([tag, attrs, own].join('|'));
    });

  return lines;
}

/**
 * Longest-common-subsequence diff, so a single inserted or removed node reports
 * as one change instead of desynchronising everything after it.
 */
function diffOutlines(a, b) {
  const n = a.length;
  const m = b.length;

  // Trim the common prefix and suffix first — these documents mostly match.
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start += 1;
  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA -= 1; endB -= 1; }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  if (!midA.length && !midB.length) return [];

  // Guard against a pathological table on very large pages.
  if (midA.length * midB.length > 4_000_000) {
    return [{ kind: 'bulk', original: midA[0] ?? '(none)', generated: midB[0] ?? '(none)',
      note: `${midA.length} vs ${midB.length} nodes differ` }];
  }

  const lcs = Array.from({ length: midA.length + 1 }, () => new Uint32Array(midB.length + 1));
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length && out.length < 60) {
    if (midA[i] === midB[j]) { i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'removed', original: midA[i], generated: '—' }); i += 1; }
    else { out.push({ kind: 'added', original: '—', generated: midB[j] }); j += 1; }
  }
  while (i < midA.length && out.length < 60) { out.push({ kind: 'removed', original: midA[i], generated: '—' }); i += 1; }
  while (j < midB.length && out.length < 60) { out.push({ kind: 'added', original: '—', generated: midB[j] }); j += 1; }

  return out;
}

/**
 * Compare rendered output against a baseline directory (the live site by
 * default, or a pre-publish snapshot via BASELINE_DIR / the second argument).
 */
export function verify(target = null, baselineDir = process.env.BASELINE_DIR || config.siteRoot) {
  const outputs = renderAll();
  const results = [];

  for (const [rel, contents] of outputs) {
    if (!rel.endsWith('.html')) continue;
    if (target && rel !== target) continue;

    const abs = path.join(baselineDir, rel);
    if (!fs.existsSync(abs)) {
      results.push({ rel, status: 'new', diffs: [] });
      continue;
    }
    const original = outline(fs.readFileSync(abs, 'utf8'));
    const generated = outline(contents);
    const diffs = diffOutlines(original, generated);
    results.push({
      rel,
      status: diffs.length ? 'differs' : 'match',
      nodes: original.length,
      diffs,
    });
  }

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2] || null;
  const results = verify(target);

  const match = results.filter((r) => r.status === 'match').length;
  const differs = results.filter((r) => r.status === 'differs');
  const fresh = results.filter((r) => r.status === 'new');

  console.log(`\n  ${match} pages match, ${differs.length} differ, ${fresh.length} new\n`);

  for (const r of differs.slice(0, target ? 999 : 12)) {
    console.log(`  ${r.rel}  (${r.diffs.length}+ differing nodes of ${r.nodes})`);
    if (target) {
      for (const d of r.diffs) {
        console.log(`    ${d.kind}${d.note ? ` — ${d.note}` : ''}`);
        console.log(`      original : ${d.original}`);
        console.log(`      generated: ${d.generated}`);
      }
    } else {
      const d = r.diffs[0];
      if (d) {
        console.log(`      original : ${d.original}`);
        console.log(`      generated: ${d.generated}`);
      }
    }
  }
  console.log('');
}
