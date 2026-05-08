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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const COURIER_TOKEN_KEY = 'courier_session_token';
const COURIER_INFO_KEY = 'courier_info';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [courier, setCourier] = useState<CourierInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = localStorage.getItem(COURIER_TOKEN_KEY);
        const savedCourier = localStorage.getItem(COURIER_INFO_KEY);

        if (savedToken && savedCourier) {
          setToken(savedToken);
          setCourier(JSON.parse(savedCourier));
        } else {
          // Auto-login with demo courier (matching Android app behavior)
          const demoCourier: CourierInfo = {
            id: 1,
            name: 'Демо Курьер',
            username: 'demo',
            phone: '+7 (999) 000-00-00',
            vehicleType: 'Автомобиль',
            isActive: true,
            totalDeliveries: 0,
            urgencyThresholdOrange: 60,
            urgencyThresholdRed: 30,
          };
          const demoToken = 'demo-token-' + Date.now();

          localStorage.setItem(COURIER_TOKEN_KEY, demoToken);
          localStorage.setItem(COURIER_INFO_KEY, JSON.stringify(demoCourier));

          setToken(demoToken);
          setCourier(demoCourier);
        }
      } catch (error) {
        console.error('[Auth] Failed to load session:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = () => {
    localStorage.removeItem(COURIER_TOKEN_KEY);
    localStorage.removeItem(COURIER_INFO_KEY);
    setToken(null);
    setCourier(null);
    
    // Auto-create new demo session
    const demoCourier: CourierInfo = {
      id: 1,
      name: 'Демо Курьер',
      username: 'demo',
      phone: '+7 (999) 000-00-00',
      vehicleType: 'Автомобиль',
      isActive: true,
      totalDeliveries: 0,
      urgencyThresholdOrange: 60,
      urgencyThresholdRed: 30,
    };
    const demoToken = 'demo-token-' + Date.now();

    localStorage.setItem(COURIER_TOKEN_KEY, demoToken);
    localStorage.setItem(COURIER_INFO_KEY, JSON.stringify(demoCourier));

    setToken(demoToken);
    setCourier(demoCourier);
  };

  return (
    <AuthContext.Provider value={{ token, courier, loading, isAuthenticated: !!token, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
