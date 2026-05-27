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

export function useManagerRealtime(_intervalMs = 5000): ManagerRealtimeState {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const lastRefreshAtRef = useRef(0);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async (showLoader = false) => {
    const now = Date.now();
    if (!showLoader && now - lastRefreshAtRef.current < 600) return;
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    lastRefreshAtRef.current = now;

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
      refreshingRef.current = false;

      if (!mountedRef.current) return;

      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh(true);

    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource('/api/live');

        eventSource.addEventListener('open', () => {
          console.log('[ManagerRealtime] SSE opened');
        });

        eventSource.addEventListener('connected', () => {
          console.log('[ManagerRealtime] SSE connected');
        });

        const sync = () => {
          refresh(false);
        };

        eventSource.addEventListener('tasks_changed', sync);
        eventSource.addEventListener('requests_changed', sync);
        eventSource.addEventListener('mails_changed', sync);
        eventSource.addEventListener('hemotest_changed', sync);
        eventSource.addEventListener('sberbank_changed', sync);
        eventSource.addEventListener('data_changed', sync);

        eventSource.onerror = () => {
          console.warn('[ManagerRealtime] SSE error, reconnecting');

          try {
            eventSource?.close();
          } catch {}

          if (!closed) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };
      } catch (caught) {
        console.warn('[ManagerRealtime] SSE connect failed', caught);

        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      }
    };

    connect();

    // Safety fallback: если браузер/прокси оборвал SSE, всё равно не теряем данные.
    fallbackTimer = window.setInterval(() => {
      refresh(false);
    }, 60000);

    const onFocus = () => refresh(false);
    window.addEventListener('focus', onFocus);

    return () => {
      mountedRef.current = false;
      closed = true;

      try {
        eventSource?.close();
      } catch {}

      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (fallbackTimer) window.clearInterval(fallbackTimer);

      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return {
    snapshot,
    isLoading,
    isRefreshing,
    error,
    lastSyncAt,
    refresh,
  };
}
