// Client workbook for the weekly health check, matching the tabs of seo/reports/weekly/<date>.xlsx.
import ExcelJS from "exceljs";

const NAVY = "FF1F3A68", SOFT = "FFF3F6FB", YELLOW = "FFFFF4CC";
const pctFmt = "0.0%", intFmt = "#,##0";
const short = (s) => { const [y, m, d] = s.split("-"); return `${m}-${d}-${y.slice(2)}`; };
const ratio = (a, b) => (b ? (a - b) / b : null);

function sheet(wb, name, title, header, widths) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: header ? 2 : 1 }] });
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: NAVY } };
  if (header) {
    const h = ws.addRow(header);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.alignment = { vertical: "middle", wrapText: true }; });
  }
  (widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return ws;
}
const section = (ws, text) => { const r = ws.addRow([text]); r.font = { bold: true }; r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } }; }); };
const note = (ws, text) => { ws.addRow([]); const r = ws.addRow([text]); r.font = { italic: true, color: { argb: "FF5B6576" } }; };
const link = (url) => (/^https?:\/\//.test(url) ? { text: url, hyperlink: url } : url);

export async function weeklyWorkbook(report, crawl) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LetsGrow MarTech"; wb.created = new Date(report.generatedAt);
  const c = report.changes, k = report.crawl.counts, s = report.search, g = report.ga4;
  const prevLabel = c ? short(c.prevDate) : null;

  // Weekly Summary
  let ws = sheet(wb, "Weekly Summary", `AiRISTA Weekly SEO Health Check: ${short(report.date)}`, ["Metric", "This Week", "Prior Week", "Change", "% Change", "Source"], [34, 14, 14, 12, 12, 30]);
  const st = ws.addRow([`Status: ${report.status.line}`]); st.font = { bold: true }; ws.mergeCells(st.number, 1, st.number, 6);
  st.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: report.status.level === "clear" ? "FFDCF5E8" : YELLOW } };
  const metric = (name, cur, prior, source, fmt = intFmt) => {
    const r = ws.addRow([name, cur, prior ?? "", prior == null ? "" : cur - prior, prior == null ? "" : ratio(cur, prior) ?? "", source]);
    r.getCell(2).numFmt = r.getCell(3).numFmt = r.getCell(4).numFmt = fmt; r.getCell(5).numFmt = pctFmt;
  };
  const crawlSrc = c ? `Crawl ${short(report.date).slice(0, 5)} vs ${prevLabel.slice(0, 5)}` : `Crawl ${short(report.date)}`;
  metric("Sitemap URLs crawled", report.crawl.pages, c?.prevPages, crawlSrc);
  metric("High issues", k.high, c?.prevCounts.high, crawlSrc);
  metric("Medium issues", k.medium, c?.prevCounts.medium, crawlSrc);
  metric("Low issues", k.low, c?.prevCounts.low, crawlSrc);
  if (!s.pending) {
    metric("GSC clicks", s.totals.clicks, s.prev.clicks, "Search Console");
    metric("GSC impressions", s.totals.impressions, s.prev.impressions, "Search Console");
    metric("GSC average position", Number(s.totals.position.toFixed(1)), Number(s.prev.position.toFixed(1)), "Search Console", "0.0");
  }
  if (!g.pending) {
    const org = g.channels.find((x) => x.channel === "Organic Search");
    metric("GA4 sessions (all channels)", g.totals.sessions, g.totals.sessionsPrior, "GA4");
    if (org) metric("GA4 organic search sessions", org.sessions, org.sessionsPrior, "GA4");
    metric("GA4 key events (all channels)", g.totals.keyEvents, g.totals.keyEventsPrior, "GA4");
  }
  note(ws, [c ? `Crawl: ${short(report.date)} compared with ${prevLabel}.` : `Crawl: ${short(report.date)} (baseline).`,
    s.pending ? `Search Console: ${s.pending}` : `GSC and GA4: ${s.range.label} compared with ${s.prevRange.label}. For average position, lower is better, so a negative change is an improvement.`,
    g.pending && !s.pending ? `GA4: ${g.pending}` : ""].filter(Boolean).join(" "));

  // Search Console
  ws = sheet(wb, "Search Console", s.pending ? "Search Console" : `Search Console: Web Search (${s.range.label} vs ${s.prevRange.label})`, null, [70, 12, 12, 14, 14, 10, 10, 10, 10, 12]);
  if (s.pending) ws.addRow([`Data pending. ${s.pending}`]);
  else {
    const head = (cols) => { const r = ws.addRow(cols); r.font = { bold: true }; };
    head(["Metric", "This Week", "Prior Week", "Change", "% Change"]);
    section(ws, "Totals");
    for (const [n, key, fmt] of [["Clicks", "clicks", intFmt], ["Impressions", "impressions", intFmt], ["Average CTR", "ctr", "0.0%"], ["Average position", "position", "0.0"]]) {
      const r = ws.addRow([n, s.totals[key], s.prev[key], s.totals[key] - s.prev[key], ratio(s.totals[key], s.prev[key]) ?? ""]);
      [2, 3, 4].forEach((i) => { r.getCell(i).numFmt = fmt; }); r.getCell(5).numFmt = pctFmt;
    }
    for (const [title, rows, label] of [["Top Pages", s.topPages, "Page"], ["Top Queries", s.topQueries, "Query"]]) {
      ws.addRow([]); section(ws, title);
      head([label, "Clicks", "Clicks Prior", "Impressions", "Impressions Prior", "CTR", "CTR Prior", "Position", "Position Prior", "Position Change"]);
      for (const x of rows) {
        const p = x.prior;
        const r = ws.addRow([link(x.key), x.clicks, p?.clicks ?? "", x.impressions, p?.impressions ?? "", x.ctr, p?.ctr ?? "", Number(x.position.toFixed(1)), p ? Number(p.position.toFixed(1)) : "", p ? Number((x.position - p.position).toFixed(1)) : ""]);
        [6, 7].forEach((i) => { r.getCell(i).numFmt = "0.0%"; }); [2, 3, 4, 5].forEach((i) => { r.getCell(i).numFmt = intFmt; });
      }
    }
    note(ws, `Source: Search Console property ${s.property}, web search, all data states.`);
  }

  // GA4 Channels
  ws = sheet(wb, "GA4 Channels", g.pending ? "GA4 Traffic Acquisition" : `GA4 Traffic Acquisition (${g.range.label} vs ${g.prevRange.label})`,
    g.pending ? null : ["Channel", "Sessions", "Sessions Prior", "Engaged Sessions", "Engaged Prior", "Engagement Rate", "Engagement Rate Prior", "Key Events", "Key Events Prior", "Sessions % Change"], [40, 12, 14, 16, 14, 16, 20, 12, 16, 18]);
  if (g.pending) ws.addRow([`Data pending. ${g.pending}`]);
  else {
    section(ws, "By session primary channel group");
    for (const x of [...g.channels, g.totals]) {
      const r = ws.addRow([x.channel, x.sessions, x.sessionsPrior, x.engaged, x.engagedPrior, x.sessions ? x.engaged / x.sessions : 0, x.sessionsPrior ? x.engagedPrior / x.sessionsPrior : 0, x.keyEvents, x.keyEventsPrior, x.sessionsPrior ? ratio(x.sessions, x.sessionsPrior) : "-"]);
      [6, 7, 10].forEach((i) => { r.getCell(i).numFmt = pctFmt; });
      if (x === g.totals) r.font = { bold: true };
    }
    note(ws, `Source: GA4 property ${g.property}, Traffic acquisition by session primary channel group.`);
  }

  // Priority Pages
  ws = sheet(wb, "Priority Pages", `Priority Pages Check (Crawl ${short(report.date)})`, ["Priority Page (config)", "Final URL", "Status Code", "Title", "Meta Robots", "Self Canonical", c ? `Changed Since ${prevLabel.slice(0, 5)}` : "Changed", "Open Issues"], [44, 50, 12, 46, 30, 14, 16, 60]);
  for (const p of report.priority) ws.addRow([link(p.configured), link(p.finalUrl), p.status, p.title, p.metaRobots, p.selfCanonical ? "Yes" : "No",
    p.changed.length ? p.changed.map((x) => `${x.label}: ${x.before} → ${x.after}`).join("; ") : p.comparedWith ? "No" : "First check", p.openIssues.join("; ")]);
  const redirected = report.priority.filter((p) => p.redirected);
  if (redirected.length) note(ws, `${redirected.map((p) => new URL(p.configured).pathname).join(" and ")} redirect to the final URLs shown.`);

  // Recommended Actions
  ws = sheet(wb, "Recommended Actions", "Recommended Actions", ["#", "Action"], [5, 120]);
  report.actions.forEach((a, i) => { const r = ws.addRow([i + 1, a]); r.alignment = { wrapText: true, vertical: "top" }; });

  // Issue Counts
  ws = sheet(wb, "Issue Counts", `Crawl Issues by Check (${short(report.date)})`, ["Severity", "Check", "Count"], [12, 36, 10]);
  for (const x of report.crawl.byCheck) ws.addRow([x.severity[0].toUpperCase() + x.severity.slice(1), x.check, x.count]);
  ws.addRow(["", "Total", report.crawl.byCheck.reduce((a, x) => a + x.count, 0)]).font = { bold: true };

  // Crawl Issues
  ws = sheet(wb, "Crawl Issues", `All Crawl Issues (${short(report.date)})`, ["Severity", "Check", "URL", "Detail"], [10, 30, 90, 40]);
  for (const i of crawl.issues) ws.addRow([i.severity, i.check, link(i.url), i.detail]);
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 4 } };

  // Broken Links
  ws = sheet(wb, "Broken Links", `Broken Internal Links (${short(report.date)})`, ["Target", "Status", "Linked From (count)", "Linked From"], [80, 10, 18, 100]);
  if (!crawl.broken.length) ws.addRow(["None found."]);
  for (const b of crawl.broken) ws.addRow([link(b.target), b.status, b.linked_from_count, b.linked_from.join(" ")]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
