import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  apiFetch,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "../api/client.js";

const AuthContext = createContext(null);

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(Boolean(getStoredToken()));
  const [error, setError] = useState("");

  const persistSession = useCallback((nextToken, nextUser) => {
    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setError("");
  }, []);

  const clearSession = useCallback(() => {
    clearStoredToken();
    setToken("");
    setUser(null);
    setError("");
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = getStoredToken();
    if (!stored) {
      clearSession();
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/me");
      const data = await parseAuthResponse(res);
      setToken(stored);
      setUser(data.user);
      setError("");
      return data.user;
    } catch {
      clearSession();
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    if (getStoredToken()) {
      void refreshUser();
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const signup = useCallback(
    async ({ username, email, password }) => {
      setError("");
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await parseAuthResponse(res);
      persistSession(data.token, data.user);
      return data.user;
    },
    [persistSession],
  );

  const login = useCallback(
    async ({ identifier, password }) => {
      setError("");
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await parseAuthResponse(res);
      persistSession(data.token, data.user);
      return data.user;
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await apiFetch("/api/auth/logout", { method: "POST" });
      }
    } catch {
      // still clear local session
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      error,
      setError,
      isAuthenticated: Boolean(token && user),
      signup,
      login,
      logout,
      refreshUser,
    }),
    [user, token, loading, error, signup, login, logout, refreshUser],
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
