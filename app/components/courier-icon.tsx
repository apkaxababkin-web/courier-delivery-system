import * as LucideIcons from "lucide-react-native";

export const COURIER_ICON_NAMES = [
  "User",
  "UserRound",
  "CircleUserRound",
  "Contact",
  "Users",

  "Car",
  "CarFront",
  "Truck",
  "Bike",
  "Bus",

  "Plane",
  "Ship",
  "Rocket",
  "Navigation",
  "Compass",

  "MapPin",
  "Route",
  "Star",
  "Heart",
  "Zap",

  "Flame",
  "Sun",
  "Moon",
  "Cloud",
  "Snowflake",

  "Umbrella",
  "Sparkles",
  "Crown",
  "Gem",
  "Diamond",

  "Shield",
  "ShieldCheck",
  "Circle",
  "Square",
  "Triangle",

  "Hexagon",
  "Octagon",
  "Flag",
  "Bookmark",
  "Tag",

  "Bell",
  "Package",
  "Briefcase",
  "Key",
  "Wrench",

  "Hammer",
  "Camera",
  "Gift",
  "Trophy",
  "Medal",
] as const;

export type CourierIconName = typeof COURIER_ICON_NAMES[number];

type Props = {
  icon?: string | null;
  color: string;
  size?: number;
};

export function CourierIcon({
  icon,
  color,
  size = 14,
}: Props) {
  const iconSet = LucideIcons as unknown as Record<string, React.ComponentType<any>>;

  const Icon =
    iconSet[icon || "UserRound"] ||
    iconSet.UserRound;

  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={2.3}
    />
  );
}
