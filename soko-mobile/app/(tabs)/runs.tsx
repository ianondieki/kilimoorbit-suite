import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { Header, Card, Button, Field, Empty } from "../../components/ui";
import { ListingCard } from "../../components/ListingCard";
import { getListings, claimListing, type Listing } from "../../lib/api";

export default function Runs() {
  const t = useTheme();
  const [open, setOpen] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Claim modal state
  const [target, setTarget] = useState<Listing | null>(null);
  const [claimer, setClaimer] = useState("");
  const [role, setRole] = useState<"rider" | "buyer">("rider");
  const [busy, setBusy] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { listings } = await getListings("open");
      setOpen(listings);
    } catch (e: any) {
      setErr(e?.message ?? "Cannot reach the Sentinel server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitClaim = async () => {
    if (!target) return;
    if (!claimer.trim()) { setModalErr("Enter your name or rider ID."); return; }
    try {
      setBusy(true); setModalErr(null);
      await claimListing(target.id, claimer.trim(), role);
      setTarget(null); setClaimer("");
      load();
    } catch (e: any) {
      setModalErr(e?.message ?? "Could not claim this run.");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header title="Runs" subtitle="Open delivery runs to claim" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.accent}
            onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        {err && (
          <Card style={{ borderColor: t.alert }}>
            <Text style={{ color: t.alert, fontWeight: "700", marginBottom: 6 }}>CONNECTION</Text>
            <Text style={{ color: t.ink, marginBottom: 12 }}>{err}</Text>
            <Button label="Retry" onPress={load} tone="alert" />
          </Card>
        )}
        {!err && !loading && open.length === 0 && (
          <Empty text={"No open runs right now.\nPull to refresh."} />
        )}
        {open.map((l) => (
          <ListingCard key={l.id} listing={l} onClaim={(x) => { setTarget(x); setModalErr(null); }} />
        ))}
      </ScrollView>

      <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={st.backdrop}>
          <View style={[st.sheet, { backgroundColor: t.panel, borderColor: t.line }]}>
            <Text style={[st.sheetTitle, { color: t.ink }]}>
              Claim {target?.qty_kg} kg {target?.crop}
            </Text>
            <Text style={{ color: t.dim, marginBottom: 14 }}>
              {target?.county} · {target?.farmer_name}
            </Text>

            <View style={st.roleRow}>
              {(["rider", "buyer"] as const).map((r) => {
                const active = role === r;
                return (
                  <Pressable key={r} onPress={() => setRole(r)}
                    style={[st.roleChip, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.raised : "transparent" }]}>
                    <Text style={{ color: active ? t.accent : t.dim, fontWeight: "700", textTransform: "capitalize" }}>
                      {r === "rider" ? "🛵 Rider" : "🧺 Buyer"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Field label={role === "rider" ? "Rider ID / name" : "Your name"} value={claimer}
              onChangeText={setClaimer} placeholder={role === "rider" ? "e.g. EBODA-KE-007" : "e.g. Achieng"} />

            {modalErr && <Text style={{ color: t.alert, marginBottom: 10 }}>{modalErr}</Text>}

            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" onPress={() => setTarget(null)} tone="dim" />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={busy ? "…" : "Confirm claim"} onPress={submitClaim} disabled={busy} tone="ok" />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 18, fontWeight: "800", textTransform: "capitalize" },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  roleChip: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  row: { flexDirection: "row", gap: 10, marginTop: 4 },
});
