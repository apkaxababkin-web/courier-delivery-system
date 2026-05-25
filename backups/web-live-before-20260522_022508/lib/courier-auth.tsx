import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const COURIER_TOKEN_KEY = "courier_session_token";
const COURIER_INFO_KEY = "courier_info";

export type CourierInfo = {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  vehicleType: string;
  isActive: boolean;
  totalDeliveries: number;
  urgencyThresholdOrange?: number;
  urgencyThresholdRed?: number;
  courierName?: string;
};

type CourierAuthState = {
  token: string | null;
  courier: CourierInfo | null;
  loading: boolean;
  isAuthenticated: boolean;
};

type CourierAuthActions = {
  setSession: (token: string, courier: CourierInfo) => Promise<void>;
  logout: () => Promise<void>;
};

type CourierAuthContextType = CourierAuthState & CourierAuthActions;

const CourierAuthContext = createContext<CourierAuthContextType | null>(null);

async function storeItem(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string) {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export function CourierAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [courier, setCourier] = useState<CourierInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const [savedToken, savedCourier] = await Promise.all([
          getItem(COURIER_TOKEN_KEY),
          getItem(COURIER_INFO_KEY),
        ]);

        if (!mountedRef.current) return;

        if (!savedToken || !savedCourier) {
          await Promise.all([
            removeItem(COURIER_TOKEN_KEY),
            removeItem(COURIER_INFO_KEY),
          ]);

          setToken(null);
          setCourier(null);
          return;
        }

        const parsedCourier = JSON.parse(savedCourier) as CourierInfo;

        if (!parsedCourier?.id || !parsedCourier?.username) {
          throw new Error("Invalid courier session payload");
        }

        setToken(savedToken);
        setCourier(parsedCourier);
      } catch (e) {
        console.error("[CourierAuth] Failed to load session:", e);

        await Promise.all([
          removeItem(COURIER_TOKEN_KEY),
          removeItem(COURIER_INFO_KEY),
        ]);

        if (mountedRef.current) {
          setToken(null);
          setCourier(null);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setSession = useCallback(async (newToken: string, newCourier: CourierInfo) => {
    await Promise.all([
      storeItem(COURIER_TOKEN_KEY, newToken),
      storeItem(COURIER_INFO_KEY, JSON.stringify(newCourier)),
    ]);

    if (!mountedRef.current) return;

    setToken(newToken);
    setCourier(newCourier);
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      removeItem(COURIER_TOKEN_KEY),
      removeItem(COURIER_INFO_KEY),
    ]);

    if (!mountedRef.current) return;

    setToken(null);
    setCourier(null);
  }, []);

  return (
    <CourierAuthContext.Provider
      value={{
        token,
        courier,
        loading,
        isAuthenticated: !!token && !!courier,
        setSession,
        logout,
      }}
    >
      {children}
    </CourierAuthContext.Provider>
  );
}

export function useCourierAuth(): CourierAuthContextType {
  const ctx = useContext(CourierAuthContext);

  if (!ctx) {
    throw new Error("useCourierAuth must be used within CourierAuthProvider");
  }

  return ctx;
}
