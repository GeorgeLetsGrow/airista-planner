const BLOBS_PKG = ["@netlify", "blobs"].join("/");
import { authStore, currentUser, sameOrigin } from "../lib/users.mjs";

const MAX_BYTES = 10 * 1024 * 1024;
const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const safeName = (value) => String(value || "attachment").replace(/[\\/\0\r\n]/g, "_").slice(0, 240) || "attachment";
const validTaskId = (value) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const validAttachmentId = (value) => {
  const slash = value.indexOf("/");
  return slash > 0 && validTaskId(value.slice(0, slash)) && /^[a-f0-9-]{20,}$/.test(value.slice(slash + 1));
};

export default async (req) => {
  const user = await currentUser(req, await authStore());
  if (!user) return json({ error: "Not signed in" }, 401);
  const { getStore } = await import(BLOBS_PKG);
  const files = getStore({ name: "airista-attachments", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id") || "";
    if (!validAttachmentId(id)) return json({ error: "Invalid attachment" }, 400);
    const entry = await files.getWithMetadata(id, { type: "blob" });
    if (!entry) return json({ error: "Attachment not found" }, 404);
    const name = safeName(entry.metadata?.name), type = entry.metadata?.type || "application/octet-stream";
    return new Response(entry.data, { headers: { "content-type": type, "content-length": String(entry.metadata?.size || entry.data.size || 0), "content-disposition": `inline; filename="${name.replace(/"/g, "'")}"`, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  }

  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);

  if (req.method === "POST") {
    const taskId = String(req.headers.get("x-task-id") || "");
    const name = safeName(decodeURIComponent(req.headers.get("x-file-name") || "attachment"));
    const size = Number(req.headers.get("content-length") || 0);
    if (!validTaskId(taskId)) return json({ error: "Invalid task" }, 400);
    if (size > MAX_BYTES) return json({ error: "Attachments must be 10 MB or smaller" }, 413);
    const plan = await getStore({ name: "airista-planner", consistency: "strong" }).get("state", { type: "json" });
    if (!plan?.items?.some((item) => item.id === taskId)) return json({ error: "Task not found" }, 404);
    const data = await req.arrayBuffer();
    if (!data.byteLength) return json({ error: "Choose a non-empty file" }, 400);
    if (data.byteLength > MAX_BYTES) return json({ error: "Attachments must be 10 MB or smaller" }, 413);
    const id = `${taskId}/${crypto.randomUUID()}`, type = String(req.headers.get("content-type") || "application/octet-stream").slice(0, 120);
    await files.set(id, data, { metadata: { name, type, size: data.byteLength, taskId, by: user.name, at: new Date().toISOString() } });
    return json({ attachment: { id, name, type, size: data.byteLength } }, 201);
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id") || "";
    if (!validAttachmentId(id)) return json({ error: "Invalid attachment" }, 400);
    await files.delete(id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/attachments" };
