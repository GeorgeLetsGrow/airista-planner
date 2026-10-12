// Read-only technical crawl of the AiRISTA sitemap. A port of seo/scripts/seo_crawl.py:
// same checks, thresholds and politeness (one request start per second across workers).
// Pure functions plus a throttled fetcher, so it runs in Netlify Functions and in plain Node.
import { parse } from "node-html-parser";
import { SEO, CHECK_SEV, SEV_RANK } from "./seo-config.mjs";

const UA = "Mozilla/5.0 (compatible; LetsGrow-SEO-Monitor/1.0; +https://letsgrow.dev)";
const T = SEO.thresholds;

// ---- throttled fetch with retry; 429/503 honour Retry-After and back off ----
let nextOk = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now(), wait = Math.max(0, nextOk - now);
  nextOk = Math.max(now, nextOk) + SEO.delayMs;
  if (wait) await sleep(wait);
}

export async function get(url, { method = "GET", log = () => {} } = {}) {
  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, { method, redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
      if (res.status === 429 || res.status === 503) {
        const ra = res.headers.get("retry-after") || "";
        const pause = Math.min(/^\d+$/.test(ra) ? Number(ra) : 10 * (attempt + 1), 120);
        log(`${res.status} on ${url} (Retry-After=${ra || "-"}); pausing ${pause}s`);
        nextOk = Math.max(nextOk, Date.now() + pause * 1000);
        await res.body?.cancel().catch(() => {});
        last = res;
        continue;
      }
      return res;
    } catch (error) {
      last = error;
      await sleep(3000 * (attempt + 1));
    }
  }
  return last;
}
const isErr = (r) => !r || r instanceof Error;

// ---- sitemap ----
export async function siteFiles(base, log) {
  const out = [];
  for (const path of SEO.siteFiles) {
    const r = await get(base + path, { log });
    if (!isErr(r)) await r.body?.cancel().catch(() => {});
    out.push({ path, status: isErr(r) ? "ERR" : r.status });
  }
  return out;
}

const locs = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
export async function sitemapUrls(base, log) {
  const idx = await get(base + "/sitemap_index.xml", { log });
  if (isErr(idx) || idx.status !== 200) return { urls: [], lastmod: {} };
  const maps = locs(await idx.text());
  const urls = [], lastmod = {};
  for (const m of maps) {
    if (SEO.skipSitemaps.includes(m.split("/").pop())) continue;
    const r = await get(m, { log });
    if (isErr(r)) continue;
    const text = await r.text();
    for (const block of text.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = block[1].match(/<loc>(.*?)<\/loc>/);
      if (!loc) continue;
      let u = loc[1].trim();
      if (base !== SEO.site) u = u.replace(SEO.site, base);
      urls.push(u);
      const lm = block[1].match(/<lastmod>(.*?)<\/lastmod>/);
      lastmod[u] = lm ? lm[1] : "";
    }
  }
  return { urls: [...new Set(urls)], lastmod };
}

// ---- one page ----
const stripHost = (h) => h.replace("www.", "");
export function parsePage(html, finalUrl, host) {
  const root = parse(html, { blockTextElements: { script: true, style: true } });
  const titleEl = root.querySelector("title");
  const title = titleEl ? titleEl.text.trim() : "";
  const md = root.querySelector('meta[name="description"]');
  const robots = root.querySelector('meta[name="robots"]');
  const canon = root.querySelectorAll("link").find((l) => (l.getAttribute("rel") || "").split(/\s+/).includes("canonical"));
  // Match BeautifulSoup get_text(" ", strip=True): strip each text node, drop empties, join with one space.
  const textOf = (el) => { const out = []; const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) { const t = c.text.trim(); if (t) out.push(t); } else if (c.nodeType === 1) walk(c); } }; walk(el); return out.join(" "); };
  const h1s = root.querySelectorAll("h1").map(textOf);
  const ldTypes = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(s.rawText || ""); } catch { continue; }
    const nodes = data && !Array.isArray(data) && typeof data === "object" ? (data["@graph"] || [data]) : data;
    for (const n of Array.isArray(nodes) ? nodes : [nodes]) {
      if (n && typeof n === "object" && n["@type"]) ldTypes.push(...(Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]));
    }
  }
  const ogImage = !!root.querySelector('meta[property="og:image"]');
  // Same order as the Python crawler: strip chrome from <main>/<body>, then count words, images and links.
  const main = root.querySelector("main") || root.querySelector("body") || root;
  main.querySelectorAll("script, style, noscript, nav, footer, header").forEach((el) => el.remove());
  // Join text nodes with spaces (like BeautifulSoup get_text(" ")) so adjacent blocks don't merge words.
  const texts = [];
  const walk = (node) => { for (const c of node.childNodes) { if (c.nodeType === 3) texts.push(c.text); else if (c.nodeType === 1) walk(c); } };
  walk(main);
  const words = (texts.join(" ").match(/[\p{L}\p{N}_]+/gu) || []).length;
  const imgs = root.querySelectorAll("img");
  const links = new Set();
  for (const a of root.querySelectorAll("a[href]")) {
    let href;
    try { href = new URL(a.getAttribute("href").trim(), finalUrl); } catch { continue; }
    href.hash = "";
    if ((href.protocol === "http:" || href.protocol === "https:") && stripHost(href.host) === stripHost(host)) links.add(href.href.replace(/#$/, ""));
  }
  const metaDescription = md ? (md.getAttribute("content") || "").trim() : "";
  return {
    title, title_len: title.length,
    meta_description: metaDescription, meta_len: metaDescription.length,
    h1_count: h1s.length, h1: h1s.join(" | ").slice(0, 200),
    canonical: canon ? canon.getAttribute("href") || "" : "",
    meta_robots: robots ? robots.getAttribute("content") || "" : "",
    word_count: words,
    img_count: imgs.length, img_missing_alt: imgs.filter((i) => !(i.getAttribute("alt") || "").trim()).length,
    internal_links: links.size,
    schema_types: [...new Set(ldTypes)].sort().join(","),
    og_image: ogImage,
    links: [...links],
  };
}

export async function auditPage(url, host, log) {
  const t0 = Date.now();
  const r = await get(url, { log });
  const row = { url };
  if (isErr(r)) return { ...row, status: "ERR", error: String(r?.message || r).slice(0, 200), links: [] };
  row.status = r.status;
  row.final_url = r.url && r.url !== url ? r.url : "";
  row.redirects = r.redirected ? 1 : 0;
  row.response_ms = Date.now() - t0;
  row.x_robots = r.headers.get("x-robots-tag") || "";
  if (!(r.headers.get("content-type") || "").includes("text/html")) {
    await r.body?.cancel().catch(() => {});
    return { ...row, links: [] };
  }
  const html = await r.text();
  return { ...row, ...parsePage(html, r.url || url, host) };
}

export async function checkLink(url, log) {
  let r = await get(url, { method: "HEAD", log });
  if (!isErr(r) && (r.status === 405 || r.status === 403)) {
    r = await get(url, { log });
    if (!isErr(r)) await r.body?.cancel().catch(() => {});
  }
  return isErr(r) ? "ERR" : r.status;
}

// Run fn over items with SEO.workers concurrency (the throttle keeps the global rate at 1/s).
export async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(SEO.workers, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  }));
  return out;
}

