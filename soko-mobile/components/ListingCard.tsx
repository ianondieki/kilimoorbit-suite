import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../lib/theme-context";
import { Badge, Button } from "./ui";
import { fmtKES, priceDelta, type Listing } from "../lib/api";

const CROP_EMOJI: Record<string, string> = {
  maize: "🌽", beans: "🫘", onions: "🧅", carrots: "🥕", oranges: "🍊",
  tomato: "🍅", tomatoes: "🍅", potato: "🥔", potatoes: "🥔", cabbage: "🥬",
  banana: "🍌", bananas: "🍌", mango: "🥭", mangoes: "🥭", avocado: "🥑",
};
const emojiFor = (crop: string) => CROP_EMOJI[crop.trim().toLowerCase()] ?? "🌾";

export function ListingCard({
  listing, onClaim,
}: { listing: Listing; onClaim?: (l: Listing) => void }) {
  const t = useTheme();
  const d = priceDelta(listing.ask_per_kg, listing.fair_price_per_kg);
  const statusTone = listing.status === "open" ? "ok" : listing.status === "claimed" ? "accent" : "dim";

  return (
    <View style={[st.card, { backgroundColor: t.panel, borderColor: t.line }]}>
      <View style={st.rowBetween}>
        <Text style={[st.title, { color: t.ink }]}>
          {emojiFor(listing.crop)} {listing.crop}
        </Text>
        <Badge label={listing.status.toUpperCase()} tone={statusTone} />
      </View>

      <Text style={[st.meta, { color: t.dim }]}>
        {listing.qty_kg} kg · {listing.county} · {listing.farmer_name}
      </Text>

      <View style={[st.priceRow, { borderTopColor: t.line }]}>
        <View>
          <Text style={[st.askLabel, { color: t.dim }]}>ASK</Text>
          <Text style={[st.ask, { color: t.accent }]}>{fmtKES(listing.ask_per_kg)}/kg</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Badge label={d.label} tone={d.tone} />
          <Text style={[st.fair, { color: t.dim }]}>
            market {fmtKES(listing.fair_price_per_kg)}
            {listing.best_market ? ` · ${listing.best_market}` : ""}
          </Text>
        </View>
      </View>

      {onClaim && listing.status === "open" && (
        <View style={{ marginTop: 12 }}>
          <Button label="Claim this run" onPress={() => onClaim(listing)} />
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 17, fontWeight: "800", textTransform: "capitalize" },
  meta: { fontSize: 13, marginTop: 4 },
  priceRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    marginTop: 12, paddingTop: 12, borderTopWidth: 1,
  },
  askLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  ask: { fontSize: 20, fontWeight: "800", marginTop: 2 },
  fair: { fontSize: 11, marginTop: 4 },
});
