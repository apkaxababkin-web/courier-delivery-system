import { createContext, useContext, useEffect, useState } from 'react';

export interface CourierInfo {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  vehicleType: string;
  isActive: boolean;
  totalDeliveries: number;
  urgencyThresholdOrange?: number;
  urgencyThresholdRed?: number;
}

interface AuthContextType {
  token: string | null;
  courier: CourierInfo | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL || '';
const COURIER_TOKEN_KEY = 'courierToken';
const COURIER_INFO_KEY = 'courierInfo';
const OLD_DEMO_TOKEN_KEY = 'courier_session_token';
const OLD_DEMO_INFO_KEY = 'courier_info';

async function unwrapTrpc<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Ошибка запроса');
  }

  return data?.result?.data?.json || data?.result?.data || data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [courier, setCourier] = useState<CourierInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      localStorage.removeItem(OLD_DEMO_TOKEN_KEY);
      localStorage.removeItem(OLD_DEMO_INFO_KEY);

      const savedToken = localStorage.getItem(COURIER_TOKEN_KEY);
      const savedCourier = localStorage.getItem(COURIER_INFO_KEY);

      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        const input = encodeURIComponent(JSON.stringify({ token: savedToken }));
        const response = await fetch(`${API_URL}/api/trpc/courierAuth.me?input=${input}`);
        const freshCourier = await unwrapTrpc<CourierInfo>(response);

        localStorage.setItem(COURIER_INFO_KEY, JSON.stringify(freshCourier));
        setToken(savedToken);
        setCourier(freshCourier);
      } catch (error) {
        console.error('[Auth] Courier session check failed:', error);
        localStorage.removeItem(COURIER_TOKEN_KEY);
        localStorage.removeItem(COURIER_INFO_KEY);

        if (savedCourier) {
          console.info('[Auth] Removed stale courier session');
        }
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (username: string, password: string) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/trpc/courierAuth.login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { username, password } }),
      });

      const data = await unwrapTrpc<{ token: string; courier: CourierInfo }>(response);

      localStorage.setItem(COURIER_TOKEN_KEY, data.token);
      localStorage.setItem(COURIER_INFO_KEY, JSON.stringify(data.courier));
      setToken(data.token);
      setCourier(data.courier);
    } catch (error) {
      console.error('[Auth] Courier login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(COURIER_TOKEN_KEY);
    localStorage.removeItem(COURIER_INFO_KEY);
    localStorage.removeItem(OLD_DEMO_TOKEN_KEY);
    localStorage.removeItem(OLD_DEMO_INFO_KEY);
    setToken(null);
    setCourier(null);
  };

  return (
    <AuthContext.Provider value={{ token, courier, loading, isAuthenticated: !!token && !!courier, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
