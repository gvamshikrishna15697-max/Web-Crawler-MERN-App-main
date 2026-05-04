import { randomUUID } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import ScrapeRun from "../models/ScrapeRun.js";
import { isScrapeInFlight, runScrapeJob } from "../jobs/runScrapeJob.js";

const router = express.Router();

const runLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

/** In-memory scrape job snapshots for HTTP clients (polling). */
const jobSnapshots = new Map();

/** Latest manual-trigger job id still running (paired with scrape mutex during HTTP runs only). */
let activeManualJobId = null;

function pruneJobSnapshots() {
  if (jobSnapshots.size <= 40) return;
  const keys = [...jobSnapshots.keys()].sort(
    (a, b) =>
      (jobSnapshots.get(a).startedAt ?? 0) -
      (jobSnapshots.get(b).startedAt ?? 0),
  );
  for (let i = 0; i < keys.length - 30; i += 1) {
    jobSnapshots.delete(keys[i]);
  }
}

router.post("/run", runLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasFrom = Object.prototype.hasOwnProperty.call(body, "from");
    const hasTo = Object.prototype.hasOwnProperty.call(body, "to");

    if (hasFrom !== hasTo) {
      return res.status(400).json({
        error:
          "Provide both `from` and `to` (ISO strings) for a range scrape, or omit both for yesterday-only mode.",
      });
    }

    /** @type {{ trigger: string, rangeFrom?: string, rangeTo?: string }} */
    let jobOpts = { trigger: "manual" };

    if (hasFrom && hasTo) {
      const from = new Date(String(body.from));
      const to = new Date(String(body.to));
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return res.status(400).json({
          error: "Invalid `from` or `to` date. Use ISO-8601 strings.",
        });
      }
      if (from.getTime() >= to.getTime()) {
        return res.status(400).json({ error: "`from` must be before `to`." });
      }
      jobOpts = {
        trigger: "manual",
        rangeFrom: from.toISOString(),
        rangeTo: to.toISOString(),
      };
    }

    // Another manual scrape already started from this HTTP path — same job id for polling.
    if (isScrapeInFlight() && activeManualJobId) {
      return res.status(202).json({
        pending: true,
        alreadyRunning: true,
        jobId: activeManualJobId,
      });
    }
    // Cron (or unrelated) scrape in flight — do not enqueue a conflicting manual job against same mutex.
    if (isScrapeInFlight()) {
      return res.status(409).json({
        error: "ScraperBusy",
        message:
          "A scrape is already in progress (for example scheduled cron). Try again shortly or check GET /api/scrape/last.",
      });
    }

    const jobId = randomUUID();
    activeManualJobId = jobId;
    pruneJobSnapshots();
    jobSnapshots.set(jobId, {
      phase: "running",
      startedAt: Date.now(),
    });

    runScrapeJob(jobOpts)
      .then((run) => {
        jobSnapshots.set(jobId, { phase: "success", run, finishedAt: Date.now() });
      })
      .catch((err) => {
        jobSnapshots.set(jobId, {
          phase: "error",
          error: err?.message ? String(err.message) : String(err),
          finishedAt: Date.now(),
        });
      })
      .finally(() => {
        activeManualJobId = null;
      });

    return res.status(202).json({ pending: true, jobId });
  } catch (err) {
    next(err);
  }
});

router.get("/last", async (_req, res, next) => {
  try {
    const run = await ScrapeRun.findOne().sort({ createdAt: -1 }).lean();
    res.json({ run });
  } catch (err) {
    next(err);
  }
});

router.get("/job/:jobId", (req, res) => {
  const snap = jobSnapshots.get(req.params.jobId);
  if (!snap) {
    return res.status(404).json({ error: "UnknownOrExpiredJob" });
  }
  return res.json({ jobId: req.params.jobId, ...snap });
});

export default router;
