import { route, get, h, img, num, go } from '/assets/app.js';

const days = () => Number(new URLSearchParams(location.search).get('days')) || 30;

function rangePicker() {
  const d = days();
  return [7, 30, 90, 365]
    .map(
      (n) =>
        `<button class="btn btn-sm${n === d ? ' btn-accent' : ''}" data-days="${n}">${
          n === 365 ? '1y' : n + 'd'
        }</button>`
    )
    .join('');
}

/**
 * Share of visitors who took an action signalling real intent. Counted per
 * distinct visitor, so a visitor who taps twice still counts once and the
 * rate stays within 0–100%.
 */
function conversion(convertingVisitors, visitors) {
  if (!visitors) return { pct: 0, text: '—' };
  const pct = Math.min(100, Math.round((convertingVisitors / visitors) * 100));
  return { pct, text: `${pct}%` };
}

route('reports', async (view) => {
  const d = days();
  const [artists, artworks, events, galleries, sources] = await Promise.all([
    get(`/reports/top-artists?days=${d}`),
    get(`/reports/top-artworks?days=${d}`),
    get(`/reports/events?days=${d}`),
    get(`/reports/galleries?days=${d}`),
    get(`/reports/sources?days=${d}`),
  ]);

  view.innerHTML = `
    <div class="row wrap mb">
      <span class="label">Reporting window</span>
      <div class="row" data-range>${rangePicker()}</div>
      <div class="spacer"></div>
      <a class="btn btn-sm" href="/api/inquiries/export.csv">Export inquiries CSV</a>
    </div>

    <div class="card mb">
      <div class="card-head"><h2 class="display">Top performing artists</h2><div class="spacer"></div>
        <span class="label">by page views</span></div>
      ${
        artists.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th></th><th>Artist</th><th class="num">Views</th><th class="num">Visitors</th>
                <th class="num">Artwork opens</th><th class="num">Inquiries</th></tr></thead>
              <tbody>${artists
                .map(
                  (a) => `<tr>
                    <td><img class="thumb" src="${img(a.card_image)}" alt=""></td>
                    <td>${h(a.name)}<div class="dim small">${h(a.specialty || '')}</div></td>
                    <td class="num">${num(a.views)}</td>
                    <td class="num">${num(a.visitors)}</td>
                    <td class="num">${num(a.artwork_opens)}</td>
                    <td class="num">${num(a.inquiries)}</td></tr>`
                )
                .join('')}</tbody></table></div>`
          : '<div class="empty">No artist traffic in this window.</div>'
      }
    </div>

    <div class="card mb">
      <div class="card-head"><h2 class="display">Highest interest artworks</h2><div class="spacer"></div>
        <span class="label">lightbox opens</span></div>
      ${
        artworks.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th></th><th>Artwork</th><th>Artist</th><th>Detail</th>
                <th class="num">Opens</th><th class="num">Visitors</th></tr></thead>
              <tbody>${artworks
                .map(
                  (w) => `<tr>
                    <td><img class="thumb" src="${img(w.thumb_path || w.image_path)}" alt=""></td>
                    <td>${h(w.title)}${w.is_release ? ' <span class="pill pill-accent">release</span>' : ''}</td>
                    <td class="muted">${h(w.artist_name)}</td>
                    <td class="dim small">${h([w.medium, w.dimensions].filter(Boolean).join(' · '))}</td>
                    <td class="num">${num(w.opens)}</td>
                    <td class="num">${num(w.visitors)}</td></tr>`
                )
                .join('')}</tbody></table></div>`
          : '<div class="empty">No artwork opens in this window.</div>'
      }
    </div>

    <div class="card mb">
      <div class="card-head"><h2 class="display">Event conversion</h2><div class="spacer"></div>
        <span class="label">visitors who acted</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Event</th><th>Date</th><th>Where</th><th class="num">Views</th>
          <th class="num">Visitors</th><th class="num">Actions</th><th class="num">Inquiries</th>
          <th style="width:9rem">Conversion</th></tr></thead>
        <tbody>${events
          .map((e) => {
            const c = conversion(e.converting_visitors, e.visitors);
            return `<tr>
              <td>${h(e.title)}<div class="dim small">${h(e.artist_name || '')}</div></td>
              <td class="mono small">${h(e.start_date)}</td>
              <td class="muted small">${h(e.location)}</td>
              <td class="num">${num(e.views)}</td>
              <td class="num">${num(e.visitors)}</td>
              <td class="num">${num(e.actions)}</td>
              <td class="num">${num(e.inquiries)}</td>
              <td><div class="meter"><span style="width:${Math.min(c.pct, 100)}%"></span></div>
                  <div class="dim small mono" style="margin-top:.2rem">${c.text}</div></td>
            </tr>`;
          })
          .join('')}</tbody></table></div>
      <div class="card-pad" style="border-top:1px solid var(--line)">
        <p class="small dim" style="margin:0">
          An “action” is a phone tap, email tap, or CTA click on the event page — the closest proxy the
          site has for intent to attend or buy. Conversion counts each visitor once.
        </p>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="card">
        <div class="card-head"><h2 class="display">Galleries</h2></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Gallery</th><th class="num">Views</th><th class="num">Calls</th></tr></thead>
          <tbody>${galleries
            .map(
              (g) => `<tr><td>${h(g.name)}<div class="dim small">${h(g.location)}</div></td>
                <td class="num">${num(g.views)}</td><td class="num">${num(g.calls)}</td></tr>`
            )
            .join('')}</tbody></table></div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="display">Sources</h2></div>
        ${
          sources.referrers.length
            ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Source</th><th class="num">Views</th></tr></thead>
                <tbody>${sources.referrers
                  .map((r) => `<tr><td class="truncate">${h(r.source)}</td><td class="num">${num(r.views)}</td></tr>`)
                  .join('')}</tbody></table></div>`
            : '<div class="empty">No referrer data yet.</div>'
        }
      </div>

      <div class="card">
        <div class="card-head"><h2 class="display">Devices</h2></div>
        ${
          sources.devices.length
            ? `<div class="card-pad">${(() => {
                const total = sources.devices.reduce((s, x) => s + x.views, 0) || 1;
                return sources.devices
                  .map(
                    (x) => `<div style="margin-bottom:.7rem">
                      <div class="row small"><span>${h(x.device)}</span><div class="spacer"></div>
                        <span class="mono dim">${Math.round((x.views / total) * 100)}%</span></div>
                      <div class="meter" style="margin-top:.25rem"><span style="width:${(x.views / total) * 100}%"></span></div>
                    </div>`
                  )
                  .join('');
              })()}</div>`
            : '<div class="empty">No device data yet.</div>'
        }
      </div>
    </div>
  `;

  view.querySelector('[data-range]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-days]');
    if (btn) go(`/reports?days=${btn.dataset.days}`);
  });
});
