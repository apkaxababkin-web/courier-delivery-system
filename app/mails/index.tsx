import { useState, useMemo, useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Mail } from "@/shared/types";

export default function MailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [token] = useState("demo_token"); // TODO: Get from auth context

  // Fetch all undelivered mails
  const { data: mails = [], isLoading } = trpc.mails.all.useQuery(
    { token },
    { enabled: !!token }
  );

  // Filter mails by search query (waybill number)
  const filteredMails = useMemo(() => {
    if (!searchQuery) return mails;

    return mails.filter((mail) => {
      // Check if waybill number contains all digits in order
      let queryIndex = 0;
      for (let i = 0; i < mail.waybillNumber.length && queryIndex < searchQuery.length; i++) {
        if (mail.waybillNumber[i] === searchQuery[queryIndex]) {
          queryIndex++;
        }
      }
      return queryIndex === searchQuery.length;
    });
  }, [mails, searchQuery]);

  // Separate delivered and not delivered
  const notDeliveredMails = useMemo(() => {
    return filteredMails.filter((m) => m.status === "not_delivered");
  }, [filteredMails]);

  const deliveredMails = useMemo(() => {
    return filteredMails.filter((m) => m.status === "delivered");
  }, [filteredMails]);

  const handleMailPress = useCallback(
    (mail: Mail) => {
      router.push({
        pathname: "/mails/[waybill]",
        params: { waybill: mail.waybillNumber },
      });
    },
    [router]
  );

  const renderMailItem = ({ item }: { item: Mail }) => (
    <Pressable
      onPress={() => handleMailPress(item)}
      style={({ pressed }) => [
        styles.mailCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.mailContent}>
        <Text style={[styles.waybill, { color: colors.foreground }]}>
          {item.waybillNumber}
        </Text>
        <Text style={[styles.address, { color: colors.muted }]} numberOfLines={2}>
          {item.deliveryAddress}
        </Text>
        <Text style={[styles.phone, { color: colors.muted }]}>
          {item.recipientPhone}
        </Text>
      </View>
    </Pressable>
  );

  const renderSectionHeader = (title: string, count: number) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {title} ({count})
      </Text>
    </View>
  );

  return (
    <ScreenContainer className="p-4" edges={["top", "left", "right"]}>
      {/* Search bar */}
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Поиск по номеру накладной"
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          keyboardType="numeric"
        />
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <Text style={{ color: colors.muted }}>Загрузка...</Text>
        </View>
      ) : notDeliveredMails.length === 0 && deliveredMails.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={{ color: colors.muted }}>Письма не найдены</Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...notDeliveredMails.map((m) => ({ ...m, _section: "not_delivered" })),
            ...deliveredMails.map((m) => ({ ...m, _section: "delivered" })),
          ]}
          keyExtractor={(item) => item.waybillNumber}
          renderItem={({ item }) => renderMailItem(item as any)}
          ListHeaderComponent={
            notDeliveredMails.length > 0
              ? renderSectionHeader("Не доставлены", notDeliveredMails.length)
              : null
          }
          scrollEnabled={true}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    fontSize: 16,
    height: 40,
  },
  mailCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  mailContent: {
    gap: 6,
  },
  waybill: {
    fontSize: 16,
    fontWeight: "600",
  },
  address: {
    fontSize: 14,
    lineHeight: 20,
  },
  phone: {
    fontSize: 13,
  },
  sectionHeader: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
