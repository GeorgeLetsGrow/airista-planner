import { authStore, currentUser, loadUsers, sameOrigin } from "../lib/users.mjs";
import { emailStatus, getSettings, saveSettings, sendEmail } from "../lib/settings.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const usersStore = await authStore(), me = await currentUser(req, usersStore);
  if (!me) return json({ error: "Not signed in" }, 401);
  if (me.role !== "admin") return json({ error: "Administrator access required" }, 403);

  if (req.method === "GET") return json({ settings: await getSettings(), status: emailStatus() });
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (req.method === "PATCH") return json({ settings: await saveSettings(body) });
  if (req.method === "POST" && body.action === "test-email") {
    try {
      const settings = await getSettings();
      await sendEmail({ to: me.email, subject: "AiRISTA Work Plan email test", settings, html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Email notifications are connected</h2><p>This test was sent to ${me.email} from the planner's administrator settings.</p></div>` });
      return json({ ok: true, sentTo: me.email });
    } catch (error) { return json({ error: error.message }, 502); }
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/settings" };
