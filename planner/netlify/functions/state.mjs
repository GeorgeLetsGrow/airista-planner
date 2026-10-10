const BLOBS_PKG = ["@netlify", "blobs"].join("/");
import core from "../../public/js/core.js";
import { authStore, currentUser, sameOrigin } from "../lib/users.mjs";

const KEY = "state";
const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const user = await currentUser(req, await authStore());
  if (!user) return json({ error: "Not signed in" }, 401);

  const { getStore } = await import(BLOBS_PKG);
  const store = getStore({ name: "airista-planner", consistency: "strong" });

  if (req.method === "GET") {
    let state = await store.get(KEY, { type: "json" });
    if (!state) {
      state = core.seed();
      await store.setJSON(KEY, state, { onlyIfNew: true });
      state = (await store.get(KEY, { type: "json" })) || state;
    }
    return json(state);
  }

  if (req.method === "POST") {
    if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    // Attribute changes to the signed-in account, not a name the browser sends.
    const by = user.name;
    for (let attempt = 0; attempt < 6; attempt++) {
      const cur = await store.getWithMetadata(KEY, { type: "json" });
      const state = cur?.data || core.seed();
      core.applyOps(state, Array.isArray(body.ops) ? body.ops : [], { by, at: new Date().toISOString() });
      const res = cur ? await store.setJSON(KEY, state, { onlyIfMatch: cur.etag }) : await store.setJSON(KEY, state, { onlyIfNew: true });
      if (!res || res.modified !== false) return json(state);
      await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
    }
    return json({ error: "Busy, please retry" }, 409);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/state" };
