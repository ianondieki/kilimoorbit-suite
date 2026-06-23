import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme-context";
import { Header, Card, Button, Field, Badge } from "../../components/ui";
import {
  createListing, suggestPrice, fmtKES, priceDelta,
  type PriceSuggest, type Listing,
} from "../../lib/api";

export default function Sell() {
  const t = useTheme();
  const [farmer, setFarmer] = useState("");
  const [crop, setCrop] = useState("");
  const [county, setCounty] = useState("");
  const [qty, setQty] = useState("");
  const [ask, setAsk] = useState("");

  const [hint, setHint] = useState<PriceSuggest | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<Listing | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const checkPrice = async () => {
    setErr(null); setHint(null);
    if (!crop.trim()) { setErr("Enter a crop to check the market price."); return; }
    try {
      setBusy(true);
      setHint(await suggestPrice(crop.trim()));
    } catch (e: any) {
      setErr(e?.message ?? "Could not fetch the market price.");
    } finally { setBusy(false); }
  };

  const submit = async () => {
    setErr(null); setPosted(null);
    const qty_kg = Number(qty), ask_per_kg = Number(ask);
    try {
      setBusy(true);
      const { listing } = await createListing({
        farmer_name: farmer.trim(), crop: crop.trim(), county: county.trim(), qty_kg, ask_per_kg,
      });
      setPosted(listing);
      setFarmer(""); setCrop(""); setCounty(""); setQty(""); setAsk(""); setHint(null);
    } catch (e: any) {
      setErr(e?.message ?? "Could not post the listing.");
    } finally { setBusy(false); }
  };

  const askNum = Number(ask);
  const liveDelta = hint?.found && askNum > 0 ? priceDelta(askNum, hint.fair_price_per_kg) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header title="Sell" subtitle="List surplus produce" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {posted && (
          <Card style={{ borderColor: t.ok }}>
            <Text style={{ color: t.ok, fontWeight: "800", marginBottom: 6 }}>✓ LISTED</Text>
            <Text style={{ color: t.ink }}>
              {posted.qty_kg} kg of {posted.crop} in {posted.county} at {fmtKES(posted.ask_per_kg)}/kg.
              {posted.fair_price_per_kg != null ? ` Market sits at ${fmtKES(posted.fair_price_per_kg)}/kg.` : ""}
            </Text>
          </Card>
        )}
        {err && (
          <Card style={{ borderColor: t.alert }}>
            <Text style={{ color: t.alert }}>{err}</Text>
          </Card>
        )}

        <Card>
          <Field label="Your name" value={farmer} onChangeText={setFarmer} placeholder="e.g. Wanjiku" />
          <Field label="Crop" value={crop} onChangeText={setCrop} placeholder="e.g. tomato, maize, onions" />
          <Field label="County" value={county} onChangeText={setCounty} placeholder="e.g. Meru" />
          <Field label="Quantity (kg)" value={qty} onChangeText={setQty} placeholder="e.g. 200" keyboardType="numeric" />
          <Field label="Your ask (KES / kg)" value={ask} onChangeText={setAsk} placeholder="e.g. 45" keyboardType="numeric" />

          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Button label={busy ? "…" : "Check market price"} onPress={checkPrice} disabled={busy} tone="dim" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={busy ? "…" : "Post listing"} onPress={submit} disabled={busy} />
            </View>
          </View>
        </Card>

        {hint && (
          <Card>
            <Text style={[st.head, { color: t.dim }]}>MARKET PRICE · {hint.crop.toUpperCase()}</Text>
            {hint.found ? (
              <>
                <View style={st.rowBetween}>
                  <Text style={[st.fair, { color: t.accent }]}>{fmtKES(hint.fair_price_per_kg)}/kg</Text>
                  {liveDelta && <Badge label={liveDelta.label} tone={liveDelta.tone} />}
                </View>
                <Text style={{ color: t.dim, marginTop: 6, fontSize: 12 }}>
                  Best: {hint.best_market} at {fmtKES(hint.best_price_per_kg)}/kg
                </Text>
                <View style={{ marginTop: 10, gap: 4 }}>
                  {hint.markets.map((m) => (
                    <View key={m.market} style={st.rowBetween}>
                      <Text style={{ color: t.dim, fontSize: 13 }}>{m.market}</Text>
                      <Text style={{ color: t.ink, fontSize: 13 }}>
                        {fmtKES(m.price)} {m.delta >= 0 ? "▲" : "▼"}{Math.abs(m.delta)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={{ color: t.dim }}>
                Not tracked on the commodity board yet — price it from local knowledge.
              </Text>
            )}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, marginTop: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  head: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  fair: { fontSize: 22, fontWeight: "800" },
});
