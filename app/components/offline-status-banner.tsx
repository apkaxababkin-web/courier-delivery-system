/**
 * Offline Status Banner Component
 * Displays offline mode status and sync information
 */

import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { cn } from "@/lib/utils";
import { getNetworkState, subscribeToNetworkChanges } from "@/lib/_core/battery-optimization";
import { getSyncStatus } from "@/lib/_core/sync-manager";
import { getReconnectionStatus } from "@/lib/_core/reconnection-handler";

export interface OfflineStatusBannerProps {
  onSyncPress?: () => void;
  dismissible?: boolean;
}

export function OfflineStatusBanner({
  onSyncPress,
  dismissible = false,
}: OfflineStatusBannerProps) {
  const colors = useColors();
  const [isOnline, setIsOnline] = useState(true);
  const [syncQueueLength, setSyncQueueLength] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Subscribe to network changes
    const unsubscribe = subscribeToNetworkChanges((state) => {
      setIsOnline(state.isConnected && state.isInternetReachable);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Update sync queue length periodically
    const interval = setInterval(async () => {
      const status = await getSyncStatus();
      setSyncQueueLength(status.queueLength);
      setIsSyncing(status.isSyncing);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (isDismissed && isOnline && syncQueueLength === 0) {
    return null;
  }

  if (isOnline && syncQueueLength === 0) {
    return null;
  }

  const isOffline = !isOnline;
  const hasPendingSync = syncQueueLength > 0;

  return (
    <View
      className={cn(
        "px-4 py-3 flex-row items-center justify-between",
        isOffline ? "bg-error/10" : "bg-warning/10"
      )}
      style={{
        backgroundColor: isOffline ? `${colors.error}15` : `${colors.warning}15`,
        borderBottomWidth: 1,
        borderBottomColor: isOffline ? colors.error : colors.warning,
      }}
    >
      <View className="flex-row items-center flex-1">
        {/* Status icon */}
        <View
          className="w-2 h-2 rounded-full mr-2"
          style={{
            backgroundColor: isOffline ? colors.error : colors.warning,
          }}
        />

        {/* Status text */}
        <View className="flex-1">
          {isOffline ? (
            <>
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.error }}
              >
                Offline Mode
              </Text>
              <Text className="text-xs text-muted">
                Changes will sync when online
              </Text>
            </>
          ) : isSyncing ? (
            <>
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.warning }}
              >
                Syncing...
              </Text>
              <Text className="text-xs text-muted">
                {syncQueueLength} item{syncQueueLength !== 1 ? "s" : ""} pending
              </Text>
            </>
          ) : (
            <>
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.warning }}
              >
                Pending Sync
              </Text>
              <Text className="text-xs text-muted">
                {syncQueueLength} item{syncQueueLength !== 1 ? "s" : ""} to sync
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View className="flex-row items-center gap-2 ml-2">
        {isSyncing && <ActivityIndicator size="small" color={colors.warning} />}

        {!isOffline && hasPendingSync && !isSyncing && (
          <Pressable
            onPress={onSyncPress}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Text
              className="text-xs font-semibold px-2 py-1 rounded"
              style={{
                color: colors.primary,
                backgroundColor: `${colors.primary}20`,
              }}
            >
              Sync Now
            </Text>
          </Pressable>
        )}

        {dismissible && (
          <Pressable
            onPress={() => setIsDismissed(true)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-xs text-muted font-semibold">✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

