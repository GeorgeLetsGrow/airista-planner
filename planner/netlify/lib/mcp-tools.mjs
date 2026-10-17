import core from "../../public/js/core.js";

const STATUS = Object.keys(core.STATUS);
const PRIORITY = Object.keys(core.PRIORITY);
const LANES = Object.keys(core.LANES);
const TYPES = Object.keys(core.TYPES);
const WORKSTREAMS = core.WS.map((x) => x.id);

const clean = (value, max = 2000) => String(value ?? "").trim().slice(0, max);
const asArray = (value) => Array.isArray(value) ? value.map((x) => clean(x, 80)).filter(Boolean).slice(0, 20) : [];
const isDate = (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function taskView(item) {
  return {
    id: item.id,
    title: item.title,
    workstream: item.ws,
    workstreamName: core.WS.find((x) => x.id === item.ws)?.name || item.ws,
    type: core.typeOf(item),
    status: item.status,
    statusLabel: core.STATUS[item.status] || item.status,
    priority: item.priority,
    lane: item.lane,
    owners: item.owner || [],
    due: item.due || "",
    nextAction: item.next || "",
    blocker: item.blocker || "",
    evidence: item.evidence || "",
    agreed: !!item.agreed,
    updatedAt: item.updatedAt,
  };
}

export const toolDefinitions = [
  {
    name: "planner_board_summary",
    description: "Summarize the AiRISTA planner board, including task counts, overdue work, support hours, and deliverable counters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "planner_list_tasks",
    description: "List planner tasks with optional filters. Returns compact task records suitable for choosing a task ID.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: STATUS },
        lane: { type: "string", enum: LANES },
        workstream: { type: "string", enum: WORKSTREAMS },
        owner: { type: "string" },
        query: { type: "string", description: "Case-insensitive search across title, next action, blocker, and evidence." },
        dueBefore: { type: "string", description: "Include tasks due on or before this YYYY-MM-DD date." },
        includeComplete: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "planner_get_task",
    description: "Get one task with its comments, history, and attachments.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"], additionalProperties: false,
    },
  },
  {
    name: "planner_create_task",
    description: "Create a task on the planner board. This changes the shared planner.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        workstream: { type: "string", enum: WORKSTREAMS },
        type: { type: "string", enum: TYPES },
        status: { type: "string", enum: STATUS, default: "ns" },
        priority: { type: "string", enum: PRIORITY, default: "med" },
        lane: { type: "string", enum: LANES, default: "later" },
        owners: { type: "array", items: { type: "string" }, maxItems: 20 },
        due: { type: "string", description: "YYYY-MM-DD or empty." },
        nextAction: { type: "string", maxLength: 2000 },
      },
      required: ["title", "workstream"], additionalProperties: false,
    },
  },
  {
    name: "planner_update_task",
    description: "Update editable fields on an existing task. This changes the shared planner and records field history.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string", maxLength: 200 },
        nextAction: { type: "string", maxLength: 2000 },
        type: { type: "string", enum: TYPES },
        status: { type: "string", enum: STATUS },
        priority: { type: "string", enum: PRIORITY },
        owners: { type: "array", items: { type: "string" }, maxItems: 20 },
        due: { type: "string", description: "YYYY-MM-DD or empty." },
        agreed: { type: "boolean" },
        blocker: { type: "string", maxLength: 2000 },
        evidence: { type: "string", maxLength: 2000 },
      },
      required: ["id"], additionalProperties: false,
    },
  },
  {
    name: "planner_move_task",
    description: "Move a task to Today, This week, or Later, optionally before another task in that lane.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }, lane: { type: "string", enum: LANES }, beforeTaskId: { type: ["string", "null"] },
      },
      required: ["id", "lane"], additionalProperties: false,
    },
  },
  {
    name: "planner_add_comment",
    description: "Add a comment to a task, with optional planner-user mentions. This changes the shared planner.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }, text: { type: "string", maxLength: 4000 },
        mentions: { type: "array", items: { type: "string" }, maxItems: 20 },
      },
      required: ["id", "text"], additionalProperties: false,
    },
  },
];

