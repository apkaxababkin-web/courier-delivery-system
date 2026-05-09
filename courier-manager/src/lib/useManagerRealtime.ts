import { useCallback, useEffect, useRef, useState } from 'react';
import { getRealtimeSnapshot, type RealtimeSnapshot } from './api';

export interface ManagerRealtimeState {
  snapshot: RealtimeSnapshot | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastSyncAt: string | null;
  refresh: (showLoader?: boolean) => Promise<void>;
}

export function useManagerRealtime(intervalMs = 5000): ManagerRealtimeState {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setIsLoading(true);
      setIsRefreshing(true);
      const nextSnapshot = await getRealtimeSnapshot();
      if (!mountedRef.current) return;
      setSnapshot(nextSnapshot);
      setLastSyncAt(nextSnapshot.updatedAt);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current) return;
      const message = caught instanceof Error ? caught.message : 'Ошибка realtime sync';
      setError(message);
    } finally {
      if (!mountedRef.current) return;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh(true);

    const timer = window.setInterval(() => {
      refresh(false);
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [intervalMs, refresh]);

  return {
    snapshot,
    isLoading,
    isRefreshing,
    error,
    lastSyncAt,
    refresh,
  };
}
