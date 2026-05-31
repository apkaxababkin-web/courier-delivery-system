import AsyncStorage from "@react-native-async-storage/async-storage";

export const VIBRATION_ENABLED_KEY = "vibrationEnabled";

export async function isVibrationEnabled(): Promise<boolean> {
  try {
    const saved = await AsyncStorage.getItem(VIBRATION_ENABLED_KEY);
    return saved !== "false";
  } catch (error) {
    console.warn("[Vibration] Failed to load preference", error);
    return true;
  }
}

export async function setVibrationEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(VIBRATION_ENABLED_KEY, enabled ? "true" : "false");
  } catch (error) {
    console.warn("[Vibration] Failed to save preference", error);
  }
}
