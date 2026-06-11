import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { performImpact } from "@/lib/vibration-preference";

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          performImpact().catch(() => undefined);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
