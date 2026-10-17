import test from "node:test";
import assert from "node:assert/strict";
import core from "../public/js/core.js";
import { executePlannerTool, toolDefinitions } from "../netlify/lib/mcp-tools.mjs";

const freshState = () => core.seed();

test("publishes distinct planner tools", () => {
  const names = toolDefinitions.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("planner_list_tasks"));
  assert.ok(names.includes("planner_create_task"));
});

test("lists tasks using board filters", () => {
  const state = freshState();
  const expected = state.items.filter((item) => item.lane === "today" && item.status !== "co");
  const execution = executePlannerTool(state, "planner_list_tasks", { lane: "today" });
  assert.equal(execution.mutates, false);
  assert.equal(execution.result.count, expected.length);
  assert.ok(execution.result.tasks.every((task) => task.lane === "today"));
});

test("creates a valid operation that the shared board engine can apply", () => {
  const state = freshState();
  const execution = executePlannerTool(state, "planner_create_task", {
    title: "Review MCP connection",
    workstream: core.WS[0].id,
    lane: "today",
    priority: "high",
    owners: ["George"],
  });
  assert.equal(execution.mutates, true);
  core.applyOps(state, [execution.op], { by: "Planner AI", at: "2026-10-17T12:00:00.000Z" });
  const created = state.items.find((item) => item.id === execution.op.id);
  assert.equal(created.title, "Review MCP connection");
  assert.equal(created.lane, "today");
  assert.equal(created.history[0].by, "Planner AI");
});

test("moves tasks through the ordering-aware place operation", () => {
  const state = freshState();
  const item = state.items[0];
  const execution = executePlannerTool(state, "planner_move_task", { id: item.id, lane: "today" });
  assert.deepEqual(execution.op, { t: "place", id: item.id, lane: "today", before: null });
});

test("rejects invalid values even when a client bypasses the JSON schema", () => {
  const state = freshState();
  assert.throws(() => executePlannerTool(state, "planner_create_task", {
    title: "Bad status",
    workstream: core.WS[0].id,
    status: "unknown",
  }), /Invalid status/);
});
