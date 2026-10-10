// User store (Netlify Blobs) and password hashing. Node-only.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_DAYS, getCookie, getSecret, sign, verify } from "./token.mjs";
import initialUsers from "./initial-users.mjs";

const BLOBS_PKG = ["@netlify", "blobs"].join("/");
const KEY = "users";
export const ROLES = ["admin", "user"];
export const SETUP_DAYS = 7;

export async function authStore() {
  const { getStore } = await import(BLOBS_PKG);
  return getStore({ name: "airista-auth", consistency: "strong" });
}

export const normEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 200);
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role, hasPassword: !!u.hash, createdAt: u.createdAt });

function seedDoc() {
  const at = new Date().toISOString();
  return { users: initialUsers().map((u) => ({ email: normEmail(u.email), name: u.name, role: u.role, hash: "", pwv: 0, createdAt: at })) };
}

export async function loadUsers(store) {
  let doc = await store.get(KEY, { type: "json" });
  if (!doc) {
    await store.setJSON(KEY, seedDoc(), { onlyIfNew: true });
    doc = await store.get(KEY, { type: "json" });
  }
  return doc;
}

// Read-modify-write with optimistic concurrency. fn mutates doc; may return a value or throw HttpError.
export async function updateUsers(store, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await loadUsers(store);
    const cur = await store.getWithMetadata(KEY, { type: "json" });
    const doc = cur.data;
    const result = await fn(doc);
    const res = await store.setJSON(KEY, doc, { onlyIfMatch: cur.etag });
    if (!res || res.modified !== false) return result;
    await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
  }
  throw new HttpError(409, "Busy, please retry");
}

// Reject cross-site writes: browsers send Origin on POST/PATCH/DELETE.
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---- passwords ----
const SCRYPT = { N: 16384, r: 8, p: 1 };
const scryptAsync = (pw, salt, len, opts) => new Promise((res, rej) => scrypt(pw, salt, len, opts, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    // keep timing similar when the user has no password yet
    await scryptAsync(pw, "x".repeat(16), 64, SCRYPT);
    return false;
  }
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(pw, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "Use at most 200 characters.";
  return "";
}

// ---- sessions ----
export function requireSecret() {
  const secret = getSecret();
  if (!secret) throw new HttpError(500, "AUTH_SECRET is not configured on this site.");
  return secret;
}

export async function sessionCookie(user) {
  const secret = requireSecret();
  const token = await sign({ p: "s", e: user.email, v: user.pwv, exp: Date.now() + SESSION_DAYS * 864e5 }, secret);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// Returns the signed-in user record, or null. Sessions die when the password changes or the user is removed.
export async function currentUser(req, store) {
  const secret = getSecret();
  const s = await verify(getCookie(req, SESSION_COOKIE), secret, "s");
  if (!s) return null;
  const doc = await loadUsers(store);
  const u = doc.users.find((x) => x.email === s.e);
  return u && u.hash && u.pwv === s.v ? u : null;
}

export async function setupToken(user) {
  return sign({ p: "setup", e: user.email, v: user.pwv, exp: Date.now() + SETUP_DAYS * 864e5 }, requireSecret());
}
