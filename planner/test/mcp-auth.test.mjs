import test from "node:test";
import assert from "node:assert/strict";
import { resolveMcpActor } from "../netlify/functions/mcp.mjs";

const requestWith = (token) => new Request("https://planner.example/api/mcp", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

test("resolves the original MCP credential without breaking compatibility", () => {
  const before = { token: process.env.MCP_API_TOKEN, actor: process.env.MCP_ACTOR, tokens: process.env.MCP_API_TOKENS };
  try {
    process.env.MCP_API_TOKEN = "owner-secret";
    process.env.MCP_ACTOR = "letsgrowAI";
    delete process.env.MCP_API_TOKENS;
    assert.equal(resolveMcpActor(requestWith("owner-secret")), "letsgrowAI");
    assert.equal(resolveMcpActor(requestWith("wrong")), null);
  } finally {
    if (before.token === undefined) delete process.env.MCP_API_TOKEN; else process.env.MCP_API_TOKEN = before.token;
    if (before.actor === undefined) delete process.env.MCP_ACTOR; else process.env.MCP_ACTOR = before.actor;
    if (before.tokens === undefined) delete process.env.MCP_API_TOKENS; else process.env.MCP_API_TOKENS = before.tokens;
  }
});

test("resolves independent named MCP credentials", () => {
  const before = process.env.MCP_API_TOKENS;
  try {
    process.env.MCP_API_TOKENS = JSON.stringify({ Nick: "nick-secret", Katherine: "katherine-secret" });
    assert.equal(resolveMcpActor(requestWith("nick-secret")), "Nick");
    assert.equal(resolveMcpActor(requestWith("katherine-secret")), "Katherine");
    assert.equal(resolveMcpActor(requestWith("unknown")), null);
  } finally {
    if (before === undefined) delete process.env.MCP_API_TOKENS; else process.env.MCP_API_TOKENS = before;
  }
});
