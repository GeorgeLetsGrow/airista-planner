import { authStore, currentUser } from "../lib/users.mjs";
import { connectedClient } from "../lib/google.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";

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
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Google API returned ${response.status}.`);
  return data;
}

async function ahrefsFetch(path, params) {
  const apiKey = env("AHREFS_API_KEY").trim();
  if (!apiKey) return null;
  const url = new URL(`https://api.ahrefs.com/v3/site-explorer/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || data?.message || `Ahrefs API returned ${response.status}.`);
  return data;
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const store = await authStore();
    if (!(await currentUser(req, store))) return json({ error: "Not signed in" }, 401);

    const url = new URL(req.url);
    const month = url.searchParams.get("month") || "";
    const range = monthRange(month);
    const propertyId = env("GA4_PROPERTY_ID").replace(/^properties\//, "").trim();
    const siteUrl = env("SEARCH_CONSOLE_SITE_URL").trim();
    if (!propertyId || !siteUrl) throw new Error("Google reporting is not configured on this site.");
    const client = await connectedClient(new URL(req.url).origin);
    if (!client) return json({ error: "Connect Google before syncing.", needsConnection: true }, 409);

    const ahrefsTarget = env("AHREFS_TARGET").trim() || "airistaflow.com";
    const [ga4, search, backlinks, keywordHistory] = await Promise.all([
      googleFetch(client, `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }],
        dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
      }),
      googleFetch(client, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        startDate: range.startDate,
        endDate: range.endDate,
        dataState: "final",
      }),
      ahrefsFetch("backlinks-stats", {
        date: range.endDate,
        target: ahrefsTarget,
        mode: "subdomains",
        protocol: "both",
      }),
      ahrefsFetch("keywords-history", {
        select: "date,top3,top4_10",
        date_from: range.startDate,
        date_to: range.endDate,
        target: ahrefsTarget,
        mode: "subdomains",
        history_grouping: "monthly",
      }),
    ]);

    const gaValues = ga4.rows?.[0]?.metricValues || [];
    const sc = search.rows?.[0] || {};
    return json({
      month,
      throughDate: range.endDate,
      partial: range.partial,
      values: {
        clicks: sc.clicks ?? 0,
        impr: sc.impressions ?? 0,
        ctr: sc.ctr == null ? 0 : sc.ctr * 100,
        pos: sc.position ?? 0,
        sessions: Number(gaValues[0]?.value || 0),
        conv: Number(gaValues[1]?.value || 0),
        ...(backlinks ? { refdom: Number(backlinks.metrics?.live_refdomains || 0) } : {}),
        ...(keywordHistory ? {
          top10: Number(keywordHistory.keywords?.[0]?.top3 || 0) + Number(keywordHistory.keywords?.[0]?.top4_10 || 0),
        } : {}),
      },
    });
  } catch (error) {
    console.error("Google report sync failed", error);
    return json({ error: error.message || "Could not load Google reporting data." }, 500);
  }
};

export const config = { path: "/api/google-report" };
