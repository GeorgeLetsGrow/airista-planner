// SEO reporting view: monthly scorecard, keyword tracker, page checks and tool shortcuts.
window.Reports = (() => {
  const C = window.PlannerCore, U = window.U, { esc } = U;
  const detail = {};

  const host = site => { try { return new URL(site).hostname; } catch (e) { return ''; } };
  const enc = encodeURIComponent;
  const monthLabel = m => { const [y, n] = m.split('-').map(Number); return new Date(y, n - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
  const prevMonth = m => { const [y, n] = m.split('-').map(Number); const d = new Date(y, n - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const lastMonths = (end, n) => { const out = [end]; while (out.length < n) out.unshift(prevMonth(out[0])); return out; };
  const fmtNum = (v, unit) => v === undefined || v === '' ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) + (unit || '');

  const tabNames = { overview: 'Overview', search: 'Search performance', traffic: 'Traffic & conversions', links: 'Links & rankings' };
  const labels = { item: 'Query or page', kind: 'Type', clicks: 'Clicks', impressions: 'Impressions', ctr: 'CTR', position: 'Position', landingPage: 'Landing page', sessions: 'Sessions', activeUsers: 'Active users', keyEvents: 'Key events', type: 'Type', primary: 'Keyword or referring domain', traffic: 'Est. traffic', detail: 'Country or anchor', url: 'Source / ranking URL', target: 'Target URL' };
  const numeric = new Set(['clicks', 'impressions', 'ctr', 'position', 'sessions', 'activeUsers', 'keyEvents', 'traffic']);

  function cell(value, column) {
    if (value === undefined || value === null || value === '') return '—';
    if ((column === 'url' || column === 'target') && /^https?:\/\//.test(value)) return `<a href="${esc(value)}" target="_blank" rel="noopener">${esc(value)}</a>`;
    if (column === 'ctr') return `${Number(value).toFixed(2)}%`;
    if (numeric.has(column)) return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return esc(String(value));
  }

  function detailPanel(tab, month) {
    const data = detail[`${tab}:${month}`];
    const title = tabNames[tab];
    if (!data) return `<section class="panel rpt-detail"><div class="panel-h"><div><h2>${esc(title)}</h2><span class="muted">Top 100 rows for ${esc(monthLabel(month))}</span></div><button class="btn primary" type="button" data-rpt-load="${tab}">Pull and save report</button></div><div class="rpt-empty">Pull this report once and its snapshot will remain available for seven days—even after refreshing or reopening the app.</div></section>`;
    if (data.loading) return `<section class="panel rpt-detail"><h2>${esc(title)}</h2><div class="rpt-empty">Loading ${esc(title.toLowerCase())}…</div></section>`;
    if (data.error) return `<section class="panel rpt-detail"><div class="panel-h"><h2>${esc(title)}</h2><button class="btn" type="button" data-rpt-load="${tab}">Retry</button></div><div class="rpt-empty auth-err">${esc(data.error)}</div></section>`;
    const rows = data.rows || [], columns = data.columns || [];
    const saved = data.savedAt ? new Date(data.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return `<section class="panel rpt-detail"><div class="panel-h"><div><h2>${esc(title)}</h2><span class="muted">${rows.length} rows · ${esc(monthLabel(month))}${saved ? ` · saved ${esc(saved)}` : ''}</span></div><div class="rpt-actions"><button class="btn sm" type="button" data-rpt-load="${tab}">Refresh snapshot</button><button class="btn sm" type="button" data-rpt-csv="${tab}">Export CSV</button></div></div>
<div class="rpt-find"><input type="search" id="rpt-q" placeholder="Search this report" aria-label="Search this report"><span class="muted" id="rpt-count">${rows.length} shown</span></div>
<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr>${columns.map(c => `<th class="${numeric.has(c) ? 'num' : ''}">${esc(labels[c] || c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr data-report-row data-search="${esc(columns.map(c => row[c] || '').join(' ').toLowerCase())}">${columns.map(c => `<td class="${numeric.has(c) ? 'num' : ''}">${cell(row[c], c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<div class="rpt-actions" style="justify-content:flex-end;margin-top:16px"><button class="btn sm" type="button" data-rpt-csv="${tab}">Export ${esc(title)} CSV</button></div></section>`;
  }

  function delta(cur, prev, lowerBetter, unit) {
    if (cur === undefined || prev === undefined || prev === 0 && cur === 0) return '';
    const diff = cur - prev; if (!diff) return '<span class="dl flat">no change</span>';
    const good = lowerBetter ? diff < 0 : diff > 0;
    const pct = prev && unit !== '%' ? ` (${diff > 0 ? '+' : ''}${Math.round(diff / Math.abs(prev) * 100)}%)` : '';
    const amt = Math.abs(diff).toLocaleString('en-US', { maximumFractionDigits: 2 }) + (unit === '%' ? ' pts' : '');
    return `<span class="dl ${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${amt}${pct}</span>`;
  }

  function spark(values, lowerBetter) {
    const pts = values.map((v, i) => [i, v]).filter(p => p[1] !== undefined);
    if (pts.length < 2) return '<svg class="spark" viewBox="0 0 100 28"></svg>';
    const ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1, w = values.length - 1 || 1;
    const xy = pts.map(([i, v]) => `${(i / w * 100).toFixed(1)},${(lowerBetter ? 3 + (v - lo) / span * 22 : 25 - (v - lo) / span * 22).toFixed(1)}`);
    return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${xy.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function tools(site) {
    const h = host(site), s = enc(site), hq = enc(h);
    const groups = [
      ['Performance', [
        ['Search Console', 'https://search.google.com/search-console', 'Clicks, impressions, CTR, position, indexing'],
        ['GA4', 'https://analytics.google.com/', 'Organic sessions and conversions'],
        ['Looker Studio', 'https://lookerstudio.google.com/', 'Shareable dashboards'],
        ['Bing Webmaster Tools', 'https://www.bing.com/webmasters', 'Bing search performance'],
      ]],
      ['Technical checks for this site', [
        ['PageSpeed Insights', `https://pagespeed.web.dev/analysis?url=${s}`, 'Core Web Vitals and Lighthouse'],
        ['Rich Results Test', `https://search.google.com/test/rich-results?url=${s}`, 'Structured data'],
        ['Schema validator', `https://validator.schema.org/#url=${s}`, 'Schema.org markup'],
        ['robots.txt', `${site.replace(/\/$/, '')}/robots.txt`, 'Crawl rules'],
        ['Sitemap', `${site.replace(/\/$/, '')}/sitemap_index.xml`, 'Yoast sitemap index'],
        ['Security headers', `https://securityheaders.com/?q=${hq}&followRedirects=on`, 'HTTPS and header hygiene'],
      ]],
      ['Keywords and links', [
        ['Google Trends', 'https://trends.google.com/trends/', 'Topic demand over time'],
        ['Keyword Planner', 'https://ads.google.com/aw/keywordplanner/home', 'Search volume (Google Ads)'],
        ['Ahrefs backlink checker', `https://ahrefs.com/backlink-checker?input=${hq}&mode=subdomains`, 'Referring domains snapshot'],
        ['Site search', `https://www.google.com/search?q=site%3A${hq}`, 'Rough count of indexed pages'],
      ]],
    ];
    return groups.map(([t, list]) => `<div class="tgroup"><span class="label">${esc(t)}</span><div class="tlinks">${list.map(([n, u, d]) =>
      `<a class="tlink" href="${esc(u)}" target="_blank" rel="noopener"><b>${esc(n)} <span aria-hidden="true">↗</span></b><span>${esc(d)}</span></a>`).join('')}</div></div>`).join('');
  }

  function render(state, ui) {
    const R = C.ensureReports(state);
    const month = ui.rptMonth, prev = prevMonth(month), row = R.months[month] || {}, prow = R.months[prev] || {};
    const months6 = lastMonths(month, 6);
    const filled = C.SEO_METRICS.filter(m => row[m.key] !== undefined).length;

    const cards = C.SEO_METRICS.map(m => `<div class="kpi">
<div class="kpi-h"><span class="label">${esc(m.label)}</span><span class="src">${esc(m.source)}</span></div>
<div class="kpi-v"><b>${fmtNum(row[m.key], m.unit)}</b>${delta(row[m.key], prow[m.key], m.lowerBetter, m.unit)}</div>
<div class="kpi-s">${spark(months6.map(x => (R.months[x] || {})[m.key]), m.lowerBetter)}</div></div>`).join('');

    const entry = C.SEO_METRICS.map(m => `<label class="f"><span class="label">${esc(m.label)}${m.unit ? ` (${m.unit})` : ''}</span>
<input type="number" step="${m.int ? '1' : 'any'}" min="0" inputmode="${m.int ? 'numeric' : 'decimal'}" data-rpt="${m.key}" value="${row[m.key] === undefined ? '' : row[m.key]}" placeholder="${prow[m.key] === undefined ? '' : 'Last month: ' + prow[m.key]}"></label>`).join('');

    const kmonths = lastMonths(month, 3);
    const kw = R.keywords.map(k => {
      const cur = k.pos[month], was = k.pos[prev];
      return `<tr data-kw="${k.id}"><td><b>${esc(k.keyword)}</b><input type="text" class="kw-url" data-kwurl value="${esc(k.url)}" placeholder="Target page" aria-label="Target page for ${esc(k.keyword)}"></td>
${kmonths.map(x => x === month
        ? `<td><input type="number" min="1" max="1000" step="0.1" data-kwpos value="${cur === undefined ? '' : cur}" aria-label="Position in ${monthLabel(x)}"></td>`
        : `<td class="num">${k.pos[x] === undefined ? '—' : k.pos[x]}</td>`).join('')}
<td>${delta(cur, was, true)}</td>
<td class="kw-acts"><a class="ibtn" href="https://www.google.com/search?q=${enc(k.keyword)}" target="_blank" rel="noopener" title="See the live results">↗</a><button class="ibtn" type="button" data-kwdel aria-label="Stop tracking ${esc(k.keyword)}">${U.ICON.close}</button></td></tr>`;
    }).join('');

    const overview = `<div class="rpt">
<section class="panel"><div class="panel-h"><h2>Scorecard · ${esc(monthLabel(month))}</h2><span class="muted">${filled} of ${C.SEO_METRICS.length} entered · compared with ${esc(monthLabel(prev))}</span></div>
<div class="kpis">${cards}</div></section>

<div class="rpt-2">
<section class="panel"><div class="panel-h"><h2>Enter ${esc(monthLabel(month))} figures</h2><div class="rpt-actions"><button class="btn primary sm" type="button" id="rpt-sync">Pull ${esc(monthLabel(month))} data</button><button class="btn sm" type="button" id="rpt-toggle">${ui.rptEdit ? 'Hide' : 'Edit figures'}</button></div></div>
<p class="rpt-sync-status muted" id="rpt-sync-status">Pulls and saves this month's Search Console, GA4 and Ahrefs totals. Existing figures for this month will be replaced.</p>
${ui.rptEdit ? `<div class="fgrid">${entry}</div><p class="muted" style="font-size:12px">Saves when you leave a field. Leave a field blank if the number isn't available yet.</p>` : `<p class="muted">Use <b>Edit figures</b> to type this month's numbers from each source. Changes are logged in Daily check-in.</p>`}
</section>
<section class="panel"><div class="panel-h"><h2>SEO tools</h2><span class="muted">${esc(host(R.site))}</span></div>${tools(R.site)}</section>
</div>

<section class="panel"><div class="panel-h"><h2>Keyword rankings</h2><span class="muted">Position in Google for ${esc(monthLabel(month))}. Lower is better.</span></div>
${R.keywords.length ? `<div class="kw-wrap"><table class="kw"><thead><tr><th>Keyword</th>${kmonths.map(x => `<th class="num">${esc(monthLabel(x))}</th>`).join('')}<th>Change</th><th></th></tr></thead><tbody>${kw}</tbody></table></div>` : '<p class="muted">No keywords yet. Add the terms you want to track.</p>'}
<form class="kw-add" id="kw-add"><input type="text" id="kw-new" placeholder="Keyword, e.g. RTLS for hospitals" maxlength="120"><input type="text" id="kw-new-url" placeholder="Target page (optional)" maxlength="300"><button class="btn primary" type="submit">Add keyword</button></form>
</section>
<div class="rpt-actions" style="justify-content:flex-end"><button class="btn" type="button" id="rpt-overview-csv">Export ${esc(monthLabel(month))} scorecard CSV</button></div>
</div>`;

    return `<div class="vhead"><div><h1>SEO reporting</h1><p>Explore Search Console, GA4 and Ahrefs data without leaving the work plan.</p></div>
<div class="rpt-ctl"><label class="f"><span class="label">Site</span><input type="text" id="rpt-site" value="${esc(R.site)}"></label>
<label class="f"><span class="label">Month</span><input type="month" id="rpt-month" value="${month}"></label></div></div>
<div class="report-tabs" role="tablist">${Object.entries(tabNames).map(([key, name]) => `<button type="button" role="tab" aria-selected="${ui.rptTab === key}" class="${ui.rptTab === key ? 'on' : ''}" data-rpt-tab="${key}">${esc(name)}</button>`).join('')}</div>
${ui.rptTab === 'overview' ? overview : detailPanel(ui.rptTab, month)}`;
  }

  function setDetail(tab, month, data) { if (data) detail[`${tab}:${month}`] = data; else delete detail[`${tab}:${month}`]; }
  function getDetail(tab, month) { return detail[`${tab}:${month}`]; }
  function csv(tab, month) {
    const data = getDetail(tab, month); if (!data?.rows) return;
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const text = [data.columns.map(quote), ...data.rows.map(row => data.columns.map(c => quote(row[c])))].map(row => row.join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `airista-${tab}-${month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function overviewCsv(state, month) {
    const R = C.ensureReports(state), row = R.months[month] || {};
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [['Section', 'Metric', 'Source', 'Month', 'Value']];
    C.SEO_METRICS.forEach(metric => lines.push(['Scorecard', metric.label, metric.source, month, row[metric.key] ?? '']));
    R.keywords.forEach(keyword => lines.push(['Keyword ranking', keyword.keyword, keyword.url || 'Ahrefs', month, keyword.pos?.[month] ?? '']));
    const text = lines.map(line => line.map(quote).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `airista-scorecard-${month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { render, prevMonth, setDetail, getDetail, csv, overviewCsv };
})();
