import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = logged out
  const [bootstrap, setBootstrap] = useState({ has_users: true });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      // 401 on first load simply means "not logged in" — normal path.
      if (err?.response?.status && err.response.status !== 401) {
        console.warn("Auth refresh failed:", formatApiError(err));
      }
      setUser(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/bootstrap-status");
        setBootstrap(data);
      } catch (err) {
        console.warn("bootstrap-status failed:", formatApiError(err));
      }
      await refresh();
    })();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    return data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    setUser(data);
    setBootstrap({ has_users: true });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.warn("logout request failed:", formatApiError(err));
    }
    setUser(false);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, register, refresh, bootstrap, setBootstrap }),
    [user, login, logout, register, refresh, bootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { formatApiError };