// ---- issues ----
export function pageIssues(p) {
  const out = [];
  const add = (sev, check, detail = "") => out.push({ severity: sev, check, url: p.url, detail });
  const st = p.status;
  if (st === 429) { add("low", "unverified_rate_limited", "re-run later"); return out; }
  if (st === "ERR" || (typeof st === "number" && st >= 400)) { add("high", "sitemap_url_not_200", String(st)); return out; }
  if (p.redirects) add("medium", "sitemap_url_redirects", p.final_url || "");
  if (((p.meta_robots || "") + (p.x_robots || "")).toLowerCase().includes("noindex")) add("high", "noindex_in_sitemap", p.meta_robots || "");
  if (!("title" in p)) return out;
  if (!p.title) add("high", "missing_title");
  else if (p.title_len > T.titleMax) add("low", "title_too_long", `${p.title_len} chars`);
  else if (p.title_len < T.titleMin) add("low", "title_too_short", `${p.title_len} chars`);
  if (!p.meta_description) add("medium", "missing_meta_description");
  else if (p.meta_len > T.metaMax) add("low", "meta_description_too_long", `${p.meta_len} chars`);
  if (p.h1_count === 0) add("medium", "missing_h1");
  else if (p.h1_count > 1) add("low", "multiple_h1", String(p.h1_count));
  const c = p.canonical;
  if (!c) add("medium", "missing_canonical");
  else if (c.replace(/\/+$/, "") !== (p.final_url || p.url).replace(/\/+$/, "")) add("medium", "canonical_points_elsewhere", c);
  if (p.word_count < T.thinWords && !SEO.thinOkPatterns.some((x) => p.url.includes(x))) add("low", "thin_content", `${p.word_count} words`);
  if (p.img_missing_alt) add("low", "images_missing_alt", `${p.img_missing_alt}/${p.img_count}`);
  if (p.response_ms > T.slowMs) add("low", "slow_response", `${p.response_ms} ms`);
  if (!p.schema_types) add("low", "no_structured_data");
  return out;
}

export const linkTargets = (pages, urls) => {
  const sitemap = new Set(urls.map((u) => u.replace(/\/+$/, "")));
  const all = new Set(pages.flatMap((p) => p.links || []));
  return [...all].filter((l) => !sitemap.has(l.replace(/\/+$/, "")) && !SEO.linkSkip.test(l));
};

// Build issues, duplicates and broken links once every page and link has been fetched.
export function analyse({ base, pages, siteChecks, linkCodes }) {
  const issues = pages.flatMap(pageIssues);
  for (const f of siteChecks) if (f.status !== 200) issues.push({ severity: "high", check: "site_file_missing", url: base + f.path, detail: String(f.status) });
  for (const [field, check] of [["title", "duplicate_title"], ["meta_description", "duplicate_meta_description"]]) {
    const groups = new Map();
    for (const p of pages) if (p[field]) { const k = p[field].trim().toLowerCase(); groups.set(k, [...(groups.get(k) || []), p.url]); }
    for (const us of groups.values()) if (us.length > 1) for (const u of us) issues.push({ severity: "medium", check, url: u, detail: `${us.length} pages share it` });
  }
  let broken = [];
  if (linkCodes) {
    const sources = new Map();
    for (const p of pages) for (const l of p.links || []) sources.set(l, [...(sources.get(l) || []), p.url]);
    const codes = { ...linkCodes };
    for (const p of pages) codes[p.url] = p.status;
    for (const [l, src] of sources) {
      const c = codes[l];
      if (c === "ERR" || (typeof c === "number" && c >= 400 && c !== 429)) broken.push({ target: l, status: c, linked_from_count: src.length, linked_from: [...src].sort().slice(0, 10) });
    }
    broken.sort((a, b) => b.linked_from_count - a.linked_from_count);
    for (const b of broken) issues.push({ severity: "high", check: "broken_internal_link", url: b.target, detail: `${b.status} from ${b.linked_from_count} pages` });
  }
  issues.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.check.localeCompare(b.check) || a.url.localeCompare(b.url));
  return { issues, broken };
}

export const severityOf = (check) => CHECK_SEV[check] || "low";
