import {
  route, get, post, put, del, h, img, num, toast,
  openDrawer, closeDrawer, drawerValues, field, checkbox, confirmAction,
  refreshBadges, refreshPublishState, reload,
} from '/assets/app.js';

function form(a = {}) {
  return `
    ${field('name', 'Name', a.name || '')}
    ${field('specialty', 'Specialty line', a.specialty || '', {
      hint: 'Shown under the name. Leave empty to show the work count instead.',
    })}
    ${field('bio', 'Biography', a.bio || '', {
      rows: 9,
      hint: 'Separate paragraphs with a blank line — each becomes its own paragraph on the site.',
    })}
    <div class="grid grid-2">
      ${field('card_image', 'Card image', a.card_image || '', { hint: 'e.g. images/artists/slug/_card.jpg' })}
      ${field('hero_image', 'Hero image', a.hero_image || '', { hint: 'e.g. images/artists/slug/_hero.jpg' })}
    </div>
    ${field('meta_description', 'Meta description', a.meta_description || '', { rows: 2 })}
    <div class="grid grid-2">
      ${field('slug', 'URL slug', a.slug || '', { hint: 'Changing this renames the page and breaks old links.' })}
      ${field('status', 'Status', a.status || 'active', {
        options: [
          { value: 'active', label: 'Active — visible on the site' },
          { value: 'archived', label: 'Archived — hidden, page removed on publish' },
        ],
      })}
    </div>
    <div class="card card-pad" style="margin-top:.5rem">
      <span class="label">Homepage feature</span>
      ${checkbox('featured', 'Show in the homepage “Featured Artists” rail', a.featured)}
      <div class="grid grid-2">
        ${field('featured_label', 'Feature label', a.featured_label || 'Top Artist')}
        ${field('featured_image', 'Feature image', a.featured_image || '', { hint: 'Defaults to the card image.' })}
      </div>
    </div>`;
}

function edit(a) {
  const isNew = !a?.id;
  openDrawer({
    title: isNew ? 'New artist' : a.name,
    body: form(a || {}),
    footer: `
      <button class="btn btn-primary" data-save>${isNew ? 'Create artist' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn btn-danger" data-delete>Delete</button>'}
      <div class="spacer"></div>
      ${isNew ? '' : `<a class="btn btn-sm" href="/artworks?artist=${a.id}" data-route>Catalogue →</a>`}`,
  });

  document.querySelector('[data-save]').onclick = async () => {
    const values = drawerValues();
    try {
      if (isNew) await post('/artists', values);
      else await put(`/artists/${a.id}`, values);
      toast(isNew ? 'Artist created.' : 'Artist saved.', 'ok');
      closeDrawer();
      refreshBadges();
      refreshPublishState();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const delBtn = document.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirmAction(`Delete ${a.name}? This also deletes their ${a.work_count || 0} catalogue entries.`)) return;
      try {
        await del(`/artists/${a.id}`);
        toast('Artist deleted.', 'ok');
        closeDrawer();
        refreshBadges();
        refreshPublishState();
        reload();
      } catch (err) {
        toast(err.message, 'bad');
      }
    };
  }
}

route('artists', async (view) => {
  const artists = await get('/artists');

  view.innerHTML = `
    <div class="row wrap mb">
      <input class="input" style="max-width:20rem" placeholder="Filter by name or specialty…" data-filter>
      <span class="muted small" data-count>${artists.length} artists</span>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-new>New artist</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th></th><th>Artist</th><th>Specialty</th><th class="num">Works</th>
          <th class="num">Events</th><th>Featured</th><th>Status</th><th></th></tr></thead>
        <tbody data-rows>
          ${artists.map(rowHtml).join('')}
        </tbody>
      </table></div>
    </div>`;

  function rowHtml(a) {
    return `<tr data-id="${a.id}" data-search="${h((a.name + ' ' + (a.specialty || '')).toLowerCase())}">
      <td><img class="thumb" src="${img(a.card_image)}" alt="" loading="lazy"></td>
      <td>${h(a.name)}<div class="dim small mono">${h(a.slug)}</div></td>
      <td class="muted small">${h(a.specialty || '—')}</td>
      <td class="num">${num(a.work_count)}</td>
      <td class="num">${num(a.event_count)}</td>
      <td>${a.featured ? '<span class="pill pill-accent">featured</span>' : ''}</td>
      <td>${a.status === 'active' ? '<span class="pill">active</span>' : '<span class="pill pill-closed">archived</span>'}</td>
      <td><button class="btn btn-sm" data-edit>Edit</button></td>
    </tr>`;
  }

  view.querySelector('[data-new]').onclick = () => edit({});

  view.querySelector('[data-rows]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    edit(artists.find((a) => a.id === id));
  });

  const filter = view.querySelector('[data-filter]');
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    view.querySelectorAll('[data-rows] tr').forEach((tr) => {
      const hit = !q || tr.dataset.search.includes(q);
      tr.hidden = !hit;
      if (hit) shown += 1;
    });
    view.querySelector('[data-count]').textContent = `${shown} artists`;
  });
});
