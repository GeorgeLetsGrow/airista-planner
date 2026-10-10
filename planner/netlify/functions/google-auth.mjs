import { authStore, currentUser, requireSecret, sameOrigin } from "../lib/users.mjs";
import { GOOGLE_SCOPES, hasRefreshToken, oauthClient, saveRefreshToken } from "../lib/google.mjs";
import { sign, verify } from "../lib/token.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  try {
    const url = new URL(req.url), origin = url.origin;
    const route = url.pathname.replace(/^\/api\/google-auth\/?/, "").replace(/\/$/, "");
    const store = await authStore(), me = await currentUser(req, store);
    if (!me) return json({ error: "Not signed in" }, 401);

    if (route === "status" && req.method === "GET") return json({ connected: await hasRefreshToken() });
    if (route === "start" && req.method === "POST") {
      if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
      if (me.role !== "admin") return json({ error: "Admins only" }, 403);
      const state = await sign({ p: "google-oauth", e: me.email, exp: Date.now() + 10 * 60 * 1000 }, requireSecret());
      const client = oauthClient(origin);
      return json({ url: client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GOOGLE_SCOPES,
        state,
        include_granted_scopes: true,
      }) });
    }
    if (route === "callback" && req.method === "GET") {
      const state = await verify(url.searchParams.get("state"), requireSecret(), "google-oauth");
      if (!state || state.e !== me.email || me.role !== "admin") return json({ error: "This Google connection request is invalid or expired." }, 400);
      if (url.searchParams.get("error")) return Response.redirect(`${origin}/#reports`, 302);
      const code = url.searchParams.get("code");
      if (!code) return json({ error: "Google did not return an authorization code." }, 400);
      const { tokens } = await oauthClient(origin).getToken(code);
      if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve access again.");
      await saveRefreshToken(tokens.refresh_token);
      return Response.redirect(`${origin}/#reports`, 302);
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Google OAuth failed", error);
    return json({ error: error.message || "Google connection failed." }, 500);
  }
};

export const config = { path: "/api/google-auth/*" };
