import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { useTheme } from "../lib/theme-context";

export default function Pill({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "dim" }) {
  const t = useTheme();
  const color = tone === "ok" ? t.ok : tone === "warn" ? t.accent : tone === "bad" ? t.alert : t.dim;
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <Text style={[s.txt, { color }]}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  txt: { fontFamily: "monospace", fontSize: 9.5, letterSpacing: 0.8 },
});
