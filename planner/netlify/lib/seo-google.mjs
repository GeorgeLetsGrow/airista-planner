// Search Console and GA4 week over week for the weekly health check.
// Window: the last full Sunday to Saturday week before the run date, compared with the week before it.
import { connectedClient } from "./google.mjs";

const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, days) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
const short = (s) => { const [y, m, d] = s.split("-"); return `${m}-${d}-${y.slice(2)}`; };

export function weekRanges(runDate) {
  const d = new Date(`${runDate}T12:00:00Z`);
  const end = addDays(runDate, -(d.getUTCDay() + 1)); // previous Saturday
  const start = addDays(end, -6);
  const prevEnd = addDays(start, -1), prevStart = addDays(prevEnd, -6);
  return {
    range: { startDate: start, endDate: end, label: `${short(start)} to ${short(end)}` },
    prevRange: { startDate: prevStart, endDate: prevEnd, label: `${short(prevStart)} to ${short(prevEnd)}` },
  };
}

async function post(client, url, body) {
  const headers = await client.getRequestHeaders(url);
  headers.set("content-type", "application/json");
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Google API returned ${res.status}.`);
  return data;
}

const row = (r) => ({ clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, ctr: r?.ctr ?? 0, position: r?.position ?? 0 });

async function searchConsole(client, w) {
  const site = env("SEARCH_CONSOLE_SITE_URL").trim();
  if (!site) return { pending: "Search Console is not configured on this site." };
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const q = (range, extra = {}) => post(client, url, { startDate: range.startDate, endDate: range.endDate, type: "web", dataState: "all", ...extra });
  const [tot, totPrev, pages, pagesPrev, queries, queriesPrev] = await Promise.all([
    q(w.range), q(w.prevRange),
    q(w.range, { dimensions: ["page"], rowLimit: 10 }), q(w.prevRange, { dimensions: ["page"], rowLimit: 1000 }),
    q(w.range, { dimensions: ["query"], rowLimit: 10 }), q(w.prevRange, { dimensions: ["query"], rowLimit: 1000 }),
  ]);
  const withPrior = (cur, prior) => {
    const map = new Map((prior.rows || []).map((r) => [r.keys[0], row(r)]));
    return (cur.rows || []).map((r) => ({ key: r.keys[0], ...row(r), prior: map.get(r.keys[0]) || null }));
  };
  return {
    property: site, range: w.range, prevRange: w.prevRange,
    totals: row(tot.rows?.[0]), prev: row(totPrev.rows?.[0]),
    topPages: withPrior(pages, pagesPrev), topQueries: withPrior(queries, queriesPrev),
  };
}

async function analytics(client, w) {
  const property = env("GA4_PROPERTY_ID").replace(/^properties\//, "").trim();
  if (!property) return { pending: "GA4 is not configured on this site." };
  const data = await post(client, `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`, {
    dateRanges: [{ startDate: w.range.startDate, endDate: w.range.endDate, name: "cur" }, { startDate: w.prevRange.startDate, endDate: w.prevRange.endDate, name: "prev" }],
    dimensions: [{ name: "sessionPrimaryChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
    metricAggregations: ["TOTAL"],
    limit: 50,
  });
  const by = new Map();
  for (const r of data.rows || []) {
    const [channel, range] = r.dimensionValues.map((v) => v.value);
    const m = r.metricValues.map((v) => Number(v.value || 0));
    const cur = by.get(channel) || { channel, sessions: 0, sessionsPrior: 0, engaged: 0, engagedPrior: 0, keyEvents: 0, keyEventsPrior: 0 };
    if (range === "cur") Object.assign(cur, { sessions: m[0], engaged: m[1], keyEvents: m[2] });
    else Object.assign(cur, { sessionsPrior: m[0], engagedPrior: m[1], keyEventsPrior: m[2] });
    by.set(channel, cur);
  }
  const totals = { channel: "Total (all channels, as reported by GA4)", sessions: 0, sessionsPrior: 0, engaged: 0, engagedPrior: 0, keyEvents: 0, keyEventsPrior: 0 };
  for (const t of data.totals || []) {
    const range = t.dimensionValues?.[1]?.value, m = t.metricValues.map((v) => Number(v.value || 0));
    if (range === "cur") Object.assign(totals, { sessions: m[0], engaged: m[1], keyEvents: m[2] });
    if (range === "prev") Object.assign(totals, { sessionsPrior: m[0], engagedPrior: m[1], keyEventsPrior: m[2] });
  }
  return { property, range: w.range, prevRange: w.prevRange, channels: [...by.values()].sort((a, b) => b.sessions - a.sessions), totals };
}

// Returns { search, ga4 }; each is real data or { pending: reason }. Never throws.
export async function weeklyGoogle(runDate, origin) {
  const w = weekRanges(runDate);
  let client;
  try { client = await connectedClient(origin); } catch (e) { client = null; }
  if (!client) return { search: { pending: "Google is not connected. An admin can connect it from the Reports tab." }, ga4: { pending: "Google is not connected. An admin can connect it from the Reports tab." } };
  const [search, ga4] = await Promise.all([
    searchConsole(client, w).catch((e) => ({ pending: `Search Console request failed: ${e.message}` })),
    analytics(client, w).catch((e) => ({ pending: `GA4 request failed: ${e.message}` })),
  ]);
  return { search, ga4 };
}
