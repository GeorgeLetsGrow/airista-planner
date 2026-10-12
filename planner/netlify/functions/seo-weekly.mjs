// Schedule for the weekly health check, and watchdog for running crawls.
// Runs every 10 minutes: starts Monday's crawl once (from 8am New York time) and resumes any
// crawl whose runner stopped checkpointing (e.g. a lost invocation).
import { SEO, localDate, localParts } from "../lib/seo-config.mjs";
import { seoStore, startJob, kick, STALE_MS } from "../lib/seo-jobs.mjs";

export default async (req) => {
  const store = await seoStore();
  const origin = new URL(req.url).origin;
  const job = await store.get("job", { type: "json" });

  if (job?.status === "running") {
    if (Date.now() - Date.parse(job.heartbeat) > STALE_MS) {
      console.log(`SEO watchdog: resuming crawl ${job.id} (phase ${job.phase})`);
      await kick(job, origin).catch((e) => console.error("SEO watchdog kick failed", e));
    }
    return;
  }

  const { weekday, hour } = localParts();
  if (weekday !== SEO.schedule.weekday || hour < SEO.schedule.hour) return;
  const today = localDate();
  if (job?.date === today) return; // already ran (or failed) today; a manual re-run is available in the app
  const { job: started, started: isNew } = await startJob(store, { trigger: "schedule" });
  if (isNew) await kick(started, origin);
};

export const config = { schedule: "*/10 * * * *" };
