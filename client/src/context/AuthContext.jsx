import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  apiFetch,
  clearStoredToken,
  clearStoredUser,
  getStoredToken,
  getStoredUser,
  isTokenExpired,
  setStoredToken,
  setStoredUser,
} from "../api/client.js";

const AuthContext = createContext(null);
const AUTH_ME_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseAuthResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data.message ||
      data.error ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function readInitialAuth() {
  const stored = getStoredToken();
  if (!stored || isTokenExpired(stored)) {
    if (stored) {
      clearStoredToken();
      clearStoredUser();
    }
    return { token: "", user: null, loading: false };
  }
  const cachedUser = getStoredUser();
  return {
    token: stored,
    user: cachedUser,
    loading: !cachedUser,
  };
}

export function AuthProvider({ children }) {
  const initial = useMemo(() => readInitialAuth(), []);
  const [user, setUser] = useState(initial.user);
  const [token, setToken] = useState(initial.token);
  const [loading, setLoading] = useState(initial.loading);
  const [error, setError] = useState("");
  const refreshGenRef = useRef(0);
  const refreshAbortRef = useRef(null);

  const persistSession = useCallback((nextToken, nextUser) => {
    setStoredToken(nextToken);
    setStoredUser(nextUser);
    setToken(nextToken);
    setUser(nextUser);
    setError("");
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    clearStoredToken();
    clearStoredUser();
    setToken("");
    setUser(null);
    setError("");
    setLoading(false);
  }, []);

  const cancelRefresh = useCallback(() => {
    refreshGenRef.current += 1;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
  }, []);

  const refreshUser = useCallback(
    async ({ silent = false } = {}) => {
      const stored = getStoredToken();
      if (!stored || isTokenExpired(stored)) {
        clearSession();
        return null;
      }

      cancelRefresh();
      const gen = refreshGenRef.current;
      const controller = new AbortController();
      refreshAbortRef.current = controller;

      if (!silent) setLoading(true);

      try {
        for (let attempt = 0; attempt <= AUTH_ME_RETRIES; attempt += 1) {
          if (gen !== refreshGenRef.current) return null;

          const res = await apiFetch("/api/auth/me", {
            signal: controller.signal,
          });

          if (gen !== refreshGenRef.current) return null;

          if (res.status === 503 && attempt < AUTH_ME_RETRIES) {
            await sleep(600 * (attempt + 1));
            continue;
          }

          const data = await parseAuthResponse(res);
          setToken(stored);
          setUser(data.user);
          setStoredUser(data.user);
          setError("");
          return data.user;
        }
        clearSession();
        return null;
      } catch (err) {
        if (gen !== refreshGenRef.current || err?.name === "AbortError") {
          return null;
        }
        clearSession();
        return null;
      } finally {
        if (gen === refreshGenRef.current) {
          refreshAbortRef.current = null;
          if (!silent) setLoading(false);
        }
      }
    },
    [cancelRefresh, clearSession],
  );

  useEffect(() => {
    const stored = getStoredToken();
    if (!stored) return;
    if (isTokenExpired(stored)) {
      clearSession();
      return;
    }
    if (getStoredUser()) {
      void refreshUser({ silent: true });
    } else {
      void refreshUser();
    }
    return () => cancelRefresh();
  }, [refreshUser, clearSession, cancelRefresh]);

  const login = useCallback(
    async ({ identifier, password }) => {
      cancelRefresh();
      setError("");
      setLoading(false);
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await parseAuthResponse(res);
      persistSession(data.token, data.user);
      return data.user;
    },
    [persistSession, cancelRefresh],
  );

  const logout = useCallback(async () => {
    cancelRefresh();
    try {
      if (getStoredToken()) {
        await apiFetch("/api/auth/logout", { method: "POST" });
      }
    } catch {
      // still clear local session
    } finally {
      clearSession();
    }
  }, [clearSession, cancelRefresh]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      error,
      setError,
      isAuthenticated: Boolean(token && user && !isTokenExpired(token)),
      login,
      logout,
      refreshUser,
    }),
    [user, token, loading, error, login, logout, refreshUser],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
