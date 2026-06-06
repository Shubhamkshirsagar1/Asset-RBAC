import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(!!getToken());

  const loadProfile = useCallback(async () => {
    const [me, perms, nav] = await Promise.all([
      api('/me'),
      api('/me/permissions'),
      api('/me/menu'),
    ]);
    setUser(me);
    setPermissions(perms.permissions || []);
    setMenu(nav.menu || []);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    loadProfile()
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [loadProfile]);

  const login = useCallback(
    async (tenantSlug, email, password) => {
      const { access_token } = await api('/auth/login', { method: 'POST', body: { tenantSlug, email, password } });
      setToken(access_token);
      await loadProfile();
    },
    [loadProfile]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions([]);
    setMenu([]);
  }, []);

  const refresh = useCallback(() => loadProfile(), [loadProfile]);

  return (
    <AuthContext.Provider value={{ user, permissions, menu, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
