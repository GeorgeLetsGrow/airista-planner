// Weekly SEO health check view: crawl status, report history and the report itself.
window.Health = (() => {
  const U = window.U, { esc } = U;
  const st = { list: null, report: {}, date: null, error: '', loading: false };
  const n = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const path = u => { try { const x = new URL(u); return x.pathname + x.search; } catch (e) { return u; } };
  const day = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const a = u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(path(u))}</a>`;
  const sev = s => `<span class="sev sev-${esc(s)}">${esc(s)}</span>`;

  function change(cur, prev, lowerBetter, unit) {
    if (prev === undefined || prev === null) return '';
    const diff = cur - prev;
    if (!diff) return '<span class="chg flat">No change</span>';
    const good = lowerBetter ? diff < 0 : diff > 0;
    const amount = unit === 'pos' ? Math.abs(diff).toFixed(1) : prev ? `${Math.abs(Math.round(diff / Math.abs(prev) * 100))}%` : n(Math.abs(diff));
    return `<span class="chg ${good ? 'good' : 'bad'}">${diff > 0 ? '▲' : '▼'} ${amount}</span>`;
  }
  const tile = (label, value, prior, source, opts = {}) => `<div class="kpi"><div class="kpi-h"><span class="label">${esc(label)}</span><span class="src">${esc(source)}</span></div>
<div class="kpi-v"><b>${esc(opts.fmt ? opts.fmt(value) : n(value))}</b>${change(value, prior, opts.lowerBetter, opts.unit)}</div>${prior !== undefined && prior !== null ? `<span class="muted hk-prior">Prior: ${esc(opts.fmt ? opts.fmt(prior) : n(prior))}</span>` : ''}</div>`;

  function jobPanel() {
    const job = st.list?.job, running = job?.status === 'running';
    let body = '';
    if (running) {
      const p = job.progress, pct = p.totalPages ? Math.round((p.pages + (p.totalLinks ? p.links / p.totalLinks * p.totalPages * .35 : 0)) / (p.totalPages * 1.35) * 100) : 2;
      const phase = { init: 'Reading the sitemap and site files', pages: `Checking pages · ${p.pages} of ${p.totalPages}`, links: `Checking internal links · ${p.links} of ${p.totalLinks}`, finish: 'Comparing with last week and writing the report' }[job.phase] || job.phase;
      body = `<div class="hk-prog"><div class="hk-bar"><i style="width:${Math.min(99, pct)}%"></i></div><span>${esc(phase)}</span></div><p class="muted hk-small">Started ${esc(U.ago(job.startedAt))}${job.by ? ` by ${esc(job.by)}` : ''}. The site is behind Cloudflare, so the crawl runs at one request per second and takes about 15 minutes. You can leave this page.</p>`;
    } else if (job?.status === 'failed') body = `<p class="auth-err hk-small">The last crawl (${esc(day(job.date))}) failed: ${esc(job.error || 'unknown error')}</p>`;
    else if (job?.status === 'done') body = `<p class="muted hk-small">Last crawl finished ${esc(U.ago(job.finishedAt))}${job.trigger === 'schedule' ? ' (scheduled)' : job.by ? ` (run by ${esc(job.by)})` : ''}.</p>`;
    else body = '<p class="muted hk-small">No crawl has run in the app yet. Run the first one to set the baseline.</p>';
    return `<section class="panel"><div class="panel-h"><div><h2>Weekly crawl</h2><span class="muted">Runs automatically ${esc(st.list?.schedule || 'every Monday')}. Read-only: nothing on the website is changed.</span></div>
<button class="btn ${running ? '' : 'primary'} sm" type="button" id="hk-run" ${running ? 'disabled' : ''}>${running ? 'Crawl running…' : 'Run crawl now'}</button></div>${body}</section>`;
  }

  function history() {
    const reports = st.list?.reports || [];
    if (!reports.length) return '';
    return `<div class="hk-hist" role="tablist" aria-label="Weekly reports">${reports.slice(0, 12).map(r => `<button type="button" class="hk-week ${r.date === st.date ? 'on' : ''}" data-hk-date="${esc(r.date)}">
<span class="hk-dot ${r.status === 'clear' ? 'ok' : 'warn'}"></span><b>${esc(day(r.date))}</b><span>${n(r.counts.high)} high · ${n(r.counts.medium)} med · ${n(r.counts.low)} low</span></button>`).join('')}</div>`;
  }

  function reportView(r) {
    const c = r.changes, k = r.crawl.counts, s = r.search, g = r.ga4;
    const org = !g.pending && g.channels.find(x => x.channel === 'Organic Search');
    const tiles = [
      tile('Sitemap URLs crawled', r.crawl.pages, c?.prevPages, 'Crawl'),
      tile('High issues', k.high, c?.prevCounts.high, 'Crawl', { lowerBetter: true }),
      tile('Medium issues', k.medium, c?.prevCounts.medium, 'Crawl', { lowerBetter: true }),
      tile('Low issues', k.low, c?.prevCounts.low, 'Crawl', { lowerBetter: true }),
      ...(!s.pending ? [tile('GSC clicks', s.totals.clicks, s.prev.clicks, 'Search Console'), tile('GSC impressions', s.totals.impressions, s.prev.impressions, 'Search Console'),
        tile('GSC average position', s.totals.position, s.prev.position, 'Search Console', { lowerBetter: true, unit: 'pos', fmt: v => Number(v).toFixed(1) })] : []),
      ...(!g.pending ? [tile('GA4 sessions (all channels)', g.totals.sessions, g.totals.sessionsPrior, 'GA4'), ...(org ? [tile('GA4 organic sessions', org.sessions, org.sessionsPrior, 'GA4')] : []),
        tile('GA4 key events', g.totals.keyEvents, g.totals.keyEventsPrior, 'GA4')] : []),
    ].join('');
    const pending = [s.pending && `Search Console: ${s.pending}`, g.pending && `GA4: ${g.pending}`].filter(Boolean);
    const windowNote = !s.pending ? `Search Console and GA4: ${esc(s.range.label)} vs ${esc(s.prevRange.label)}. ` : '';

    const changed = !c ? '<p class="muted">No previous crawl to compare with; this run is the baseline.</p>' : `<ul class="hk-list">
<li><b>Sitemap:</b> ${n(r.crawl.pages)} URLs crawled (${n(c.prevPages)} last week). ${n(c.added.length)} added, ${n(c.removed.length)} removed.${c.added.length || c.removed.length ? `<ul>${c.added.map(u => `<li>Added: ${a(u)}</li>`).join('')}${c.removed.map(u => `<li>Removed: ${a(u)}</li>`).join('')}</ul>` : ''}</li>
<li><b>Site files:</b> ${r.crawl.siteChecks.map(f => `<code>${esc(f.path)}</code> <span class="${f.status === 200 ? 'ok' : 'bad'}">${esc(f.status)}</span>`).join(', ')}</li>
<li><b>Issue totals:</b> ${n(k.high)} high, ${n(k.medium)} medium, ${n(k.low)} low (last week ${n(c.prevCounts.high)} / ${n(c.prevCounts.medium)} / ${n(c.prevCounts.low)}).</li>
<li><b>New issues (${n(c.newIssues)}):</b> ${c.newByCheck.map(x => `${n(x.count)} ${esc(x.label.toLowerCase())}`).join('; ') || 'none'}.</li>
<li><b>Resolved issues (${n(c.resolvedIssues)}):</b> ${c.resolvedByCheck.map(x => `${n(x.count)} ${esc(x.label.toLowerCase())}`).join('; ') || 'none'}.${c.newByCheck.some(x => x.check === 'slow_response') ? ' <span class="muted">Slow-response movement mostly reflects Cloudflare rate limiting during the crawl.</span>' : ''}</li>
<li><b>On-page changes:</b> ${c.onPage.length ? `${n(c.onPage.length)}<ul>${c.onPage.slice(0, 30).map(x => `<li>${a(x.url)} · ${esc(x.label.toLowerCase())}: <s>${esc(x.before || '(none)')}</s> → ${esc(x.after || '(none)')}</li>`).join('')}</ul>` : 'none. No titles, meta descriptions, H1s, canonicals or robots directives changed on existing pages.'}</li></ul>`;

    const highItem = i => `<li><b>${esc(i.label)}:</b> <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.url)}</a> <span class="muted">(${esc(i.detail)})</span>${i.linkedFrom.length ? `<ul>${i.linkedFrom.map(u => `<li>Linked from ${a(u)}</li>`).join('')}</ul>` : ''}</li>`;
    const high = `${r.newHigh.length ? `<ul class="hk-list">${r.newHigh.map(highItem).join('')}</ul>` : '<p class="muted">None this week.</p>'}
