(() => {
  const C = window.PlannerCore, U = window.U, V = window.Views, D = window.Drawer, St = window.Store, { esc } = U;
  const $ = s => document.querySelector(s);
  const main = $('#main'), drawer = $('#drawer'), scrim = $('#scrim'), modal = $('#modal');
  const saved = JSON.parse(localStorage.getItem('awp-planner-ui') || '{}');
  if (new URLSearchParams(location.search).has('google')) history.replaceState(null, '', location.pathname + location.hash);
  const ui = { view: location.hash.slice(1) || saved.view || 'focus', f: Object.assign({ type: '', ws: '', owner: '', prio: '', q: '' }, saved.f || {}), drawerId: null, tab: 'comments', since: 'last', noteDate: U.today(), rptMonth: saved.rptMonth || window.Reports.prevMonth(U.today().slice(0, 7)), rptEdit: false };
  const persist = () => localStorage.setItem('awp-planner-ui', JSON.stringify({ view: ui.view, f: ui.f, rptMonth: ui.rptMonth }));
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

  function setView(v) { ui.view = v; history.replaceState(null, '', '#' + v); persist(); render(); window.scrollTo(0, 0); }
  function openItem(id) { ui.drawerId = id; ui.tab = 'comments'; renderDrawer(); }
  function closeDrawer() { ui.drawerId = null; renderDrawer(); document.querySelectorAll('.tcard.sel').forEach(c => c.classList.remove('sel')); }

  function showModal(html) { modal.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`; modal.hidden = false; }
  function hideModal() { modal.hidden = true; modal.innerHTML = ''; }
  function confirmBox(title, body, okLabel) {
    return new Promise(res => {
      showModal(`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="acts"><button class="btn" type="button" data-m="0">Cancel</button><button class="btn primary" type="button" data-m="1">${esc(okLabel)}</button></div>`);
      modal.onclick = e => { const b = e.target.closest('[data-m]'); if (b || e.target === modal) { hideModal(); modal.onclick = null; res(!!(b && b.dataset.m === '1')); } };
    });
  }
  // ---- account menu, password change and user admin ----
  const ROLE = { admin: 'Admin', user: 'User' };
  function account() {
    const u = St.user;
    if (!u) return showModal(`<h2>Preview mode</h2><p class="muted">Sign-in is only available on the deployed site.</p><div class="acts"><button class="btn" type="button" data-m="close">Close</button></div>`);
    showModal(`<div class="acct-h">${U.av(u.name)}<div><h2>${esc(u.name)}</h2><span class="muted">${esc(u.email)} · ${ROLE[u.role]}</span></div></div>
<div class="acct-list">${u.role === 'admin' ? '<button type="button" class="btn" data-m="users">Manage users</button>' : ''}<button type="button" class="btn" data-m="pw">Change password</button><button type="button" class="btn" data-m="logout">Sign out</button></div>
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
  const linkBox = (name, url) => `<div class="linkbox"><span>Send this link to <b>${esc(name)}</b> to set their password. It works once and expires in 7 days.</span><div class="linkrow"><input type="text" readonly value="${esc(url)}" id="setup-link"><button class="btn sm" type="button" data-copy>Copy</button></div></div>`;

  modal.addEventListener('click', async e => {
    const t = e.target, m = t.closest('[data-m]');
    if (t === modal && !modal.onclick) return hideModal();
    if (m && m.dataset.m === 'close') return hideModal();
    if (m && m.dataset.m === 'logout') return St.logout();
    if (m && m.dataset.m === 'pw') return passwordForm();
    if (m && m.dataset.m === 'users') return usersPanel();
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

  // clicks
  document.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('#tabs button'); if (tab) return setView(tab.dataset.view);
    const jump = t.closest('[data-jump]'); if (jump) return setView(jump.dataset.jump);
    if (t.closest('#who')) return account();
    if (t.closest('#theme')) { window.Theme.toggle(); return themeIcon(); }
    if (t.closest('#rpt-toggle')) { ui.rptEdit = !ui.rptEdit; return render(); }
    if (t.closest('#rpt-sync')) {
      const button = t.closest('#rpt-sync'), status = $('#rpt-sync-status');
      button.disabled = true; button.textContent = 'Syncing…'; status.textContent = 'Loading GA4 and Search Console…';
      fetch('/api/google-report?month=' + encodeURIComponent(ui.rptMonth), { cache: 'no-store' }).then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) return location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash));
        if (data.needsConnection) {
          const start = await fetch('/api/google-auth/start', { method: 'POST' });
          const auth = await start.json().catch(() => ({}));
          if (!start.ok || !auth.url) throw new Error(auth.error || 'Could not start Google connection');
          location.href = auth.url; return;
        }
        if (!r.ok) throw new Error(data.error || 'Google sync failed');
        St.dispatch(Object.entries(data.values).map(([key, value]) => ({ t: 'rpt-metric', month: ui.rptMonth, key, value })));
        status.textContent = 'Google data synced. The six imported figures were saved to this month.';
      }).catch(err => { status.textContent = err.message; status.classList.add('auth-err'); }).finally(() => { button.disabled = false; button.textContent = 'Sync Google data'; });
      return;
    }
    const kd = t.closest('[data-kwdel]'); if (kd) { const id = kd.closest('[data-kw]').dataset.kw, k = C.ensureReports(St.state).keywords.find(x => x.id === id); if (k) confirmBox(`Stop tracking "${k.keyword}"?`, 'Its position history is removed.', 'Remove').then(ok => ok && St.dispatch({ t: 'kw-del', id })); return; }
    if (t.closest('#export')) return St.exportJSON();
    if (t === scrim || t.closest('[data-close]')) return closeDrawer();
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
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'hrs-in') return St.dispatch({ t: 'hours', value: Number(t.value) });
    if (t.id === 'ci-date') { ui.noteDate = t.value || U.today(); return render(); }
    if (t.id === 'rpt-month') { if (/^\d{4}-\d{2}$/.test(t.value)) { ui.rptMonth = t.value; persist(); } t.blur(); return render(); }
    if (t.id === 'rpt-site') return St.dispatch({ t: 'rpt-site', site: t.value.trim() });
    if (t.dataset.rpt) return St.dispatch({ t: 'rpt-metric', month: ui.rptMonth, key: t.dataset.rpt, value: t.value.trim() });
    if (t.hasAttribute('data-kwpos')) return St.dispatch({ t: 'kw-pos', id: t.closest('[data-kw]').dataset.kw, month: ui.rptMonth, value: t.value.trim() });
    if (t.hasAttribute('data-kwurl')) return St.dispatch({ t: 'kw-url', id: t.closest('[data-kw]').dataset.kw, url: t.value.trim() });
    if (!drawer.contains(t) || !t.dataset.f) return;
    if (t.dataset.f === 'status') return setStatus(ui.drawerId, t.value);
    St.dispatch({ t: 'set', id: ui.drawerId, fields: { [t.dataset.f]: t.value.trim() } });
  });
  let noteTimer;
  document.addEventListener('input', e => {
    if (e.target.id !== 'ci-text') return;
    const date = ui.noteDate, text = e.target.value;
    clearTimeout(noteTimer);
    $('#ci-saved').textContent = 'Saving…';
    noteTimer = setTimeout(() => { St.dispatch({ t: 'note', date, text }); const s = $('#ci-saved'); if (s) s.textContent = `Saved by ${St.me || 'you'} · just now`; }, 700);
  });
  document.addEventListener('submit', e => {
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
    ta.value = ''; ta.blur();
    St.dispatch({ t: 'comment', id: ui.drawerId, text });
  });
  document.addEventListener('keydown', e => {
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
  St.init().then(() => { const el = $('#f-owner'), o = p => `<option value="${esc(p)}">${esc(p)}</option>`; el.innerHTML = '<option value="">All owners</option>' + St.people.map(o).join(''); el.value = ui.f.owner || ''; }).catch(() => {});
})();
