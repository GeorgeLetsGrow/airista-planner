(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.PlannerCore = m;
})(typeof self !== 'undefined' ? self : this, function () {
var STATUS = { ns: 'Not started', ip: 'In progress', nv: 'Needs verification', bl: 'Blocked', co: 'Complete' };
var PRIORITY = { high: 'High', med: 'Medium', low: 'Low' };
var LANES = { today: 'Today', week: 'This week', later: 'Later' };
var TYPES = { paid: 'Paid', seo: 'SEO', dev: 'Development' };
var WS_TYPE = { pm: 'paid', lp: 'dev', seo: 'seo', con: 'seo', off: 'seo', web: 'dev', mr: 'paid' };
function typeOf(it) { return it.type || WS_TYPE[it.ws] || 'dev'; }
// Owner choices come from the account list at runtime (Store.people); AiRISTA is the client organization.
var PEOPLE = ['AiRISTA'];
var EDITABLE = ['type', 'status', 'priority', 'lane', 'owner', 'due', 'agreed', 'blocker', 'evidence'];
var WS = [
  { id: 'pm', name: 'Paid Media', counters: ['weekly'] },
  { id: 'lp', name: 'Landing Pages and Conversion', counters: ['lpopt'], note: 'New page development is separate from recurring optimization unless agreed in writing.' },
  { id: 'seo', name: 'Technical and On-Page SEO' },
  { id: 'con', name: 'Organic Content', counters: ['articles', 'refresh'] },
  { id: 'off', name: 'Off-Site SEO and Authority', counters: ['pitches'] },
  { id: 'web', name: 'Website Support', hours: true, note: 'Tracked separately from paid media and SEO deliverables.' },
  { id: 'mr', name: 'Measurement and Reporting', counters: ['report'], access: true,
    metrics: ['Spend', 'Conversions', 'Cost per lead', 'Lead quality', 'Pipeline', 'Landing page conversion rate', 'Organic performance'] }
];
var ROADMAP = [
  { month: '2026-10', label: 'October', items: ['Confirm scope, access, budgets, owners and priorities.', 'Establish campaign, SEO and tracking baselines.', 'Begin priority campaign and technical improvements.', 'Approve content calendar and first landing page brief.', 'Complete October recurring deliverables.'] },
  { month: '2026-11', label: 'November', items: ['Launch first approved landing page.', 'Refine campaigns using search term and lead quality evidence.', 'Continue articles, page optimization, blog refresh and outreach.', 'Work through technical SEO backlog.'] },
  { month: '2026-12', label: 'December', items: ['Review campaign and landing page results.', 'Continue recurring work.', 'Complete quarterly paid and SEO review.', 'Set Q1 content, campaign, testing and budget priorities.'] }
];

function seed() {
  var raw = [
    ['pm', [], 'ip', '2026-10-17', 'Confirm budgets, active campaigns, audiences and commercial priorities', 'Review current budgets and priorities with AiRISTA', 'today', 'high'],
    ['pm', [], 'ip', '2026-10-24', 'Review Google Ads structure, search terms, match types, negatives, targeting, bids and budget allocation', 'Finish search term review and draft negatives list', 'week', 'high'],
    ['pm', [], 'nv', '2026-10-10', 'October campaign changes', 'Confirm each change, its date and its result in the optimization log', 'today', 'high', { evidence: 'Change history export requested' }],
    ['pm', [], 'bl', '2026-10-31', 'Verify conversion tracking and separate quality leads from spam', 'Audit conversion actions once access is granted', 'week', 'high', { blocker: 'Awaiting GTM and CRM access' }],
    ['pm', [], 'ns', '2026-11-14', 'Update and test ad copy aligned with buyer intent', 'Draft copy variants after search term review', 'later', 'med'],
    ['pm', [], 'ns', '2026-11-21', 'Align each campaign with the most relevant landing page', 'Map campaigns to current solution pages', 'later', 'med'],
    ['pm', [], 'ns', '2026-10-17', 'Confirm launch status of prepared LinkedIn audiences and campaigns', 'Check campaign status in LinkedIn Campaign Manager', 'week', 'med'],
    ['pm', [], 'bl', '2026-10-17', 'Confirm whether Microsoft Ads is in approved scope', 'Raise at next client check-in', 'today', 'med', { blocker: 'Awaiting AiRISTA scope decision' }],
    ['pm', [], 'ip', '2026-10-16', 'Weekly optimization log: changes, results, risks, next actions', 'Publish next weekly entry', 'week', 'med', { cadence: 'Weekly' }],
    ['lp', [], 'ip', '2026-10-24', 'Finalize hybrid strategy (evergreen solution pages plus dedicated campaign pages)', 'Share strategy outline for AiRISTA review', 'week', 'high'],
    ['lp', [], 'ns', '2026-10-24', 'Select first priority page', 'Shortlist candidates using paid media data', 'week', 'high'],
    ['lp', [], 'ns', '2026-10-31', 'Approve first landing page brief', 'Draft brief after priority page is selected', 'later', 'med'],
    ['lp', [], 'ns', '2026-11-07', 'Finalize copy, structure, CTAs and form requirements', 'Start after brief approval', 'later', 'med'],
    ['lp', [], 'ns', '2026-11-07', 'Decide on dynamic content via URL parameters', 'Outline options and tracking implications', 'later', 'low'],
    ['lp', [], 'ns', '2026-10-31', 'Confirm scope and approval for new page development', 'Send scope note for written approval', 'week', 'med'],
    ['lp', [], 'ns', '2026-11-28', 'Implement, verify tracking, measure conversion', 'Begin after copy and scope approval', 'later', 'med'],
    ['lp', [], 'ns', '2026-10-31', 'Optimize one existing landing page (October)', 'Select page and define the change', 'later', 'med', { cadence: 'Monthly' }],
    ['seo', [], 'ip', '2026-10-24', 'Technical SEO baseline and prioritized backlog', 'Complete crawl and rank issues by impact', 'week', 'high'],
    ['seo', [], 'nv', '2026-10-17', 'Verify which earlier audit and Yoast findings are resolved', 'Check each finding against the live site', 'today', 'high', { evidence: 'Audit findings list compiled; live checks pending' }],
    ['seo', [], 'ns', '2026-11-14', 'Crawlability, indexation, redirects, canonicals, sitemap, robots, broken links, structured data', 'Work from the prioritized backlog', 'later', 'med'],
    ['seo', [], 'ns', '2026-11-28', 'Titles, descriptions, headings, internal links, mobile usability, page speed', 'Work from the prioritized backlog', 'later', 'med'],
    ['seo', [], 'ns', '2026-12-12', 'Implement priority fixes within approved scope', 'Confirm fix list with AiRISTA', 'later', 'med'],
    ['seo', [], 'ns', '2026-10-31', 'Monitor Search Console and organic performance', 'Set up monitoring once access is confirmed', 'later', 'low'],
    ['seo', [], 'ns', '2026-12-18', 'Comprehensive technical audit every six months', 'Set date for first audit', 'later', 'low'],
    ['con', [], 'ip', '2026-10-17', 'Quarterly editorial calendar', 'Send Q4 calendar for topic approval', 'week', 'high'],
    ['con', [], 'nv', '2026-10-31', 'October SEO articles (3)', 'Confirm topics, drafts, approvals and publication status', 'today', 'high', { evidence: 'Status of each article to be confirmed', cadence: 'Monthly' }],
    ['con', [], 'nv', '2026-10-31', 'October blog refresh or consolidation (1)', 'Confirm selected post and publication status', 'week', 'med', { cadence: 'Monthly' }],
    ['con', [], 'ns', '2026-11-14', 'Internal links and CTAs to solution pages', 'Add to each article at publication', 'later', 'low'],
    ['con', [], 'ns', '2026-10-31', 'Track approvals, publish dates, visibility, engagement and conversion contribution', 'Set up content tracking sheet', 'later', 'low'],
    ['off', [], 'ns', '2026-10-24', 'Identify approved publications, associations and partners', 'Draft target list for AiRISTA approval', 'week', 'med'],
    ['off', [], 'ns', '2026-10-31', 'October editorial pitches (up to 2)', 'Develop concepts after target list approval', 'later', 'med', { cadence: 'Monthly' }],
    ['off', [], 'ns', '2026-10-31', 'Track outreach, responses, mentions and backlinks', 'Set up outreach log', 'later', 'low'],
    ['off', [], 'ns', '2026-12-19', 'Quarterly backlink review', 'Schedule for end of quarter', 'later', 'low'],
    ['web', [], 'co', '2026-09-30', 'Contact Us redesign', 'Monitor form submissions', 'later', 'low', { agreed: true, evidence: 'https://www.airistaflow.com/contact-us/', result: 'Launched' }],
    ['web', [], 'ip', '2026-10-31', 'Maintenance, content updates, fixes and approved improvements', 'Log hours against the 25 hour monthly arrangement', 'later', 'med', { cadence: 'Monthly' }],
    ['web', [], 'ip', '2026-10-31', 'Monitor the launched Contact Us experience', 'Review submissions and form errors weekly', 'week', 'med'],
    ['mr', [], 'ip', '2026-10-17', 'Confirm access: Ads accounts, GA4, GTM, Search Console, website admin, CRM', 'Request GTM, Search Console and CRM access', 'today', 'high'],
    ['mr', [], 'ns', '2026-10-24', 'Agree on the definition of a qualified lead', 'Propose a draft definition', 'week', 'high'],
    ['mr', [], 'ns', '2026-11-07', 'Establish baseline and shared scorecard', 'Start once access and lead definition are confirmed', 'later', 'med'],
    ['mr', [], 'ip', '2026-10-16', 'Weekly paid media updates', 'Send next weekly update', 'week', 'med', { cadence: 'Weekly' }],
    ['mr', [], 'ns', '2026-11-05', 'Monthly integrated report', 'Prepare October report', 'later', 'med', { cadence: 'Monthly' }],
    ['mr', [], 'ns', '2026-12-18', 'Quarterly business review', 'Schedule with AiRISTA', 'later', 'low']
  ];
  var at = '2026-10-10T09:00:00.000Z', laneCount = { today: 0, week: 0, later: 0 };
  var items = raw.map(function (r, n) {
    var x = r[8] || {};
    return { id: 'd' + (n + 1), ws: r[0], type: WS_TYPE[r[0]], owner: r[1], status: r[2], due: r[3], title: r[4], next: r[5], lane: r[6], priority: r[7],
      order: laneCount[r[6]]++, agreed: !!x.agreed, blocker: x.blocker || '', evidence: x.evidence || '', result: x.result || '', cadence: x.cadence || '',
      comments: [], history: [{ at: at, by: 'LetsGrow', field: 'import', text: 'Imported from work plan' }], updatedAt: at };
  });
  return {
    version: 1, updatedAt: at, period: '2026-10', items: items,
    hours: { used: 6.5, month: 25 },
    counters: {
      articles: { label: 'New SEO articles', done: 0, target: 3 },
      refresh: { label: 'Blog refresh', done: 0, target: 1 },
      lpopt: { label: 'Landing page optimization', done: 0, target: 1 },
      pitches: { label: 'Editorial pitches', done: 0, target: 2, upTo: true },
      weekly: { label: 'Weekly paid media updates', done: 1, target: 4, unit: 'weeks' },
      report: { label: 'Monthly integrated report', done: 0, target: 1 }
    },
    access: [{ name: 'Google Ads', ok: true }, { name: 'LinkedIn Ads', ok: true }, { name: 'GA4', ok: true }, { name: 'GTM', ok: false }, { name: 'Search Console', ok: false }, { name: 'Website admin', ok: true }, { name: 'CRM', ok: false }],
    notes: {}, log: []
  };
}

function fmtVal(f, v) {
  if (f === 'status') return STATUS[v] || v;
  if (f === 'priority') return PRIORITY[v] || v;
  if (f === 'lane') return LANES[v] || v;
  if (f === 'type') return TYPES[v] || v;
  if (f === 'owner') return (v || []).join(', ') || 'None';
  if (f === 'agreed') return v ? 'Agreed' : 'Proposed';
  return v === '' || v == null ? '(empty)' : String(v);
}
function addLog(s, at, by, text) { s.log.unshift({ at: at, by: by, text: text }); if (s.log.length > 400) s.log.length = 400; }

// ---- SEO reporting ----
// Monthly figures are typed in from Search Console, GA4 and the backlink tool. Nothing is pre-filled.
var SEO_METRICS = [
  { key: 'clicks', label: 'Organic clicks', source: 'Search Console', int: true },
  { key: 'impr', label: 'Impressions', source: 'Search Console', int: true },
  { key: 'ctr', label: 'Average CTR', source: 'Search Console', unit: '%' },
  { key: 'pos', label: 'Average position', source: 'Search Console', lowerBetter: true },
  { key: 'sessions', label: 'Organic sessions', source: 'GA4', int: true },
  { key: 'conv', label: 'Organic conversions', source: 'GA4', int: true },
  { key: 'top10', label: 'Keywords in top 10', source: 'Rank tracker', int: true },
  { key: 'refdom', label: 'Referring domains', source: 'Backlink tool', int: true },
  { key: 'indexed', label: 'Indexed pages', source: 'Search Console', int: true },
  { key: 'cwv', label: 'Core Web Vitals pass', source: 'Search Console', unit: '%' }
];
function ensureReports(state) {
  if (!state.reports) state.reports = { site: 'https://www.airistaflow.com', months: {}, keywords: [] };
  if (!state.reports.months) state.reports.months = {};
  if (!state.reports.keywords) state.reports.keywords = [];
  return state.reports;
}
var MONTH_RE = /^\d{4}-\d{2}$/;
function numOrBlank(v) {
  if (v === '' || v == null) return '';
  var n = Number(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function applyReportOp(state, op, at, by) {
  var R = ensureReports(state);
  if (op.t === 'rpt-site') {
    var s = String(op.site || '').trim().slice(0, 300);
    if (/^https?:\/\/[^\s]+$/i.test(s) && s !== R.site) { addLog(state, at, by, 'Report site set to ' + s); R.site = s.replace(/\/$/, ''); }
  } else if (op.t === 'rpt-metric' && MONTH_RE.test(op.month)) {
    var m = SEO_METRICS.find(function (x) { return x.key === op.key; }), v = numOrBlank(op.value);
    if (!m || v === null) return;
    if (m.int && v !== '') v = Math.round(v);
    var row = R.months[op.month] || (R.months[op.month] = {});
    if (row[m.key] === v || (row[m.key] === undefined && v === '')) return;
    if (v === '') delete row[m.key]; else row[m.key] = v;
    addLog(state, at, by, m.label + ' for ' + op.month + ' set to ' + (v === '' ? '(empty)' : v + (m.unit || '')));
  } else if (op.t === 'kw-add') {
    var kw = String(op.keyword || '').trim().slice(0, 120);
    if (!kw || R.keywords.length >= 300 || R.keywords.some(function (k) { return k.keyword.toLowerCase() === kw.toLowerCase(); })) return;
    R.keywords.push({ id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), keyword: kw, url: String(op.url || '').trim().slice(0, 300), pos: {} });
    addLog(state, at, by, 'Tracking keyword "' + kw + '"');
  } else if (op.t === 'kw-del') {
    var k = R.keywords.find(function (x) { return x.id === op.id; });
    if (k) { R.keywords = R.keywords.filter(function (x) { return x !== k; }); addLog(state, at, by, 'Stopped tracking "' + k.keyword + '"'); }
  } else if (op.t === 'kw-pos' && MONTH_RE.test(op.month)) {
    var kk = R.keywords.find(function (x) { return x.id === op.id; }), p = numOrBlank(op.value);
    if (!kk || p === null || (p !== '' && (p < 1 || p > 1000))) return;
    if (p === '') delete kk.pos[op.month]; else kk.pos[op.month] = Math.round(p * 10) / 10;
  } else if (op.t === 'kw-url') {
    var ku = R.keywords.find(function (x) { return x.id === op.id; });
    if (ku) ku.url = String(op.url || '').trim().slice(0, 300);
  }
}
function byOrder(a, b) { return a.order - b.order; }

function applyOps(state, ops, meta) {
  var at = meta.at, by = meta.by;
  (ops || []).forEach(function (op) {
    var it = op.id ? state.items.find(function (i) { return i.id === op.id; }) : null;
    if (op.t === 'set' && it) {
      Object.keys(op.fields || {}).forEach(function (k) {
        if (EDITABLE.indexOf(k) < 0) return;
        var v = op.fields[k];
        if (k === 'agreed') v = !!v;
        if (typeof v === 'string') v = v.slice(0, 2000);
        var prev = k === 'type' ? typeOf(it) : it[k];
        if (JSON.stringify(prev) === JSON.stringify(v)) return;
        it.history.unshift({ at: at, by: by, field: k, from: fmtVal(k, prev), to: fmtVal(k, v) });
        it[k] = v; it.updatedAt = at;
      });
    } else if (op.t === 'place' && it && LANES[op.lane]) {
      var list = state.items.filter(function (i) { return i.lane === op.lane && i.id !== it.id; }).sort(byOrder);
      var idx = op.before ? list.findIndex(function (i) { return i.id === op.before; }) : -1;
      if (idx < 0) idx = list.length;
      list.splice(idx, 0, it);
      if (it.lane !== op.lane) { it.history.unshift({ at: at, by: by, field: 'lane', from: fmtVal('lane', it.lane), to: fmtVal('lane', op.lane) }); it.lane = op.lane; it.updatedAt = at; }
      list.forEach(function (x, n) { x.order = n; });
    } else if (op.t === 'comment' && it && op.text && String(op.text).trim()) {
      it.comments.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: at, by: by, text: String(op.text).trim().slice(0, 4000) });
      it.history.unshift({ at: at, by: by, field: 'comment', text: 'Added a comment' }); it.updatedAt = at;
    } else if (op.t === 'hours') {
      var h = Math.max(0, Math.round(Number(op.value) * 4) / 4);
      if (!isNaN(h) && h !== state.hours.used) { addLog(state, at, by, 'Support hours ' + state.hours.used + ' → ' + h + ' h'); state.hours.used = h; }
    } else if (op.t === 'counter' && state.counters[op.key]) {
      var c = state.counters[op.key], v = Math.max(0, Math.round(Number(op.value)));
      if (!isNaN(v) && v !== c.done) { addLog(state, at, by, c.label + ' ' + c.done + ' → ' + v); c.done = v; }
    } else if (op.t === 'access') {
      var a = state.access.find(function (x) { return x.name === op.name; });
      if (a && a.ok !== !!op.ok) { a.ok = !!op.ok; addLog(state, at, by, 'Access to ' + a.name + (a.ok ? ' confirmed' : ' marked pending')); }
    } else if (op.t === 'note' && /^\d{4}-\d{2}-\d{2}$/.test(op.date)) {
      state.notes[op.date] = { text: String(op.text || '').slice(0, 20000), at: at, by: by };
    } else if (op.t === 'period' && /^\d{4}-\d{2}$/.test(op.period) && op.period !== state.period) {
      addLog(state, at, by, 'Started ' + (op.label || op.period) + ': monthly counters and support hours reset');
      state.period = op.period; state.hours.used = 0;
      Object.keys(state.counters).forEach(function (k) { state.counters[k].done = 0; });
    } else if (/^(rpt|kw)-/.test(op.t || '')) {
      applyReportOp(state, op, at, by);
    }
    if (it && it.history.length > 200) it.history.length = 200;
  });
  state.version = (state.version || 0) + 1; state.updatedAt = at;
  return state;
}

return { TYPES: TYPES, typeOf: typeOf, STATUS: STATUS, PRIORITY: PRIORITY, LANES: LANES, PEOPLE: PEOPLE, WS: WS, ROADMAP: ROADMAP, SEO_METRICS: SEO_METRICS, ensureReports: ensureReports, seed: seed, applyOps: applyOps };
});
