import { authStore, currentUser } from "../lib/users.mjs";
import { connectedClient } from "../lib/google.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";
const REPORT_TTL = 7 * 24 * 60 * 60 * 1000;
const BLOBS_PKG = ["@netlify", "blobs"].join("/");

async function reportStore() {
  const { getStore } = await import(BLOBS_PKG);
  return getStore({ name: "airista-report-cache", consistency: "strong" });
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a valid month.");
  const [year, number] = month.split("-").map(Number);
  if (number < 1 || number > 12) throw new Error("Choose a valid month.");
  const startDate = `${month}-01`;
  const monthEnd = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  const latest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (startDate > latest) throw new Error("This month has not started producing report data yet.");
  const endDate = monthEnd < latest ? monthEnd : latest;
  return { startDate, endDate, partial: endDate < monthEnd };
}

async function googleFetch(client, url, body) {
  const headers = await client.getRequestHeaders(url);
  headers.set("content-type", "application/json");
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Google API returned ${response.status}.`);
  return data;
}

async function ahrefsFetch(path, params) {
  const key = env("AHREFS_API_KEY").trim();
  if (!key) throw new Error("Ahrefs is not configured on this site.");
  const url = new URL(`https://api.ahrefs.com/v3/site-explorer/${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  const response = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || data?.message || `Ahrefs API returned ${response.status}.`);
  return data;
}

const scRows = (rows, kind) => (rows || []).map(row => ({
  item: row.keys?.[0] || "(not set)", kind,
  clicks: row.clicks || 0,
  impressions: row.impressions || 0,
  ctr: (row.ctr || 0) * 100,
  position: row.position || 0,
}));

async function searchData(client, range) {
  const site = env("SEARCH_CONSOLE_SITE_URL").trim();
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const base = { startDate: range.startDate, endDate: range.endDate, dataState: "final", rowLimit: 100 };
  const [queries, pages] = await Promise.all([
    googleFetch(client, endpoint, { ...base, dimensions: ["query"] }),
    googleFetch(client, endpoint, { ...base, dimensions: ["page"] }),
  ]);
  return { columns: ["item", "kind", "clicks", "impressions", "ctr", "position"], rows: [...scRows(queries.rows, "Query"), ...scRows(pages.rows, "Page")] };
}

async function trafficData(client, range) {
  const property = env("GA4_PROPERTY_ID").replace(/^properties\//, "").trim();
  const data = await googleFetch(client, `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`, {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: "landingPage" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }],
    dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 100,
  });
  return { columns: ["landingPage", "sessions", "activeUsers", "keyEvents"], rows: (data.rows || []).map(row => ({
    landingPage: row.dimensionValues?.[0]?.value || "(not set)",
    sessions: Number(row.metricValues?.[0]?.value || 0),
    activeUsers: Number(row.metricValues?.[1]?.value || 0),
    keyEvents: Number(row.metricValues?.[2]?.value || 0),
  })) };
}

async function linksData(range) {
  const target = env("AHREFS_TARGET").trim() || "airistaflow.com";
  const shared = { target, mode: "subdomains", limit: 100 };
  const [links, keywords] = await Promise.all([
    ahrefsFetch("all-backlinks", { ...shared, select: "url_from,root_name_source,anchor,url_to,link_type,last_visited", history: "live", aggregation: "1_per_domain" }),
    ahrefsFetch("organic-keywords", { ...shared, date: range.endDate, select: "keyword,best_position,best_position_url,keyword_country,volume,sum_traffic", order_by: "sum_traffic:desc" }),
  ]);
  const linkRows = (links.backlinks || []).map(row => ({ type: "Backlink", primary: row.root_name_source || row.url_from, position: "", traffic: "", detail: row.anchor || row.link_type, url: row.url_from, target: row.url_to }));
  const keywordRows = (keywords.keywords || []).map(row => ({ type: "Keyword", primary: row.keyword, position: row.best_position ?? "", traffic: row.sum_traffic ?? "", detail: (row.keyword_country || "").toUpperCase(), url: row.best_position_url || "", target: row.best_position_url || "" }));
  return { columns: ["type", "primary", "position", "traffic", "detail", "url", "target"], rows: [...keywordRows, ...linkRows] };
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const store = await authStore();
    if (!(await currentUser(req, store))) return json({ error: "Not signed in" }, 401);
    const url = new URL(req.url), view = url.searchParams.get("view"), month = url.searchParams.get("month") || "";
    if (!["search", "traffic", "links"].includes(view)) return json({ error: "Unknown report" }, 400);
    monthRange(month);
    const key = `${view}-${month}`, refresh = url.searchParams.get("refresh") === "1", snapshots = await reportStore();
    if (!refresh) {
      const saved = await snapshots.get(key, { type: "json" });
      if (saved && Date.now() - Date.parse(saved.savedAt) < REPORT_TTL) return json({ ...saved.data, savedAt: saved.savedAt, cached: true });
      return json({ error: saved ? "The saved report expired. Refresh it to pull a new snapshot." : "No saved report yet.", notLoaded: true }, 404);
    }
    const range = monthRange(month);
    const client = view === "links" ? null : await connectedClient(url.origin);
    if (view !== "links" && !client) return json({ error: "Connect Google before loading this report.", needsConnection: true }, 409);
    const result = view === "search" ? await searchData(client, range) : view === "traffic" ? await trafficData(client, range) : await linksData(range);
    const data = { ...result, throughDate: range.endDate, partial: range.partial };
    const savedAt = new Date().toISOString();
    await snapshots.setJSON(key, { savedAt, data });
    return json({ ...data, savedAt, cached: false });
  } catch (error) {
    console.error("Detailed report failed", error);
    return json({ error: error.message || "Could not load report data." }, 500);
  }
};

export const config = { path: "/api/report-detail" };
