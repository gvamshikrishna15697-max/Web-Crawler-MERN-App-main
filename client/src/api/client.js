const TOKEN_KEY = "wc.auth.token";
const USER_KEY = "wc.auth.user";
const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

export function getStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore private mode
  }
}

export function clearStoredToken() {
  setStoredToken("");
}

export function getStoredUser() {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  } catch {
    // ignore private mode
  }
}

export function clearStoredUser() {
  setStoredUser(null);
}

/** Decode JWT payload (client-side expiry check only; server still verifies signature). */
export function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token, skewSeconds = 30) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= (payload.exp - skewSeconds) * 1000;
}

export function authHeaders(extra = {}) {
  const token = getStoredToken();
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Network-level failures (API down, wrong port). Optional timeout via AbortController. */
export async function apiFetch(url, init = {}, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const headers = authHeaders(init.headers || {});
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;

  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (timedOut) {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s (${url}). The API may be starting up — try again in a moment.`,
      );
    }
    if (e?.name === "AbortError") {
      throw e;
    }
    const msg = e?.message || String(e);
    const isNetwork =
      e?.name === "TypeError" ||
      /Failed to fetch|NetworkError|ECONNREFUSED|Load failed|network/i.test(msg);
    if (isNetwork) {
      throw new Error(
        `Cannot reach the API (${url}). Start the backend on port 5000: from the project root run \`npm run dev\`, or in a second terminal run \`npm run dev\` inside the \`server\` folder. Original error: ${msg}`,
      );
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, init) {
  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await apiFetch(url, init, { timeoutMs: 0 });
    if (res.ok) {
      return res.json();
    }
    const text = await res.text().catch(() => "");
    const isDbBootWindow =
      res.status === 503 &&
      /DatabaseUnavailable|MongoDB is not connected yet/i.test(text || "");
    if (isDbBootWindow && attempt < maxRetries) {
      await sleep(700 * (attempt + 1));
      continue;
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  throw new Error("API retry budget exhausted");
}
