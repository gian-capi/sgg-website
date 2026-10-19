import { route, get, post, h, img, toast, refreshPublishState, reload } from '/assets/app.js';

route('releases', async (view) => {
  const [releases, allWorks] = await Promise.all([get('/releases'), get('/artworks')]);
  const inCarousel = new Set(releases.map((r) => r.id));
  const candidates = allWorks.filter((w) => !inCarousel.has(w.id) && w.status === 'active');

  view.innerHTML = `
    <div class="card card-pad mb">
      <p class="small muted" style="margin:0">
        These are the pieces in the homepage <strong>New Releases</strong> carousel, in order.
        Drag to reorder, or remove a piece to drop it from the carousel — its catalogue entry stays intact.
      </p>
    </div>

    <div class="grid grid-2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start">
      <div class="card">
        <div class="card-head"><h2 class="display">In the carousel</h2><div class="spacer"></div>
          <span class="label" data-n>${releases.length} pieces</span>
          <button class="btn btn-sm btn-primary" data-save hidden>Save order</button></div>
        <div data-list>
          ${releases.map(rowHtml).join('') || '<div class="empty">No releases selected.</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="display">Add a piece</h2></div>
        <div class="card-pad">
          <input class="input" placeholder="Search artworks…" data-search>
        </div>
        <div class="table-wrap" style="max-height:32rem">
          <table class="table"><tbody data-candidates>
            ${candidates
              .slice(0, 300)
              .map(
                (w) => `<tr data-add="${w.id}" data-search="${h((w.title + ' ' + w.artist_name).toLowerCase())}">
                  <td style="width:52px"><img class="thumb" src="${img(w.thumb_path || w.image_path)}" alt="" loading="lazy"></td>
                  <td>${h(w.title)}<div class="dim small">${h(w.artist_name)}</div></td>
                  <td style="width:4rem"><button class="btn btn-sm">Add</button></td>
                </tr>`
              )
              .join('')}
          </tbody></table>
        </div>
      </div>
    </div>`;

  function rowHtml(w) {
    return `<div class="row sortable-item" draggable="true" data-id="${w.id}"
                 style="padding:.6rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06)">
      <span class="dim mono small" style="width:1.6rem">⠿</span>
      <img class="thumb" src="${img(w.thumb_path || w.image_path)}" alt="" loading="lazy">
      <div style="min-width:0">
        <div class="truncate">${h(w.title)}</div>
        <div class="dim small">${h(w.artist_name)}${w.dimensions ? ' · ' + h(w.dimensions) : ''}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-sm btn-danger" data-remove>Remove</button>
    </div>`;
  }

  const list = view.querySelector('[data-list]');
  const saveBtn = view.querySelector('[data-save]');

  const markDirty = () => saveBtn.removeAttribute('hidden');

  // --- drag to reorder ---
  let dragged = null;
  list.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.sortable-item');
    if (dragged) dragged.classList.add('dragging');
  });
  list.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    dragged = null;
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = e.target.closest('.sortable-item');
    if (!over || !dragged || over === dragged) return;
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    over.parentNode.insertBefore(dragged, after ? over.nextSibling : over);
    markDirty();
  });

  list.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-remove]')) return;
    e.target.closest('.sortable-item').remove();
    markDirty();
  });

  saveBtn.onclick = async () => {
    const ids = [...list.querySelectorAll('.sortable-item')].map((el) => Number(el.dataset.id));
    try {
      await post('/releases/reorder', { ids });
      toast(`Saved ${ids.length} releases.`, 'ok');
      refreshPublishState();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  view.querySelector('[data-candidates]').addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-add]');
    if (!tr) return;
    const ids = [...list.querySelectorAll('.sortable-item')].map((el) => Number(el.dataset.id));
    ids.push(Number(tr.dataset.add));
    try {
      await post('/releases/reorder', { ids });
      toast('Added to the carousel.', 'ok');
      refreshPublishState();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  const search = view.querySelector('[data-search]');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    view.querySelectorAll('[data-candidates] tr').forEach((tr) => {
      tr.hidden = q && !tr.dataset.search.includes(q);
    });
  });
});
