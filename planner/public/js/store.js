window.Store = (() => {
  const C = window.PlannerCore;
  const LOCAL_KEY = 'awp-planner-local';
  const S = { state: null, mode: 'remote', pending: [], inflight: false, me: '', user: null, people: [], subs: [], syncState: 'saved' };
  const emit = () => S.subs.forEach(f => f());
  const setSync = st => { S.syncState = st; const el = document.getElementById('sync'); if (!el) return;
    el.className = 'sync ' + st;
    el.textContent = { saved: 'Saved · live', saving: 'Saving…', error: 'Offline, retrying', local: 'Preview: saved in this browser only' }[st];
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const isJson = r => (r.headers.get('content-type') || '').includes('json');
  const toLogin = () => { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash)); throw new Error('signed out'); };
  const check = r => { if (r.status === 401) toLogin(); return r; };

  async function init() {
    let r;
    try { r = await fetch('/api/auth/me', { cache: 'no-store' }); } catch (e) { r = null; }
    if (r && r.status === 401) return toLogin();
    if (r && r.ok && isJson(r)) {
      S.user = (await r.json()).user; S.me = S.user.name;
      try { const p = await fetch('/api/auth/people', { cache: 'no-store' }); if (p.ok) S.people = (await p.json()).people || []; } catch (e) {}
      r = check(await fetch('/api/state', { cache: 'no-store' }));
      if (!r.ok) throw new Error('Could not load the plan');
      S.state = await r.json();
      setSync('saved');
      setInterval(poll, 8000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    } else {
      // No API (files opened outside Netlify): local preview mode.
      S.mode = 'local'; S.me = 'Preview';
      try { S.state = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (_) { S.state = null; }
      if (!S.state) S.state = C.seed();
      setSync('local');
    }
    emit();
  }

  function dispatch(ops) {
    ops = Array.isArray(ops) ? ops : [ops];
    C.applyOps(S.state, clone(ops), { by: S.me || 'Unknown', at: new Date().toISOString() });
    if (S.mode === 'local') localStorage.setItem(LOCAL_KEY, JSON.stringify(S.state));
    else { S.pending.push(...ops); flush(); }
    emit();
  }

  async function flush() {
    if (S.inflight || !S.pending.length) return;
    S.inflight = true; setSync('saving');
    const ops = S.pending.splice(0);
    try {
      const r = check(await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) }));
      if (!r.ok) throw new Error('save failed');
      const server = await r.json();
      S.inflight = false;
      S.state = server;
      if (S.pending.length) { C.applyOps(S.state, clone(S.pending), { by: S.me, at: new Date().toISOString() }); flush(); }
      else setSync('saved');
      emit();
    } catch (e) {
      S.inflight = false; S.pending.unshift(...ops); setSync('error');
      setTimeout(flush, 4000);
    }
  }

  async function poll() {
    if (S.mode !== 'remote' || S.pending.length || S.inflight || document.hidden) return;
    try {
      const r = check(await fetch('/api/state', { cache: 'no-store' }));
      if (!r.ok) return;
      const s = await r.json();
      if (S.pending.length || S.inflight) return;
      if (s.version !== S.state.version) { S.state = s; emit(); }
      if (S.syncState === 'error') setSync('saved');
    } catch (e) {}
  }

  // JSON call to the auth API. Throws Error(message) on failure.
  async function api(path, method = 'GET', body) {
    const r = check(await fetch('/api/auth/' + path, { method, cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  async function logout() { try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {} location.replace('/login'); }
  const subscribe = f => S.subs.push(f);
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(S.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `airista-work-plan-${window.U.today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return { S, init, dispatch, api, logout, subscribe, exportJSON, get state() { return S.state; }, get me() { return S.me; }, get user() { return S.user; },
    // Owner choices: every account, the client org, and anyone already assigned to a card.
    get people() { const own = S.state ? S.state.items.flatMap(i => i.owner) : []; return [...new Set([...S.people, ...C.PEOPLE, ...own])]; } };
})();