${r.carriedHigh.length ? `<p class="label" style="margin-top:6px">Carried over from earlier crawls</p><ul class="hk-list">${r.carriedHigh.map(highItem).join('')}</ul>` : ''}`;

    const pp = `<div class="rpt-table-wrap"><table class="rpt-table hk-pp"><thead><tr><th>Priority page</th><th>Final URL</th><th class="num">Status</th><th>Title</th><th>Indexable</th><th>Change</th></tr></thead><tbody>
${r.priority.map(p => `<tr><td>${a(p.configured)}</td><td>${p.redirected ? a(p.finalUrl) : '<span class="muted">same</span>'}</td><td class="num"><span class="${p.status === 200 ? 'ok' : 'bad'}">${esc(p.status)}</span></td><td title="${esc(p.title)}">${esc(p.title)}</td>
<td><span class="${p.indexable ? 'ok' : 'bad'}">${p.indexable ? 'Yes' : 'No'}</span> <span class="muted">${esc((p.metaRobots || 'no robots tag').split(',').slice(0, 2).join(','))}; ${p.selfCanonical ? 'self canonical' : 'canonical elsewhere'}</span></td>
<td>${p.changed.length ? p.changed.map(x => `<span class="bad">${esc(x.label)}</span>`).join(', ') : `<span class="muted">${p.comparedWith ? 'None' : 'First check'}</span>`}</td></tr>`).join('')}</tbody></table></div>
${r.priority.some(p => p.openIssues.length) ? `<p class="muted hk-small">Open items: ${r.priority.filter(p => p.openIssues.length).map(p => `<b>${esc(path(p.finalUrl))}</b> ${esc(p.openIssues.join('; ').toLowerCase())}`).join(' · ')}</p>` : ''}`;

    const gscTable = (rows, label) => `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>${label}</th><th class="num">Clicks</th><th class="num">Prior</th><th class="num">Impr.</th><th class="num">Prior</th><th class="num">CTR</th><th class="num">Pos.</th><th class="num">Prior</th></tr></thead><tbody>
