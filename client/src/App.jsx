import { useEffect, useMemo, useState } from "react";
import "./App.css";

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST /api/scrape/run returns 202 + jobId; work runs in background (avoids dev-proxy timeouts). */
async function postScrapeJob(body) {
  const res = await fetch("/api/scrape/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = [data.error, data.message].filter(Boolean).join(" — ");
    const text = detail || (await res.text().catch(() => ""));
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  if (!data.jobId) {
    throw new Error("Server did not return a job id");
  }
  return data.jobId;
}

async function pollScrapeJob(jobId, { timeoutMs = 30 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await fetchJson(`/api/scrape/job/${jobId}`);
    if (st.phase === "success") return st.run ?? null;
    if (st.phase === "error") {
      throw new Error(st.error || "Scrape failed");
    }
    await sleep(1600);
  }
  throw new Error(
    "Timed out waiting for the scraper. It may still be running — open /api/scrape/last or refresh the dashboard.",
  );
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString();
}

function buildArticleQuery(params) {
  const {
    q,
    locale,
    source,
    fromApplied,
    toApplied,
    page,
    limit,
  } = params;
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (locale) search.set("locale", locale);
  if (source) search.set("source", source);
  if (fromApplied)
    search.set("from", new Date(fromApplied).toISOString());
  if (toApplied) search.set("to", new Date(toApplied).toISOString());
  search.set("page", String(page));
  search.set("limit", String(limit));
  search.set("sort", "pubDateDesc");
  return search.toString();
}

function App() {
  const [q, setQ] = useState("");
  const [locale, setLocale] = useState("");
  const [source, setSource] = useState("");
  /** Draft date range (inputs only; no fetch until Apply). */
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  /** Applied date range (sent to API as pubDate filter). */
  const [fromApplied, setFromApplied] = useState("");
  const [toApplied, setToApplied] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [lastRun, setLastRun] = useState(null);
  const [running, setRunning] = useState(false);

  const queryString = useMemo(
    () =>
      buildArticleQuery({
        q,
        locale,
        source,
        fromApplied,
        toApplied,
        page,
        limit,
      }),
    [q, locale, source, fromApplied, toApplied, page, limit],
  );

  async function load(overrides = {}) {
    setLoading(true);
    setError("");
    try {
      const qs = buildArticleQuery({
        q: overrides.q ?? q,
        locale: overrides.locale ?? locale,
        source: overrides.source ?? source,
        fromApplied:
          overrides.fromApplied !== undefined ? overrides.fromApplied : fromApplied,
        toApplied: overrides.toApplied !== undefined ? overrides.toApplied : toApplied,
        page: overrides.page ?? page,
        limit: overrides.limit ?? limit,
      });
      const data = await fetchJson(`/api/articles?${qs}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadLastRun() {
    try {
      const data = await fetchJson("/api/scrape/last");
      setLastRun(data.run || null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadLastRun();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  function resetToFirstPage() {
    setPage(1);
  }

  function applyDateFilter() {
    if (fromDraft && toDraft) {
      const a = new Date(fromDraft).getTime();
      const b = new Date(toDraft).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b) && b < a) {
        setError('"To" must be after "From".');
        return;
      }
    }
    setError("");
    setFromApplied(fromDraft);
    setToApplied(toDraft);
    setPage(1);
  }

  function clearDateFilter() {
    setError("");
    setFromDraft("");
    setToDraft("");
    setFromApplied("");
    setToApplied("");
    setPage(1);
  }

  async function runScraperYesterday() {
    setRunning(true);
    setError("");
    try {
      const jobId = await postScrapeJob({});
      const run = await pollScrapeJob(jobId);
      setLastRun(run);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  async function scrapeDateRangeFromGoogle() {
    if (!fromDraft || !toDraft) {
      setError("Set both From and To, then fetch from Google for that range.");
      return;
    }
    const a = new Date(fromDraft).getTime();
    const b = new Date(toDraft).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) {
      setError("Invalid From or To date.");
      return;
    }
    if (b <= a) {
      setError('"To" must be after "From".');
      return;
    }
    setRunning(true);
    setError("");
    try {
      const fromIso = new Date(fromDraft).toISOString();
      const toIso = new Date(toDraft).toISOString();
      const jobId = await postScrapeJob({ from: fromIso, to: toIso });
      const run = await pollScrapeJob(jobId);
      setLastRun(run);
      setFromApplied(fromDraft);
      setToApplied(toDraft);
      setPage(1);
      await load({ fromApplied: fromDraft, toApplied: toDraft, page: 1 });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="titleRow">
            <h1>Global News Dashboard</h1>
            <a className="exportLink" href="/api/articles/export.json" target="_blank" rel="noreferrer">
              Download JSON
            </a>
          </div>
          <p className="subtitle">
            Google News RSS scraper with URL dedupe in MongoDB. Quick run uses “yesterday” only; pick dates below to fetch a range from Google.
          </p>
        </div>

        <div className="runCard">
          <div className="runMeta">
            <div className="runLabel">Last run</div>
            <div className="runValue">
              {lastRun?.finishedAt ? formatDate(lastRun.finishedAt) : "—"}
            </div>
            <div className={`pill ${lastRun?.status === "success" ? "ok" : "warn"}`}>
              {lastRun?.status || "unknown"}
            </div>
          </div>

          <div className="runActions">
            <button className="primary" disabled={running} onClick={runScraperYesterday}>
              {running ? "Scraping…" : "Run scraper (yesterday only)"}
            </button>
          </div>
        </div>
      </header>

      <section className="filters">
        <div className="field">
          <label>Search title</label>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetToFirstPage();
            }}
            placeholder="e.g. Sadhguru"
          />
        </div>

        <div className="field">
          <label>Locale</label>
          <input
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              resetToFirstPage();
            }}
            placeholder="e.g. English (India)"
          />
        </div>

        <div className="field">
          <label>Source</label>
          <input
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              resetToFirstPage();
            }}
            placeholder="e.g. The Hindu"
          />
        </div>

        <div className="field fieldSpan2">
          <label>Date range (pubDate): filter DB or fetch from Google</label>
          <div className="dateRow">
            <input
              type="datetime-local"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              aria-label="From date"
            />
            <span className="dateSep">→</span>
            <input
              type="datetime-local"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              aria-label="To date"
            />
          </div>
          <p className="fieldHint">
            <strong>Filter stored articles</strong> — query Mongo only. <strong>Fetch from Google</strong> — starts the
            scraper in the background and polls status (large ranges can take many minutes). <code>To</code> is
            exclusive. RSS lookback is limited (tiers up to <code>when:1y</code>).
          </p>
          <div className="dateActions">
            <button type="button" className="secondary" onClick={applyDateFilter}>
              Filter stored articles
            </button>
            <button
              type="button"
              className="primary narrow"
              disabled={running || !fromDraft || !toDraft}
              onClick={scrapeDateRangeFromGoogle}
            >
              {running ? "Scraping…" : "Fetch from Google for this range"}
            </button>
            <button type="button" className="ghost" onClick={clearDateFilter}>
              Clear dates
            </button>
          </div>
        </div>

        <div className="field">
          <label>Rows</label>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              resetToFirstPage();
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="tableWrap">
        <div className="tableHeader">
          <div className="muted">
            {loading ? "Loading…" : `${total.toLocaleString()} results`}
          </div>
          <div className="pager">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            <div className="pagerText">
              Page <b>{page}</b> / {totalPages}
            </div>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Publisher</th>
              <th>Locale</th>
              <th>Date Published</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id || a.url}>
                <td className="titleCell">{a.title}</td>
                <td className="nowrap">{a.source || "Unknown"}</td>
                <td className="nowrap">{a.locale}</td>
                <td className="nowrap">{formatDate(a.pubDate || a.pubDateText)}</td>
                <td className="urlCell">
                  <a href={a.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No articles found for these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <footer className="footer">
        <div className="muted">Backend: <a href="/health" target="_blank" rel="noreferrer">/health</a></div>
      </footer>
    </div>
  );
}

export default App;
