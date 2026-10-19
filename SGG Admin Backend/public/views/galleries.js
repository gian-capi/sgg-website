import {
  route, get, post, put, h, img, toast,
  openDrawer, closeDrawer, drawerValues, drawerBody, field, confirmAction,
  refreshPublishState, reload,
} from '/assets/app.js';

function form(g) {
  return `
    <div class="grid grid-2">
      ${field('name', 'Gallery name', g.name || '')}
      ${field('brand', 'Brand', g.brand || 'wyland', {
        options: [
          { value: 'wyland', label: 'Wyland Galleries' },
          { value: 'signature', label: 'Signature Galleries' },
        ],
      })}
    </div>
    ${field('location', 'Location line', g.location || '', { placeholder: 'South Lake Tahoe, California' })}
    ${field('address', 'Full address', g.address || '', {
      rows: 3,
      hint: 'One line per row — each becomes a line break on the gallery page.',
    })}
    ${field('short_address', 'Short address', g.short_address || '', {
      rows: 2,
      hint: 'Two lines, used on the homepage carousel card.',
    })}
    <div class="grid grid-2">
      ${field('phone', 'Phone', g.phone || '')}
      ${field('email', 'Email', g.email || '')}
    </div>
    ${field('hours', 'Opening hours', g.hours || '', { rows: 3, hint: 'One line per row.' })}
    <div class="grid grid-2">
      ${field('instagram_url', 'Instagram URL', g.instagram_url || '')}
      ${field('facebook_url', 'Facebook URL', g.facebook_url || '')}
    </div>
    <div class="grid grid-2">
      ${field('logo', 'Logo path', g.logo || '')}
      ${field('slug', 'URL slug', g.slug || '')}
    </div>

    <div class="card card-pad" style="margin-top:.5rem">
      <div class="row"><span class="label">Photos</span><div class="spacer"></div>
        <button class="btn btn-sm" data-add-photo type="button">Add photo</button></div>
      <div data-photos style="margin-top:.6rem"></div>
      <p class="hint">First photo is the cover. Two or more photos render as a carousel; one renders as a single image.</p>
    </div>

    <div class="card card-pad" style="margin-top:.75rem">
      <div class="row"><span class="label">Fine art consultants</span><div class="spacer"></div>
        <button class="btn btn-sm" data-add-con type="button">Add consultant</button></div>
      <div data-cons style="margin-top:.6rem"></div>
      <p class="hint">Leave the photo empty to show the placeholder avatar.</p>
    </div>`;
}

function photoRow(p = '') {
  return `<div class="row" data-photo style="margin-bottom:.4rem">
    <img class="thumb" src="${img(p)}" alt="">
    <input class="input" data-photo-path value="${h(p)}" placeholder="images/galleries/slug/0.jpg">
    <button class="btn btn-sm btn-danger" data-del type="button">×</button>
  </div>`;
}

function conRow(c = {}) {
  return `<div class="card card-pad" data-con style="margin-bottom:.5rem;background:rgba(255,255,255,.02)">
    <div class="grid grid-2">
      <input class="input" data-c="name" value="${h(c.name || '')}" placeholder="Name">
      <input class="input" data-c="title" value="${h(c.title || 'Art Consultant')}" placeholder="Title">
    </div>
    <div class="grid grid-2" style="margin-top:.5rem">
      <input class="input" data-c="email" value="${h(c.email || '')}" placeholder="name@signaturegalleries.com">
      <input class="input" data-c="photo" value="${h(c.photo || '')}" placeholder="images/con-name.jpg (optional)">
    </div>
    <div class="row" style="margin-top:.5rem"><div class="spacer"></div>
      <button class="btn btn-sm btn-danger" data-del type="button">Remove</button></div>
  </div>`;
}

async function edit(g) {
  const isNew = !g?.id;
  const [photos, cons] = isNew
    ? [[], []]
    : await Promise.all([get(`/galleries/${g.id}/photos`), get(`/galleries/${g.id}/consultants`)]);

  openDrawer({
    title: isNew ? 'New gallery' : `${g.name} — ${g.location}`,
    body: form(g || {}),
    footer: `<button class="btn btn-primary" data-save>${isNew ? 'Create gallery' : 'Save changes'}</button>`,
  });

  const body = drawerBody();
  const photosEl = body.querySelector('[data-photos]');
  const consEl = body.querySelector('[data-cons]');

  photosEl.innerHTML = photos.map((p) => photoRow(p.path)).join('') || photoRow('');
  consEl.innerHTML = cons.map(conRow).join('');

  body.querySelector('[data-add-photo]').onclick = () => photosEl.insertAdjacentHTML('beforeend', photoRow(''));
  body.querySelector('[data-add-con]').onclick = () => consEl.insertAdjacentHTML('beforeend', conRow());

  body.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) del.closest('[data-photo],[data-con]')?.remove();
  });

  document.querySelector('[data-save]').onclick = async () => {
    try {
      const values = drawerValues();
      const saved = isNew ? await post('/galleries', values) : await put(`/galleries/${g.id}`, values);

      const paths = [...photosEl.querySelectorAll('[data-photo-path]')].map((i) => i.value.trim()).filter(Boolean);
      await put(`/galleries/${saved.id}/photos`, { paths });

      const consultants = [...consEl.querySelectorAll('[data-con]')].map((el) => {
        const f = (k) => el.querySelector(`[data-c="${k}"]`).value.trim();
        return { name: f('name'), title: f('title'), email: f('email'), photo: f('photo') };
      }).filter((c) => c.name);
      await put(`/galleries/${saved.id}/consultants`, { consultants });

      toast('Gallery saved.', 'ok');
      closeDrawer();
      refreshPublishState();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
}

route('galleries', async (view) => {
  const galleries = await get('/galleries');

  view.innerHTML = `
    <div class="row mb">
      <span class="muted small">${galleries.length} galleries</span>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-new>New gallery</button>
    </div>
    <div class="grid grid-3">
      ${galleries
        .map(
          (g) => `<div class="card" data-id="${g.id}">
          <div class="card-pad">
            <div class="row">
              <div style="min-width:0">
                <div class="display" style="font-size:1.15rem">${h(g.name)}</div>
                <div class="label" style="margin-top:.3rem">${h(g.location)}</div>
              </div>
              <div class="spacer"></div>
              <span class="pill">${h(g.brand)}</span>
            </div>
            <p class="small muted" style="margin:.8rem 0 .4rem;white-space:pre-line">${h(g.address)}</p>
            <p class="mono small">${h(g.phone)}</p>
            <div class="row small dim" style="margin-top:.7rem;gap:1rem">
              <span>${g.photo_count} photos</span>
              <span>${g.consultant_count} consultants</span>
              <span>${g.event_count} events</span>
            </div>
            <button class="btn btn-sm" style="margin-top:.9rem" data-edit>Edit gallery</button>
          </div>
        </div>`
        )
        .join('')}
    </div>`;

  view.querySelector('[data-new]').onclick = () => edit({});
  view.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    edit(galleries.find((g) => g.id === Number(btn.closest('[data-id]').dataset.id)));
  });
});
