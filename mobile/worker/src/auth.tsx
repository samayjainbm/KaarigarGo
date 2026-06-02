import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Api, ApiUser, tokens } from './api';

interface AuthCtx {
  user: ApiUser | null;
  loading: boolean;
  setUser: (u: ApiUser) => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  setUser: () => {},
  refreshMe: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await tokens.load();
      if (tokens.access) {
        try {
          const r = await Api.me();
          setUser(r.data);
        } catch {
          await tokens.clear();
        }
      }
      setLoading(false);
    })();
  }, []);

  const refreshMe = async () => {
    const r = await Api.me();
    setUser(r.data);
  };

  const logout = async () => {
    await tokens.clear();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, setUser, refreshMe, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
