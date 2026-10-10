// Prints a one-time password setup link for an account that has never set a password.
// Use this once to get the first admin in; after that, admins issue links from the app.
//
//   AUTH_SECRET=... node scripts/setup-link.mjs https://your-site.netlify.app you@example.com
//
// With no emails, links are printed for every entry in INITIAL_USERS.
import { sign } from "../netlify/lib/token.mjs";
import initialUsers from "../netlify/lib/initial-users.mjs";
import { SETUP_DAYS } from "../netlify/lib/users.mjs";

const [site, ...emails] = process.argv.slice(2);
const secret = process.env.AUTH_SECRET || "";
if (!site || !/^https?:\/\//.test(site)) {
  console.error("Usage: AUTH_SECRET=... node scripts/setup-link.mjs <site-url> [email ...]");
  process.exit(1);
}
if (secret.length < 32) {
  console.error("AUTH_SECRET must be set (32+ characters) and match the value configured on Netlify.");
  process.exit(1);
}
const targets = emails.length ? emails.map((e) => e.trim().toLowerCase()) : initialUsers().map((u) => u.email.toLowerCase());
if (!targets.length) {
  console.error("Pass one or more emails, or set INITIAL_USERS.");
  process.exit(1);
}
for (const email of targets) {
  const token = await sign({ p: "setup", e: email, v: 0, exp: Date.now() + SETUP_DAYS * 864e5 }, secret);
  console.log(`${email}\n  ${site.replace(/\/$/, "")}/login#setup=${token}\n`);
}
