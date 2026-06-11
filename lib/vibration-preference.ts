import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

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

export async function performImpact(style = Haptics.ImpactFeedbackStyle.Light) {
  if (!(await isVibrationEnabled())) return;
  await Haptics.impactAsync(style);
}

export async function performSuccessHaptic() {
  if (!(await isVibrationEnabled())) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
