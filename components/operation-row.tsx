import { Pressable, Text, View } from "react-native";
import { CheckCircle2, CircleDot, Clock3, Plus, XCircle } from "lucide-react-native";

type OperationRowProps = {
  colors: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    border: string;
    primary: string;
  };
  status: string;
  statusColor: string;
  typeLabel: string;
  typeColor: string;
  TypeIcon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  requestNumber?: string | number;
  primaryName: string;
  primaryAddress?: string;
  secondaryName?: string;
  secondaryAddress?: string;
  detailLine?: string;
  places?: string | null;
  courier?: string | null;
  trailingMeta?: string | null;
  time?: string | null;
  isLast?: boolean;
  onPress: () => void;
};


function StatusIcon({ status, color }: { status: string; color: string }) {
  if (status === "completed") return <CheckCircle2 size={20} color={color} strokeWidth={2.5} />;
  if (status === "cancelled") return <XCircle size={20} color={color} strokeWidth={2.4} />;
  if (status === "in_progress") return <Clock3 size={21} color={color} strokeWidth={2.4} />;
  if (status === "new") return <Plus size={21} color={color} strokeWidth={2.6} />;
  return <CircleDot size={20} color={color} strokeWidth={2.4} />;
}

function AddressLine({
  name,
  address,
  colors,
}: {
  name: string;
  address?: string;
  colors: OperationRowProps["colors"];
}) {
  return (
    <View style={{ minHeight: 19, minWidth: 0 }}>
      <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 13, lineHeight: 17, fontWeight: "700" }}>
        {name || "—"}
      </Text>
      {address ? (
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "500", marginTop: 1 }}>
          {address}
        </Text>
      ) : null}
    </View>
  );
}

export function OperationRow({
  colors,
  status,
  statusColor,
  typeLabel,
  typeColor,
  TypeIcon,
  requestNumber,
  primaryName,
  primaryAddress,
  secondaryName,
  secondaryAddress,
  detailLine,
  places,
  courier,
  trailingMeta,
  time,
  isLast,
  onPress,
}: OperationRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 108,
        position: "relative",
        flexDirection: "row",
        paddingLeft: 0,
        paddingRight: 16,
        backgroundColor: pressed ? colors.surface : "transparent",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: colors.border,
          zIndex: 2,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 44,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: colors.border,
          zIndex: 2,
        }}
      />
      <View
        style={{
          width: 44,
          alignSelf: "stretch",
          alignItems: "center",
          justifyContent: "center",
          borderRightWidth: 0,
        }}
      >
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <StatusIcon status={status} color={statusColor} />
        </View>
      </View>

      <View
        style={{
          flex: 1,
          minWidth: 0,
          paddingVertical: 8,
          marginLeft: 11,
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
          <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between", paddingRight: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 20 }}>
              <TypeIcon size={14} color={typeColor} strokeWidth={2.2} />
              <Text numberOfLines={1} style={{ color: typeColor, fontSize: 11, lineHeight: 18, fontWeight: "600", marginLeft: 6 }}>
                {typeLabel}
              </Text>
            </View>

            <AddressLine name={primaryName} address={primaryAddress} colors={colors} />

            {secondaryName ? (
              <AddressLine name={secondaryName} address={secondaryAddress} colors={colors} />
            ) : (
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "400" }}>
                {trailingMeta ? <Text style={{ color: colors.foreground, fontWeight: "600" }}>{trailingMeta}  ·  </Text> : null}
                {detailLine || "—"}
              </Text>
            )}

            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "400" }}>
              {courier || "Без курьера"}
            </Text>
          </View>

          <View style={{ width: 88, alignItems: "flex-end", justifyContent: "space-between" }}>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "400" }}>
              {requestNumber ? `№${requestNumber}` : "—"}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "400" }}>
              {time || "—"}
            </Text>
            <View style={{ minHeight: 19 }} />
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "400" }}>
              {places || ""}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
