// Weekly health report: compares a finished crawl with the previous one and writes the
// Status / What changed / New high issues / Priority pages / Recommended actions sections.
// Rule-based and derived only from crawl, Search Console and GA4 data: no estimates, ever.
import { SEO, CHECK_LABEL, SEV_RANK, CHECK_SEV } from "./seo-config.mjs";

const ON_PAGE_FIELDS = ["status", "title", "meta_description", "h1", "canonical", "meta_robots"];
const FIELD_LABEL = { status: "Status", title: "Title", meta_description: "Meta description", h1: "H1", canonical: "Canonical", meta_robots: "Robots" };
const n = (v) => Number(v).toLocaleString("en-US");
const plural = (count, one, many = one + "s") => `${n(count)} ${count === 1 ? one : many}`;
const trimSlash = (u) => String(u || "").replace(/\/+$/, "");
const path = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
const label = (check) => CHECK_LABEL[check] || check.replace(/_/g, " ");

// Snapshot in the same shape as seo_crawl.py's snapshot.json, used for next week's diff.
export function snapshotOf(crawl) {
  const pages = {};
  for (const p of crawl.pages) pages[p.url] = Object.fromEntries(["status", "title", "meta_description", "h1", "canonical", "meta_robots", "word_count"].map((k) => [k, p[k] ?? null]));
  return { date: crawl.date, base: crawl.base, pages, issues: [...new Set(crawl.issues.map((i) => `${i.check}|${i.url}`))].sort() };
}

export function countsOf(issueKeys) {
  const out = { high: 0, medium: 0, low: 0 };
  for (const key of issueKeys) out[CHECK_SEV[key.split("|")[0]] || "low"]++;
  return out;
}

function byCheck(issues) {
  const m = new Map();
  for (const i of issues) { const k = `${i.severity}|${i.check}`; m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([k, count]) => { const [severity, check] = k.split("|"); return { severity, check, label: label(check), count }; })
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count);
}

function groupKeys(keys) {
  const m = new Map();
  for (const key of keys) { const check = key.split("|")[0]; m.set(check, (m.get(check) || 0) + 1); }
  return [...m].map(([check, count]) => ({ check, severity: CHECK_SEV[check] || "low", label: label(check), count }))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count);
}

// Priority pages: the configured URL is fetched directly (it may redirect), then matched to the crawl.
function priorityCheck(crawl, prev) {
  const pagesByUrl = new Map(crawl.pages.map((p) => [trimSlash(p.url), p]));
  return (crawl.priority || []).map((pp) => {
    const final = pp.final_url || pp.url;
    const inCrawl = pagesByUrl.get(trimSlash(final)) || pagesByUrl.get(trimSlash(pp.url));
    const robots = `${pp.meta_robots || ""} ${pp.x_robots || ""}`.toLowerCase();
    const selfCanonical = !!pp.canonical && trimSlash(pp.canonical) === trimSlash(final);
    const indexable = pp.status === 200 && !robots.includes("noindex") && selfCanonical;
    const before = prev?.pages?.[inCrawl?.url || final] || prev?.pages?.[final];
    const changed = before ? ["status", "title", "canonical", "meta_robots"].filter((k) => (before[k] ?? "") !== (pp[k] ?? "") && !(k === "status" && String(before[k]) === String(pp[k])))
      .map((k) => ({ field: k, label: FIELD_LABEL[k], before: before[k] ?? "", after: pp[k] ?? "" })) : [];
    const openIssues = crawl.issues.filter((i) => trimSlash(i.url) === trimSlash(final)).map((i) => i.check === "meta_description_too_long" ? `Meta description over 160 characters (${i.detail})` : label(i.check));
    return {
      configured: pp.url, finalUrl: final, redirected: trimSlash(final) !== trimSlash(pp.url), inSitemap: !!inCrawl,
      status: pp.status, title: pp.title || "", metaRobots: pp.meta_robots || "", canonical: pp.canonical || "",
      selfCanonical, indexable, comparedWith: before ? prev.date : null, changed, openIssues: [...new Set(openIssues)],
    };
  });
}

