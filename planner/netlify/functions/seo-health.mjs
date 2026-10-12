// Weekly SEO health check API.
//   GET  /api/seo-health                     latest job status + report index
//   GET  /api/seo-health?date=YYYY-MM-DD     one report (JSON)
//   GET  /api/seo-health?date=...&format=xlsx|md|issues|broken   downloads
//   POST /api/seo-health  { action: "run" }  start a crawl now
import { authStore, currentUser, sameOrigin } from "../lib/users.mjs";
import { seoStore, startJob, kick, publicJob, STALE_MS } from "../lib/seo-jobs.mjs";
import { weeklyWorkbook } from "../lib/seo-xlsx.mjs";
import { SEO } from "../lib/seo-config.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const csvCell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const download = (body, type, name) => new Response(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });

export default async (req) => {
  try {
    const me = await currentUser(req, await authStore());
    if (!me) return json({ error: "Not signed in" }, 401);
    const store = await seoStore();
    const url = new URL(req.url);

    if (req.method === "POST") {
      if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
      const body = await req.json().catch(() => ({}));
      if (body.action !== "run") return json({ error: "Unknown action" }, 400);
      const { job, started } = await startJob(store, { trigger: "manual", by: me.name });
      // Already running: resume it if its runner went quiet, otherwise just report progress.
      if (started || Date.now() - Date.parse(job.heartbeat) > STALE_MS) await kick(job, url.origin);
      return json({ job: publicJob(job), started });
    }
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const date = url.searchParams.get("date");
    if (!date) {
      const [job, index] = await Promise.all([store.get("job", { type: "json" }), store.get("index", { type: "json" })]);
      return json({ site: SEO.site, schedule: "Mondays from 8am New York time", job: publicJob(job), reports: index?.reports || [] });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date" }, 400);
    const format = url.searchParams.get("format") || "json";
    const report = await store.get(`reports/${date}.json`, { type: "json" });
    if (!report) return json({ error: "No report for that date." }, 404);
    if (format === "json") return json(report);
    if (format === "md") return download(await store.get(`reports/${date}.md`, { type: "text" }), "text/markdown; charset=utf-8", `airista-weekly-${date}.md`);
    const crawl = await store.get(`crawls/${date}.json`, { type: "json" });
    if (!crawl) return json({ error: "The crawl data for that report is missing." }, 404);
    if (format === "xlsx") return download(await weeklyWorkbook(report, crawl), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `AiRISTA-Weekly-SEO-${date}.xlsx`);
    if (format === "issues") return download([["severity", "check", "url", "detail"], ...crawl.issues.map((i) => [i.severity, i.check, i.url, i.detail])].map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv", `issues-${date}.csv`);
    if (format === "broken") return download([["target", "status", "linked_from_count", "linked_from"], ...crawl.broken.map((b) => [b.target, b.status, b.linked_from_count, b.linked_from.join(" ")])].map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv", `broken-links-${date}.csv`);
    if (format === "pages") {
      const cols = ["url", "status", "final_url", "redirects", "response_ms", "title", "title_len", "meta_description", "meta_len", "h1_count", "h1", "canonical", "meta_robots", "x_robots", "word_count", "img_count", "img_missing_alt", "internal_links", "schema_types", "og_image", "lastmod", "error"];
      return download([cols, ...crawl.pages.map((p) => cols.map((c) => p[c]))].map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv", `pages-${date}.csv`);
    }
    return json({ error: "Unknown format" }, 400);
  } catch (error) {
    console.error("SEO health API failed", error);
    return json({ error: error.message || "Could not load the weekly health check." }, 500);
  }
};

export const config = { path: "/api/seo-health" };
