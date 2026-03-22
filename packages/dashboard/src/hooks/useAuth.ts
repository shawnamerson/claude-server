import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  credits: number;
}

const API = "/api";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setTokenState] = useState<string | null>(
    localStorage.getItem("token")
  );

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem("token", t);
    else localStorage.removeItem("token");
  };

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const res = await fetch(`${API}/auth/me`, { headers: headers() });
      if (res.ok) {
        setUser(await res.json());
      } else {
        setToken(null);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token, headers]);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const signup = async (email: string, password: string, name: string) => {
    const res = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      headers: headers(),
    }).catch(() => {});
    setToken(null);
    setUser(null);
  };

  return { user, loading, token, signup, login, logout, refreshUser };
}
