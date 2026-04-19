import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  // Navigation
  "house.fill": "home",
  "clock.fill": "history",
  "person.fill": "person",
  "paperplane.fill": "send",
  
  // Tab Bar Icons
  "list.bullet": "list",
  "box.2": "inventory-2",
  "building.2": "domain",
  "envelope": "mail",
  "hemotest": "local-hospital",
  "sberbank": "account-balance",
  
  // Task list
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "clock": "schedule",
  
  // Task detail
  "mappin.fill": "location-on",
  "phone.fill": "phone",
  "shippingbox.fill": "inventory-2",
  "exclamationmark.triangle.fill": "warning",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "arrow.left": "arrow-back",
  
  // Status
  "bolt.fill": "flash-on",
  "truck.box.fill": "local-shipping",
  "figure.walk": "directions-walk",
  
  // General
  "chevron.left.forwardslash.chevron.right": "code",
  "bell.fill": "notifications",
  "gearshape.fill": "settings",
  "arrow.right.square.fill": "logout",
  "star.fill": "star",
  "info.circle.fill": "info",
  "plus.circle.fill": "add-circle",
  "tray.full.fill": "inbox",
  
  // Theme toggle
  "moon.fill": "dark-mode",
  "sun.max.fill": "light-mode",
} as unknown as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
