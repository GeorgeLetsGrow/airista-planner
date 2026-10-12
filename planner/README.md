# AiRISTA Work Plan: shared planner

A shared work plan. Edits save to Netlify Blobs through one Netlify Function. Everyone sees the same data, and open tabs pick up changes every 8 seconds.

## Deploy to Netlify
1. Put this `planner/` folder in a Git repo, either as the repo root or as a subfolder.
2. In Netlify, choose **Add new site → Import from Git**. If `planner/` is a subfolder, set **Base directory** to `planner`. The build settings come from `netlify.toml`: publish `public`, functions `netlify/functions`.
3. In **Site configuration → Environment variables**, add:
   - `AUTH_SECRET`: a long random string (32+ characters), e.g. the output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Mark it secret. Changing it later signs everyone out and voids open setup links.
   - `INITIAL_USERS`: the accounts to create on first run, as comma-separated `email:Display name:role` entries (role is `admin` or `user`), e.g. `admin@example.com:Alex:admin,client@example.com:Sam:user`. Only read once, when the account store is empty. Keeps names and emails out of the repo.
   - `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`: credentials for a Google web OAuth client whose authorized redirect URI is `https://<your-site>/api/google-auth/callback`. Mark the secret as secret.
   - `GA4_PROPERTY_ID`: the numeric GA4 property ID (for AiRISTA, `376930282`).
   - `SEARCH_CONSOLE_SITE_URL`: the exact Search Console property identifier (for AiRISTA, `sc-domain:airistaflow.com`).
4. Deploy. Netlify installs `@netlify/blobs` from `package.json`. Blobs need no other setup.
5. Get the first admin in: run `AUTH_SECRET=<same value> node scripts/setup-link.mjs https://<your-site>.netlify.app <your-email>` and open the printed link. Each link works once and expires in 7 days.

Local development: run `npm install`, put `AUTH_SECRET=...` and `INITIAL_USERS=...` in `planner/.env` (git-ignored), then `npx netlify dev`. The edge function only sees env vars from `.env` or the linked site, not from your shell.

## Sign-in and accounts
- Every page and file is behind sign-in. `netlify/edge-functions/require-login.mjs` redirects anyone without a valid session to `/login`; the API functions check the session again and reject removed users and stale sessions.
- Accounts listed in `INITIAL_USERS` are created the first time the auth store is used. No personal details are stored in the code.
- Accounts start without a password. An admin opens the account menu (top right) → **Manage users** → **Setup link**, and sends that link to the person. Admins can also add and remove users, change roles, and issue reset links for forgotten passwords. Users can only use the planner and change their own password.
- Passwords are hashed with scrypt and stored in the `airista-auth` Blobs store. Sessions last 30 days in an HttpOnly cookie. Changing a password signs out the account's other devices. Eight failed sign-ins lock an email out for 15 minutes.
- Changes and comments are attributed to the signed-in account's name. The server ignores any name the browser sends.

## How it works
- `public/js/core.js` holds the seed data and `applyOps`. The browser and the function share it.
- The browser sends small operations (set a field, move a card, add a comment). The server applies them to the latest saved state, so two people editing different fields at the same time don't overwrite each other.
- Every field change is recorded in that card's history with the person's name and the time. Non-card changes (hours, counters, access) go to an activity log.
- If the API is unreachable, for example when the files are opened outside Netlify, the app runs in local preview mode and saves to that browser only.

## Reports
- The **Reports** tab is the SEO scorecard. Each month, type in figures from Search Console, GA4, the rank tracker and the backlink tool (**Edit figures**). Cards show the value, the change from the previous month and a six-month trend. For average position and keyword rank, a lower number counts as better.
- **Keyword rankings** tracks Google positions per keyword and target page. Enter positions for the selected month.
- **SEO tools** links to Search Console, GA4, Looker Studio, Bing Webmaster Tools, Trends and Keyword Planner, plus checks pre-filled for the report site: PageSpeed, Rich Results, schema, robots.txt, sitemap, security headers, backlinks and indexed pages.
- Nothing is pre-filled with numbers. Report data is stored with the plan, and every change is logged in Daily check-in.
- **Sync connected data** imports Search Console clicks, impressions, CTR and average position; GA4 organic sessions and key events; and Ahrefs top-10 organic keywords and live referring domains for the selected month. Indexed pages and Core Web Vitals remain manual.
- **Detailed reporting tabs** load the top Search Console queries and pages, GA4 organic landing pages, and Ahrefs organic keywords and live referring-domain backlinks on demand. Results are searchable, exportable to CSV and saved as persistent seven-day snapshots so page reloads do not spend API usage.
- The first sync by an admin opens Google's read-only consent flow. The resulting refresh token is encrypted with `AUTH_SECRET` and stored server-side in Netlify Blobs; it is never sent to the browser.

## Weekly SEO health check
The **Reports → Weekly health** tab replaces the weekly Claude monitoring run (`seo_crawl.py` + weekly report). It is read-only: nothing on the website or WordPress is changed.
- **Schedule:** `netlify/functions/seo-weekly.mjs` runs every 10 minutes. From 8am New York time on Mondays it starts that week's crawl once. It also restarts any crawl whose runner has gone quiet. Anyone signed in can also click **Run crawl now**.
- **Crawl:** `netlify/lib/seo-crawl.mjs` is a port of `seo/scripts/seo_crawl.py`. It uses the same sitemap, checks, thresholds and Cloudflare-safe pace (one request per second, 2 workers). A full crawl takes about 15 minutes, which is longer than one function can run. So `seo-crawl-run-background.mjs` works in checkpointed batches stored in the `airista-seo` Blobs store, and calls itself again to continue. It is authenticated by a short-lived token signed with `AUTH_SECRET`.
- **Report:** `netlify/lib/seo-report.mjs` compares each crawl with the previous snapshot. It writes Status, What changed, New high-severity issues, Priority pages check and up to 5 Recommended actions. It is rule-based, and every number comes from the crawl, Search Console or GA4. Material changes lead the report: a new high issue; a change to a priority page's status, title, canonical or robots; a missing robots.txt, llms.txt or sitemap; or pages dropping out of the sitemap.
- **Search Console and GA4:** these cover the last full Sunday to Saturday week, compared with the week before. They use the Google connection from the Reports tab. If Google isn't connected, those sections are marked "data pending".
- **Exports:** a client workbook (.xlsx, the same tabs as `seo/reports/weekly/<date>.xlsx`), Markdown, and CSVs of issues, broken links and pages.
- **Settings** (site, priority pages, thresholds, schedule) live in `netlify/lib/seo-config.mjs`, mirroring `seo/config.json`. `SEO_SITE` overrides the site URL.
- **Local check:** `node scripts/local-crawl.mjs <seo/data/crawls> <out dir>` runs the whole pipeline against the live site with an in-memory store, seeding the previous snapshots from the Python crawler. `node scripts/replay-crawl.mjs <seo/data/crawls> <date> <prevDate>` rebuilds a report from an existing Python crawl.

## Dark mode
The moon/sun button in the header switches themes. The choice is saved per browser; without one, the app follows the operating system setting.

## Data
- The first request seeds the store from `core.js`. To reset, delete the `airista-planner` store in Netlify, under **Blobs** in the site dashboard. Deleting `airista-auth` resets accounts to the defaults with no passwords.
- **Export JSON backup** in the footer downloads the current state.
