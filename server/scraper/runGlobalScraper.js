import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import Article from "../models/Article.js";
import { locales } from "../config/locales.js";
import { blockedPublishers } from "../config/blockedPublishers.js";
import {
  getScrapeQueries,
  matchesTopic,
} from "../config/scrapeKeywords.js";
import {
  findPublication,
  normalizePublisherName,
} from "../config/publications.js";
import {
  addDays,
  getScrapeTimezone,
  googleAfterBefore,
  startOfTodayInScrapeTz,
  ymdInTimeZone,
} from "../utils/scrapeDates.js";

const MS_PER_DAY = 86400000;
const FETCH_CONCURRENCY = Math.min(
  12,
  Math.max(2, Number(process.env.SCRAPE_FETCH_CONCURRENCY) || 6),
);

function computeWhenForLookback(rangeStartDate) {
  const start = rangeStartDate.getTime();
  const lookbackDays = Math.max(
    2,
    Math.ceil((Date.now() - start) / MS_PER_DAY) + 1,
  );
  if (lookbackDays <= 2) return "2d";
  if (lookbackDays <= 7) return "7d";
  if (lookbackDays <= 30) return "30d";
  return "1y";
}

function isBlockedSource(sourceText) {
  const sourceLower = (sourceText || "").toLowerCase();
  return blockedPublishers.some((b) => sourceLower.includes(b));
}

function normalizeItemSource(item) {
  const src = item?.source;
  if (!src) return "";
  if (typeof src === "string") return src;
  if (typeof src === "object" && typeof src["#text"] === "string") return src["#text"];
  return "";
}

