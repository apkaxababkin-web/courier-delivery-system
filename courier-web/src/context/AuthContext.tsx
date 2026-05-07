import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  id: number;
  username: string;
  name: string;
  phone?: string;
  vehicleType?: string;
  isActive?: boolean;
  totalDeliveries?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_STORAGE_KEY = 'courierToken';

const unwrapTrpc = async <T,>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Request failed');
  }

  return data?.result?.data?.json || data?.result?.data || data;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const input = encodeURIComponent(JSON.stringify({ token }));
        const response = await fetch(`${API_URL}/api/trpc/courierAuth.me?input=${input}`);
        const courier = await unwrapTrpc<User>(response);
        setUser(courier);
      } catch (error) {
        console.error('Courier auth check failed:', error);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/trpc/courierAuth.login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { username, password } }),
      });

      const data = await unwrapTrpc<{ token: string; courier: User }>(response);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setUser(data.courier);
    } catch (error) {
      console.error('Courier login failed:', error);
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
