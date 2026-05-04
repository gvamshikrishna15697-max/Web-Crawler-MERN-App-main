import cron from "node-cron";
import { runScrapeJob } from "./runScrapeJob.js";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  const pattern = process.env.SCRAPE_CRON;
  if (!pattern) {
    // eslint-disable-next-line no-console
    console.log("SCRAPE_CRON not set; scheduler disabled");
    return;
  }

  const timezone = process.env.TIMEZONE || undefined;

  cron.schedule(
    pattern,
    async () => {
      // eslint-disable-next-line no-console
      console.log("Cron: starting scrape job");
      try {
        await runScrapeJob({ trigger: "cron" });
        // eslint-disable-next-line no-console
        console.log("Cron: scrape job finished");
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Cron: scrape job failed", err?.message || err);
      }
    },
    { timezone },
  );

  // eslint-disable-next-line no-console
  console.log(`Scheduler enabled: ${pattern}${timezone ? ` (${timezone})` : ""}`);
}

