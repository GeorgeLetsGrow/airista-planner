window.Views = (() => {
  const C = window.PlannerCore, U = window.U, { esc } = U;
  const wsName = id => (C.WS.find(w => w.id === id) || {}).name || id;
  const counts = list => { const c = { ns: 0, ip: 0, nv: 0, bl: 0, co: 0 }; list.forEach(i => c[i.status]++); return c; };
  const stack = (c, cls = 'stack') => { const t = Object.values(c).reduce((a, b) => a + b, 0) || 1;
    return `<div class="${cls}">${Object.keys(C.STATUS).filter(k => c[k]).map(k => `<i class="st-${k}" style="width:${c[k] / t * 100}%"></i>`).join('')}</div>`; };
  const hoursCls = (u, m) => u / m >= 1 ? 'over' : u / m >= .8 ? 'warn' : '';
  const PR = { high: 0, med: 1, low: 2 };
  const empty = t => `<div class="drop-empty">${t}</div>`;

  function card(it, rank) {
    return `<article class="tcard ty-${C.typeOf(it)}" draggable="true" data-id="${it.id}" tabindex="0">
<div class="tc-top"><span class="tc-ws">${rank ? `<span class="rank">${rank}</span>` : ''}${esc(wsName(it.ws))}</span>${U.pill(it.status)}</div>
<span class="ty">${C.TYPES[C.typeOf(it)]}</span>
<h4>${esc(it.title)}</h4>
${it.blocker ? `<div class="tc-block">${esc(it.blocker)}</div>` : ''}
<div class="tc-meta">${U.prio(it.priority)}${U.dueChip(it)}<span class="grow"></span>${it.comments.length ? `<span class="cmt">${U.ICON.cmt}${it.comments.length}</span>` : ''}${U.avs(it.owner)}</div>
</article>`;
  }

  function stats(state) {
    const items = state.items, c = counts(items), h = state.hours;
    const over = items.filter(i => U.dueState(i) === 'over').length, soon = items.filter(i => U.dueState(i) === 'soon').length;
    const bl = items.filter(i => i.status === 'bl' || (i.blocker && i.status !== 'co')).length;
    return `<div class="stat" title="${Object.keys(C.STATUS).map(k => c[k] + ' ' + C.STATUS[k]).join(', ')}">${stack(c, 'mini')}<span>${c.co} of ${items.length} complete</span></div>
<button class="stat ${over ? 'alert' : ''}" type="button" data-jump="checkin"><b>${over}</b><span>Overdue</span></button>
<button class="stat ${soon ? 'warn' : ''}" type="button" data-jump="checkin"><b>${soon}</b><span>Due in 7 days</span></button>
<button class="stat ${bl ? 'alert' : ''}" type="button" data-jump="board"><b>${bl}</b><span>Blocked</span></button>
<div class="stat"><b>${h.used}</b><span>of ${h.month} support h</span><div class="hbar ${hoursCls(h.used, h.month)}"><i style="width:${Math.min(h.used / h.month, 1) * 100}%"></i><span class="tick"></span></div></div>`;
  }

  function focus(state, list) {
    return `<div class="vhead"><div><h1>Priorities</h1><p>Drag cards between lanes and up or down to set the order you'll work in.</p></div></div>
<div class="cols lanes">${Object.keys(C.LANES).map(l => {
      const L = list.filter(i => i.lane === l).sort((a, b) => a.order - b.order);
      const hi = L.filter(i => i.priority === 'high' && i.status !== 'co').length;
      return `<section class="col"><div class="col-h"><h3>${C.LANES[l]}</h3><span class="n">${L.length}</span>${hi ? `<span class="sub">${hi} high priority</span>` : ''}</div>
<div class="drop" data-lane="${l}">${L.map((i, n) => card(i, n + 1)).join('') || empty('Drop deliverables here')}</div></section>`;
    }).join('')}</div>`;
  }

  function board(state, list) {
    const sort = (a, b) => PR[a.priority] - PR[b.priority] || String(a.due).localeCompare(String(b.due));
    return `<div class="vhead"><div><h1>Board</h1><p>Drag a card to another column to change its status.</p></div></div>
<div class="cols board">${Object.keys(C.STATUS).map(k => {
      const L = list.filter(i => i.status === k).sort(sort);
      return `<section class="col"><div class="col-h"><span class="dot st-${k}"></span><h3>${C.STATUS[k]}</h3><span class="n">${L.length}</span></div>
<div class="drop" data-status="${k}">${L.map(i => card(i)).join('') || empty('None')}</div></section>`;
    }).join('')}</div>`;
  }

  function counter(state, key) {
    const c = state.counters[key];
    return `<div class="extra"><span class="label">${esc(c.label)}</span>
<div class="ctr"><button class="ibtn" type="button" data-ctr="${key}" data-d="-1" aria-label="Decrease">−</button><b>${c.done}</b><span>of ${c.upTo ? 'up to ' : ''}${c.target}${c.unit ? ' ' + c.unit : ''}</span><button class="ibtn" type="button" data-ctr="${key}" data-d="1" aria-label="Increase">+</button></div>
<div class="slots">${Array.from({ length: c.target }, (_, n) => `<i class="${n < c.done ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }

  function workstreams(state) {
    const per = state.period, [y, m] = per.split('-').map(Number), next = new Date(y, m, 1);
    const nextP = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    const label = d => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const h = state.hours, hc = hoursCls(h.used, h.month);
    return `<div class="vhead"><div><h1>Workstreams</h1><p>Monthly counters and support hours for ${label(new Date(y, m - 1, 1))}.</p></div>
<button class="btn" type="button" id="new-period" data-period="${nextP}" data-label="${label(next)}">Start ${label(next)}</button></div>
<div class="wsgrid">${C.WS.map((w, n) => {
      const items = state.items.filter(i => i.ws === w.id), c = counts(items);
      const ex = [];
      (w.counters || []).forEach(k => ex.push(counter(state, k)));
      if (w.hours) ex.push(`<div class="extra"><span class="label">Support hours</span>
<div class="ctr hrs"><button class="ibtn" type="button" data-hrs="-0.5" aria-label="Remove half hour">−</button><input type="number" step="0.25" min="0" id="hrs-in" value="${h.used}" aria-label="Hours used"><span>of ${h.month} h</span><button class="ibtn" type="button" data-hrs="0.5" aria-label="Add half hour">+</button></div>
<div class="hbar ${hc}" style="width:100%"><i style="width:${Math.min(h.used / h.month, 1) * 100}%"></i><span class="tick"></span></div>
<span class="muted" style="font-size:12px">${hc ? 'Above 80% of monthly hours' : `Warning at 80% (${h.month * .8} h)`}</span></div>`);
      if (w.access) ex.push(`<div class="extra" style="grid-column:1/-1"><span class="label">Access · ${state.access.filter(a => a.ok).length} of ${state.access.length} confirmed</span>
<div class="checks">${state.access.map(a => `<button class="chk" type="button" data-access="${esc(a.name)}" data-ok="${a.ok ? 0 : 1}"><span class="box ${a.ok ? 'on' : ''}">${a.ok ? U.ICON.check : ''}</span>${esc(a.name)}</button>`).join('')}</div></div>`);
      if (w.metrics) ex.push(`<div class="extra" style="grid-column:1/-1"><span class="label">Scorecard metrics</span><div class="chips">${w.metrics.map(x => `<span>${esc(x)}</span>`).join('')}</div></div>`);
      return `<section class="wsc"><div class="wsc-h"><span class="wsc-num">${n + 1}</span><h3>${esc(w.name)}</h3></div>
<div class="prog">${stack(c)}<div class="sub"><span>${c.co} of ${items.length} complete</span><span>${[c.ip && c.ip + ' in progress', c.nv && c.nv + ' to verify', c.bl && c.bl + ' blocked'].filter(Boolean).join(' · ')}</span></div></div>
<div class="wsrows">${items.map(i => `<button class="wsrow" type="button" data-open="${i.id}"><span class="t">${esc(i.title)}</span>${U.pill(i.status)}<span class="w">${U.prio(i.priority)}${U.dueChip(i)}</span></button>`).join('')}</div>
${ex.length ? `<div class="extras">${ex.join('')}</div>` : ''}
${w.note ? `<div class="note"><b>Note</b><span>${esc(w.note)}</span></div>` : ''}</section>`;
    }).join('')}</div>`;
  }

  function roadmap(state) {
    const cur = U.today().slice(0, 7);
    return `<div class="vhead"><div><h1>Roadmap</h1><p>October to December 2026. Deliverables are grouped by target date.</p></div></div>
<div class="road">${C.ROADMAP.map(m => {
      const due = state.items.filter(i => i.due && i.due.slice(0, 7) === m.month).sort((a, b) => a.due.localeCompare(b.due));
      const done = due.filter(i => i.status === 'co').length;
      return `<section class="month ${m.month === cur ? 'now' : ''}"><div class="month-h"><h2>${m.label}</h2>${m.month === cur ? '<span class="tag now">Current</span>' : ''}<span class="cnt">${done} of ${due.length} due complete</span></div>
<ul class="plan">${m.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
<div><span class="label">Due this month</span><div class="wsrows" style="margin-top:8px">${due.map(i => `<button class="wsrow" type="button" data-open="${i.id}"><span class="t">${esc(i.title)}</span>${U.pill(i.status)}<span class="w">${U.dueChip(i)}</span></button>`).join('') || '<p class="muted" style="padding:10px 0">Nothing scheduled.</p>'}</div></div></section>`;
    }).join('')}</div>`;
  }

  function activity(state, sinceIso) {
    const out = [];
    state.items.forEach(it => it.history.forEach(h => { if (h.field !== 'import' && h.at >= sinceIso) out.push({ ...h, item: it }); }));
    (state.log || []).forEach(l => { if (l.at >= sinceIso) out.push(l); });
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
  }
  const histText = h => h.field && h.from !== undefined
    ? `changed <b>${esc({ title: 'title', next: 'next action', type: 'type', status: 'status', priority: 'priority', lane: 'lane', owner: 'owner', due: 'target date', agreed: 'date', blocker: 'blocker', evidence: 'evidence' }[h.field] || h.field)}</b> <em>${esc(h.from)}</em> → ${esc(h.to)}`
    : esc(h.text);

  function checkin(state, ui) {
    const date = ui.noteDate, note = state.notes[date];
    const dates = Object.keys(state.notes).filter(d => state.notes[d].text.trim()).sort().reverse();
    const prev = dates.find(d => d < date);
    const now = Date.now();
    const since = ui.since === '24h' ? new Date(now - 864e5) : ui.since === '7d' ? new Date(now - 7 * 864e5) : prev ? U.parseDay(prev) : new Date(now - 7 * 864e5);
    const feed = activity(state, since.toISOString());
    const open = state.items.filter(i => i.status !== 'co');
    const groups = [
      ['Overdue', 'st-bl', open.filter(i => U.dueState(i) === 'over')],
      ['Due in the next 7 days', 'st-nv', open.filter(i => U.dueState(i) === 'soon')],
      ['Blocked', 'st-bl', open.filter(i => i.status === 'bl' || i.blocker)],
      ['Needs verification', 'st-nv', open.filter(i => i.status === 'nv')]
    ];
    return `<div class="vhead"><div><h1>Daily check-in</h1><p>${esc(U.fmtDayLong(date))}</p></div></div>
<div class="ci"><div style="display:flex;flex-direction:column;gap:16px">
<section class="panel"><div class="panel-h"><h2>Meeting notes</h2><input type="date" id="ci-date" value="${date}" aria-label="Meeting date"></div>
<textarea id="ci-text" placeholder="Decisions, priorities agreed, follow-ups">${esc(note ? note.text : '')}</textarea>
<span class="muted" style="font-size:12px" id="ci-saved">${note ? `Last saved by ${esc(note.by)} · ${U.ago(note.at)}` : 'Notes save automatically as you type.'}</span>
${dates.length ? `<div class="pastnotes"><span class="label" style="align-self:center;margin-right:4px">Earlier</span>${dates.slice(0, 12).map(d => `<button type="button" data-note="${d}" class="${d === date ? 'on' : ''}">${U.fmtDay(d)}</button>`).join('')}</div>` : ''}
</section>
<section class="panel"><div class="panel-h"><h2>Needs attention</h2></div><div class="attn">${groups.map(([t, cls, L]) => L.length ? `<div><h3><span class="dot ${cls}"></span>${t} <span class="muted">${L.length}</span></h3>${L.map(i => `<button class="row" type="button" data-open="${i.id}"><span>${esc(i.title)}</span>${U.dueChip(i)}</button>`).join('')}</div>` : '').join('') || '<p class="muted">Nothing overdue, blocked or waiting on verification.</p>'}</div></section>
</div>
<section class="panel"><div class="panel-h"><h2>What changed</h2><div class="seg" id="ci-since">${[['last', prev ? `Since ${U.fmtDay(prev)} check-in` : 'Since last check-in'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days']].map(([k, l]) => `<button type="button" data-since="${k}" class="${ui.since === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
<div class="feed">${feed.map(h => `<${h.item ? `button type="button" data-open="${h.item.id}"` : 'div'} class="fe">${U.av(h.by)}<div><div class="txt"><b>${esc(h.by)}</b> ${histText(h)}</div><div class="ttl">${h.item ? esc(h.item.title) + ' · ' : ''}${U.ago(h.at)}</div></div></${h.item ? 'button' : 'div'}>`).join('') || '<p class="muted">No changes in this period.</p>'}</div></section>
</div>`;
  }

  return { stats, focus, board, workstreams, roadmap, checkin, histText, wsName };
})();
