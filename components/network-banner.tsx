import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { NetworkPhase } from "@/hooks/use-network-status";

type Props = {
  phase: NetworkPhase;
};

export function NetworkBanner({ phase }: Props) {
  const [dots, setDots] = useState(1);
  const visible = phase !== "online";

  useEffect(() => {
    if (!visible) {
      setDots(1);
      return;
    }

    if (phase !== "connecting") {
      return;
    }

    const timer = setInterval(() => {
      setDots((current) => (current >= 3 ? 1 : current + 1));
    }, 450);

    return () => clearInterval(timer);
  }, [phase, visible]);

  if (!visible) return null;

  const label =
    phase === "offline"
      ? "Нет соединения"
      : `Соединение${".".repeat(dots)}`;

  return (
    <View
      pointerEvents="none"
      style={{
        height: 24,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(100,116,139,0.10)",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(148,163,184,0.16)",
      }}
    >
      <Text
        style={{
          color: "#64748B",
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
