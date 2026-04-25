/**
 * Screen Brightness Optimizer
 * Manages adaptive screen brightness based on time of day and conditions
 */

import { Brightness } from "expo-brightness";
import { Platform } from "react-native";

export type BrightnessMode = "auto" | "manual" | "high-contrast";

export interface BrightnessConfig {
  mode: BrightnessMode;
  manualLevel?: number; // 0-1
  autoAdjust: boolean;
}

let currentConfig: BrightnessConfig = {
  mode: "auto",
  autoAdjust: true,
};

let brightnessListeners: Set<(brightness: number) => void> = new Set();

/**
 * Get current screen brightness
 */
export async function getCurrentBrightness(): Promise<number> {
  if (Platform.OS === "web") {
    return 1; // Web doesn't support brightness control
  }

  try {
    return await Brightness.getBrightnessAsync();
  } catch (error) {
    console.error("[Brightness] Failed to get brightness:", error);
    return 1;
  }
}

/**
 * Set screen brightness
 */
export async function setBrightness(level: number): Promise<void> {
  if (Platform.OS === "web") {
    return; // Web doesn't support brightness control
  }

  try {
    // Clamp between 0 and 1
    const clampedLevel = Math.max(0, Math.min(1, level));
    await Brightness.setBrightnessAsync(clampedLevel);

    console.log(`[Brightness] Set to ${(clampedLevel * 100).toFixed(0)}%`);

    // Notify listeners
    brightnessListeners.forEach((listener) => listener(clampedLevel));
  } catch (error) {
    console.error("[Brightness] Failed to set brightness:", error);
  }
}

/**
 * Get optimal brightness based on time of day
 */
function getTimeBasedBrightness(): number {
  const hour = new Date().getHours();

  // Night (22:00 - 06:00): 30% brightness
  if (hour >= 22 || hour < 6) {
    return 0.3;
  }

  // Early morning (06:00 - 09:00): 50% brightness
  if (hour >= 6 && hour < 9) {
    return 0.5;
  }

  // Day (09:00 - 18:00): 100% brightness
  if (hour >= 9 && hour < 18) {
    return 1;
  }

  // Evening (18:00 - 22:00): 70% brightness
  return 0.7;
}

/**
 * Enable auto brightness adjustment
 */
export async function enableAutoBrightness(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  currentConfig.mode = "auto";
  currentConfig.autoAdjust = true;

  // Set initial brightness based on time
  const brightness = getTimeBasedBrightness();
  await setBrightness(brightness);

  console.log("[Brightness] Auto mode enabled");

  // Start periodic updates (every 5 minutes)
  const interval = setInterval(async () => {
    if (currentConfig.autoAdjust) {
      const newBrightness = getTimeBasedBrightness();
      const currentBrightness = await getCurrentBrightness();

      // Only update if brightness changed significantly (> 10%)
      if (Math.abs(newBrightness - currentBrightness) > 0.1) {
        await setBrightness(newBrightness);
      }
    }
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}

/**
 * Disable auto brightness adjustment
 */
export async function disableAutoBrightness(): Promise<void> {
  currentConfig.autoAdjust = false;
  console.log("[Brightness] Auto mode disabled");
}

/**
 * Set manual brightness level
 */
export async function setManualBrightness(level: number): Promise<void> {
  currentConfig.mode = "manual";
  currentConfig.manualLevel = level;
  currentConfig.autoAdjust = false;

  await setBrightness(level);
  console.log("[Brightness] Manual mode set to", (level * 100).toFixed(0) + "%");
}

/**
 * Enable high contrast mode (maximum brightness)
 */
export async function enableHighContrast(): Promise<void> {
  currentConfig.mode = "high-contrast";
  currentConfig.autoAdjust = false;

  await setBrightness(1);
  console.log("[Brightness] High contrast mode enabled");
}

/**
 * Subscribe to brightness changes
 */
export function subscribeToBrightnessChanges(
  callback: (brightness: number) => void
): () => void {
  brightnessListeners.add(callback);

  return () => {
    brightnessListeners.delete(callback);
  };
}

/**
 * Get brightness statistics
 */
export async function getBrightnessStats(): Promise<{
  current: number;
  mode: BrightnessMode;
  autoAdjust: boolean;
  timeBasedOptimal: number;
}> {
  return {
    current: await getCurrentBrightness(),
    mode: currentConfig.mode,
    autoAdjust: currentConfig.autoAdjust,
    timeBasedOptimal: getTimeBasedBrightness(),
  };
}

/**
 * Brightness presets for quick access
 */
export const BRIGHTNESS_PRESETS = {
  NIGHT: 0.2, // 20% - Very dim for night
  LOW: 0.4, // 40% - Low brightness
  MEDIUM: 0.6, // 60% - Medium brightness
  HIGH: 0.8, // 80% - High brightness
  MAXIMUM: 1.0, // 100% - Maximum brightness
};

/**
 * Apply brightness preset
 */
export async function applyBrightnessPreset(preset: keyof typeof BRIGHTNESS_PRESETS): Promise<void> {
  const level = BRIGHTNESS_PRESETS[preset];
  await setManualBrightness(level);
  console.log(`[Brightness] Applied preset: ${preset}`);
}
