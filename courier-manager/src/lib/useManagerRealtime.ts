export interface ManagerRealtimeState {
  snapshot: any | null;
  isConnected: boolean;
  lastUpdated: Date | null;
}

export function useManagerRealtime(_intervalMs = 5000): ManagerRealtimeState {
  return {
    snapshot: null,
    isConnected: false,
    lastUpdated: null,
  };
}
