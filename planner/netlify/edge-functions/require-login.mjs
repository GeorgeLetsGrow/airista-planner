// Gatekeeper for every page and file: no valid session cookie, no content.
// The API functions re-check the session themselves (including revocation),
// so this only needs to verify the cookie signature.
import { SESSION_COOKIE, getCookie, getSecret, verify } from "../lib/token.mjs";

const PUBLIC = new Set(["/login", "/login.html", "/js/login.js", "/js/theme.js", "/styles.css", "/app.css", "/assets/airista-logo.png", "/assets/letsgrow-martech-logo.png", "/assets/letsgrow-martech-logo-dark.png", "/favicon.ico"]);

export default async (req, context) => {
  const url = new URL(req.url);
  const p = url.pathname;
  // The SEO crawl runner is server-to-server (scheduled crawl) and verifies its own signed token.
  if (PUBLIC.has(p) || p.startsWith("/tokens/") || p.startsWith("/api/auth/") || p === "/api/mcp" || p === "/.netlify/functions/seo-crawl-run-background") return context.next();

  const session = await verify(getCookie(req, SESSION_COOKIE), getSecret(), "s");
  if (session) return context.next();

  if (p.startsWith("/api/")) {
    return Response.json({ error: "Not signed in" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const destination = p + url.search;
  const next = (p === "/" || p === "/index.html") && !url.search ? "" : `?next=${encodeURIComponent(destination)}`;
  return new Response(null, { status: 302, headers: { location: `/login${next}`, "cache-control": "no-store" } });
};

export const config = { path: "/*" };