export function buildReport({ crawl, prev, search, ga4, generatedAt = new Date().toISOString() }) {
  const snap = snapshotOf(crawl);
  const counts = countsOf(snap.issues);
  const issueByKey = new Map(crawl.issues.map((i) => [`${i.check}|${i.url}`, i]));
  const brokenByTarget = new Map(crawl.broken.map((b) => [b.target, b]));
  const highChecks = new Set(Object.keys(CHECK_SEV).filter((c) => CHECK_SEV[c] === "high"));

  let changes = null, newHigh = [], carriedHigh = [], removed = [], added = [];
  if (prev) {
    const pu = new Set(Object.keys(prev.pages)), cu = new Set(Object.keys(snap.pages));
    const pi = new Set(prev.issues), ci = new Set(snap.issues);
    added = [...cu].filter((u) => !pu.has(u)).sort();
    removed = [...pu].filter((u) => !cu.has(u)).sort();
    const newKeys = [...ci].filter((k) => !pi.has(k)), resolvedKeys = [...pi].filter((k) => !ci.has(k));
    const onPage = [];
    for (const u of [...pu].filter((x) => cu.has(x)).sort()) for (const k of ON_PAGE_FIELDS) {
      const a = prev.pages[u][k] ?? null, b = snap.pages[u][k] ?? null;
      if (String(a ?? "") !== String(b ?? "")) onPage.push({ url: u, field: k, label: FIELD_LABEL[k], before: String(a ?? "").slice(0, 160), after: String(b ?? "").slice(0, 160) });
    }
    changes = { prevDate: prev.date, prevPages: pu.size, added, removed, newIssues: newKeys.length, resolvedIssues: resolvedKeys.length,
      newByCheck: groupKeys(newKeys), resolvedByCheck: groupKeys(resolvedKeys), onPage, prevCounts: countsOf(prev.issues) };
    const toIssue = (k) => { const i = issueByKey.get(k); const b = brokenByTarget.get(i.url); return { ...i, label: label(i.check), linkedFrom: b?.linked_from || [] }; };
    newHigh = newKeys.filter((k) => highChecks.has(k.split("|")[0])).sort().map(toIssue);
    carriedHigh = [...ci].filter((k) => pi.has(k) && highChecks.has(k.split("|")[0])).sort().map(toIssue);
    // A broken link and a 404 sitemap URL for the same target is one problem: show the linking pages on both.
    for (const list of [newHigh, carriedHigh]) for (const i of list) if (!i.linkedFrom.length) i.linkedFrom = brokenByTarget.get(i.url)?.linked_from || [];
  } else {
    carriedHigh = crawl.issues.filter((i) => i.severity === "high").map((i) => ({ ...i, label: label(i.check), linkedFrom: brokenByTarget.get(i.url)?.linked_from || [] }));
  }

  const priority = priorityCheck(crawl, prev);
  const missingFiles = crawl.siteChecks.filter((f) => f.status !== 200);

  // ---- material changes (they lead the weekly summary) ----
  const material = [];
  const newHighTargets = [...new Set(newHigh.map((i) => i.url))];
  for (const url of newHighTargets) {
    const items = newHigh.filter((i) => i.url === url), linked = items.find((i) => i.linkedFrom.length)?.linkedFrom || [];
    const linkedText = linked.length ? ` and linked from ${plural(linked.length, "page")}` : "";
    const notOk = items.find((i) => i.check === "sitemap_url_not_200");
    if (notOk) material.push(`New high issue: ${url} returns ${notOk.detail}. It is listed in the sitemap${linkedText}.`);
    else material.push(`New high issue: ${items.map((i) => i.label.toLowerCase()).join(" and ")} at ${url}${linked.length ? `, linked from ${plural(linked.length, "page")}` : ""}.`);
  }
  for (const pp of priority) {
    if (pp.status !== 200) material.push(`Priority page ${path(pp.configured)} returns ${pp.status}.`);
    for (const c of pp.changed) material.push(`Priority page ${path(pp.finalUrl)}: ${c.label.toLowerCase()} changed from "${c.before || "(none)"}" to "${c.after || "(none)"}".`);
  }
  for (const f of missingFiles) material.push(`${f.path} returned ${f.status}${f.path.includes("sitemap") ? "; the sitemap could not be read" : ""}.`);
  if (removed.length) material.push(`${plural(removed.length, "page")} dropped out of the sitemap since ${prev.date}.`);
  if (!crawl.pages.length) material.push("The crawl found no sitemap URLs, so no pages were checked.");

  const status = material.length
    ? { level: "attention", line: `Needs attention. ${material.length === 1 ? "One material change" : `${material.length} material changes`} this week.` }
    : { level: "clear", line: `All clear. No material changes.${carriedHigh.length ? ` ${carriedHigh.length === 1 ? "The one high-severity issue is" : `The ${carriedHigh.length} high-severity issues are`} carried over from earlier crawls.` : ""}` };

  return {
    date: crawl.date, generatedAt, site: crawl.base, status, material,
    crawl: { pages: crawl.pages.length, counts, brokenCount: crawl.broken.length, siteChecks: crawl.siteChecks, byCheck: byCheck(crawl.issues), durationMs: crawl.durationMs || null },
    changes, newHigh, carriedHigh, priority,
    search: search || { pending: "Search Console was not pulled for this run." },
    ga4: ga4 || { pending: "GA4 was not pulled for this run." },
    actions: recommend({ crawl, changes, newHigh, carriedHigh, priority, missingFiles }),
  };
}

