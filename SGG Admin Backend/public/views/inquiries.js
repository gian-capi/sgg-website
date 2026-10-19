import {
  route, get, put, del, h, toast, fmtWhen, confirmAction, refreshBadges, reload, go,
} from '/assets/app.js';

const STATUSES = ['New', 'Contacted', 'Closed'];
const pillClass = (s) => `pill pill-${s.toLowerCase()}`;

route('inquiries', async (view) => {
  const params = new URLSearchParams(location.search);
  const status = params.get('status') || '';
  const rows = await get(`/inquiries${status ? `?status=${encodeURIComponent(status)}` : ''}`);

  view.innerHTML = `
    <div class="row wrap mb">
      <div class="row">
        <button class="btn btn-sm${!status ? ' btn-accent' : ''}" data-status="">All</button>
        ${STATUSES.map(
          (s) => `<button class="btn btn-sm${status === s ? ' btn-accent' : ''}" data-status="${s}">${s}</button>`
        ).join('')}
      </div>
      <span class="muted small">${rows.length} shown</span>
      <div class="spacer"></div>
      <a class="btn btn-sm" href="/api/inquiries/export.csv">Export CSV</a>
    </div>

    <div class="card">
      ${
        rows.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Received</th><th>Email</th><th>Type</th><th>From page</th>
                <th>Status</th><th>Notes</th><th></th></tr></thead>
              <tbody data-rows>${rows
                .map(
                  (r) => `<tr data-id="${r.id}">
                  <td class="dim small mono">${fmtWhen(r.created_at)}</td>
                  <td><a href="mailto:${h(r.email)}">${h(r.email)}</a>
                    ${r.name ? `<div class="dim small">${h(r.name)}</div>` : ''}</td>
                  <td class="muted small">${h(r.type)}</td>
                  <td class="dim small truncate">${h(r.source_path || '—')}</td>
                  <td><span class="${pillClass(r.status)}">${h(r.status)}</span></td>
                  <td><input class="input" data-notes value="${h(r.notes)}" placeholder="Add a note…"></td>
                  <td class="row" style="gap:.3rem">
                    <select class="select" data-set style="width:8.5rem">
                      ${STATUSES.map(
                        (s) => `<option${s === r.status ? ' selected' : ''}>${s}</option>`
                      ).join('')}
                    </select>
                    <button class="btn btn-sm btn-danger" data-del>×</button>
                  </td>
                </tr>`
                )
                .join('')}</tbody></table></div>`
          : `<div class="empty">
               <p>No inquiries${status ? ` with status “${h(status)}”` : ''} yet.</p>
               <p class="small">Newsletter sign-ups from the published site land here automatically.</p>
             </div>`
      }
    </div>`;

  view.querySelectorAll('[data-status]').forEach((b) => {
    b.onclick = () => go(b.dataset.status ? `/inquiries?status=${b.dataset.status}` : '/inquiries');
  });

  const tbody = view.querySelector('[data-rows]');
  if (!tbody) return;

  tbody.addEventListener('change', async (e) => {
    const tr = e.target.closest('tr');
    const id = tr.dataset.id;
    try {
      if (e.target.matches('[data-set]')) {
        await put(`/inquiries/${id}`, { status: e.target.value });
        tr.querySelector('.pill').className = pillClass(e.target.value);
        tr.querySelector('.pill').textContent = e.target.value;
        toast('Status updated.', 'ok');
        refreshBadges();
      }
      if (e.target.matches('[data-notes]')) {
        await put(`/inquiries/${id}`, { notes: e.target.value });
        toast('Note saved.', 'ok');
      }
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  tbody.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-del]')) return;
    const tr = e.target.closest('tr');
    if (!confirmAction('Delete this inquiry?')) return;
    try {
      await del(`/inquiries/${tr.dataset.id}`);
      tr.remove();
      refreshBadges();
      toast('Deleted.', 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    }
  });
});
