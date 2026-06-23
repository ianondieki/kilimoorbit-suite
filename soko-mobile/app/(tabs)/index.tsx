import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { Header, Card, Button, Empty } from "../../components/ui";
import { ListingCard } from "../../components/ListingCard";
import { getListings, type Listing, type ListingStatus } from "../../lib/api";

type Filter = "all" | ListingStatus;
const FILTERS: Filter[] = ["all", "open", "claimed"];

export default function Market() {
  const t = useTheme();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setErr(null);
    try {
      const { listings } = await getListings(f === "all" ? undefined : f);
      setListings(listings);
    } catch (e: any) {
      setErr(e?.message ?? "Cannot reach the Sentinel server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh whenever the tab regains focus (e.g. after posting from Sell).
  useFocusEffect(useCallback(() => { load(filter); }, [load, filter]));
  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header title="Soko" subtitle="Community produce marketplace" />

      <View style={st.filters}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[
                st.chip,
                { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.raised : "transparent" },
              ]}
            >
              <Text style={{ color: active ? t.accent : t.dim, fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.accent}
            onRefresh={() => { setRefreshing(true); load(filter); }} />
        }
      >
        {err && (
          <Card style={{ borderColor: t.alert }}>
            <Text style={{ color: t.alert, fontWeight: "700", marginBottom: 6 }}>CONNECTION</Text>
            <Text style={{ color: t.ink, marginBottom: 12 }}>{err}</Text>
            <Button label="Retry" onPress={() => load(filter)} tone="alert" />
          </Card>
        )}

        {!err && !loading && listings.length === 0 && (
          <Empty text={`No ${filter === "all" ? "" : filter + " "}listings yet.\nPost surplus produce from the Sell tab.`} />
        )}

        {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
});
