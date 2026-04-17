import { Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface CommentsSectionProps {
  comments: string | null | undefined;
}

export function CommentsSection({ comments }: CommentsSectionProps) {
  const colors = useColors();

  if (!comments) {
    return null;
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" }}>
        КОММЕНТАРИИ
      </Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 12,
          borderLeftWidth: 3,
          borderLeftColor: colors.warning,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>
          {comments}
        </Text>
      </View>
    </View>
  );
}
