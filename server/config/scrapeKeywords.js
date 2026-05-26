/**
 * Google News RSS is queried once per phrase (OR in one query often returns fewer hits).
 * Override with SCRAPE_KEYWORDS in .env — pipe-separated, e.g.:
 *   Sadhguru|"Isha Foundation"|"Jaggi Vasudev"
 */
export const DEFAULT_SCRAPE_QUERIES = [
  "Sadhguru",
  '"Jaggi Vasudev"',
  '"Isha Foundation"',
  "Isha Yoga",
  '"Isha Outreach"',
  "Adiyogi",
  "Isha Gramotsavam",
];

export function getScrapeQueries() {
  const raw = process.env.SCRAPE_KEYWORDS;
  if (!raw || !String(raw).trim()) {
    return DEFAULT_SCRAPE_QUERIES;
  }
  return String(raw)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Drop obvious off-topic hits when the query itself is already narrow. */
export function matchesTopic(title, source = "") {
  const hay = `${title || ""} ${source || ""}`;
  return /sadhguru|jaggi\s*vasudev|isha|adiyogi|gramotsavam|dhyanalinga|linga\s*bhairavi/i.test(
    hay,
  );
}
