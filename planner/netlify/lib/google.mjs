import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { requireSecret } from "./users.mjs";

const BLOBS_PKG = ["@netlify", "blobs"].join("/");
const TOKEN_KEY = "oauth";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];
const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";

export function oauthClient(origin) {
  const id = env("GOOGLE_OAUTH_CLIENT_ID").trim();
  const secret = env("GOOGLE_OAUTH_CLIENT_SECRET").trim();
  if (!id || !secret) throw new Error("Google OAuth is not configured on this site.");
  return new OAuth2Client(id, secret, `${origin}/api/google-auth/callback`);
}

async function tokenStore() {
  const { getStore } = await import(BLOBS_PKG);
  return getStore({ name: "airista-google", consistency: "strong" });
}

const key = () => createHash("sha256").update(requireSecret()).digest();
function encrypt(value) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), data: data.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function decrypt(value) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8");
}

export async function saveRefreshToken(token) {
  await (await tokenStore()).setJSON(TOKEN_KEY, encrypt(token));
}
export async function hasRefreshToken() {
  return !!(await (await tokenStore()).get(TOKEN_KEY, { type: "json" }));
}
export async function connectedClient(origin) {
  const saved = await (await tokenStore()).get(TOKEN_KEY, { type: "json" });
  if (!saved) return null;
  const client = oauthClient(origin);
  client.setCredentials({ refresh_token: decrypt(saved) });
  return client;
}
