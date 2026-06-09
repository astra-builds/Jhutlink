import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type AuthUser, type ApiError } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    trade_license?: string;
    department?: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jhutlink_token");
    if (!token) {
      setLoading(false);
      return;
    }

    api.auth
      .me()
      .then((u) => {
        setUser(u);
        setError(null);
      })
      .catch(() => {
        localStorage.removeItem("jhutlink_token");
        localStorage.removeItem("jhutlink_user_id");
        localStorage.removeItem("jhutlink_role");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.login(email, password);
      localStorage.setItem("jhutlink_token", res.access_token);
      localStorage.setItem("jhutlink_user_id", String(res.user_id));
      localStorage.setItem("jhutlink_role", res.role);
      const me = await api.auth.me();
      setUser(me);
    } catch (err) {
      const e = err as ApiError;
      setError(e.detail || e.message || "Login failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function register(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    trade_license?: string;
    department?: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      await api.auth.register(data);
      await login(data.email, data.password);
    } catch (err) {
      const e = err as ApiError;
      setError(e.detail || e.message || "Registration failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("jhutlink_token");
    localStorage.removeItem("jhutlink_user_id");
    localStorage.removeItem("jhutlink_role");
    setUser(null);
    window.location.href = "/";
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}