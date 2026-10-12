// Background runner for the weekly crawl. Invoked by /api/seo-health (manual run), the
// seo-weekly schedule, or itself (to continue past one invocation's time limit).
// Authenticated by a short-lived signed token instead of a session cookie.
import { verify } from "../lib/token.mjs";
import { requireSecret } from "../lib/users.mjs";
import { seoStore, runSteps, kick, RUN_PATH } from "../lib/seo-jobs.mjs";

export default async (req) => {
  if (req.method !== "POST") return;
  const body = await req.json().catch(() => ({}));
  const token = await verify(body.token, requireSecret(), "seo-crawl");
  if (!token) { console.error("SEO crawl runner: invalid or expired token"); return; }
  const store = await seoStore();
  const origin = new URL(req.url).origin;
  const result = await runSteps(store, token.id, origin);
  if (result === "continue") {
    const job = await store.get("job", { type: "json" });
    if (job?.id === token.id && job.status === "running") await kick(job, origin).catch((e) => console.error("SEO crawl re-kick failed", e));
  }
};

export const config = { path: RUN_PATH, background: true };