// At most five actions, most important first. Every number comes straight from the crawl.
function recommend({ crawl, changes, newHigh, carriedHigh, priority, missingFiles }) {
  const out = [];
  const add = (text) => { if (out.length < 5 && !out.includes(text)) out.push(text); };
  const pageIssues = (url) => crawl.issues.filter((i) => trimSlash(i.url) === trimSlash(url));
  const fixFor = (targets, isNew) => {
    for (const url of targets) {
      const items = (isNew ? newHigh : carriedHigh).filter((i) => i.url === url);
      const linked = items.find((i) => i.linkedFrom.length)?.linkedFrom || [];
      const checks = new Set(items.map((i) => i.check));
      const lead = isNew ? "Fix" : "Fix the carried-over";
      if (checks.has("sitemap_url_not_200")) {
        const st = items.find((i) => i.check === "sitemap_url_not_200").detail;
        add(`${lead} ${st} on ${path(url)}: it is listed in the sitemap${linked.length ? ` and linked from ${plural(linked.length, "page")}` : ""}. Restore the page or 301 it in Redirection, then update the links. Staging first, then log it.`);
      } else if (checks.has("broken_internal_link")) {
        const st = items.find((i) => i.check === "broken_internal_link").detail.split(" ")[0];
        add(`${lead === "Fix" ? "Fix the" : lead} broken internal link to ${path(url)} (${st})${linked.length ? ` on ${linked.length === 1 ? path(linked[0]) : plural(linked.length, "page")}` : ""}: point it at a live URL or add a 301 in Redirection.`);
      } else if (checks.has("noindex_in_sitemap")) add(`${lead === "Fix" ? "Resolve" : "Resolve the carried-over"} noindex on ${path(url)}: either allow indexing or remove it from the sitemap in Yoast.`);
      else if (checks.has("missing_title")) add(`Add an SEO title to ${path(url)} as a Yoast draft for approval.`);
      else if (checks.has("site_file_missing")) add(`Restore ${path(url)} (returns ${items[0].detail}).`);
    }
  };
  fixFor([...new Set(newHigh.map((i) => i.url))], true);
  for (const f of missingFiles) add(`Restore ${f.path}: it returned ${f.status}. Check WP Engine and Yoast settings.`);
  for (const pp of priority) {
    if (pp.status !== 200) add(`Check priority page ${path(pp.configured)}: it returns ${pp.status}.`);
    if (pp.changed.length) add(`Confirm the ${pp.changed.map((c) => c.label.toLowerCase()).join(", ")} change on ${path(pp.finalUrl)} was intended.`);
    if (pp.status === 200 && !pp.indexable) add(`Make ${path(pp.finalUrl)} indexable: check the robots tag and that its canonical points to itself.`);
  }
  if (changes?.removed.length) add(`Confirm the ${plural(changes.removed.length, "page")} that left the sitemap were removed on purpose, and 301 any that still earn traffic.`);
  // New pages: tidy on-page basics.
  for (const url of changes?.added || []) {
    const issues = pageIssues(url).filter((i) => i.severity !== "high");
    const bits = [];
    for (const i of issues) {
      if (i.check === "images_missing_alt") bits.push(`add alt text to ${i.detail.split("/")[0]} of ${i.detail.split("/")[1]} images`);
      if (i.check === "title_too_long") bits.push(`trim the SEO title to 60 characters (now ${i.detail.replace(" chars", "")})`);
      if (i.check === "title_too_short") bits.push(`lengthen the SEO title (now ${i.detail})`);
      if (i.check === "missing_meta_description") bits.push("write a meta description");
      if (i.check === "meta_description_too_long") bits.push(`shorten the meta description to 160 characters (now ${i.detail.replace(" chars", "")})`);
      if (i.check === "missing_h1") bits.push("add an H1");
    }
    if (bits.length) add(`Tidy the new page ${path(url)}: ${bits.join(", ")}, as a Yoast draft for approval.`);
  }
  fixFor([...new Set(carriedHigh.map((i) => i.url))], false);
  const longMeta = priority.filter((pp) => pp.openIssues.some((x) => x.startsWith("Meta description over")));
  if (longMeta.length) add(`Shorten the meta descriptions on ${longMeta.map((pp) => path(pp.finalUrl)).join(" and ")} to 160 characters or fewer, as Yoast drafts for approval.`);
  // Backlog, biggest medium-severity checks first.
  const backlog = { missing_meta_description: "Write the {n} missing meta descriptions, starting with blog posts and solution pages.",
    duplicate_title: "Fix the {n} duplicate titles, starting with posts that reuse another post's SEO title.",
    sitemap_url_redirects: "Remove the {n} redirecting URLs from the sitemap so it lists only final URLs.",
    missing_h1: "Add H1s to the {n} pages missing one.", duplicate_meta_description: "Rewrite the {n} duplicate meta descriptions." };
  for (const c of byCheck(crawl.issues).filter((x) => backlog[x.check])) add(backlog[c.check].replace("{n}", n(c.count)));
  return out;
}

