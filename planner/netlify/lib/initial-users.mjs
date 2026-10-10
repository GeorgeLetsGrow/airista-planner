// Accounts created the first time the auth store is used, read from the
// INITIAL_USERS environment variable so no personal details live in the repo.
// Format: comma-separated "email:Display name:role" entries, role = admin | user, e.g.
//   INITIAL_USERS="admin@example.com:Alex:admin,client@example.com:Sam:user"
// After the first run, admins manage accounts from the app (account menu → Manage users).
function readEnv() {
  return (globalThis.Netlify?.env?.get?.("INITIAL_USERS")) ?? globalThis.process?.env?.INITIAL_USERS ?? "";
}

export default function initialUsers() {
  return readEnv().split(",").map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [email = "", name = "", role = "user"] = entry.split(":").map((x) => x.trim());
    return { email, name: name || email.split("@")[0], role: role === "admin" ? "admin" : "user" };
  }).filter((u) => u.email.includes("@"));
}
