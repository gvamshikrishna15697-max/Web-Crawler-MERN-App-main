/** Monitoring calendar (Isha / India). Falls back if TIMEZONE unset on host. */
export function getScrapeTimezone() {
  return process.env.TIMEZONE || "Asia/Kolkata";
}

/** YYYY-MM-DD for a Date interpreted in `timeZone`. */
export function ymdInTimeZone(date, timeZone = getScrapeTimezone()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * UTC instant for 00:00:00 on calendar day `ymd` in `timeZone`.
 * `ymd` is YYYY-MM-DD from en-CA formatter.
 */
export function startOfYmdInTimeZone(ymd, timeZone = getScrapeTimezone()) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const offsetMs = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMs);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function startOfTodayInScrapeTz() {
  return startOfYmdInTimeZone(ymdInTimeZone(new Date()));
}

const MS_PER_DAY = 86400000;

export function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Google News `after:` / `before:` (calendar dates in scrape TZ). */
export function googleAfterBefore(rangeFrom, rangeTo) {
  const after = ymdInTimeZone(rangeFrom);
  const before = ymdInTimeZone(rangeTo);
  return { after, before };
}
