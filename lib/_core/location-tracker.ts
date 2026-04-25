/**
 * Intelligent Location Tracking Service
 * Optimizes GPS usage based on task status and network conditions
 */

import * as Location from "expo-location";
import { getNetworkState, isMeteredConnection } from "./battery-optimization";

export type LocationAccuracy =
  | "Lowest"
  | "Low"
  | "Balanced"
  | "High"
  | "Highest";

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationTrackerConfig {
  taskStatus: "idle" | "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  isOnMeteredConnection: boolean;
}

// Current tracking subscription
let currentLocationSubscription: Location.LocationSubscription | null = null;
let lastLocationUpdate: LocationUpdate | null = null;
let locationUpdateListeners: Set<(location: LocationUpdate) => void> = new Set();

/**
 * Get optimal accuracy based on task status and network
 */
function getOptimalAccuracy(config: LocationTrackerConfig): LocationAccuracy {
  const { taskStatus, isOnMeteredConnection } = config;

  // Only track when courier is actively delivering
  if (taskStatus !== "in_progress") {
    return "Lowest"; // Minimal accuracy when not delivering
  }

  // On metered connection, use lower accuracy to save data
  if (isOnMeteredConnection) {
    return "Balanced"; // 100m accuracy
  }

  // On WiFi, use higher accuracy
  return "High"; // 10m accuracy
}

/**
 * Get optimal update interval based on task status
 */
function getOptimalUpdateInterval(taskStatus: string): number {
  switch (taskStatus) {
    case "in_progress":
      return 30 * 1000; // 30 seconds while delivering
    case "assigned":
      return 5 * 60 * 1000; // 5 minutes when assigned but not started
    case "pending":
      return 10 * 60 * 1000; // 10 minutes when pending
    default:
      return 0; // Don't track
  }
}

/**
 * Get optimal distance interval (minimum movement to trigger update)
 */
function getOptimalDistanceInterval(taskStatus: string): number {
  switch (taskStatus) {
    case "in_progress":
      return 50; // 50 meters while delivering
    case "assigned":
      return 200; // 200 meters when assigned
    case "pending":
      return 500; // 500 meters when pending
    default:
      return 0;
  }
}

/**
 * Start tracking courier location
 */
export async function startLocationTracking(
  taskStatus: "idle" | "pending" | "assigned" | "in_progress" | "completed" | "cancelled"
): Promise<void> {
  // Stop existing tracking
  if (currentLocationSubscription) {
    await stopLocationTracking();
  }

  // Don't track if not needed
  if (taskStatus === "idle" || taskStatus === "completed" || taskStatus === "cancelled") {
    console.log("[Location] Not tracking for status:", taskStatus);
    return;
  }

  try {
    // Request location permissions
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.warn("[Location] Permission denied");
      return;
    }

    const isMetered = isMeteredConnection();
    const accuracy = getOptimalAccuracy({
      taskStatus,
      isOnMeteredConnection: isMetered,
    });

    const accuracyMap: Record<LocationAccuracy, number> = {
      Lowest: Location.Accuracy.Lowest,
      Low: Location.Accuracy.Low,
      Balanced: Location.Accuracy.Balanced,
      High: Location.Accuracy.High,
      Highest: Location.Accuracy.Highest,
    };

    console.log("[Location] Starting tracking:", {
      taskStatus,
      accuracy,
      isMetered,
      timeInterval: getOptimalUpdateInterval(taskStatus),
      distanceInterval: getOptimalDistanceInterval(taskStatus),
    });

    currentLocationSubscription = await Location.watchPositionAsync(
      {
        accuracy: accuracyMap[accuracy],
        timeInterval: getOptimalUpdateInterval(taskStatus),
        distanceInterval: getOptimalDistanceInterval(taskStatus),
      },
      (location) => {
        const update: LocationUpdate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy || 0,
          timestamp: location.timestamp,
        };

        lastLocationUpdate = update;

        // Notify listeners
        locationUpdateListeners.forEach((listener) => listener(update));

        console.log("[Location] Update:", {
          lat: update.latitude.toFixed(6),
          lon: update.longitude.toFixed(6),
          accuracy: update.accuracy.toFixed(1),
        });
      }
    );
  } catch (error) {
    console.error("[Location] Failed to start tracking:", error);
  }
}

/**
 * Stop location tracking
 */
export async function stopLocationTracking(): Promise<void> {
  if (currentLocationSubscription) {
    await currentLocationSubscription.remove();
    currentLocationSubscription = null;
    console.log("[Location] Stopped tracking");
  }
}

/**
 * Get last known location
 */
export function getLastLocation(): LocationUpdate | null {
  return lastLocationUpdate;
}

/**
 * Subscribe to location updates
 */
export function subscribeToLocationUpdates(
  callback: (location: LocationUpdate) => void
): () => void {
  locationUpdateListeners.add(callback);

  return () => {
    locationUpdateListeners.delete(callback);
  };
}

/**
 * Update tracking based on task status change
 */
export async function updateTracking(
  taskStatus: "idle" | "pending" | "assigned" | "in_progress" | "completed" | "cancelled"
): Promise<void> {
  console.log("[Location] Updating tracking for status:", taskStatus);
  await startLocationTracking(taskStatus);
}

/**
 * Calculate distance between two points (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Return in meters
}

/**
 * Get location statistics for debugging
 */
export function getLocationStats(): {
  isTracking: boolean;
  lastUpdate: LocationUpdate | null;
  lastUpdateAge: number | null;
} {
  const now = Date.now();
  const lastUpdateAge = lastLocationUpdate ? now - lastLocationUpdate.timestamp : null;

  return {
    isTracking: currentLocationSubscription !== null,
    lastUpdate: lastLocationUpdate,
    lastUpdateAge,
  };
}
