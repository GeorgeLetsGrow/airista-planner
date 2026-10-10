(() => {
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const next = (() => { const n = params.get('next') || '/'; return n.startsWith('/') && !n.startsWith('//') ? n : '/'; })();
  const showErr = (el, msg) => { el.textContent = msg; el.hidden = !msg; };
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({ error: 'Unexpected server response.' }));
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  };
  const busy = (form, on) => form.querySelectorAll('button,input').forEach(x => { x.disabled = on; });

  // Setup links look like /login#setup=TOKEN (in the hash so the token isn't sent to servers or logged).
  const setupToken = (location.hash.match(/^#setup=(.+)$/) || [])[1];

  if (setupToken) {
    const form = $('#setup-form'), err = $('#setup-err');
    $('#login-form').hidden = true; form.hidden = false;
    fetch('/api/auth/setup?token=' + encodeURIComponent(setupToken)).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { showErr(err, d.error || 'This link is not valid.'); busy(form, true); return; }
      $('#setup-title').textContent = d.reset ? 'Reset your password' : 'Set your password';
      $('#setup-who').textContent = `${d.name} · ${d.email}`;
      $('#setup-email').value = d.email;
      $('#setup-password').focus();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const pw = $('#setup-password').value, pw2 = $('#setup-confirm').value;
      if (pw.length < 10) return showErr(err, 'Use at least 10 characters.');
      if (pw !== pw2) return showErr(err, "The passwords don't match.");
      showErr(err, ''); busy(form, true);
      try { await post('/api/auth/setup', { token: setupToken, password: pw }); location.replace('/'); }
      catch (x) { showErr(err, x.message); busy(form, false); }
    });
    return;
  }

  const form = $('#login-form'), err = $('#login-err');
  fetch('/api/auth/me').then(r => { if (r.ok) location.replace(next); }).catch(() => {});
  $('#login-email').focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#login-email').value.trim(), password = $('#login-password').value;
    if (!email || !password) return showErr(err, 'Enter your email and password.');
    showErr(err, ''); busy(form, true);
    try { await post('/api/auth/login', { email, password }); location.replace(next); }
    catch (x) { showErr(err, x.message); busy(form, false); $('#login-password').select(); }
  });
})();
