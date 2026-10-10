import {
  HttpError, ROLES, authStore, checkPassword, clearCookie, currentUser, hashPassword, loadUsers,
  normEmail, passwordProblem, publicUser, sameOrigin, sessionCookie, setupToken, updateUsers, validEmail, requireSecret,
} from "../lib/users.mjs";
import { verify } from "../lib/token.mjs";

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });

const MAX_FAILS = 8, FAIL_WINDOW = 15 * 60 * 1000;
async function tooManyFails(store, email) {
  const f = await store.get(`fail:${email}`, { type: "json" });
  return f && f.n >= MAX_FAILS && Date.now() - f.first < FAIL_WINDOW;
}
async function noteFail(store, email) {
  const f = await store.get(`fail:${email}`, { type: "json" });
  const fresh = !f || Date.now() - f.first >= FAIL_WINDOW;
  await store.setJSON(`fail:${email}`, fresh ? { n: 1, first: Date.now() } : { n: f.n + 1, first: f.first });
}

async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, "Invalid JSON"); }
}

const setupUrl = async (req, user) => `${new URL(req.url).origin}/login#setup=${await setupToken(user)}`;

export default async (req) => {
  try {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/auth\/?/, "").replace(/\/$/, "");
    const m = req.method;
    if (m !== "GET" && !sameOrigin(req)) return json({ error: "Bad origin" }, 403);
    const store = await authStore();

    // ---- public routes ----
    if (route === "login" && m === "POST") {
      requireSecret();
      const b = await body(req);
      const email = normEmail(b.email);
      if (await tooManyFails(store, email)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      const doc = await loadUsers(store);
      const u = doc.users.find((x) => x.email === email);
      const ok = await checkPassword(String(b.password || ""), u?.hash);
      if (!u || !ok) {
        await noteFail(store, email);
        return json({ error: u && !u.hash ? "This account has no password yet. Ask an admin for a setup link." : "Email or password is incorrect." }, 401);
      }
      await store.delete(`fail:${email}`);
      return json({ user: publicUser(u) }, 200, { "set-cookie": await sessionCookie(u) });
    }

    if (route === "logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": clearCookie });

    if (route === "setup") {
      if (m !== "GET" && m !== "POST") return json({ error: "Method not allowed" }, 405);
      const b = m === "POST" ? await body(req) : {};
      const token = m === "GET" ? url.searchParams.get("token") : b.token;
      const t = await verify(token, requireSecret(), "setup");
      const doc = await loadUsers(store);
      const u = t && doc.users.find((x) => x.email === t.e && x.pwv === t.v);
      if (!u) return json({ error: "This setup link is invalid, expired or already used. Ask an admin for a new one." }, 400);
      if (m === "GET") return json({ email: u.email, name: u.name, reset: !!u.hash });
      const pw = String(b.password || "");
      const problem = passwordProblem(pw);
      if (problem) return json({ error: problem }, 400);
      const hash = await hashPassword(pw);
      const saved = await updateUsers(store, (d) => {
        const x = d.users.find((y) => y.email === t.e && y.pwv === t.v);
        if (!x) throw new HttpError(400, "This setup link was already used.");
        x.hash = hash; x.pwv += 1;
        return { ...x };
      });
      return json({ user: publicUser(saved) }, 200, { "set-cookie": await sessionCookie(saved) });
    }

    // ---- signed-in routes ----
    const me = await currentUser(req, store);
    if (!me) return json({ error: "Not signed in" }, 401);

    if (route === "me" && m === "GET") return json({ user: publicUser(me) });

    // Display names of all accounts, for owner chips and filters.
    if (route === "people" && m === "GET") {
      const doc = await loadUsers(store);
      return json({ people: doc.users.map((u) => u.name) });
    }

    if (route === "password" && m === "POST") {
      const b = await body(req);
      if (!(await checkPassword(String(b.current || ""), me.hash))) return json({ error: "Current password is incorrect." }, 400);
      const problem = passwordProblem(b.password);
      if (problem) return json({ error: problem }, 400);
      const hash = await hashPassword(b.password);
      const saved = await updateUsers(store, (d) => {
        const x = d.users.find((y) => y.email === me.email);
        x.hash = hash; x.pwv += 1;
        return { ...x };
      });
      // other devices are signed out; this one gets a fresh cookie
      return json({ ok: true }, 200, { "set-cookie": await sessionCookie(saved) });
    }

    // ---- admin routes ----
    if (!route.startsWith("users")) return json({ error: "Not found" }, 404);
    if (me.role !== "admin") return json({ error: "Admins only" }, 403);

    if (route === "users" && m === "GET") {
      const doc = await loadUsers(store);
      return json({ users: doc.users.map(publicUser) });
    }

    if (route === "users" && m === "POST") {
      const b = await body(req);
      const email = normEmail(b.email), name = String(b.name || "").trim().slice(0, 40), role = b.role;
      if (!validEmail(email)) return json({ error: "Enter a valid email." }, 400);
      if (!name) return json({ error: "Enter a name." }, 400);
      if (!ROLES.includes(role)) return json({ error: "Invalid role." }, 400);
      const u = await updateUsers(store, (d) => {
        if (d.users.some((x) => x.email === email)) throw new HttpError(400, "That email already has an account.");
        const nu = { email, name, role, hash: "", pwv: 0, createdAt: new Date().toISOString() };
        d.users.push(nu);
        return nu;
      });
      return json({ user: publicUser(u), setupUrl: await setupUrl(req, u) });
    }

    if (route === "users" && m === "PATCH") {
      const b = await body(req);
      const email = normEmail(b.email);
      const u = await updateUsers(store, (d) => {
        const x = d.users.find((y) => y.email === email);
        if (!x) throw new HttpError(404, "No such user.");
        if (b.name !== undefined) {
          const name = String(b.name).trim().slice(0, 40);
          if (!name) throw new HttpError(400, "Enter a name.");
          x.name = name;
        }
        if (b.role !== undefined) {
          if (!ROLES.includes(b.role)) throw new HttpError(400, "Invalid role.");
          if (x.role === "admin" && b.role !== "admin" && d.users.filter((y) => y.role === "admin").length < 2) throw new HttpError(400, "There must be at least one admin.");
          x.role = b.role;
        }
        return { ...x };
      });
      return json({ user: publicUser(u) });
    }

    if (route === "users" && m === "DELETE") {
      const email = normEmail(url.searchParams.get("email"));
      if (email === me.email) return json({ error: "You can't remove your own account." }, 400);
      await updateUsers(store, (d) => {
        const n = d.users.length;
        d.users = d.users.filter((y) => y.email !== email);
        if (d.users.length === n) throw new HttpError(404, "No such user.");
      });
      return json({ ok: true });
    }

    // Creates a one-time link for setting (or resetting) a password. Valid for 7 days or until used.
    if (route === "users/link" && m === "POST") {
      const b = await body(req);
      const doc = await loadUsers(store);
      const u = doc.users.find((x) => x.email === normEmail(b.email));
      if (!u) return json({ error: "No such user." }, 404);
      return json({ setupUrl: await setupUrl(req, u) });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Server error" }, 500);
  }
};

export const config = { path: "/api/auth/*" };
