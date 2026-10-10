window.U = (() => {
  const C = window.PlannerCore;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDay(new Date());
  const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = s => { if (!s) return 'No date'; const d = parseDay(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
  const fmtDayLong = s => { const d = parseDay(s); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
  const fmtTime = iso => { const d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const ago = iso => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return fmtTime(iso);
  };
  const daysUntil = s => Math.round((parseDay(s) - parseDay(today())) / 86400000);
  const dueState = it => {
    if (!it.due || it.status === 'co') return '';
    const n = daysUntil(it.due);
    return n < 0 ? 'over' : n <= 7 ? 'soon' : '';
  };
  const initials = n => (n || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  // Avatar colour derived from the name, so no per-person styles are needed.
  const AV_COLORS = ['#1f2f5c', '#d9591d', '#1b7350', '#2b3d6b', '#7a3b8f', '#0f766e', '#a8261c', '#80540a'];
  const avColor = n => { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
  const av = n => `<span class="av" style="background:${avColor(n)}" title="${esc(n)}">${esc(initials(n))}</span>`;
  const avs = list => `<span class="avs">${(list || []).map(av).join('')}</span>`;
  const pill = k => `<span class="pill st-${k}">${C.STATUS[k]}</span>`;
  const prio = k => `<span class="prio p-${k}"><span class="pbars"><i></i><i></i><i></i></span>${C.PRIORITY[k]}</span>`;
  const dueChip = it => {
    const st = dueState(it), when = it.cadence ? `${it.cadence} · ${fmtDay(it.due)}` : fmtDay(it.due);
    const lead = st === 'over' ? `Overdue · ${when}` : st === 'soon' ? `Due ${when}` : when;
    return `<span class="due ${st}">${esc(lead)}${it.agreed ? '' : ' <span class="prop">· Proposed</span>'}</span>`;
  };
  const isUrl = s => /^https?:\/\//i.test(s || '');
  const ICON = {
    close: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.4 2.3 4.6-5"/></svg>',
    cmt: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>'
  };
  return { esc, isoDay, today, parseDay, fmtDay, fmtDayLong, fmtTime, ago, daysUntil, dueState, av, avs, pill, prio, dueChip, isUrl, ICON, MON };
})();
