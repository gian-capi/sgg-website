import {
  route, get, put, post, h, toast, field, fmtWhen, confirmAction,
  refreshPublishState, user,
} from '/assets/app.js';

route('settings', async (view) => {
  const [settings, pub] = await Promise.all([get('/settings'), get('/publish/status')]);
  const isOwner = user()?.role === 'owner';

  view.innerHTML = `
    <div class="card mb">
      <div class="card-head"><h2 class="display">Site details</h2><div class="spacer"></div>
        <button class="btn btn-sm btn-primary" data-save>Save</button></div>
      <div class="card-pad" data-form>
        ${field('site_title', 'Homepage title tag', settings.site_title || '')}
        ${field('site_description', 'Homepage meta description', settings.site_description || '', { rows: 2 })}
        <div class="grid grid-2">
          ${field('contact_email', 'Contact email', settings.contact_email || '')}
          ${field('credit_name', 'Footer credit', settings.credit_name || '')}
        </div>
        <div class="grid grid-2">
          ${field('instagram_url', 'Instagram URL', settings.instagram_url || '')}
          ${field('facebook_url', 'Facebook URL', settings.facebook_url || '')}
        </div>
        <div class="grid grid-2">
          ${field('footer_heading', 'Footer heading', settings.footer_heading || '')}
          ${field('footer_body', 'Footer copy', settings.footer_body || '', { rows: 3 })}
        </div>
      </div>
    </div>

    <div class="card mb">
      <div class="card-head"><h2 class="display">Publishing</h2></div>
      <div class="card-pad">
        <div class="row small" style="margin-bottom:.8rem">
          <span class="muted">Status</span><div class="spacer"></div>
          ${
            pub.dirty
              ? '<span class="pill pill-contacted">unpublished changes</span>'
              : '<span class="pill pill-new">up to date</span>'
          }
        </div>
        <div class="row small" style="margin-bottom:.8rem">
          <span class="muted">Last publish</span><div class="spacer"></div>
          <span class="mono">${pub.lastPublishAt ? fmtWhen(pub.lastPublishAt) : 'never'}</span>
        </div>
        <div class="row small" style="margin-bottom:1rem">
          <span class="muted">Last import from site</span><div class="spacer"></div>
          <span class="mono">${pub.lastImportAt ? fmtWhen(pub.lastImportAt) : 'never'}</span>
        </div>
        <div class="row wrap" style="gap:.5rem">
          <button class="btn" data-dry>Dry run</button>
          ${isOwner ? '<button class="btn btn-danger" data-reimport>Re-import from site files</button>' : ''}
        </div>
        <p class="hint">
          A dry run renders every page without writing anything — useful to confirm a change compiles.
          Re-importing discards database edits and reads the current site files back in.
        </p>
      </div>
    </div>

    <div class="card mb">
      <div class="card-head"><h2 class="display">Publish history</h2></div>
      ${
        pub.history.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>When</th><th>Status</th><th class="num">Files</th><th>Backup</th></tr></thead>
              <tbody>${pub.history
                .map(
                  (p) => `<tr>
                  <td class="mono small">${fmtWhen(p.started_at)}</td>
                  <td>${
                    p.status === 'success'
                      ? '<span class="pill pill-new">success</span>'
                      : p.status === 'failed'
                        ? '<span class="pill" style="border-color:rgba(248,113,113,.5);color:#fca5a5">failed</span>'
                        : '<span class="pill">running</span>'
                  }</td>
                  <td class="num">${p.files_written}</td>
                  <td class="dim small mono truncate">${h(p.backup_path || '—')}</td>
                </tr>`
                )
                .join('')}</tbody></table></div>`
          : '<div class="empty">No publishes yet.</div>'
      }
    </div>

    <div class="card">
      <div class="card-head"><h2 class="display">Your password</h2></div>
      <div class="card-pad">
        <label class="field" style="max-width:24rem">
          <span>New password</span>
          <input class="input" type="password" data-pw minlength="8" placeholder="At least 8 characters">
        </label>
        <button class="btn" data-pw-save>Update password</button>
      </div>
    </div>`;

  view.querySelector('[data-save]').onclick = async () => {
    const payload = {};
    view.querySelectorAll('[data-form] [name]').forEach((el) => { payload[el.name] = el.value; });
    try {
      await put('/settings', payload);
      toast('Settings saved.', 'ok');
      refreshPublishState();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  view.querySelector('[data-dry]').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await post('/publish', { dryRun: true });
      toast(`Dry run OK — ${r.count} files would be written.`, 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      e.target.disabled = false;
    }
  };

  const reimport = view.querySelector('[data-reimport]');
  if (reimport) {
    reimport.onclick = async () => {
      if (!confirmAction('Re-import from the site files? Unpublished database edits will be overwritten.')) return;
      try {
        await post('/import', {});
        toast('Re-imported from the site.', 'ok');
        refreshPublishState();
      } catch (err) {
        toast(err.message, 'bad');
      }
    };
  }

  view.querySelector('[data-pw-save]').onclick = async () => {
    const pw = view.querySelector('[data-pw]').value;
    if (pw.length < 8) return toast('Password must be at least 8 characters.', 'bad');
    try {
      await post('/me/password', { password: pw });
      view.querySelector('[data-pw]').value = '';
      toast('Password updated.', 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
});
