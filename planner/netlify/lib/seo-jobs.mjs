// Weekly crawl jobs. A crawl takes ~12 minutes behind Cloudflare, longer than one function run
// is allowed, so the work is split into checkpointed steps stored in Netlify Blobs. A background
// function runs steps for up to RUN_BUDGET_MS, then re-invokes itself to continue.
import { randomBytes } from "node:crypto";
import { SEO, localDate } from "./seo-config.mjs";
import { siteFiles, sitemapUrls, auditPage, checkLink, pool, linkTargets, analyse } from "./seo-crawl.mjs";
import { buildReport, snapshotOf, reportMarkdown, headline } from "./seo-report.mjs";
import { weeklyGoogle } from "./seo-google.mjs";
import { sign } from "./token.mjs";
import { requireSecret } from "./users.mjs";

const BLOBS_PKG = ["@netlify", "blobs"].join("/");
const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";
// Background functions ignore custom paths, so the runner lives at its default URL.
export const RUN_PATH = "/.netlify/functions/seo-crawl-run-background";
const RUN_BUDGET_MS = 11 * 60 * 1000;   // background functions stop at 15 minutes
const PAGE_BATCH = 20, LINK_BATCH = 40;
export const STALE_MS = 6 * 60 * 1000;  // a runner that has not checkpointed for this long is presumed dead

export async function seoStore() {
  const { getStore } = await import(BLOBS_PKG);
  return getStore({ name: "airista-seo", consistency: "strong" });
}

// Read-modify-write with optimistic concurrency, like updateUsers().
export async function update(store, key, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const doc = cur?.data ?? null;
    const next = await fn(doc);
    if (next === undefined) return doc;
    const res = await store.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return next;
    await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
  }
  throw new Error("The crawl job is busy. Try again in a moment.");
}

const logLine = (job, text) => { job.log = [...(job.log || []), `${new Date().toISOString().slice(11, 19)} ${text}`].slice(-40); };
export const publicJob = (job) => job && ({ id: job.id, date: job.date, status: job.status, phase: job.phase, trigger: job.trigger, by: job.by || null,
  startedAt: job.startedAt, finishedAt: job.finishedAt || null, heartbeat: job.heartbeat, error: job.error || null,
  progress: { pages: job.cursor || 0, totalPages: job.urls?.length || 0, links: job.linkCursor || 0, totalLinks: job.totalLinks || 0 }, log: (job.log || []).slice(-8) });

// Create a new job unless one is already running. Returns { job, started }.
export async function startJob(store, { trigger, by = null }) {
  let started = false;
  const job = await update(store, "job", (cur) => {
    if (cur && cur.status === "running" && Date.now() - Date.parse(cur.heartbeat) < 20 * 60 * 1000) return undefined;
    started = true;
    const now = new Date().toISOString();
    const next = { id: randomBytes(6).toString("hex"), date: localDate(), base: SEO.site, status: "running", phase: "init", trigger, by, startedAt: now, heartbeat: now, runner: null, cursor: 0, linkCursor: 0, log: [] };
    logLine(next, `Crawl started (${trigger}${by ? ` by ${by}` : ""}).`);
    return next;
  });
  return { job, started };
}

function siteOrigin(fallback) { return (env("URL") || fallback || "").replace(/\/$/, ""); }

