import {
  route, get, post, put, del, h, toast, fmtWhen, confirmAction,
  openDrawer, closeDrawer, drawerValues, field, reload, user,
} from '/assets/app.js';

const ROLES = [
  { value: 'owner', label: 'Owner — full access, can manage the team' },
  { value: 'editor', label: 'Editor — can edit content and publish' },
  { value: 'viewer', label: 'Viewer — read-only reports' },
];

function edit(u) {
  const isNew = !u?.id;
  openDrawer({
    title: isNew ? 'Add team member' : u.email,
    body: `
      ${isNew ? field('email', 'Email', '', { type: 'email' }) : ''}
      ${field('name', 'Name', u.name || '')}
      ${field('role', 'Role', u.role || 'editor', { options: ROLES })}
      ${field('password', isNew ? 'Password' : 'New password (optional)', '', {
        type: 'password',
        hint: 'At least 8 characters.',
      })}
      ${isNew ? '' : field('active', 'Account status', u.active, {
        options: [
          { value: 1, label: 'Active' },
          { value: 0, label: 'Disabled — cannot sign in' },
        ],
      })}`,
    footer: `<button class="btn btn-primary" data-save>${isNew ? 'Add member' : 'Save changes'}</button>
      ${isNew || u.id === user().id ? '' : '<button class="btn btn-danger" data-delete>Remove</button>'}`,
  });

  document.querySelector('[data-save]').onclick = async () => {
    const v = drawerValues();
    try {
      if (isNew) {
        if (!v.email || !v.password) return toast('Email and password are required.', 'bad');
        await post('/users', v);
      } else {
        const payload = { name: v.name, role: v.role, active: Number(v.active) };
        if (v.password) payload.password = v.password;
        await put(`/users/${u.id}`, payload);
      }
      toast('Saved.', 'ok');
      closeDrawer();
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const delBtn = document.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirmAction(`Remove ${u.email}?`)) return;
      try {
        await del(`/users/${u.id}`);
        toast('Removed.', 'ok');
        closeDrawer();
        reload();
      } catch (err) {
        toast(err.message, 'bad');
      }
    };
  }
}

route('users', async (view) => {
  if (user()?.role !== 'owner') {
    view.innerHTML = '<div class="card card-pad"><p class="muted" style="margin:0">Owner access required.</p></div>';
    return;
  }
  const users = await get('/users');

  view.innerHTML = `
    <div class="row mb">
      <span class="muted small">${users.length} team members</span>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-new>Add member</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
        <tbody data-rows>${users
          .map(
            (u) => `<tr data-id="${u.id}">
            <td>${h(u.name || '—')}</td>
            <td class="mono small">${h(u.email)}</td>
            <td><span class="pill${u.role === 'owner' ? ' pill-accent' : ''}">${h(u.role)}</span></td>
            <td>${u.active ? '<span class="pill pill-new">active</span>' : '<span class="pill pill-closed">disabled</span>'}</td>
            <td class="dim small">${u.last_login_at ? fmtWhen(u.last_login_at) : 'never'}</td>
            <td><button class="btn btn-sm" data-edit>Edit</button></td>
          </tr>`
          )
          .join('')}</tbody>
      </table></div>
    </div>`;

  view.querySelector('[data-new]').onclick = () => edit({});
  view.querySelector('[data-rows]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) edit(users.find((u) => u.id === Number(btn.closest('tr').dataset.id)));
  });
});
