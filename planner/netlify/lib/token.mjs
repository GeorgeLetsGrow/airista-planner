// Signed tokens (sessions and password-setup links) using Web Crypto only,
// so the same code runs in Netlify Functions (Node) and Edge Functions (Deno).

export const SESSION_COOKIE = "awp_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function getSecret() {
  const v = (globalThis.Netlify?.env?.get?.("AUTH_SECRET")) ?? globalThis.process?.env?.AUTH_SECRET ?? "";
  return v.length >= 32 ? v : "";
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const keyCache = new Map();
function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return keyCache.get(secret);
}

// payload must include p (purpose) and exp (ms epoch)
export async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verify(token, secret, purpose) {
  if (!token || !secret || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(unb64url(body)));
    if (payload.p !== purpose || !(payload.exp > Date.now())) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}
