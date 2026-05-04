import ScrapeRun from "../models/ScrapeRun.js";
import { runGlobalScraper } from "../scraper/runGlobalScraper.js";
import { writeArticlesSnapshot } from "../scraper/snapshot.js";

let currentRun = null;

/** True while a scrape (cron or HTTP) owns the singleton job. */
export function isScrapeInFlight() {
  return currentRun != null;
}

export async function runScrapeJob({ trigger, rangeFrom, rangeTo } = {}) {
  if (currentRun) return currentRun;

  const startedAt = new Date();

  const scraperOptions =
    rangeFrom != null && rangeTo != null
      ? { rangeFrom, rangeTo }
      : {};

  currentRun = (async () => {
    try {
      const stats = await runGlobalScraper(scraperOptions);
      const snapshot = await writeArticlesSnapshot();

      const finishedAt = new Date();
      const run = await ScrapeRun.create({
        trigger,
        status: "success",
        startedAt,
        finishedAt,
        stats,
        snapshot: { generatedAt: snapshot.generatedAt, count: snapshot.count },
      });

      return run.toObject();
    } catch (err) {
      const finishedAt = new Date();
      const run = await ScrapeRun.create({
        trigger,
        status: "error",
        startedAt,
        finishedAt,
        error: err?.message ? String(err.message) : String(err),
      });
      throw Object.assign(new Error(run.error || "Scrape failed"), { runId: run._id });
    } finally {
      currentRun = null;
    }
  })();

  return currentRun;
}

