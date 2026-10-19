import {
  route, get, post, put, del, h, img, toast, fmtDate,
  openDrawer, closeDrawer, drawerValues, field, confirmAction,
  refreshBadges, refreshPublishState, reload,
} from '/assets/app.js';

function form(e, artists, galleries) {
  return `
    ${field('title', 'Title', e.title || '', { placeholder: 'Joseph Capicotto Art Show in Lake Tahoe' })}
    <div class="grid grid-2">
      ${field('start_date', 'Start date', e.start_date || '', { type: 'date' })}
      ${field('location', 'Location label', e.location || '', { placeholder: 'Lake Tahoe' })}
    </div>
    <div class="grid grid-2">
      ${field('artist_id', 'Featured artist', e.artist_id || '', {
        options: [{ value: '', label: '— none —' }, ...artists.map((a) => ({ value: a.id, label: a.name }))],
      })}
      ${field('gallery_id', 'Gallery', e.gallery_id || '', {
        options: [
          { value: '', label: '— none —' },
          ...galleries.map((g) => ({ value: g.id, label: `${g.name} — ${g.location}` })),
        ],
      })}
    </div>
    ${field('banner_image', 'Banner image', e.banner_image || '', { hint: 'e.g. images/events/capicotto.jpg' })}
    ${field('schedule', 'Session times', e.schedule || '', {
      rows: 4,
      hint: 'One line per session, e.g. “Friday, August 21st, 2pm – 6pm”.',
    })}
    ${field('description', 'Description', e.description || '', { rows: 4 })}
    <div class="grid grid-2">
      ${field('slug', 'URL slug', e.slug || '')}
      ${field('status', 'Status', e.status || 'published', {
        options: [
          { value: 'published', label: 'Published' },
          { value: 'draft', label: 'Draft — not written to the site' },
          { value: 'archived', label: 'Archived' },
        ],
      })}
    </div>`;
}

function edit(e, artists, galleries) {
  const isNew = !e?.id;
  openDrawer({
    title: isNew ? 'New event' : e.title,
    body: form(e || {}, artists, galleries),
    footer: `<button class="btn btn-primary" data-save>${isNew ? 'Create event' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn btn-danger" data-delete>Delete</button>'}`,
  });

  document.querySelector('[data-save]').onclick = async () => {
    try {
      const v = drawerValues();
      if (!v.start_date) return toast('A start date is required.', 'bad');
      if (isNew) await post('/events', v);
      else await put(`/events/${e.id}`, v);
      toast(isNew ? 'Event created.' : 'Event saved.', 'ok');
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
      if (!confirmAction(`Delete “${e.title}”? The event page is removed on the next publish.`)) return;
      try {
        await del(`/events/${e.id}`);
        toast('Event deleted.', 'ok');
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

route('events', async (view) => {
  const [events, artists, galleries] = await Promise.all([get('/events'), get('/artists'), get('/galleries')]);
  const today = new Date().toISOString().slice(0, 10);

  view.innerHTML = `
    <div class="row wrap mb">
      <span class="muted small">${events.length} events · ${events.filter((e) => e.start_date >= today).length} upcoming</span>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-new>New event</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th></th><th>Event</th><th>Date</th><th>Artist</th><th>Gallery</th>
          <th>Status</th><th></th></tr></thead>
        <tbody data-rows>${events
          .map(
            (e) => `<tr data-id="${e.id}">
            <td><img class="thumb thumb-lg" style="width:88px;height:46px" src="${img(e.banner_image)}" alt="" loading="lazy"></td>
            <td>${h(e.title)}<div class="dim small mono">${h(e.slug)}</div></td>
            <td>${fmtDate(e.start_date)}
              ${e.start_date >= today ? '<div class="pill pill-new" style="margin-top:.2rem">upcoming</div>' : '<div class="dim small">past</div>'}</td>
            <td class="muted small">${h(e.artist_name || '—')}</td>
            <td class="muted small">${h(e.gallery_name || '—')}</td>
            <td>${
              e.status === 'published'
                ? '<span class="pill">published</span>'
                : `<span class="pill pill-closed">${h(e.status)}</span>`
            }</td>
            <td><button class="btn btn-sm" data-edit>Edit</button></td>
          </tr>`
          )
          .join('')}</tbody>
      </table></div>
    </div>`;

  view.querySelector('[data-new]').onclick = () => edit({}, artists, galleries);
  view.querySelector('[data-rows]').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-edit]');
    if (!btn) return;
    edit(events.find((e) => e.id === Number(btn.closest('tr').dataset.id)), artists, galleries);
  });
});