${rows.map(x => `<tr><td title="${esc(x.key)}">${/^https?:/.test(x.key) ? a(x.key) : esc(x.key)}</td><td class="num">${n(x.clicks)}</td><td class="num">${x.prior ? n(x.prior.clicks) : '—'}</td><td class="num">${n(x.impressions)}</td><td class="num">${x.prior ? n(x.prior.impressions) : '—'}</td><td class="num">${(x.ctr * 100).toFixed(1)}%</td><td class="num">${x.position.toFixed(1)}</td><td class="num">${x.prior ? x.prior.position.toFixed(1) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    const google = s.pending && g.pending ? '' : `<section class="panel"><div class="panel-h"><div><h2>Search Console and GA4</h2><span class="muted">${!s.pending ? `${esc(s.range.label)} vs ${esc(s.prevRange.label)}` : esc(`${g.range.label} vs ${g.prevRange.label}`)}</span></div></div>
${!s.pending ? `<div class="rpt-2"><div><p class="label">Top pages</p>${gscTable(s.topPages, 'Page')}</div><div><p class="label">Top queries</p>${gscTable(s.topQueries, 'Query')}</div></div>` : `<p class="muted">Search Console: ${esc(s.pending)}</p>`}
${!g.pending ? `<p class="label">GA4 channels</p><div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Channel</th><th class="num">Sessions</th><th class="num">Prior</th><th class="num">Engaged</th><th class="num">Eng. rate</th><th class="num">Key events</th><th class="num">Prior</th></tr></thead><tbody>
${[...g.channels, g.totals].map(x => `<tr class="${x === g.totals ? 'hk-total' : ''}"><td>${esc(x.channel)}</td><td class="num">${n(x.sessions)}</td><td class="num">${n(x.sessionsPrior)}</td><td class="num">${n(x.engaged)}</td><td class="num">${x.sessions ? Math.round(x.engaged / x.sessions * 100) : 0}%</td><td class="num">${n(x.keyEvents)}</td><td class="num">${n(x.keyEventsPrior)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">GA4: ${esc(g.pending)}</p>`}</section>`;

    const counts = `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Severity</th><th>Check</th><th class="num">Count</th></tr></thead><tbody>${r.crawl.byCheck.map(x => `<tr><td>${sev(x.severity)}</td><td>${esc(x.label)}</td><td class="num">${n(x.count)}</td></tr>`).join('')}</tbody></table></div>`;
    const dl = (fmt, label) => `<a class="btn sm" href="/api/seo-health?date=${esc(r.date)}&format=${fmt}" download>${label}</a>`;

    return `<section class="panel hk-status ${r.status.level === 'clear' ? 'ok' : 'warn'}"><div class="panel-h"><div><span class="label">Status · ${esc(day(r.date))}</span><h2>${esc(r.status.line)}</h2></div>
<div class="rpt-actions">${dl('xlsx', 'Download workbook (.xlsx)')}${dl('md', 'Markdown')}</div></div>
${r.material.length ? `<ul class="hk-list hk-material">${r.material.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
<div class="kpis">${tiles}</div>
<p class="muted hk-small">Crawl ${esc(day(r.date))}${c ? ` compared with ${esc(day(c.prevDate))}` : ' (baseline)'}. ${windowNote}${pending.map(esc).join(' ')}</p></section>

<section class="panel"><div class="panel-h"><h2>Recommended actions</h2><span class="muted">Most important first. Staging or Yoast drafts first; LetsGrow approves before anything goes live.</span></div>
<ol class="hk-actions">${r.actions.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>

<div class="rpt-2"><section class="panel"><h2>What changed since last week</h2>${changed}</section>
<section class="panel"><h2>New high-severity issues</h2>${high}</section></div>

<section class="panel"><div class="panel-h"><h2>Priority pages check</h2><span class="muted">Configured URLs are fetched directly, following redirects.</span></div>${pp}</section>
${google}
<section class="panel"><div class="panel-h"><h2>Crawl issues by check</h2><div class="rpt-actions">${dl('issues', 'All issues CSV')}${dl('broken', 'Broken links CSV')}${dl('pages', 'Pages CSV')}</div></div>${counts}</section>`;
  }

  function render() {
    const head = `<div class="rpt">${jobPanel()}${history()}`;
    if (st.error) return `${head}<section class="panel"><p class="auth-err">${esc(st.error)}</p></section></div>`;
    if (!st.list) return `${head}<section class="panel rpt-empty">Loading weekly reports…</section></div>`;
    if (!st.list.reports.length) return `${head}</div>`;
    const r = st.report[st.date];
    if (!r) return `${head}<section class="panel rpt-empty">Loading the ${esc(day(st.date))} report…</section></div>`;
    if (r.error) return `${head}<section class="panel"><p class="auth-err">${esc(r.error)}</p></section></div>`;
    return `${head}${reportView(r)}</div>`;
  }

  // ---- data ----
  let timer = null, onChange = () => {};
  async function api(url, opts) {
    const r = await fetch(url, { cache: 'no-store', ...opts });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash)); throw new Error('Not signed in'); }
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }
  async function loadReport(date) {
    if (st.report[date] && !st.report[date].error) return;
    try { st.report[date] = await api(`/api/seo-health?date=${encodeURIComponent(date)}`); } catch (e) { st.report[date] = { error: e.message }; }
    onChange();
  }
  async function refresh() {
    try {
      const wasRunning = st.list?.job?.status === 'running';
      st.list = await api('/api/seo-health'); st.error = '';
      const newest = st.list.reports[0]?.date;
      if (wasRunning && st.list.job?.status === 'done' && newest) { delete st.report[newest]; st.date = newest; }
      if (!st.date || !st.list.reports.some(r => r.date === st.date)) st.date = newest || null;
      if (st.date) loadReport(st.date);
    } catch (e) { st.error = e.message; }
    onChange();
    clearTimeout(timer);
    if (st.list?.job?.status === 'running') timer = setTimeout(() => { if (active()) refresh(); }, 10000);
  }
  let active = () => false;
  function open(isActive, changed) { active = isActive; onChange = changed; refresh(); }
  function select(date) { st.date = date; onChange(); loadReport(date); }
  async function run() {
    try { const r = await api('/api/seo-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run' }) }); st.list = { ...(st.list || { reports: [] }), job: r.job }; }
    catch (e) { st.error = e.message; }
    onChange(); refresh();
  }
  return { render, open, select, run };
})();
