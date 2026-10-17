import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import core from "../../public/js/core.js";
import { executePlannerTool, resultContent, toolDefinitions } from "../lib/mcp-tools.mjs";

const KEY = "state";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const rpcError = (id, code, message) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

const tokenMatches = (expected, supplied) => {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function resolveMcpActor(req) {
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!supplied) return null;
  if (tokenMatches(process.env.MCP_API_TOKEN || "", supplied)) return String(process.env.MCP_ACTOR || "letsgrowAI").slice(0, 80);
  let named = {};
  try { named = JSON.parse(process.env.MCP_API_TOKENS || "{}"); } catch { return null; }
  if (!named || typeof named !== "object" || Array.isArray(named)) return null;
  for (const [actor, token] of Object.entries(named)) {
    if (tokenMatches(String(token || ""), supplied)) return String(actor).trim().slice(0, 80) || null;
  }
  return null;
}

async function loadState(store) {
  let current = await store.getWithMetadata(KEY, { type: "json" });
  let state = current?.data;
  if (!state) {
    state = core.seed();
    await store.setJSON(KEY, state, { onlyIfNew: true });
    current = await store.getWithMetadata(KEY, { type: "json" });
    state = current?.data || state;
  }
  core.migrate(state, { by: "Planner MCP", at: new Date().toISOString() });
  return { current, state };
}

async function callTool(name, args, actor) {
  const store = getStore({ name: "airista-planner", consistency: "strong" });
  for (let attempt = 0; attempt < 6; attempt++) {
    const { current, state } = await loadState(store);
    let execution;
    try { execution = executePlannerTool(state, name, args); }
    catch (error) { return { isError: true, content: resultContent({ error: error.message }) }; }
    if (!execution.mutates) return { content: resultContent(execution.result) };

    core.applyOps(state, [execution.op], { by: actor, at: new Date().toISOString() });
    const saved = current
      ? await store.setJSON(KEY, state, { onlyIfMatch: current.etag })
      : await store.setJSON(KEY, state, { onlyIfNew: true });
    if (!saved || saved.modified !== false) {
      const item = execution.op.id ? state.items.find((x) => x.id === execution.op.id) : null;
      return { content: resultContent({ ok: true, version: state.version, task: item || undefined }) };
    }
    await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
  }
  return { isError: true, content: resultContent({ error: "Planner was busy. Retry the tool call." }) };
}

export default async (req) => {
  const actor = resolveMcpActor(req);
  if (!actor) return json({ error: "Unauthorized" }, 401);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let message;
  try { message = await req.json(); } catch { return rpcError(null, -32700, "Parse error"); }
  const { id, method, params = {} } = message || {};
  if (method === "initialize") return json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "airista-planner", version: "1.0.0" } } });
  if (method === "notifications/initialized") return new Response(null, { status: 202 });
  if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools: toolDefinitions } });
  if (method === "tools/call") {
    if (!params.name) return rpcError(id, -32602, "Tool name is required");
    const result = await callTool(params.name, params.arguments || {}, actor);
    return json({ jsonrpc: "2.0", id, result });
  }
  return rpcError(id, -32601, "Method not found");
};

export const config = { path: "/api/mcp" };
