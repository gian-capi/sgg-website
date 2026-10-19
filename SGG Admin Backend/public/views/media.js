import { route, get, h, img, toast, go, reload } from '/assets/app.js';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

route('media', async (view) => {
  const dir = new URLSearchParams(location.search).get('dir') || '';
  const data = await get(`/media?dir=${encodeURIComponent(dir)}`);

  const crumbs = ['images', ...(dir ? dir.split('/') : [])];

  view.innerHTML = `
    <div class="row wrap mb">
      <div class="row small mono">
        ${crumbs
          .map((part, i) => {
            const target = crumbs.slice(1, i + 1).join('/');
            return i === crumbs.length - 1
              ? `<span>${h(part)}</span>`
              : `<a href="/media?dir=${encodeURIComponent(target)}" data-crumb="${h(target)}" class="muted">${h(part)}</a><span class="dim">/</span>`;
          })
          .join('')}
      </div>
      <div class="spacer"></div>
      <label class="switch small"><input type="checkbox" data-thumbs><span>Also make 420px thumbnails</span></label>
      <button class="btn btn-primary" data-pick>Upload images</button>
      <input type="file" accept="image/*" multiple hidden data-file>
    </div>

    <div class="drop-zone mb" data-drop>
      Drop images here to upload into <span class="mono">images/${h(dir) || ''}</span>
    </div>

    ${
      data.folders.length
        ? `<div class="card mb"><div class="card-head"><h2 class="display">Folders</h2></div>
           <div class="card-pad row wrap" style="gap:.5rem">
             ${data.folders
               .map(
                 (f) => `<a class="btn btn-sm" href="/media?dir=${encodeURIComponent(dir ? dir + '/' + f : f)}"
                   data-crumb="${h(dir ? dir + '/' + f : f)}">${h(f)}/</a>`
               )
               .join('')}
           </div></div>`
        : ''
    }

    <div class="card">
      <div class="card-head"><h2 class="display">Images</h2><div class="spacer"></div>
        <span class="label">${data.files.length} files</span></div>
      ${
        data.files.length
          ? `<div class="card-pad grid" style="grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr));gap:.75rem">
              ${data.files
                .map(
                  (f) => `<div class="card" style="overflow:hidden">
                  <img src="${img(f.path)}" alt="" loading="lazy"
                       style="width:100%;aspect-ratio:1;object-fit:cover;background:rgba(255,255,255,.04)">
                  <div style="padding:.5rem .6rem">
                    <div class="small truncate" style="max-width:100%">${h(f.name)}</div>
                    <div class="dim small mono">${kb(f.size)}</div>
                    <button class="btn btn-sm" style="margin-top:.4rem;width:100%"
                      data-copy="${h(f.path)}">Copy path</button>
                  </div>
                </div>`
                )
                .join('')}
            </div>`
          : '<div class="empty">No images in this folder.</div>'
      }
    </div>`;

  view.addEventListener('click', (e) => {
    const crumb = e.target.closest('[data-crumb]');
    if (crumb) {
      e.preventDefault();
      go(`/media?dir=${encodeURIComponent(crumb.dataset.crumb)}`);
      return;
    }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard.writeText(copy.dataset.copy);
      toast(`Copied ${copy.dataset.copy}`, 'ok');
    }
  });

  const fileInput = view.querySelector('[data-file]');
  view.querySelector('[data-pick]').onclick = () => fileInput.click();
  fileInput.onchange = () => upload(fileInput.files);

  const drop = view.querySelector('[data-drop]');
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('hot');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('hot');
    })
  );
  drop.addEventListener('drop', (e) => upload(e.dataTransfer.files));

  async function upload(files) {
    if (!files?.length) return;
    const fd = new FormData();
    fd.append('dir', dir);
    fd.append('thumbs', view.querySelector('[data-thumbs]').checked ? 'true' : 'false');
    [...files].forEach((f) => fd.append('files', f));
    toast(`Uploading ${files.length} image(s)…`);
    try {
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast(`Uploaded ${data.files.length} image(s).`, 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }
});
