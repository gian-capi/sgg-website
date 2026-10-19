/* SGG Admin — shell, router and shared helpers. */

// ------------------------------------------------------------------ api ---

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname);
    throw new Error('Not signed in');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

// -------------------------------------------------------------- helpers ---

/** Escape for safe interpolation into innerHTML. */
export function h(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Site-relative image path -> URL the admin can display. */
export const img = (p) =>
  p ? '/site-images/' + String(p).replace(/^images\//, '') : '';

export const num = (n) => Number(n || 0).toLocaleString();

export function delta(value, previous) {
  if (!previous) return value ? { cls: 'up', text: 'new' } : { cls: 'flat', text: '—' };
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return { cls: 'flat', text: 'no change' };
  return { cls: pct > 0 ? 'up' : 'down', text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%` };
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('T') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return fmtDate(iso);
}

export function toast(message, kind = '') {
  const wrap = document.querySelector('[data-toasts]');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, kind === 'bad' ? 6000 : 3200);
}

// --------------------------------------------------------------- drawer ---

const drawer = {
  back: document.querySelector('[data-drawer-back]'),
  el: document.querySelector('[data-drawer]'),
  title: document.querySelector('[data-drawer-title]'),
  body: document.querySelector('[data-drawer-body]'),
  foot: document.querySelector('[data-drawer-foot]'),
};

export function openDrawer({ title, body, footer }) {
  drawer.title.textContent = title;
  drawer.body.innerHTML = body;
  drawer.foot.innerHTML = footer || '';
  drawer.el.classList.add('open');
  drawer.back.classList.add('open');
  setTimeout(() => drawer.body.querySelector('input,textarea,select')?.focus(), 120);
  return drawer;
}

export function closeDrawer() {
  drawer.el.classList.remove('open');
  drawer.back.classList.remove('open');
}

drawer.back.addEventListener('click', closeDrawer);
document.querySelector('[data-drawer-close]').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

/** Read every [name] control inside the drawer body into a plain object. */
export function drawerValues() {
  const out = {};
  drawer.body.querySelectorAll('[name]').forEach((el) => {
    out[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
  });
  return out;
}

export const drawerBody = () => drawer.body;

// --------------------------------------------------------------- fields ---

export function field(name, label, value = '', opts = {}) {
  const { type = 'text', hint = '', rows = 0, options = null, placeholder = '' } = opts;
  let control;
  if (options) {
    control = `<select class="select" name="${name}">${options
      .map((o) => `<option value="${h(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${h(o.label)}</option>`)
      .join('')}</select>`;
  } else if (rows) {
    control = `<textarea class="textarea" name="${name}" rows="${rows}" placeholder="${h(placeholder)}">${h(value)}</textarea>`;
  } else {
    control = `<input class="input" type="${type}" name="${name}" value="${h(value)}" placeholder="${h(placeholder)}">`;
  }
  return `<label class="field"><span>${h(label)}</span>${control}${hint ? `<span class="hint">${h(hint)}</span>` : ''}</label>`;
}

export function checkbox(name, label, checked) {
  return `<label class="switch field"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}><span>${h(label)}</span></label>`;
}

/** Simple confirm dialog wrapper so destructive actions always ask. */
export function confirmAction(message) {
  return window.confirm(message);
}

// --------------------------------------------------------------- router ---

const routes = {};
let currentUser = null;

export const user = () => currentUser;

export function route(name, loader) {
  routes[name] = loader;
}

const titles = {
  dashboard: 'Dashboard',
  reports: 'Reports',
  inquiries: 'Inquiries',
  artists: 'Artists',
  artworks: 'Artworks',
  releases: 'New Releases',
  events: 'Events',
  galleries: 'Galleries',
  homepage: 'Homepage',
  media: 'Media',
  settings: 'Settings',
  users: 'Team',
};

export function go(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  render();
}

/** Re-render the current screen in place, without touching history. */
export function reload() {
  return render();
}

const view = document.querySelector('[data-view]');

async function render() {
  const name = (location.pathname.split('/')[1] || 'dashboard').toLowerCase();
  const loader = routes[name] || routes.dashboard;

  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === name);
  });
  document.querySelector('[data-page-title]').textContent = titles[name] || 'Dashboard';

  view.innerHTML = '<div class="empty"><span class="spin" style="display:inline-block"></span></div>';
  try {
    await loader(view);
  } catch (err) {
    view.innerHTML = `<div class="card card-pad"><p style="color:#fca5a5;margin:0">${h(err.message)}</p></div>`;
  }
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (!link) return;
  e.preventDefault();
  closeDrawer();
  go(link.getAttribute('href'));
});

window.addEventListener('popstate', render);

// -------------------------------------------------------------- publish ---

export async function refreshPublishState() {
  const state = document.querySelector('[data-publish-state]');
  try {
    const s = await get('/publish/status');
    state.innerHTML = s.dirty
      ? `<span class="dot-dirty"></span><span class="muted">Unpublished changes</span>`
      : `<span class="dot-live"></span><span class="muted">Site up to date${
          s.lastPublishAt ? ` · ${fmtWhen(s.lastPublishAt)}` : ''
        }</span>`;
  } catch {
    state.innerHTML = '';
  }
}

document.querySelector('[data-publish-btn]').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!confirmAction('Publish now? This rewrites the live website files. A backup is taken first.')) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> PUBLISHING';
  try {
    const r = await post('/publish', {});
    toast(`Published ${r.count} files in ${r.ms}ms.`, 'ok');
    if (r.removed?.length) toast(`Removed ${r.removed.length} orphaned page(s).`);
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
    refreshPublishState();
  }
});

// --------------------------------------------------------------- badges ---

export async function refreshBadges() {
  try {
    const o = await get('/reports/overview?days=30');
    const set = (k, v) => {
      const el = document.querySelector(`[data-badge="${k}"]`);
      if (el) el.textContent = v ? num(v) : '';
    };
    set('artists', o.catalog.artists);
    set('artworks', o.catalog.artworks);
    set('events', o.catalog.events);
    set('galleries', o.catalog.galleries);
    set('inquiries', o.newInquiries);
  } catch {
    /* badges are decorative */
  }
}

// ----------------------------------------------------------------- boot ---

const views = [
  'dashboard', 'reports', 'inquiries', 'artists', 'artworks',
  'releases', 'events', 'galleries', 'homepage', 'media', 'settings', 'users',
];

/**
 * Boot runs inside an async function rather than as top-level await: the view
 * modules import back from this one, and a top-level await here would make
 * that cycle deadlock — each module waiting on the other to finish evaluating.
 */
async function boot() {
  try {
    await Promise.all(views.map((v) => import(`/assets/views/${v}.js`)));

    currentUser = await get('/me');
    document.querySelector('[data-user-name]').textContent = currentUser.name || currentUser.email;
    document.querySelector('[data-user-role]').textContent = currentUser.role;
    if (currentUser.role === 'owner') {
      document.querySelectorAll('[data-owner-only]').forEach((el) => el.removeAttribute('hidden'));
    }

    if (location.pathname === '/') go('/dashboard', true);
    else await render();

    refreshPublishState();
    refreshBadges();
  } catch (err) {
    view.innerHTML = `<div class="card card-pad"><p style="color:#fca5a5;margin:0">
      Could not start the admin: ${h(err.message)}</p></div>`;
    throw err;
  }
}

boot();