function normalizeItems(parsed) {
  const items = parsed?.rss?.channel?.item ?? [];
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRss(url, { timeoutMs, retries }) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await axios.get(url, {
        timeout: timeoutMs,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (err) {
      if (attempt >= retries) throw err;
      const backoff = 500 * 2 ** attempt;
      await sleep(backoff);
      attempt += 1;
    }
  }
}

function parseDateInput(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function buildGoogleNewsQuery(keywordPhrase, { whenUsed, rangeFrom, rangeTo, rangeMode }) {
  const parts = [keywordPhrase.trim()];
  if (rangeMode && rangeFrom && rangeTo) {
    const { after, before } = googleAfterBefore(rangeFrom, rangeTo);
    parts.push(`after:${after}`, `before:${before}`);
  } else if (whenUsed) {
    parts.push(`when:${whenUsed}`);
  }
  return parts.join(" ");
}

async function mapPool(items, worker, concurrency) {
  const results = [];
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

export async function runGlobalScraper({
  when: whenOverride,
  rangeFrom: rangeFromInput,
  rangeTo: rangeToInput,
  timeoutMs = 20_000,
  retries = 2,
  /** yesterday | today | both — default window when not using an explicit range */
  defaultWindow = process.env.SCRAPE_DEFAULT_WINDOW || "both",
} = {}) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const tz = getScrapeTimezone();
  const today = startOfTodayInScrapeTz();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  const rf = parseDateInput(rangeFromInput);
  const rt = parseDateInput(rangeToInput);
  const rangeMode = rf != null && rt != null;

  let whenUsed;
  if (rangeMode) {
    whenUsed = whenOverride ?? computeWhenForLookback(rf);
  } else {
    whenUsed = whenOverride ?? "7d";
  }

  const keywordQueries = getScrapeQueries();
  const seenUrls = new Set();

  const stats = {
    mode: rangeMode ? "range" : defaultWindow,
    timeZone: tz,
    whenUsed,
    keywordQueries,
    startedAt: new Date().toISOString(),
    today: today.toISOString(),
    yesterday: yesterday.toISOString(),
    localesTotal: locales.length,
    queriesPerLocale: keywordQueries.length,
    localesSucceeded: 0,
    localesFailed: 0,
    fetchTasksTotal: locales.length * keywordQueries.length,
    fetchTasksSucceeded: 0,
    fetchTasksFailed: 0,
    fetchedItems: 0,
    acceptedItems: 0,
    upserted: 0,
    enriched: 0,
    skippedLocales: [],
    duplicateUrlsSkipped: 0,
    unknownPublishers: [],
  };
  const unknownPublishersSet = new Set();

  if (rangeMode) {
    stats.rangeFrom = rf.toISOString();
    stats.rangeTo = rt.toISOString();
    stats.rangeFromLocal = ymdInTimeZone(rf, tz);
    stats.rangeToLocal = ymdInTimeZone(addDays(rt, -1), tz);
  }

  function passesDateFilter(articleDate) {
    if (rangeMode) {
      return articleDate >= rf && articleDate < rt;
    }
    const win = String(defaultWindow).toLowerCase();
    if (win === "today") {
      return articleDate >= today && articleDate < tomorrow;
    }
    if (win === "yesterday") {
      return articleDate >= yesterday && articleDate < today;
    }
    return articleDate >= yesterday && articleDate < tomorrow;
  }

  const fetchTasks = [];
  for (const locale of locales) {
    for (const keywordPhrase of keywordQueries) {
      fetchTasks.push({ locale, keywordPhrase });
    }
  }

  await mapPool(
    fetchTasks,
    async ({ locale, keywordPhrase }) => {
      const googleQ = buildGoogleNewsQuery(keywordPhrase, {
        whenUsed: rangeMode ? null : whenUsed,
        rangeFrom: rf,
        rangeTo: rt,
        rangeMode,
      });
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(googleQ)}&${locale.param}`;

      try {
        const resp = await fetchRss(url, { timeoutMs, retries });
        const parsed = parser.parse(resp.data);
        const items = normalizeItems(parsed);
        stats.fetchTasksSucceeded += 1;
        stats.fetchedItems += items.length;

        const ops = [];
        const narrowQuery =
          keywordPhrase.includes("Sadhguru") ||
          keywordPhrase.includes("Isha") ||
          keywordPhrase.includes("Jaggi") ||
          keywordPhrase.includes("Adiyogi");

        for (const item of items) {
          const pubDateText = item?.pubDate ? String(item.pubDate) : "";
          const articleDate = pubDateText ? new Date(pubDateText) : null;
          if (!articleDate || Number.isNaN(articleDate.getTime())) continue;

          const sourceText = normalizeItemSource(item);
          if (isBlockedSource(sourceText)) continue;

          const title = item?.title ? String(item.title) : "";
          const link = item?.link ? String(item.link) : "";
          if (!title || !link) continue;

          if (!narrowQuery && !matchesTopic(title, sourceText)) continue;

          if (!passesDateFilter(articleDate)) continue;

          if (seenUrls.has(link)) {
            stats.duplicateUrlsSkipped += 1;
            continue;
          }
          seenUrls.add(link);

          const pubMatch = findPublication(sourceText);
          const publisherKey = normalizePublisherName(sourceText);
          if (pubMatch) {
            stats.enriched += 1;
          } else if (sourceText) {
            unknownPublishersSet.add(sourceText);
          }

          stats.acceptedItems += 1;
          ops.push({
            updateOne: {
              filter: { url: link },
              update: {
                $setOnInsert: {
                  title,
                  source: sourceText || "Unknown",
                  locale: locale.name,
                  url: link,
                  pubDate: articleDate,
                  pubDateText,
                },
                $set: {
                  publisherKey,
                  country: pubMatch?.country || "",
                  language: pubMatch?.language || "",
                  category: pubMatch?.category || "",
                },
              },
              upsert: true,
            },
          });
        }

        if (ops.length) {
          const result = await Article.bulkWrite(ops, { ordered: false });
          stats.upserted += result.upsertedCount ?? 0;
        }
      } catch (err) {
        stats.fetchTasksFailed += 1;
        // eslint-disable-next-line no-console
        console.log(
          `Skipped fetch: ${locale.name} / ${keywordPhrase}`,
          err?.message || err,
        );
      }
    },
    FETCH_CONCURRENCY,
  );

  stats.localesSucceeded = locales.length;
  stats.localesFailed = 0;
  stats.unknownPublishers = [...unknownPublishersSet].sort().slice(0, 100);
  stats.unknownPublishersTotal = unknownPublishersSet.size;
  stats.finishedAt = new Date().toISOString();
  return stats;
}
