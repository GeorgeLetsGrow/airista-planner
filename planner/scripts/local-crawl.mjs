// Runs the full in-app weekly crawl pipeline locally with an in-memory Blobs stand-in.
// node scripts/local-crawl.mjs <crawls dir with previous snapshot.json files> <out dir>
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startJob, runSteps } from "../netlify/lib/seo-jobs.mjs";
import { weeklyWorkbook } from "../netlify/lib/seo-xlsx.mjs";

class MemStore {
  constructor() { this.m = new Map(); this.v = 0; }
  async get(key, { type } = {}) { const e = this.m.get(key); return e ? (type === "json" ? JSON.parse(e.data) : e.data) : null; }
  async getWithMetadata(key, { type } = {}) { const e = this.m.get(key); return e ? { data: type === "json" ? JSON.parse(e.data) : e.data, etag: e.etag, metadata: {} } : null; }
  async setJSON(key, value, opts = {}) { return this.set(key, JSON.stringify(value), opts); }
  async set(key, data, { onlyIfMatch, onlyIfNew } = {}) {
    const cur = this.m.get(key);
    if (onlyIfNew && cur) return { modified: false };
    if (onlyIfMatch && cur?.etag !== onlyIfMatch) return { modified: false };
    this.m.set(key, { data, etag: String(++this.v) });
    return { modified: true };
  }
  async list({ prefix = "" } = {}) { return { blobs: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: this.m.get(key).etag })), directories: [] }; }
  async delete(key) { this.m.delete(key); }
}

const [crawls, out] = process.argv.slice(2);
const store = new MemStore();
for (const d of readdirSync(crawls)) {
  const f = join(crawls, d, "snapshot.json");
  if (existsSync(f)) await store.set(`snapshots/${d}.json`, readFileSync(f, "utf8"));
}
const { job } = await startJob(store, { trigger: "manual", by: "local test" });
console.log("job", job.id, job.date);
let last = "";
const tick = setInterval(async () => {
  const j = await store.get("job", { type: "json" });
  const line = j?.log?.at(-1);
  if (line && line !== last) { console.log(line); last = line; }
}, 5000);
let result;
do { result = await runSteps(store, job.id, ""); console.log("runSteps:", result); } while (result === "continue");
clearInterval(tick);
const final = await store.get("job", { type: "json" });
console.log((final.log || []).slice(-3).join("\n"));
if (final.status !== "done") process.exit(1);
mkdirSync(out, { recursive: true });
const report = await store.get(`reports/${final.date}.json`, { type: "json" });
const crawl = await store.get(`crawls/${final.date}.json`, { type: "json" });
writeFileSync(join(out, `${final.date}.report.json`), JSON.stringify(report, null, 1));
writeFileSync(join(out, `${final.date}.crawl.json`), JSON.stringify(crawl));
writeFileSync(join(out, `${final.date}.snapshot.json`), JSON.stringify(await store.get(`snapshots/${final.date}.json`, { type: "json" }), null, 1));
writeFileSync(join(out, `${final.date}.md`), await store.get(`reports/${final.date}.md`, { type: "text" }));
writeFileSync(join(out, `${final.date}.xlsx`), await weeklyWorkbook(report, crawl));
console.log("WROTE", join(out, `${final.date}.md`));
