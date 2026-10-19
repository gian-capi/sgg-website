import {
  route, get, post, put, del, h, toast,
  openDrawer, closeDrawer, drawerValues, field, checkbox, confirmAction,
  refreshPublishState, reload,
} from '/assets/app.js';

const KINDS = {
  welcome: 'Welcome — headline, logos, rotating artwork',
  event: 'Event feature — artwork, details, two CTAs',
  releases: 'New releases — headline, CTA, artwork grid',
  statement: 'Statement — full-bleed photo, headline, CTA',
};

function slideForm(s) {
  const cfg = s.config || '{}';
  return `
    ${field('kind', 'Slide type', s.kind || 'statement', {
      options: Object.entries(KINDS).map(([value, label]) => ({ value, label })),
    })}
    ${field('eyebrow', 'Eyebrow', s.eyebrow || '', { placeholder: 'Next art show' })}
    ${field('headline', 'Headline', s.headline || '', {
      rows: 3,
      hint: 'One line per row — each row becomes a line break in the big display type.',
    })}
    ${field('body', 'Body copy', s.body || '', { rows: 3 })}
    <div class="grid grid-2">
      ${field('cta_label', 'Primary CTA label', s.cta_label || '')}
      ${field('cta_href', 'Primary CTA link', s.cta_href || '')}
    </div>
    <div class="grid grid-2">
      ${field('cta2_label', 'Secondary CTA label', s.cta2_label || '')}
      ${field('cta2_href', 'Secondary CTA link', s.cta2_href || '')}
    </div>
    ${field('image', 'Image', s.image || '', { hint: 'Used by the event and statement slide types.' })}
    ${field('config', 'Advanced (JSON)', cfg, {
      rows: 5,
      hint: 'Per-type extras: logos, rotator, grid (image path arrays), detail (HTML lines), caption.',
    })}
    ${checkbox('active', 'Show this slide on the site', s.id ? s.active : 1)}`;
}

function editSlide(s) {
  const isNew = !s?.id;
  openDrawer({
    title: isNew ? 'New hero slide' : `Hero slide — ${s.kind}`,
    body: slideForm(s || {}),
    footer: `<button class="btn btn-primary" data-save>${isNew ? 'Create slide' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn btn-danger" data-delete>Delete</button>'}`,
  });

  document.querySelector('[data-save]').onclick = async () => {
    const v = drawerValues();
    try {
      JSON.parse(v.config || '{}');
    } catch {
      return toast('The advanced JSON is not valid.', 'bad');
    }
    try {
      if (isNew) await post('/hero-slides', v);
      else await put(`/hero-slides/${s.id}`, v);
      toast('Slide saved.', 'ok');
      closeDrawer();
      refreshPublishState();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const delBtn = document.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirmAction('Delete this hero slide?')) return;
      await del(`/hero-slides/${s.id}`);
      toast('Slide deleted.', 'ok');
      closeDrawer();
      refreshPublishState();
      reload();
    };
  }
}

function editFaq(f) {
  const isNew = !f?.id;
  openDrawer({
    title: isNew ? 'New question' : 'Edit question',
    body: `
      ${field('question', 'Question', f.question || '')}
      ${field('answer', 'Answer', f.answer || '', {
        rows: 7,
        hint: 'Basic HTML is allowed, e.g. <a href="…">links</a>.',
      })}
      ${checkbox('active', 'Show on the site', f.id ? f.active : 1)}`,
    footer: `<button class="btn btn-primary" data-save>${isNew ? 'Create' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn btn-danger" data-delete>Delete</button>'}`,
  });

  document.querySelector('[data-save]').onclick = async () => {
    try {
      const v = drawerValues();
      if (isNew) await post('/faqs', v);
      else await put(`/faqs/${f.id}`, v);
      toast('Saved.', 'ok');
      closeDrawer();
      refreshPublishState();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const delBtn = document.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirmAction('Delete this question?')) return;
      await del(`/faqs/${f.id}`);
      toast('Deleted.', 'ok');
      closeDrawer();
      refreshPublishState();
      reload();
    };
  }
}

