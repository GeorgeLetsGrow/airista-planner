(() => {
  const C = window.PlannerCore, U = window.U, V = window.Views, D = window.Drawer, St = window.Store, { esc } = U;
  const $ = s => document.querySelector(s);
  const main = $('#main'), drawer = $('#drawer'), scrim = $('#scrim'), modal = $('#modal');
  const saved = JSON.parse(localStorage.getItem('awp-planner-ui') || '{}');
  const initialParams = new URLSearchParams(location.search), initialTask = initialParams.get('task');
  if (initialParams.has('google')) { initialParams.delete('google'); history.replaceState(null, '', location.pathname + (initialParams.size ? '?' + initialParams : '') + location.hash); }
  const ui = { view: location.hash.slice(1) || saved.view || 'focus', f: Object.assign({ type: '', ws: '', owner: '', prio: '', q: '' }, saved.f || {}), drawerId: initialTask, tab: 'comments', since: 'last', noteDate: U.today(), rptMonth: saved.rptMonth || window.Reports.prevMonth(U.today().slice(0, 7)), rptTab: saved.rptTab || 'overview', rptEdit: false };
  const persist = () => localStorage.setItem('awp-planner-ui', JSON.stringify({ view: ui.view, f: ui.f, rptMonth: ui.rptMonth, rptTab: ui.rptTab }));
  let deferred = false;
  const themeIcon = () => { const b = $('#theme'); if (b) b.innerHTML = window.Theme.get() === 'dark' ? U.ICON.sun : U.ICON.moon; };
  themeIcon();

  const editing = () => { const a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /text|number|search|month/.test(a.type))) && a.id !== 'f-q'; };
  function render() {
    if (!St.state) return;
    if (editing()) { deferred = true; renderLight(); return; }
    deferred = false;
    $('#stats').innerHTML = V.stats(St.state);
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === ui.view));
    $('#filters').hidden = !['focus', 'board'].includes(ui.view);
    $('#who').innerHTML = St.me ? `${U.av(St.me)}${esc(St.me)}` : '';
    updateNotificationBadge();
    maybeBrowserNotify(false);
    const list = filtered();
    main.innerHTML = ui.view === 'board' ? V.board(St.state, list) : ui.view === 'ws' ? V.workstreams(St.state) : ui.view === 'road' ? V.roadmap(St.state) : ui.view === 'checkin' ? V.checkin(St.state, ui) : ui.view === 'reports' ? window.Reports.render(St.state, ui) : V.focus(St.state, list);
    renderDrawer();
  }
  function renderLight() { $('#stats').innerHTML = V.stats(St.state); }
  function renderDrawer() {
    const open = !!ui.drawerId;
    drawer.hidden = scrim.hidden = !open;
    if (!open) return;
    const draft = $('#cm-text') ? $('#cm-text').value : '', st = drawer.querySelector('.dr-body') ? drawer.querySelector('.dr-body').scrollTop : 0;
    drawer.innerHTML = D.render(St.state, ui);
    if ($('#cm-text')) $('#cm-text').value = draft;
    if (drawer.querySelector('.dr-body')) drawer.querySelector('.dr-body').scrollTop = st;
    document.querySelectorAll('.tcard').forEach(c => c.classList.toggle('sel', c.dataset.id === ui.drawerId));
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (deferred && !editing()) render(); }, 0));

  function filtered() {
    const { type, ws, owner, prio, q } = ui.f, qq = (q || '').toLowerCase();
    return St.state.items.filter(i => (!type || C.typeOf(i) === type) && (!ws || i.ws === ws) && (!owner || i.owner.includes(owner)) && (!prio || i.priority === prio) && (!qq || (i.title + ' ' + i.next + ' ' + i.blocker).toLowerCase().includes(qq)));
  }
  function setupFilters() {
    const o = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
    $('#f-type').innerHTML = o('', 'All types') + Object.entries(C.TYPES).map(([k, l]) => o(k, l)).join('');
    $('#f-ws').innerHTML = o('', 'All workstreams') + C.WS.map(w => o(w.id, w.name)).join('');
    $('#f-owner').innerHTML = o('', 'All owners') + St.people.map(p => o(p, p)).join('');
    $('#f-prio').innerHTML = o('', 'All priorities') + Object.entries(C.PRIORITY).map(([k, l]) => o(k, l)).join('');
    [['type', 'f-type'], ['ws', 'f-ws'], ['owner', 'f-owner'], ['prio', 'f-prio'], ['q', 'f-q']].forEach(([k, id]) => {
      const el = $('#' + id); el.value = ui.f[k] || '';
      el.addEventListener(k === 'q' ? 'input' : 'change', () => { ui.f[k] = el.value; persist(); render(); if (k === 'q') el.focus(); });
    });
  }

  function pageUrl(taskId) { const url = new URL(location.href); url.searchParams.delete('google'); if (taskId) url.searchParams.set('task', taskId); else url.searchParams.delete('task'); return url; }
  function setView(v) { ui.view = v; const url = pageUrl(ui.drawerId); url.hash = v; history.replaceState(null, '', url.pathname + url.search + url.hash); persist(); render(); window.scrollTo(0, 0); if (v === 'reports' && ui.rptTab === 'health') openReportTab(); }
  function openItem(id) { if (!St.state?.items.some(i => i.id === id)) return; ui.drawerId = id; ui.tab = 'comments'; const url = pageUrl(id); history.replaceState(null, '', url.pathname + url.search + url.hash); renderDrawer(); }
  function closeDrawer() { ui.drawerId = null; const url = pageUrl(); history.replaceState(null, '', url.pathname + url.search + url.hash); renderDrawer(); document.querySelectorAll('.tcard.sel').forEach(c => c.classList.remove('sel')); }

  function showModal(html) { modal.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`; modal.hidden = false; }
  function hideModal() { modal.hidden = true; modal.innerHTML = ''; }
  function confirmBox(title, body, okLabel) {
    return new Promise(res => {
      showModal(`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="acts"><button class="btn" type="button" data-m="0">Cancel</button><button class="btn primary" type="button" data-m="1">${esc(okLabel)}</button></div>`);
      modal.onclick = e => { const b = e.target.closest('[data-m]'); if (b || e.target === modal) { hideModal(); modal.onclick = null; res(!!(b && b.dataset.m === '1')); } };
    });
  }
  function addTaskForm() {
    const option = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
    showModal(`<h2>Add a new task</h2><p class="muted">Create a task and add it to the shared work plan.</p>
<form id="task-add-form" class="fgrid">
<label class="f full"><span class="label">Task title</span><input type="text" id="task-title" maxlength="200" placeholder="What needs to be done?" required autofocus></label>
<label class="f"><span class="label">Workstream</span><select id="task-ws">${C.WS.map(w => option(w.id, w.name, w.id === (ui.f.ws || 'pm'))).join('')}</select></label>
<label class="f"><span class="label">Due date</span><input type="date" id="task-due"></label>
<label class="f"><span class="label">Priority</span><select id="task-priority">${Object.entries(C.PRIORITY).map(([k, l]) => option(k, l, k === 'med')).join('')}</select></label>
<label class="f"><span class="label">Priority lane</span><select id="task-lane">${Object.entries(C.LANES).map(([k, l]) => option(k, l, k === 'later')).join('')}</select></label>
<label class="f full"><span class="label">Next action <span class="muted">(optional)</span></span><input type="text" id="task-next" maxlength="2000" placeholder="The first concrete step"></label>
<p class="auth-err full" id="task-add-err" hidden></p>
<div class="acts full"><button class="btn" type="button" data-m="close">Cancel</button><button class="btn primary" type="submit">Add task</button></div></form>`);
    modal.querySelector('.mbox').classList.add('wide');
    setTimeout(() => $('#task-title')?.focus(), 0);
  }
  let mentionIndex = 0;
  function mentionCandidates(ta) {
    const before = ta.value.slice(0, ta.selectionStart), match = before.match(/(^|\s)@([^\s@]*)$/);
    if (!match) return { match: null, names: [] };
    const q = match[2].toLowerCase();
    return { match, names: St.people.filter(name => name !== St.me && name !== 'AiRISTA' && name.toLowerCase().includes(q)).slice(0, 8) };
  }
  function updateMentionSuggestions(ta) {
    const box = $('#mention-suggest'); if (!box) return;
    const { names } = mentionCandidates(ta); mentionIndex = Math.min(mentionIndex, Math.max(0, names.length - 1));
    box.hidden = !names.length;
    box.innerHTML = names.map((name, index) => `<button type="button" data-mention-suggestion="${esc(name)}" class="${index === mentionIndex ? 'on' : ''}">${U.av(name)}<span>@${esc(name)}</span></button>`).join('');
  }
  function insertMention(name, replaceTyped) {
    const ta = $('#cm-text'); if (!ta) return;
    if (replaceTyped) {
      const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd), match = before.match(/(^|\s)@([^\s@]*)$/);
      if (match) { const start = before.length - match[0].length + match[1].length; ta.value = before.slice(0, start) + `@${name} ` + after; ta.selectionStart = ta.selectionEnd = start + name.length + 2; }
    } else {
      const token = `@${name}`;
      if (!ta.value.includes(token)) ta.value = `${ta.value}${ta.value && !/\s$/.test(ta.value) ? ' ' : ''}${token} `;
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
    mentionIndex = 0; updateMentionSuggestions(ta); ta.focus();
  }

  // Mentions are stored with shared plan data. Browser alerts are opt-in and appear
  // while the planner is open; the in-app inbox remains available on every device.
  function notificationItems() {
    if (!St.state || !St.me) return [];
    const mentions = (St.state.notifications || []).filter(n => n.to === St.me && !n.read).map(n => ({ kind: 'mention', ...n }));
    const due = St.state.items.filter(i => i.status !== 'co' && i.owner.includes(St.me) && ['over', 'soon'].includes(U.dueState(i)))
      .sort((a, b) => String(a.due).localeCompare(String(b.due))).map(i => ({ kind: 'due', ...i }));
    return [...mentions, ...due];
  }
  function updateNotificationBadge() {
    const badge = $('#notify-count'); if (!badge) return;
    const count = notificationItems().length; badge.hidden = !count; badge.textContent = count > 99 ? '99+' : count;
  }
  function notificationPanel() {
    const items = notificationItems(), supported = 'Notification' in window, enabled = supported && Notification.permission === 'granted';
    showModal(`<h2>Notifications</h2><p class="muted">Unread mentions and assigned tasks that need attention.</p>
${items.length ? `<div class="notice-list">${items.map(i => i.kind === 'mention'
      ? `<button class="notice-row unread" type="button" data-notice-id="${esc(i.id)}" data-notice-open="${esc(i.itemId)}">${U.av(i.by)}<span><b>${esc(i.by)} mentioned you</b><small>${esc(i.text.length > 120 ? i.text.slice(0, 117) + '…' : i.text)}</small></span></button>`
      : `<button class="notice-row" type="button" data-notice-open="${esc(i.id)}">${U.prio(i.priority)}<span><b>${esc(i.title)}</b><small>${esc(i.due)} · ${esc(V.wsName(i.ws))}</small></span></button>`).join('')}</div>` : '<p class="muted" style="margin-top:14px">You’re all caught up.</p>'}
<div class="acts">${supported && !enabled && Notification.permission !== 'denied' ? '<button class="btn" type="button" data-enable-notifications>Enable browser alerts</button>' : ''}${supported && Notification.permission === 'denied' ? '<span class="muted">Browser alerts are blocked in this browser.</span>' : ''}<button class="btn primary" type="button" data-m="close">Done</button></div>`);
  }
  async function enableNotifications() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') maybeBrowserNotify(true);
    notificationPanel();
  }
  function maybeBrowserNotify(force) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const items = notificationItems(), key = `awp-notified-${U.today()}-${items.map(i => i.id).join('-')}`;
    if (!items.length || (!force && localStorage.getItem(key))) return;
    const mentions = items.filter(i => i.kind === 'mention').length;
    const body = mentions ? `${mentions} new mention${mentions === 1 ? '' : 's'} and ${items.length - mentions} task alert${items.length - mentions === 1 ? '' : 's'}.` : `${items.length} task${items.length === 1 ? '' : 's'} need your attention.`;
    const n = new Notification('AiRISTA Work Plan', { body, icon: '/assets/airista-logo.png', tag: 'airista-work-plan' });
    n.onclick = () => { window.focus(); notificationPanel(); };
    localStorage.setItem(key, '1');
  }
  // ---- account menu, password change and user admin ----
  const ROLE = { admin: 'Admin', user: 'User' };
  function account() {
    const u = St.user;
    if (!u) return showModal(`<h2>Preview mode</h2><p class="muted">Sign-in is only available on the deployed site.</p><div class="acts"><button class="btn" type="button" data-m="close">Close</button></div>`);
    showModal(`<div class="acct-h">${U.av(u.name)}<div><h2>${esc(u.name)}</h2><span class="muted">${esc(u.email)} · ${ROLE[u.role]}</span></div></div>
<div class="acct-list">${u.role === 'admin' ? '<button type="button" class="btn" data-m="users">Manage users</button><button type="button" class="btn" data-m="settings">Notification settings</button>' : ''}<button type="button" class="btn" data-m="pw">Change password</button><button type="button" class="btn" data-m="logout">Sign out</button></div>
<div class="acts"><button class="btn" type="button" data-m="close">Close</button></div>`);
  }
  function passwordForm() {
    showModal(`<h2>Change password</h2><form class="auth-form" id="pwform">
<label class="f"><span class="label">Current password</span><input type="password" id="pw-cur" autocomplete="current-password" required></label>
<label class="f"><span class="label">New password</span><input type="password" id="pw-new" autocomplete="new-password" minlength="10" required></label>
<label class="f"><span class="label">Confirm new password</span><input type="password" id="pw-new2" autocomplete="new-password" minlength="10" required></label>
<p class="muted auth-help">At least 10 characters. Other devices will be signed out.</p><p class="auth-err" id="pw-err" hidden></p>
<div class="acts"><button class="btn" type="button" data-m="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
    $('#pw-cur').focus();
  }
  const errOut = (sel, msg) => { const el = $(sel); if (el) { el.textContent = msg; el.hidden = !msg; } };
  async function usersPanel(flash) {
    let users;
    try { users = (await St.api('users')).users; } catch (e) { return showModal(`<h2>Users</h2><p class="auth-err">${esc(e.message)}</p><div class="acts"><button class="btn" type="button" data-m="close">Close</button></div>`); }
    showModal(`<h2>Users</h2>
${flash || ''}
<div class="ulist">${users.map(u => `<div class="urow" data-email="${esc(u.email)}">${U.av(u.name)}<div class="uinfo"><b>${esc(u.name)}</b><span class="muted">${esc(u.email)}${u.hasPassword ? '' : ' · <em>no password yet</em>'}</span></div>
<select data-urole aria-label="Role for ${esc(u.name)}">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select>
<button class="btn sm" type="button" data-ulink>${u.hasPassword ? 'Reset link' : 'Setup link'}</button>
${u.email === St.user.email ? '<span class="urm"></span>' : `<button class="ibtn urm" type="button" data-udel aria-label="Remove ${esc(u.name)}">${U.ICON.close}</button>`}</div>`).join('')}</div>
<form class="uadd" id="uadd"><span class="label">Add a user</span><div class="uadd-row"><input type="text" id="ua-name" placeholder="Name" maxlength="40" required><input type="email" id="ua-email" placeholder="Email" required><select id="ua-role">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${k === 'user' ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary" type="submit">Add</button></div><p class="auth-err" id="ua-err" hidden></p></form>
<div class="acts"><button class="btn" type="button" data-m="close">Done</button></div>`);
    modal.querySelector('.mbox').classList.add('wide');
  }
  async function settingsPanel(flash = '') {
    let data;
    try { const r = await fetch('/api/settings', { cache: 'no-store' }); data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not load settings'); }
    catch (error) { return showModal(`<h2>Notification settings</h2><p class="auth-err">${esc(error.message)}</p><div class="acts"><button class="btn" type="button" data-m="close">Close</button></div>`); }
    const s = data.settings, ready = data.status.apiKeyConfigured && data.status.fromConfigured;
    showModal(`<h2>Notification settings</h2>${flash}<div class="config-status ${ready ? 'ready' : ''}"><b>${ready ? 'Resend is connected' : 'Resend setup is incomplete'}</b><span>API key: ${data.status.apiKeyConfigured ? 'configured' : 'missing'} · From address: ${data.status.fromConfigured ? esc(data.status.fromAddress) : 'missing'}</span></div>
<form class="settings-form" id="settings-form">
<label class="toggle-row"><span><b>Email notifications</b><small>Master switch for all outgoing planner email.</small></span><input type="checkbox" id="set-email" ${s.emailEnabled ? 'checked' : ''}></label>
<label class="toggle-row"><span><b>@mention emails</b><small>Email someone when they are mentioned in a comment.</small></span><input type="checkbox" id="set-mentions" ${s.mentionEmails ? 'checked' : ''}></label>
<label class="toggle-row"><span><b>Assignment emails</b><small>Email someone when they are newly assigned to a task.</small></span><input type="checkbox" id="set-assignments" ${s.assignmentEmails ? 'checked' : ''}></label>
<label class="f"><span class="label">Sender display name</span><input type="text" id="set-from-name" maxlength="80" value="${esc(s.fromName)}"></label>
<label class="f"><span class="label">Reply-to address</span><input type="email" id="set-reply-to" maxlength="200" value="${esc(s.replyTo)}" placeholder="Optional"></label>
<p class="muted" style="font-size:12px">The Resend API key and verified From address are managed securely in Netlify, not here.</p>
<div class="acts"><button class="btn" type="button" data-test-email ${ready ? '' : 'disabled'}>Send test email</button><button class="btn" type="button" data-m="close">Cancel</button><button class="btn primary" type="submit">Save settings</button></div></form>`);
  }
  const linkBox = (name, url) => `<div class="linkbox"><span>Send this link to <b>${esc(name)}</b> to set their password. It works once and expires in 7 days.</span><div class="linkrow"><input type="text" readonly value="${esc(url)}" id="setup-link"><button class="btn sm" type="button" data-copy>Copy</button></div></div>`;

  modal.addEventListener('click', async e => {
    const t = e.target, m = t.closest('[data-m]');
    if (t === modal && !modal.onclick) return hideModal();
    if (m && m.dataset.m === 'close') return hideModal();
    if (m && m.dataset.m === 'logout') return St.logout();
    if (m && m.dataset.m === 'pw') return passwordForm();
    if (m && m.dataset.m === 'users') return usersPanel();
    if (m && m.dataset.m === 'settings') return settingsPanel();
    if (t.closest('[data-enable-notifications]')) return enableNotifications();
    if (t.closest('[data-test-email]')) {
      const button = t.closest('[data-test-email]'); button.disabled = true; button.textContent = 'Sending…';
      try { const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'test-email' }) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Test failed'); return settingsPanel(`<p class="successbox">Test email sent to ${esc(data.sentTo)}.</p>`); }
      catch (error) { return settingsPanel(`<p class="auth-err">${esc(error.message)}</p>`); }
    }
    const notice = t.closest('[data-notice-open]'); if (notice) { if (notice.dataset.noticeId) St.dispatch({ t: 'notification-read', notificationId: notice.dataset.noticeId }); hideModal(); return openItem(notice.dataset.noticeOpen); }
    if (t.closest('[data-copy]')) { const i = $('#setup-link'); i.select(); try { await navigator.clipboard.writeText(i.value); t.textContent = 'Copied'; } catch (_) { document.execCommand('copy'); } return; }
    const row = t.closest('.urow'); if (!row) return;
    const email = row.dataset.email, name = row.querySelector('b').textContent;
    try {
      if (t.closest('[data-ulink]')) { const r = await St.api('users/link', 'POST', { email }); return usersPanel(linkBox(name, r.setupUrl)); }
      if (t.closest('[data-udel]')) {
        if (!confirm(`Remove ${name}'s account? They will be signed out and lose access. Their comments and history stay.`)) return;
        await St.api('users?email=' + encodeURIComponent(email), 'DELETE'); return usersPanel();
      }
    } catch (x) { alert(x.message); }
  });
  modal.addEventListener('change', async e => {
    const sel = e.target.closest('[data-urole]'); if (!sel) return;
    const email = sel.closest('.urow').dataset.email;
    try { await St.api('users', 'PATCH', { email, role: sel.value }); if (email === St.user.email) St.user.role = sel.value; usersPanel(); }
    catch (x) { alert(x.message); usersPanel(); }
  });
  modal.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'task-add-form') {
      const title = $('#task-title').value.trim();
      if (!title) return errOut('#task-add-err', 'Enter a task title.');
      const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      St.dispatch({ t: 'add', id, title, ws: $('#task-ws').value, due: $('#task-due').value, priority: $('#task-priority').value, lane: $('#task-lane').value, next: $('#task-next').value.trim() });
      hideModal(); openItem(id); return;
    }
    if (e.target.id === 'pwform') {
      const cur = $('#pw-cur').value, pw = $('#pw-new').value;
      if (pw.length < 10) return errOut('#pw-err', 'Use at least 10 characters.');
      if (pw !== $('#pw-new2').value) return errOut('#pw-err', "The new passwords don't match.");
      try { await St.api('password', 'POST', { current: cur, password: pw }); showModal(`<h2>Password changed</h2><p class="muted">You're still signed in here. Other devices have been signed out.</p><div class="acts"><button class="btn primary" type="button" data-m="close">Done</button></div>`); }
      catch (x) { errOut('#pw-err', x.message); }
    }
    if (e.target.id === 'uadd') {
      const name = $('#ua-name').value.trim(), email = $('#ua-email').value.trim(), role = $('#ua-role').value;
      if (!name || !email) return errOut('#ua-err', 'Enter a name and email.');
      try { const r = await St.api('users', 'POST', { name, email, role }); usersPanel(linkBox(name, r.setupUrl)); }
      catch (x) { errOut('#ua-err', x.message); }
    }
    if (e.target.id === 'settings-form') {
      const body = { emailEnabled: $('#set-email').checked, mentionEmails: $('#set-mentions').checked, assignmentEmails: $('#set-assignments').checked, fromName: $('#set-from-name').value.trim(), replyTo: $('#set-reply-to').value.trim() };
      try { const r = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not save settings'); settingsPanel('<p class="successbox">Settings saved.</p>'); }
      catch (error) { settingsPanel(`<p class="auth-err">${esc(error.message)}</p>`); }
    }
  });

  async function setStatus(id, status) {
    const it = St.state.items.find(i => i.id === id);
    if (!it || it.status === status) return;
    if (status === 'co' && !it.evidence) {
      const ok = await confirmBox('No completion evidence', 'Work should be marked complete only with evidence of implementation, delivery or publication. Mark it complete anyway?', 'Mark complete');
      if (!ok) { render(); return; }
    }
    St.dispatch({ t: 'set', id, fields: { status } });
  }

  async function loadReportDetail(tab, refresh = false, month = ui.rptMonth) {
    window.Reports.setDetail(tab, month, { loading: true }); render();
    try {
      const r = await fetch(`/api/report-detail?view=${encodeURIComponent(tab)}&month=${encodeURIComponent(month)}${refresh ? '&refresh=1' : ''}`, { cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) return location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash));
      if (data.notLoaded) { window.Reports.setDetail(tab, month, null); if (ui.rptMonth === month && ui.rptTab === tab) render(); return; }
      if (!r.ok) throw new Error(data.error || 'Could not load report');
      window.Reports.setDetail(tab, month, data);
    } catch (error) { window.Reports.setDetail(tab, month, { error: error.message }); }
    if (ui.rptMonth === month && ui.rptTab === tab) render();
  }

  function selectReportMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(value) || value === ui.rptMonth) return;
    ui.rptMonth = value; persist();
    if (document.activeElement?.id === 'rpt-month') document.activeElement.blur();
    render();
    if (isDetailTab(ui.rptTab)) loadReportDetail(ui.rptTab, false, value);
  }
  const isDetailTab = tab => ['search', 'traffic', 'links'].includes(tab);
  // Weekly health has its own data and refresh loop; the other detail tabs load a monthly snapshot.
  function openReportTab() {
    if (ui.rptTab === 'health') return window.Health.open(() => ui.view === 'reports' && ui.rptTab === 'health', render);
    if (isDetailTab(ui.rptTab)) loadReportDetail(ui.rptTab);
  }

  // clicks
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('#add-task')) return addTaskForm();
    const tab = t.closest('#tabs button'); if (tab) return setView(tab.dataset.view);
    const jump = t.closest('[data-jump]'); if (jump) return setView(jump.dataset.jump);
    if (t.closest('#who')) return account();
    if (t.closest('#notify')) return notificationPanel();
    if (t.closest('#theme')) { window.Theme.toggle(); return themeIcon(); }
    const rptTab = t.closest('[data-rpt-tab]'); if (rptTab) { ui.rptTab = rptTab.dataset.rptTab; persist(); render(); openReportTab(); return; }
    if (t.closest('#hk-run')) return window.Health.run();
    const hkDate = t.closest('[data-hk-date]'); if (hkDate) return window.Health.select(hkDate.dataset.hkDate);
    const rptLoad = t.closest('[data-rpt-load]'); if (rptLoad) return loadReportDetail(rptLoad.dataset.rptLoad, true);
    const rptCsv = t.closest('[data-rpt-csv]'); if (rptCsv) return window.Reports.csv(rptCsv.dataset.rptCsv, ui.rptMonth);
    if (t.closest('#rpt-overview-csv')) return window.Reports.overviewCsv(St.state, ui.rptMonth);
    if (t.closest('#rpt-month-view')) { selectReportMonth($('#rpt-month')?.value); render(); return; }
    if (t.closest('#rpt-toggle')) { ui.rptEdit = !ui.rptEdit; return render(); }
    if (t.closest('#rpt-sync')) {
      const button = t.closest('#rpt-sync'), status = $('#rpt-sync-status');
      const visibleMonth = $('#rpt-month')?.value;
      if (/^\d{4}-\d{2}$/.test(visibleMonth) && visibleMonth !== ui.rptMonth) { ui.rptMonth = visibleMonth; persist(); }
      const reportMonth = ui.rptMonth;
      let reportLabel = new Date(`${reportMonth}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      let pullSucceeded = false;
      button.disabled = true; button.textContent = 'Pulling…'; status.textContent = `Loading ${reportLabel} from GA4, Search Console and Ahrefs…`;
      fetch('/api/google-report?month=' + encodeURIComponent(reportMonth), { cache: 'no-store' }).then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) return location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash));
        if (data.needsConnection) {
          const start = await fetch('/api/google-auth/start', { method: 'POST' });
          const auth = await start.json().catch(() => ({}));
          if (!start.ok || !auth.url) throw new Error(auth.error || 'Could not start Google connection');
          location.href = auth.url; return;
        }
        if (!r.ok) throw new Error(data.error || 'Google sync failed');
        St.dispatch(Object.entries(data.values).map(([key, value]) => ({ t: 'rpt-metric', month: reportMonth, key, value })));
        pullSucceeded = true;
        if (data.partial && data.throughDate) reportLabel += ` through ${new Date(`${data.throughDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        if (ui.rptMonth === reportMonth) render();
      }).catch(err => { status.textContent = err.message; status.classList.add('auth-err'); }).finally(() => {
        const current = $('#rpt-sync'); if (current) { current.disabled = false; current.textContent = `Pull ${reportLabel} data`; }
        const currentStatus = $('#rpt-sync-status'); if (pullSucceeded && currentStatus && ui.rptMonth === reportMonth) currentStatus.textContent = `${reportLabel} data was pulled and saved to the scorecard.`;
      });
      return;
    }
    const kd = t.closest('[data-kwdel]'); if (kd) { const id = kd.closest('[data-kw]').dataset.kw, k = C.ensureReports(St.state).keywords.find(x => x.id === id); if (k) confirmBox(`Stop tracking "${k.keyword}"?`, 'Its position history is removed.', 'Remove').then(ok => ok && St.dispatch({ t: 'kw-del', id })); return; }
    if (t.closest('#export')) return St.exportJSON();
    if (t === scrim || t.closest('[data-close]')) return closeDrawer();
    if (t.closest('[data-share-task]')) {
      const url = pageUrl(ui.drawerId).href;
      navigator.clipboard.writeText(url).then(() => { t.closest('[data-share-task]').textContent = 'Link copied'; }).catch(() => prompt('Copy this task link:', url));
      return;
    }
    const removeAttachment = t.closest('[data-attachment-remove]'); if (removeAttachment) {
      const attachmentId = removeAttachment.dataset.attachmentRemove, name = removeAttachment.dataset.attachmentName;
      confirmBox(`Remove ${name}?`, 'The file will be permanently removed from this task.', 'Remove file').then(async ok => {
        if (!ok) return;
        try {
          const r = await fetch('/api/attachments?id=' + encodeURIComponent(attachmentId), { method: 'DELETE' });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || 'Could not remove the attachment');
          St.dispatch({ t: 'attachment-remove', id: ui.drawerId, attachmentId });
        } catch (error) { alert(error.message); }
      });
      return;
    }
    const card = t.closest('.tcard'); if (card) return openItem(card.dataset.id);
    const op = t.closest('[data-open]'); if (op) return openItem(op.dataset.open);
    const ctr = t.closest('[data-ctr]'); if (ctr) { const c = St.state.counters[ctr.dataset.ctr]; return St.dispatch({ t: 'counter', key: ctr.dataset.ctr, value: c.done + Number(ctr.dataset.d) }); }
    const hrs = t.closest('[data-hrs]'); if (hrs) return St.dispatch({ t: 'hours', value: St.state.hours.used + Number(hrs.dataset.hrs) });
    const acc = t.closest('[data-access]'); if (acc) return St.dispatch({ t: 'access', name: acc.dataset.access, ok: acc.dataset.ok === '1' });
    const np = t.closest('#new-period'); if (np) { confirmBox(`Start ${np.dataset.label}?`, 'Monthly counters and support hours reset to zero. The change is logged.', 'Start month').then(ok => ok && St.dispatch({ t: 'period', period: np.dataset.period, label: np.dataset.label })); return; }
    const nt = t.closest('[data-note]'); if (nt) { ui.noteDate = nt.dataset.note; return render(); }
    const sn = t.closest('[data-since]'); if (sn) { ui.since = sn.dataset.since; return render(); }
    // drawer
    if (!drawer.contains(t) || !ui.drawerId) return;
    const id = ui.drawerId, it = St.state.items.find(i => i.id === id);
    const dt = t.closest('[data-tab]'); if (dt) { ui.tab = dt.dataset.tab; return renderDrawer(); }
    const sg = t.closest('[data-seg] button'); if (sg) {
      const f = sg.parentElement.dataset.seg, v = sg.dataset.v;
      if (f === 'lane') return St.dispatch({ t: 'place', id, lane: v, before: null });
      return St.dispatch({ t: 'set', id, fields: { [f]: f === 'agreed' ? v === '1' : v } });
    }
    const ow = t.closest('[data-owner]'); if (ow) { const p = ow.dataset.owner, cur = it.owner; return St.dispatch({ t: 'set', id, fields: { owner: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p] } }); }
    const rk = t.closest('[data-rank]'); if (rk) {
      const lane = St.state.items.filter(i => i.lane === it.lane).sort((a, b) => a.order - b.order), idx = lane.indexOf(it);
      const before = rk.dataset.rank === 'up' ? lane[idx - 1] : lane[idx + 2];
      return St.dispatch({ t: 'place', id, lane: it.lane, before: before ? before.id : null });
    }
    const suggestion = t.closest('[data-mention-suggestion]'); if (suggestion) return insertMention(suggestion.dataset.mentionSuggestion, true);
    const mention = t.closest('[data-mention]'); if (mention) {
      insertMention(mention.dataset.mention, false); return;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'hrs-in') return St.dispatch({ t: 'hours', value: Number(t.value) });
    if (t.id === 'ci-date') { ui.noteDate = t.value || U.today(); return render(); }
    if (t.id === 'rpt-month') { selectReportMonth(t.value); return; }
    if (t.dataset.rpt) return St.dispatch({ t: 'rpt-metric', month: ui.rptMonth, key: t.dataset.rpt, value: t.value.trim() });
    if (t.hasAttribute('data-kwpos')) return St.dispatch({ t: 'kw-pos', id: t.closest('[data-kw]').dataset.kw, month: ui.rptMonth, value: t.value.trim() });
    if (t.hasAttribute('data-kwurl')) return St.dispatch({ t: 'kw-url', id: t.closest('[data-kw]').dataset.kw, url: t.value.trim() });
    if (!drawer.contains(t) || !t.dataset.f) return;
    if (t.dataset.f === 'status') return setStatus(ui.drawerId, t.value);
    St.dispatch({ t: 'set', id: ui.drawerId, fields: { [t.dataset.f]: t.value.trim() } });
  });
  let noteTimer;
  document.addEventListener('input', e => {
    if (e.target.id === 'rpt-month') { selectReportMonth(e.target.value); return; }
    if (e.target.id === 'rpt-q') {
      const q = e.target.value.trim().toLowerCase(), rows = [...document.querySelectorAll('[data-report-row]')];
      let shown = 0; rows.forEach(row => { row.hidden = !!q && !row.dataset.search.includes(q); if (!row.hidden) shown++; });
      const count = $('#rpt-count'); if (count) count.textContent = `${shown} shown`;
      return;
    }
    if (e.target.id === 'cm-text') { mentionIndex = 0; updateMentionSuggestions(e.target); return; }
    if (e.target.id !== 'ci-text') return;
    const date = ui.noteDate, text = e.target.value;
    clearTimeout(noteTimer);
    $('#ci-saved').textContent = 'Saving…';
    noteTimer = setTimeout(() => { St.dispatch({ t: 'note', date, text }); const s = $('#ci-saved'); if (s) s.textContent = `Saved by ${St.me || 'you'} · just now`; }, 700);
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'attachment-form') {
      e.preventDefault();
      const input = $('#attachment-file'), file = input.files?.[0], status = $('#attachment-status'), button = e.target.querySelector('button[type=submit]'), taskId = ui.drawerId;
      if (!file) { status.textContent = 'Choose a file first.'; return; }
      if (file.size > 10 * 1024 * 1024) { status.textContent = 'Attachments must be 10 MB or smaller.'; return; }
      button.disabled = true; status.textContent = `Uploading ${file.name}…`;
      try {
        const r = await fetch('/api/attachments', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-task-id': taskId, 'x-file-name': encodeURIComponent(file.name) }, body: file });
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) return location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
        if (!r.ok) throw new Error(data.error || 'Upload failed');
        St.dispatch({ t: 'attachment-add', id: taskId, attachment: data.attachment });
      } catch (error) { button.disabled = false; status.textContent = error.message; }
      return;
    }
    if (e.target.id === 'kw-add') {
      e.preventDefault();
      const kw = $('#kw-new').value.trim(), url = $('#kw-new-url').value.trim();
      if (!kw) return $('#kw-new').focus();
      $('#kw-new').value = ''; $('#kw-new-url').value = ''; document.activeElement.blur();
      return St.dispatch({ t: 'kw-add', keyword: kw, url });
    }
    if (e.target.id !== 'cmform') return;
    e.preventDefault();
    const ta = $('#cm-text'), text = ta.value.trim();
    if (!text) return;
    const mentions = St.people.filter(name => name !== St.me && name !== 'AiRISTA' && new RegExp(`(^|\\s)@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|[.,!?;:]|$)`, 'i').test(text));
    if (mentions.length) {
      const who = mentions.join(', '), ok = await confirmBox(`Notify ${who}?`, `This comment mentions ${who}. Send an in-app notification?`, 'Comment and notify');
      if (!ok) { ta.focus(); return; }
    }
    ta.value = ''; ta.blur();
    St.dispatch({ t: 'comment', id: ui.drawerId, text, mentions });
  });
  document.addEventListener('keydown', e => {
    if (e.target.id === 'cm-text' && !$('#mention-suggest')?.hidden) {
      const buttons = [...$('#mention-suggest').querySelectorAll('[data-mention-suggestion]')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mentionIndex = (mentionIndex + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length; updateMentionSuggestions(e.target); return; }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && buttons.length) { e.preventDefault(); insertMention(buttons[mentionIndex].dataset.mentionSuggestion, true); return; }
      if (e.key === 'Escape') { $('#mention-suggest').hidden = true; return; }
    }
    if (e.key === 'Escape') { if (!modal.hidden) hideModal(); else if (ui.drawerId) closeDrawer(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'cm-text') { e.preventDefault(); $('#cmform').requestSubmit(); }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('tcard')) openItem(e.target.dataset.id);
  });

  // drag and drop
  let dragId = null; const ph = document.createElement('div'); ph.className = 'ph';
  main.addEventListener('dragstart', e => {
    const c = e.target.closest('.tcard'); if (!c) return;
    dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => c.classList.add('dragging'));
  });
  main.addEventListener('dragend', () => { dragId = null; ph.remove(); document.querySelectorAll('.dragging,.drop.over').forEach(x => x.classList.remove('dragging', 'over')); });
  main.addEventListener('dragover', e => {
    const drop = e.target.closest('.drop'); if (!drop || !dragId) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drop.over').forEach(x => x !== drop && x.classList.remove('over')); drop.classList.add('over');
    if (!drop.dataset.lane) return;
    const cards = [...drop.querySelectorAll('.tcard:not(.dragging)')];
    const after = cards.find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (after) drop.insertBefore(ph, after); else drop.appendChild(ph);
  });
  main.addEventListener('drop', e => {
    const drop = e.target.closest('.drop'); if (!drop || !dragId) return;
    e.preventDefault();
    const id = dragId;
    if (drop.dataset.lane) {
      let n = ph.nextElementSibling; while (n && (!n.classList.contains('tcard') || n.dataset.id === id)) n = n.nextElementSibling;
      ph.remove();
      St.dispatch({ t: 'place', id, lane: drop.dataset.lane, before: n ? n.dataset.id : null });
    } else if (drop.dataset.status) { ph.remove(); setStatus(id, drop.dataset.status); }
  });

  St.subscribe(render);
  setupFilters();
  St.init().then(() => { const el = $('#f-owner'), o = p => `<option value="${esc(p)}">${esc(p)}</option>`; el.innerHTML = '<option value="">All owners</option>' + St.people.map(o).join(''); el.value = ui.f.owner || ''; if (ui.drawerId && !St.state.items.some(i => i.id === ui.drawerId)) closeDrawer(); if (ui.view === 'reports') openReportTab(); updateNotificationBadge(); maybeBrowserNotify(false); }).catch(() => {});
})();