export function executePlannerTool(state, name, args = {}) {
  const now = new Date().toISOString();
  if (name === "planner_board_summary") {
    const counts = Object.fromEntries(STATUS.map((key) => [key, 0]));
    state.items.forEach((item) => { if (counts[item.status] !== undefined) counts[item.status]++; });
    const today = now.slice(0, 10);
    const overdue = state.items.filter((x) => x.status !== "co" && x.due && x.due < today).map(taskView);
    return { mutates: false, result: { period: state.period, updatedAt: state.updatedAt, counts, overdue, hours: state.hours, counters: state.counters } };
  }
  if (name === "planner_list_tasks") {
    const q = clean(args.query, 200).toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
    let items = state.items.filter((item) => args.includeComplete || item.status !== "co");
    if (args.status) items = items.filter((x) => x.status === args.status);
    if (args.lane) items = items.filter((x) => x.lane === args.lane);
    if (args.workstream) items = items.filter((x) => x.ws === args.workstream);
    if (args.owner) items = items.filter((x) => (x.owner || []).some((o) => o.toLowerCase() === clean(args.owner, 80).toLowerCase()));
    if (args.dueBefore) { assert(isDate(args.dueBefore) && args.dueBefore, "dueBefore must be YYYY-MM-DD"); items = items.filter((x) => x.due && x.due <= args.dueBefore); }
    if (q) items = items.filter((x) => [x.title, x.next, x.blocker, x.evidence].some((v) => String(v || "").toLowerCase().includes(q)));
    items.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.order || 0) - (b.order || 0));
    return { mutates: false, result: { count: items.length, tasks: items.slice(0, limit).map(taskView) } };
  }
  if (name === "planner_get_task") {
    const item = state.items.find((x) => x.id === clean(args.id, 80));
    assert(item, "Task not found");
    return { mutates: false, result: { ...taskView(item), comments: item.comments || [], history: item.history || [], attachments: item.attachments || [] } };
  }

  let op;
  if (name === "planner_create_task") {
    assert(clean(args.title, 200), "title is required");
    assert(WORKSTREAMS.includes(args.workstream), "Invalid workstream");
    if (args.type !== undefined) assert(TYPES.includes(args.type), "Invalid type");
    if (args.status !== undefined) assert(STATUS.includes(args.status), "Invalid status");
    if (args.priority !== undefined) assert(PRIORITY.includes(args.priority), "Invalid priority");
    if (args.lane !== undefined) assert(LANES.includes(args.lane), "Invalid lane");
    assert(isDate(args.due || ""), "due must be YYYY-MM-DD or empty");
    const id = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    op = { t: "add", id, title: clean(args.title, 200), ws: args.workstream, type: args.type, status: args.status, priority: args.priority, lane: args.lane, owner: asArray(args.owners), due: args.due || "", next: clean(args.nextAction) };
  } else if (name === "planner_update_task") {
    const id = clean(args.id, 80), item = state.items.find((x) => x.id === id);
    assert(item, "Task not found");
    if (args.due !== undefined) assert(isDate(args.due), "due must be YYYY-MM-DD or empty");
    if (args.type !== undefined) assert(TYPES.includes(args.type), "Invalid type");
    if (args.status !== undefined) assert(STATUS.includes(args.status), "Invalid status");
    if (args.priority !== undefined) assert(PRIORITY.includes(args.priority), "Invalid priority");
    const fields = {};
    const map = { title: "title", nextAction: "next", type: "type", status: "status", priority: "priority", owners: "owner", due: "due", agreed: "agreed", blocker: "blocker", evidence: "evidence" };
    Object.entries(map).forEach(([from, to]) => { if (args[from] !== undefined) fields[to] = from === "owners" ? asArray(args[from]) : typeof args[from] === "string" ? clean(args[from], from === "title" ? 200 : 2000) : args[from]; });
    assert(Object.keys(fields).length, "No fields supplied");
    op = { t: "set", id, fields };
  } else if (name === "planner_move_task") {
    assert(state.items.some((x) => x.id === clean(args.id, 80)), "Task not found");
    assert(LANES.includes(args.lane), "Invalid lane");
    op = { t: "place", id: clean(args.id, 80), lane: args.lane, before: args.beforeTaskId ? clean(args.beforeTaskId, 80) : null };
  } else if (name === "planner_add_comment") {
    assert(state.items.some((x) => x.id === clean(args.id, 80)), "Task not found");
    assert(clean(args.text, 4000), "text is required");
    op = { t: "comment", id: clean(args.id, 80), text: clean(args.text, 4000), mentions: asArray(args.mentions) };
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }
  return { mutates: true, op };
}

export function resultContent(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}
