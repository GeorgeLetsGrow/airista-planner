window.Drawer = (() => {
  const C = window.PlannerCore, U = window.U, V = window.Views, { esc } = U;

  function render(state, ui) {
    const it = state.items.find(i => i.id === ui.drawerId);
    if (!it) return '';
    const lane = state.items.filter(i => i.lane === it.lane && i.status !== 'co').sort((a, b) => a.order - b.order), idx = lane.indexOf(it);
    const seg = (f, opts, cur) => `<div class="seg" data-seg="${f}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const people = [...new Set([...window.Store.people, ...it.owner])];
    const ev = it.evidence;
    const attachments = Array.isArray(it.attachments) ? it.attachments : [];
    const fileSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
    return `<div class="dr-head"><div><span class="label" style="color:var(--orange-600)">${esc(V.wsName(it.ws))}</span><h2>${esc(it.title)}</h2></div><div class="dr-head-actions"><button class="btn sm ${it.status === 'co' ? '' : 'primary'}" type="button" data-task-close="${it.status === 'co' ? '0' : '1'}">${it.status === 'co' ? 'Reopen task' : 'Close task'}</button><button class="btn sm" type="button" data-share-task title="Copy a direct link to this task">Copy link</button><button class="ibtn" type="button" data-close aria-label="Close details">${U.ICON.close}</button></div></div>
<div class="dr-body">
<div class="fgrid">
<label class="f full"><span class="label">Title</span><input type="text" data-f="title" value="${esc(it.title)}" maxlength="200" placeholder="Task title"></label>
<div class="f full"><span class="label">Type</span>${seg('type', Object.entries(C.TYPES), C.typeOf(it))}</div>
<label class="f"><span class="label">Status</span><select data-f="status">${Object.entries(C.STATUS).map(([k, l]) => `<option value="${k}" ${k === it.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
<div class="f"><span class="label">Priority</span>${seg('priority', Object.entries(C.PRIORITY), it.priority)}</div>
<div class="f full"><span class="label">Lane</span><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${seg('lane', Object.entries(C.LANES), it.lane)}${it.status === 'co' ? '<span class="rankrow">Shown in Completed</span>' : `<span class="rankrow">#${idx + 1} of ${lane.length}<button class="ibtn" type="button" data-rank="up" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="ibtn" type="button" data-rank="down" ${idx === lane.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></span>`}</div></div>
<div class="f full"><span class="label">Owner</span><div class="ownchips">${people.map(p => `<button type="button" data-owner="${esc(p)}" class="${it.owner.includes(p) ? 'on' : ''}">${U.av(p)}${esc(p)}</button>`).join('')}</div></div>
<label class="f"><span class="label">Target date</span><input type="date" data-f="due" value="${esc(it.due)}"></label>
<div class="f"><span class="label">Date</span>${seg('agreed', [['0', 'Proposed'], ['1', 'Agreed']], it.agreed ? 1 : 0)}</div>
<label class="f full"><span class="label">Blocker</span><textarea data-f="blocker" rows="2" placeholder="None">${esc(it.blocker)}</textarea></label>
<label class="f full"><span class="label">Next action</span><textarea data-f="next" rows="3" maxlength="2000" placeholder="What needs to happen next?">${esc(it.next)}</textarea></label>
<label class="f full"><span class="label">Completion evidence</span><input type="text" data-f="evidence" value="${esc(ev)}" placeholder="Link or note showing implementation, delivery or publication">${U.isUrl(ev) ? `<a href="${esc(ev)}" target="_blank" rel="noopener" style="font-size:12.5px">Open evidence →</a>` : ''}</label>
</div>
${it.status === 'co' && !ev ? '<div class="warnbox">Marked complete without evidence. Add a link or note showing implementation, delivery or publication.</div>' : ''}
${it.result || it.cadence ? `<div class="ro">${it.result ? `<span class="label">Result</span><p>${esc(it.result)}</p>` : ''}${it.cadence ? `<p class="muted" style="margin-top:8px;font-size:12px">Recurring: ${esc(it.cadence)}</p>` : ''}</div>` : ''}
<div class="attachments"><div class="panel-h"><div><span class="label">Attachments · ${attachments.length}</span><p class="muted">Files up to 10 MB</p></div></div>
<div class="attachment-list">${attachments.map(a => `<div class="attachment"><a href="/api/attachments?id=${encodeURIComponent(a.id)}" target="_blank" rel="noopener"><b>${esc(a.name)}</b><span>${esc(fileSize(a.size))} · ${esc(a.by)} · ${U.ago(a.at)}</span></a><button class="ibtn" type="button" data-attachment-remove="${esc(a.id)}" data-attachment-name="${esc(a.name)}" aria-label="Remove ${esc(a.name)}">${U.ICON.close}</button></div>`).join('') || '<p class="muted">No files attached.</p>'}</div>
<form class="attachment-form" id="attachment-form"><input type="file" id="attachment-file" aria-label="Choose attachment"><button class="btn sm" type="submit">Upload file</button><span class="muted" id="attachment-status"></span></form></div>
<div><div class="dtabs"><button type="button" data-tab="comments" class="${ui.tab === 'comments' ? 'on' : ''}">Comments · ${it.comments.length}</button><button type="button" data-tab="history" class="${ui.tab === 'history' ? 'on' : ''}">History · ${it.history.length}</button></div>
<div style="padding-top:16px">${ui.tab === 'history'
      ? `<div class="hist">${it.history.map(h => `<div><b>${esc(h.by)}</b> ${V.histText(h)}<span class="t">${U.fmtTime(h.at)}</span></div>`).join('')}</div>`
      : `<div class="cmlist">${it.comments.map(c => `<div class="cm">${U.av(c.by)}<div><div class="who-l"><b>${esc(c.by)}</b>${U.ago(c.at)}${c.by === window.Store.me || window.Store.user?.role === 'admin' ? `<button class="comment-delete" type="button" data-comment-delete="${esc(c.id)}" aria-label="Delete comment">Delete</button>` : ''}</div><p>${esc(c.text)}</p></div></div>`).join('') || '<p class="muted">No comments yet.</p>'}
<form class="cmform" id="cmform"><textarea id="cm-text" rows="3" placeholder="Add a comment as ${esc(window.Store.me || 'you')} · type @ to mention someone"></textarea><div class="mention-suggest" id="mention-suggest" hidden></div><div class="mention-row"><span>Mention</span>${people.filter(p => p !== window.Store.me && p !== 'AiRISTA').map(p => `<button type="button" data-mention="${esc(p)}">@${esc(p)}</button>`).join('')}</div><button class="btn primary sm" type="submit">Comment</button></form></div>`}</div></div>
</div>`;
  }
  return { render };
})();