route('homepage', async (view) => {
  const [slides, faqs, settings] = await Promise.all([get('/hero-slides'), get('/faqs'), get('/settings')]);

  view.innerHTML = `
    <div class="card mb">
      <div class="card-head"><h2 class="display">Hero carousel</h2><div class="spacer"></div>
        <span class="label">drag to reorder</span>
        <button class="btn btn-sm btn-primary" data-save-order hidden>Save order</button>
        <button class="btn btn-sm" data-new-slide>Add slide</button></div>
      <div data-slides>
        ${slides
          .map(
            (s) => `<div class="row sortable-item" draggable="true" data-id="${s.id}"
                 style="padding:.75rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06)">
            <span class="dim mono small" style="width:1.6rem">⠿</span>
            <div style="min-width:0;flex:1">
              <div class="row" style="gap:.5rem">
                <span class="pill pill-accent">${h(s.kind)}</span>
                ${s.active ? '' : '<span class="pill pill-closed">hidden</span>'}
              </div>
              <div style="margin-top:.35rem">${h((s.headline || '').split('\n').join(' '))}</div>
              <div class="dim small">${h(s.eyebrow || '')}${s.cta_label ? ` · ${h(s.cta_label)}` : ''}</div>
            </div>
            <button class="btn btn-sm" data-edit-slide>Edit</button>
          </div>`
          )
          .join('') || '<div class="empty">No hero slides.</div>'}
      </div>
    </div>

    <div class="card mb">
      <div class="card-head"><h2 class="display">Section headings</h2><div class="spacer"></div>
        <button class="btn btn-sm btn-primary" data-save-copy>Save copy</button></div>
      <div class="card-pad">
        <div class="grid grid-2">
          ${field('releases_heading', 'New releases heading', settings.releases_heading || '')}
          ${field('releases_body', 'New releases intro', settings.releases_body || '', { rows: 3 })}
        </div>
        <div class="grid grid-2">
          ${field('artists_heading', 'Featured artists heading', settings.artists_heading || '')}
          ${field('artists_body', 'Featured artists intro', settings.artists_body || '', { rows: 3 })}
        </div>
        <div class="grid grid-2">
          ${field('events_heading', 'Events heading', settings.events_heading || '')}
          ${field('galleries_heading', 'Galleries heading', settings.galleries_heading || '')}
        </div>
        ${field('galleries_body', 'Galleries intro', settings.galleries_body || '', {
          rows: 2,
          hint: 'One line per row — each becomes a line break.',
        })}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2 class="display">Gallery information · FAQ</h2><div class="spacer"></div>
        <span class="label">drag to reorder</span>
        <button class="btn btn-sm btn-primary" data-save-faq-order hidden>Save order</button>
        <button class="btn btn-sm" data-new-faq>Add question</button></div>
      <div data-faqs>
        ${faqs
          .map(
            (f) => `<div class="row sortable-item" draggable="true" data-id="${f.id}"
                 style="padding:.7rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06)">
            <span class="dim mono small" style="width:1.6rem">⠿</span>
            <div style="min-width:0;flex:1">
              <div>${h(f.question)}${f.active ? '' : ' <span class="pill pill-closed">hidden</span>'}</div>
              <div class="dim small truncate" style="max-width:60rem">${h(f.answer.replace(/<[^>]+>/g, ''))}</div>
            </div>
            <button class="btn btn-sm" data-edit-faq>Edit</button>
          </div>`
          )
          .join('') || '<div class="empty">No questions.</div>'}
      </div>
    </div>`;

  // --- shared drag-to-reorder wiring ---
  function sortable(container, saveBtn, endpoint) {
    let dragged = null;
    container.addEventListener('dragstart', (e) => {
      dragged = e.target.closest('.sortable-item');
      dragged?.classList.add('dragging');
    });
    container.addEventListener('dragend', () => {
      dragged?.classList.remove('dragging');
      dragged = null;
    });
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const over = e.target.closest('.sortable-item');
      if (!over || !dragged || over === dragged) return;
      const r = over.getBoundingClientRect();
      over.parentNode.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
      saveBtn.removeAttribute('hidden');
    });
    saveBtn.onclick = async () => {
      const ids = [...container.querySelectorAll('.sortable-item')].map((el) => Number(el.dataset.id));
      try {
        await post(`${endpoint}/reorder`, { ids });
        toast('Order saved.', 'ok');
        refreshPublishState();
        reload();
      } catch (err) {
        toast(err.message, 'bad');
      }
    };
  }

  sortable(view.querySelector('[data-slides]'), view.querySelector('[data-save-order]'), '/hero-slides');
  sortable(view.querySelector('[data-faqs]'), view.querySelector('[data-save-faq-order]'), '/faqs');

  view.querySelector('[data-new-slide]').onclick = () => editSlide({});
  view.querySelector('[data-new-faq]').onclick = () => editFaq({});

  view.querySelector('[data-slides]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit-slide]');
    if (btn) editSlide(slides.find((s) => s.id === Number(btn.closest('[data-id]').dataset.id)));
  });
  view.querySelector('[data-faqs]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit-faq]');
    if (btn) editFaq(faqs.find((f) => f.id === Number(btn.closest('[data-id]').dataset.id)));
  });

  view.querySelector('[data-save-copy]').onclick = async (e) => {
    const payload = {};
    e.target.closest('.card').querySelectorAll('[name]').forEach((el) => { payload[el.name] = el.value; });
    try {
      await put('/settings', payload);
      toast('Copy saved.', 'ok');
      refreshPublishState();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
});