// Fire-and-forget call to the background runner (returns 202 immediately).
export async function kick(job, origin) {
  const token = await sign({ p: "seo-crawl", id: job.id, exp: Date.now() + 30 * 60 * 1000 }, requireSecret());
  const base = siteOrigin(origin);
  if (!base) throw new Error("Site URL is unknown, cannot start the crawl runner.");
  const res = await fetch(`${base}${RUN_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  if (res.status >= 400) throw new Error(`Crawl runner returned ${res.status}.`);
}

// Claim the job for this runner, or return null if another live runner owns it.
async function claim(store, id, runner) {
  let claimed = null;
  await update(store, "job", (cur) => {
    if (!cur || cur.id !== id || cur.status !== "running") return undefined;
    if (cur.runner && cur.runner !== runner && Date.now() - Date.parse(cur.heartbeat) < STALE_MS) return undefined;
    claimed = { ...cur, runner, heartbeat: new Date().toISOString() };
    return claimed;
  });
  return claimed;
}

async function checkpoint(store, job, changes, line) {
  let saved = null;
  await update(store, "job", (cur) => {
    if (!cur || cur.id !== job.id || cur.runner !== job.runner) return undefined; // superseded
    saved = { ...cur, ...changes, heartbeat: new Date().toISOString() };
    if (line) logLine(saved, line);
    return saved;
  });
  if (!saved) throw new Superseded();
  return saved;
}
class Superseded extends Error {}

const work = (job, name) => `work/${job.id}/${name}`;
const stripLinks = ({ links, ...p }) => p;

async function loadChunks(store, job, prefix) {
  const { blobs } = await store.list({ prefix: work(job, prefix) });
  const parts = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return parts.flat();
}

// One background invocation: run steps until done or out of budget. Returns "done" | "continue" | "skip".
export async function runSteps(store, id, origin) {
  const t0 = Date.now(), runner = randomBytes(6).toString("hex"), log = () => {};
  let job = await claim(store, id, runner);
  if (!job) return "skip";
  try {
    while (Date.now() - t0 < RUN_BUDGET_MS) {
      if (job.phase === "init") {
        const files = await siteFiles(job.base, log);
        const { urls, lastmod } = await sitemapUrls(job.base, log);
        const priority = [];
        for (const url of SEO.priorityPages) {
          const p = await auditPage(url.replace(SEO.site, job.base), new URL(job.base).host, log);
          priority.push({ url, final_url: p.final_url || p.url, status: p.status, title: p.title ?? "", meta_robots: p.meta_robots ?? "", x_robots: p.x_robots ?? "", canonical: p.canonical ?? "" });
        }
        await store.setJSON(work(job, "lastmod.json"), lastmod);
        job = await checkpoint(store, job, { phase: "pages", siteChecks: files, urls, priority, cursor: 0 }, `${urls.length} sitemap URLs found. Site files: ${files.map((f) => `${f.path} ${f.status}`).join(", ")}.`);
      } else if (job.phase === "pages") {
        const batch = job.urls.slice(job.cursor, job.cursor + PAGE_BATCH);
        if (!batch.length) {
          const pages = await loadChunks(store, job, "pages-");
          const targets = linkTargets(pages, job.urls);
          await store.setJSON(work(job, "targets.json"), targets);
          job = await checkpoint(store, job, { phase: "links", linkCursor: 0, totalLinks: targets.length }, `Pages done. Checking ${targets.length} other internal link targets.`);
          continue;
        }
        const host = new URL(job.base).host;
        const rows = await pool(batch, (u) => auditPage(u, host, log));
        await store.setJSON(work(job, `pages-${String(job.cursor).padStart(5, "0")}.json`), rows);
        const done = job.cursor + batch.length;
        job = await checkpoint(store, job, { cursor: done }, done % 100 < PAGE_BATCH || done === job.urls.length ? `Pages ${done}/${job.urls.length}` : null);
      } else if (job.phase === "links") {
        const targets = await store.get(work(job, "targets.json"), { type: "json" }) || [];
        const batch = targets.slice(job.linkCursor, job.linkCursor + LINK_BATCH);
        if (!batch.length) { job = await checkpoint(store, job, { phase: "finish" }, "Links done. Writing the report."); continue; }
        const codes = await pool(batch, (u) => checkLink(u, log));
        await store.setJSON(work(job, `links-${String(job.linkCursor).padStart(5, "0")}.json`), batch.map((u, i) => [u, codes[i]]));
        const done = job.linkCursor + batch.length;
        job = await checkpoint(store, job, { linkCursor: done }, done % 200 < LINK_BATCH || done === targets.length ? `Links ${done}/${targets.length}` : null);
      } else if (job.phase === "finish") {
        await finish(store, job, origin);
        return "done";
      } else return "skip";
    }
    // Hand the job back so the next invocation can claim it straight away.
    await checkpoint(store, job, { runner: null });
    return "continue";
  } catch (error) {
    if (error instanceof Superseded) return "skip";
    console.error("SEO crawl step failed", error);
    await update(store, "job", (cur) => {
      if (!cur || cur.id !== job.id) return undefined;
      const next = { ...cur, status: "failed", error: error.message || String(error), finishedAt: new Date().toISOString(), heartbeat: new Date().toISOString() };
      logLine(next, `Failed: ${next.error}`);
      return next;
    });
    return "done";
  }
}

export async function previousSnapshot(store, date, base) {
  const { blobs } = await store.list({ prefix: "snapshots/" });
  const dates = blobs.map((b) => b.key.slice(10, 20)).filter((d) => d < date).sort().reverse();
  for (const d of dates) {
    const s = await store.get(`snapshots/${d}.json`, { type: "json" });
    if (s && s.base === base) return s;
  }
  return null;
}

async function finish(store, job, origin) {
  const lastmod = await store.get(work(job, "lastmod.json"), { type: "json" }) || {};
  const rawPages = await loadChunks(store, job, "pages-");
  const linkCodes = Object.fromEntries(await loadChunks(store, job, "links-"));
  const order = new Map(job.urls.map((u, i) => [u, i]));
  rawPages.sort((a, b) => order.get(a.url) - order.get(b.url));
  for (const p of rawPages) p.lastmod = lastmod[p.url] || "";
  const { issues, broken } = analyse({ base: job.base, pages: rawPages, siteChecks: job.siteChecks, linkCodes });
  const pages = rawPages.map(stripLinks);
  const crawl = { date: job.date, base: job.base, pages, issues, broken, siteChecks: job.siteChecks, priority: job.priority, durationMs: Date.now() - Date.parse(job.startedAt) };
  const prev = await previousSnapshot(store, job.date, job.base);
  const google = await weeklyGoogle(job.date, siteOrigin(origin));
  const report = buildReport({ crawl, prev, search: google.search, ga4: google.ga4 });
  await store.setJSON(`crawls/${job.date}.json`, crawl);
  await store.setJSON(`snapshots/${job.date}.json`, snapshotOf(crawl));
  await store.setJSON(`reports/${job.date}.json`, report);
  await store.set(`reports/${job.date}.md`, reportMarkdown(report));
  await update(store, "index", (cur) => {
    const list = (cur?.reports || []).filter((r) => r.date !== job.date);
    list.push(indexEntry(report));
    return { reports: list.sort((a, b) => b.date.localeCompare(a.date)) };
  });
  await update(store, "job", (cur) => {
    if (!cur || cur.id !== job.id) return undefined;
    const next = { ...cur, phase: "done", status: "done", finishedAt: new Date().toISOString(), heartbeat: new Date().toISOString() };
    logLine(next, `Report written. ${headline(report)}`);
    return next;
  });
  const { blobs } = await store.list({ prefix: `work/${job.id}/` });
  await Promise.all(blobs.map((b) => store.delete(b.key)));
}

export const indexEntry = (r) => ({ date: r.date, status: r.status.level, line: r.status.line, headline: headline(r), counts: r.crawl.counts, pages: r.crawl.pages, generatedAt: r.generatedAt });
