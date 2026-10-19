import { route, get, h, img, num, delta, fmtWhen, fmtDate } from '/assets/app.js';

function stat(label, value, prev, note = '') {
  const d = delta(value, prev);
  return `
    <div class="card stat">
      <span class="label">${h(label)}</span>
      <div class="v mono">${num(value)}</div>
      <div class="d ${d.cls}">${d.text}${note ? ` <span class="dim">· ${h(note)}</span>` : ''}</div>
    </div>`;
}

/** Sparkline-style bar chart from the daily series. */
function bars(series, key) {
  const max = Math.max(1, ...series.map((p) => p[key]));
  return `<div class="bars">${series
    .map(
      (p) =>
        `<div class="bar" style="height:${Math.round((p[key] / max) * 100)}%" title="${p.day}: ${p[key]}"></div>`
    )
    .join('')}</div>`;
}

route('dashboard', async (view) => {
  const [o, series, topArtists, topArtworks, activity, pub] = await Promise.all([
    get('/reports/overview?days=30'),
    get('/reports/timeseries?days=30'),
    get('/reports/top-artists?days=30'),
    get('/reports/top-artworks?days=30'),
    get('/activity'),
    get('/publish/status'),
  ]);

  const noData = o.views.value === 0;

  view.innerHTML = `
    ${
      noData
        ? `<div class="card card-pad mb" style="border-color:rgba(144,137,211,.4)">
             <p style="margin:0 0 .4rem"><strong>No traffic recorded yet.</strong></p>
             <p class="small muted" style="margin:0">
               Analytics start flowing once you publish — publishing writes <code class="mono">assets/track.js</code>
               into the site and links it from every page. Until the published site is served from a URL that can
               reach this admin server, these numbers stay at zero.
             </p>
           </div>`
        : ''
    }

    <div class="grid grid-4 mb">
      ${stat('Pageviews · 30d', o.views.value, o.views.previous)}
      ${stat('Visitors · 30d', o.visitors.value, o.visitors.previous)}
      ${stat('Artwork opens · 30d', o.artworkOpens.value, o.artworkOpens.previous)}
      ${stat('Inquiries · 30d', o.inquiries.value, o.inquiries.previous, `${o.newInquiries} new`)}
    </div>

    <div class="grid grid-2 mb" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div class="card">
        <div class="card-head"><h2 class="display">Traffic · last 30 days</h2><div class="spacer"></div>
          <span class="label">views per day</span></div>
        <div class="card-pad">${bars(series, 'views')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2 class="display">Catalog</h2></div>
        <div class="card-pad">
          ${[
            ['Artists', o.catalog.artists],
            ['Artworks', o.catalog.artworks],
            ['Galleries', o.catalog.galleries],
            ['Events published', o.catalog.events],
            ['Upcoming shows', o.catalog.upcomingEvents],
          ]
            .map(
              ([k, v]) =>
                `<div class="row" style="padding:.35rem 0"><span class="muted small">${k}</span>
                 <div class="spacer"></div><span class="mono">${num(v)}</span></div>`
            )
            .join('')}
          <div class="row" style="padding:.6rem 0 0;margin-top:.5rem;border-top:1px solid var(--line)">
            <span class="muted small">Last publish</span><div class="spacer"></div>
            <span class="mono small">${pub.lastPublishAt ? fmtWhen(pub.lastPublishAt) : 'never'}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-2 mb">
      <div class="card">
        <div class="card-head"><h2 class="display">Top artists</h2><div class="spacer"></div>
          <a class="btn btn-sm" href="/reports" data-route>All reports</a></div>
        ${
          topArtists.length
            ? `<div class="table-wrap"><table class="table">
                 <thead><tr><th></th><th>Artist</th><th class="num">Views</th><th class="num">Opens</th></tr></thead>
                 <tbody>${topArtists
                   .slice(0, 8)
                   .map(
                     (a) => `<tr>
                       <td><img class="thumb" src="${img(a.card_image)}" alt=""></td>
                       <td>${h(a.name)}<div class="dim small">${h(a.specialty || '')}</div></td>
                       <td class="num">${num(a.views)}</td>
                       <td class="num">${num(a.artwork_opens)}</td></tr>`
                   )
                   .join('')}</tbody></table></div>`
            : '<div class="empty">No artist views recorded yet.</div>'
        }
      </div>

      <div class="card">
        <div class="card-head"><h2 class="display">Most opened artworks</h2></div>
        ${
          topArtworks.length
            ? `<div class="table-wrap"><table class="table">
                 <thead><tr><th></th><th>Artwork</th><th class="num">Opens</th></tr></thead>
                 <tbody>${topArtworks
                   .slice(0, 8)
                   .map(
                     (w) => `<tr>
                       <td><img class="thumb" src="${img(w.thumb_path || w.image_path)}" alt=""></td>
                       <td>${h(w.title)}<div class="dim small">${h(w.artist_name)}</div></td>
                       <td class="num">${num(w.opens)}</td></tr>`
                   )
                   .join('')}</tbody></table></div>`
            : '<div class="empty">No artwork opens recorded yet.</div>'
        }
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2 class="display">Recent activity</h2></div>
      ${
        activity.length
          ? `<div class="table-wrap" style="max-height:22rem"><table class="table">
               <tbody>${activity
                 .slice(0, 20)
                 .map(
                   (a) => `<tr>
                     <td style="width:8rem" class="dim small mono">${fmtWhen(a.created_at)}</td>
                     <td>${h(a.summary)}</td>
                     <td class="dim small" style="width:12rem">${h(a.user_name || a.user_email || 'system')}</td>
                   </tr>`
                 )
                 .join('')}</tbody></table></div>`
          : '<div class="empty">Nothing yet.</div>'
      }
    </div>
  `;
});
