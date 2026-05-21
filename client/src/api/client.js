const TOKEN_KEY = "wc.auth.token";

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

export function authHeaders(extra = {}) {
  const token = getStoredToken();
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Network-level failures (API down, wrong port). */
export async function apiFetch(url, init = {}) {
  const headers = authHeaders(init.headers || {});
  try {
    return await fetch(url, { ...init, headers });
  } catch (e) {
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
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, init) {
  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await apiFetch(url, init);
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
