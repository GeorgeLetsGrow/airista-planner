// Replays an existing seo_crawl.py output folder through the in-app report builder.
// node scripts/replay-crawl.mjs <crawls dir> <date> [prevDate]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReport, reportMarkdown, headline } from "../netlify/lib/seo-report.mjs";
import { SEO } from "../netlify/lib/seo-config.mjs";

function csv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const [dir, date, prevDate] = process.argv.slice(2);
const read = (d, f) => readFileSync(join(dir, d, f), "utf8");
const num = (v) => (v === "" ? undefined : /^\d+$/.test(v) ? Number(v) : v);
const pages = csv(read(date, "pages.csv")).map((p) => ({ ...p, status: num(p.status), redirects: Number(p.redirects || 0), title_len: Number(p.title_len || 0), meta_len: Number(p.meta_len || 0), h1_count: Number(p.h1_count || 0), word_count: Number(p.word_count || 0), response_ms: Number(p.response_ms || 0) }));
const issues = csv(read(date, "issues.csv"));
const broken = csv(read(date, "broken_links.csv")).map((b) => ({ ...b, status: num(b.status), linked_from_count: Number(b.linked_from_count), linked_from: b.linked_from.split(" ").filter(Boolean) }));
const summary = read(date, "summary.md");
const siteChecks = [...summary.matchAll(/- `(\/[^`]+)` → (\S+)/g)].map((m) => ({ path: m[1], status: num(m[2]) }));
// Priority pages: the replay has no live fetch, so use the known final URLs from the crawl.
const finals = { "/healthcare/": "/solutions/healthcare/", "/software/": "/products/software/" };
const priority = SEO.priorityPages.map((url) => {
  const p = new URL(url).pathname, final = SEO.site + (finals[p] || p);
  const page = pages.find((x) => x.url === final) || {};
  return { url, final_url: final, status: page.status, title: page.title, meta_robots: page.meta_robots, canonical: page.canonical };
});
const prev = prevDate ? JSON.parse(read(prevDate, "snapshot.json")) : null;
const r = buildReport({ crawl: { date, base: SEO.site, pages, issues, broken, siteChecks, priority }, prev });
if (process.argv[5]) {
  const { writeFileSync } = await import("node:fs");
  const { weeklyWorkbook } = await import("../netlify/lib/seo-xlsx.mjs");
  writeFileSync(`${process.argv[5]}/${date}.report.json`, JSON.stringify(r));
  writeFileSync(`${process.argv[5]}/${date}.xlsx`, await weeklyWorkbook(r, { pages, issues, broken }));
}
console.log(reportMarkdown(r));
console.log("\n---\n" + headline(r));
