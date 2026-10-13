const BLOBS_PKG = ["@netlify", "blobs"].join("/");

export const DEFAULT_SETTINGS = { emailEnabled: false, mentionEmails: true, assignmentEmails: true, fromName: "AiRISTA Work Plan", replyTo: "" };
const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function configStore() {
  const { getStore } = await import(BLOBS_PKG);
  return getStore({ name: "airista-config", consistency: "strong" });
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await (await configStore()).get("settings", { type: "json" })) || {}) };
}

export async function saveSettings(input) {
  const settings = {
    emailEnabled: !!input.emailEnabled,
    mentionEmails: !!input.mentionEmails,
    assignmentEmails: !!input.assignmentEmails,
    fromName: String(input.fromName || DEFAULT_SETTINGS.fromName).trim().slice(0, 80) || DEFAULT_SETTINGS.fromName,
    replyTo: String(input.replyTo || "").trim().toLowerCase().slice(0, 200),
  };
  await (await configStore()).setJSON("settings", settings);
  return settings;
}

export function emailStatus() {
  const from = env("RESEND_FROM");
  return { apiKeyConfigured: !!env("RESEND_API_KEY"), fromConfigured: !!from, fromAddress: from };
}

export async function sendEmail({ to, subject, html, settings }) {
  const key = env("RESEND_API_KEY"), fromAddress = env("RESEND_FROM");
  if (!key || !fromAddress) throw new Error("RESEND_API_KEY and RESEND_FROM must be configured in Netlify.");
  const body = { from: `${settings.fromName} <${fromAddress}>`, to: [to], subject, html };
  if (settings.replyTo) body.reply_to = settings.replyTo;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || `Resend returned ${response.status}`);
  return result;
}

export async function sendNewNotificationEmails(notifications, users, origin) {
  if (!notifications.length) return;
  const settings = await getSettings();
  if (!settings.emailEnabled) return;
  for (const n of notifications) {
    if ((n.type === "mention" && !settings.mentionEmails) || (n.type === "assignment" && !settings.assignmentEmails)) continue;
    const recipient = users.find((u) => u.name === n.to);
    if (!recipient?.email) continue;
    const taskUrl = `${origin}/?task=${encodeURIComponent(n.itemId)}`;
    const subject = n.type === "mention" ? `${n.by} mentioned you in AiRISTA Work Plan` : `${n.by} assigned you a task in AiRISTA Work Plan`;
    const intro = n.type === "mention" ? `<strong>${esc(n.by)}</strong> mentioned you in a task comment:` : `<strong>${esc(n.by)}</strong> assigned you a task:`;
    await sendEmail({ to: recipient.email, subject, settings, html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033"><p>${intro}</p><blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #ef7d23;background:#f7f8fb">${esc(n.text)}</blockquote><p><a href="${esc(taskUrl)}" style="color:#d96512;font-weight:700">Open the task</a></p><p style="color:#6b7280;font-size:12px">AiRISTA Work Plan</p></div>` });
  }
}
