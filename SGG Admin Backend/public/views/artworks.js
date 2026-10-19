import {
  route, get, post, put, del, h, img, num, toast,
  openDrawer, closeDrawer, drawerValues, field, checkbox, confirmAction,
  refreshBadges, refreshPublishState, reload,
} from '/assets/app.js';

function form(w, artists) {
  return `
    ${field('title', 'Title', w.title || '')}
    ${field('artist_id', 'Artist', w.artist_id || '', {
      options: artists.map((a) => ({ value: a.id, label: a.name })),
    })}
    <div class="grid grid-2">
      ${field('medium', 'Medium', w.medium || '', { placeholder: 'charcoal-pastel' })}
      ${field('dimensions', 'Dimensions', w.dimensions || '', { placeholder: '18x24"' })}
    </div>
    ${field('image_path', 'Full image', w.image_path || '', { hint: 'e.g. images/artists/slug/000.jpg' })}
    ${field('thumb_path', 'Thumbnail', w.thumb_path || '', { hint: 'Falls back to the full image if empty.' })}
    ${checkbox('in_catalogue', 'Show in the artist’s catalogue grid', w.id ? w.in_catalogue : 1)}
    ${checkbox('is_release', 'Feature in the homepage New Releases carousel', w.is_release)}
    ${field('status', 'Status', w.status || 'active', {
      options: [
        { value: 'active', label: 'Active' },
        { value: 'archived', label: 'Archived — hidden from the site' },
      ],
    })}`;
}

function edit(w, artists) {
  const isNew = !w?.id;
  openDrawer({
    title: isNew ? 'New artwork' : w.title,
    body: form(w || {}, artists),
    footer: `<button class="btn btn-primary" data-save>${isNew ? 'Create' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn btn-danger" data-delete>Delete</button>'}`,
  });

  document.querySelector('[data-save]').onclick = async () => {
    try {
      const v = drawerValues();
      if (isNew) await post('/artworks', v);
      else await put(`/artworks/${w.id}`, v);
      toast(isNew ? 'Artwork created.' : 'Artwork saved.', 'ok');
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
      if (!confirmAction(`Delete “${w.title}”?`)) return;
      try {
        await del(`/artworks/${w.id}`);
        toast('Artwork deleted.', 'ok');
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

route('artworks', async (view) => {
  const artistFilter = new URLSearchParams(location.search).get('artist');
  const [all, artists] = await Promise.all([get('/artworks'), get('/artists')]);
  const works = artistFilter ? all.filter((w) => String(w.artist_id) === artistFilter) : all;

  view.innerHTML = `
    <div class="row wrap mb">
      <input class="input" style="max-width:20rem" placeholder="Filter by title or artist…" data-filter>
      <select class="select" style="max-width:16rem" data-artist>
        <option value="">All artists</option>
        ${artists
          .map(
            (a) => `<option value="${a.id}"${String(a.id) === artistFilter ? ' selected' : ''}>${h(a.name)}</option>`
          )
          .join('')}
      </select>
      <span class="muted small" data-count>${works.length} works</span>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-new>New artwork</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th></th><th>Title</th><th>Artist</th><th>Medium</th><th>Size</th>
          <th>Catalogue</th><th>Release</th><th></th></tr></thead>
        <tbody data-rows>${works
          .map(
            (w) => `<tr data-id="${w.id}" data-search="${h((w.title + ' ' + w.artist_name).toLowerCase())}">
            <td><img class="thumb" src="${img(w.thumb_path || w.image_path)}" alt="" loading="lazy"></td>
            <td>${h(w.title)}</td>
            <td class="muted small">${h(w.artist_name)}</td>
            <td class="dim small">${h(w.medium || '—')}</td>
            <td class="dim small">${h(w.dimensions || '—')}</td>
            <td>${w.in_catalogue ? '<span class="pill">in catalogue</span>' : '<span class="pill pill-closed">hidden</span>'}</td>
            <td>${w.is_release ? '<span class="pill pill-accent">release</span>' : ''}</td>
            <td><button class="btn btn-sm" data-edit>Edit</button></td>
          </tr>`
          )
          .join('')}</tbody>
      </table></div>
    </div>`;

  view.querySelector('[data-new]').onclick = () => edit({ artist_id: artistFilter || artists[0]?.id }, artists);

  view.querySelector('[data-rows]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    edit(works.find((w) => w.id === Number(btn.closest('tr').dataset.id)), artists);
  });

  view.querySelector('[data-artist]').onchange = (e) => {
    const v = e.target.value;
    history.replaceState({}, '', v ? `/artworks?artist=${v}` : '/artworks');
    reload();
  };

  const filter = view.querySelector('[data-filter]');
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    view.querySelectorAll('[data-rows] tr').forEach((tr) => {
      const hit = !q || tr.dataset.search.includes(q);
      tr.hidden = !hit;
      if (hit) shown += 1;
    });
    view.querySelector('[data-count]').textContent = `${shown} works`;
  });
});