// ---- Markdown version (same structure as seo/reports/weekly/<date>.md) ----
export function reportMarkdown(r) {
  const L = [`# AiRISTA Flow weekly SEO health check: ${r.date}`, "", `Site: ${r.site}`,
    r.changes ? `Crawl: ${r.date} compared with the previous crawl on ${r.changes.prevDate}.` : `Crawl: ${r.date}. No previous crawl to compare with; this run is the baseline.`, "",
    "## Status", "", r.status.line, ""];
  if (r.material.length) L.push(...r.material.map((m) => `- ${m}`), "");
  L.push("## What changed since last week", "");
  const c = r.changes, k = r.crawl.counts;
  if (c) {
    L.push(`- **Sitemap:** ${n(r.crawl.pages)} URLs crawled (${n(c.prevPages)} last week). ${n(c.added.length)} added, ${n(c.removed.length)} removed.`);
    for (const u of c.added) L.push(`  - Added: ${u}`);
    for (const u of c.removed) L.push(`  - Removed: ${u}`);
  } else L.push(`- **Sitemap:** ${n(r.crawl.pages)} URLs crawled.`);
  L.push(`- **Site files:** ${r.crawl.siteChecks.map((f) => `\`${f.path}\` ${f.status}`).join(", ")}.`);
  L.push(`- **Issue totals:** ${n(k.high)} high, ${n(k.medium)} medium and ${n(k.low)} low${c ? ` (last week: ${n(c.prevCounts.high)} high, ${n(c.prevCounts.medium)} medium, ${n(c.prevCounts.low)} low)` : ""}.`);
  if (c) {
    L.push(`- **New issues (${n(c.newIssues)}):** ${c.newByCheck.map((g) => `${n(g.count)} ${g.label.toLowerCase()}`).join("; ") || "none"}.`);
    L.push(`- **Resolved issues (${n(c.resolvedIssues)}):** ${c.resolvedByCheck.map((g) => `${n(g.count)} ${g.label.toLowerCase()}`).join("; ") || "none"}.`);
    if (c.newByCheck.some((g) => g.check === "slow_response")) L.push("  - Slow-response changes between crawls mostly reflect Cloudflare rate limiting during the crawl.");
    L.push(c.onPage.length ? `- **On-page changes (${n(c.onPage.length)}):**` : "- **On-page changes:** none. No titles, meta descriptions, H1s, canonicals or robots directives changed on existing pages.");
    for (const x of c.onPage.slice(0, 40)) L.push(`  - ${x.url}, ${x.label.toLowerCase()}: "${x.before}" → "${x.after}"`);
  }
  L.push("", "## New high-severity issues", "");
  if (!r.newHigh.length) L.push("None.");
  for (const i of r.newHigh) { L.push(`- **${i.label}:** ${i.url} (${i.detail})`); for (const s of i.linkedFrom) L.push(`  - Linked from ${s}`); }
  if (r.carriedHigh.length) { L.push("", "Carried over from earlier crawls:", ""); for (const i of r.carriedHigh) L.push(`- ${i.label}: ${i.url} (${i.detail})${i.linkedFrom.length ? `, linked from ${i.linkedFrom.join(", ")}` : ""}`); }
  L.push("", "## Priority pages check", "", "| Priority page | Final URL | Status | Title | Indexable | Change |", "|---|---|---|---|---|---|");
  for (const p of r.priority) L.push(`| ${path(p.configured)} | ${p.redirected ? path(p.finalUrl) : "same"} | ${p.status} | ${String(p.title).replace(/\|/g, "\\|")} | ${p.indexable ? "Yes" : "No"} (${p.metaRobots || "no robots tag"}; ${p.selfCanonical ? "self canonical" : "canonical elsewhere"}) | ${p.changed.length ? p.changed.map((x) => x.label).join(", ") : p.comparedWith ? "None" : "First check"} |`);
  const open = r.priority.filter((p) => p.openIssues.length);
  if (open.length) L.push("", `Open items: ${open.map((p) => `${path(p.finalUrl)}: ${p.openIssues.join("; ").toLowerCase()}`).join(". ")}.`);
  if (!r.search.pending) {
    const s = r.search, pct = (a, b) => b ? `${a >= b ? "+" : ""}${Math.round((a - b) / b * 100)}%` : "n/a";
    L.push("", "## Search Console and GA4", "", `Search Console ${s.range.label} vs ${s.prevRange.label}: ${n(s.totals.clicks)} clicks (${pct(s.totals.clicks, s.prev.clicks)}), ${n(s.totals.impressions)} impressions (${pct(s.totals.impressions, s.prev.impressions)}), average position ${s.totals.position.toFixed(1)} (prior ${s.prev.position.toFixed(1)}).`);
    if (!r.ga4.pending) { const o = r.ga4.channels.find((x) => x.channel === "Organic Search"); if (o) L.push(`GA4 organic search: ${n(o.sessions)} sessions (prior ${n(o.sessionsPrior)}), ${n(o.keyEvents)} key events (prior ${n(o.keyEventsPrior)}).`); }
  }
  L.push("", "## Recommended actions", "", ...r.actions.map((a, i) => `${i + 1}. ${a}`), "");
  if (r.search.pending || r.ga4.pending) L.push(`_${[r.search.pending ? "Search Console" : "", r.ga4.pending ? "GA4" : ""].filter(Boolean).join(" and ")}: data pending for this run._`, "");
  return L.join("\n");
}

// One-line weekly summary for the account lead.
export function headline(r) {
  const k = r.crawl.counts;
  if (!r.material.length) return `AiRISTA weekly check: no material changes, ${n(k.high)} high, ${n(k.medium)} medium and ${n(k.low)} low issues.`;
  return r.material.slice(0, 4).join(" ");
}
