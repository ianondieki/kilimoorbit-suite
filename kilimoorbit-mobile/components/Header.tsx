import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../lib/theme-context";

export default function Header({
  engine, onMenu,
}: { engine: "LIVE" | "MOCK" | "OFFLINE"; onMenu: () => void }) {
  const t = useTheme();
  const dot = engine === "LIVE" ? t.ok : engine === "MOCK" ? t.accent : t.alert;
  return (
    <View style={[s.row, { borderBottomColor: t.line, backgroundColor: t.bg }]}>
      <Pressable onPress={onMenu} hitSlop={12} accessibilityLabel="Menu">
        <Text style={[s.burger, { color: t.ink }]}>☰</Text>
      </Pressable>
      <Text style={[s.brand, { color: t.ink }]}>
        KILIMO<Text style={{ color: t.accent }}>ORBIT</Text> SENTINEL
      </Text>
      <View style={s.status}>
        <View style={[s.dot, { backgroundColor: dot }]} />
        <Text style={[s.statusTxt, { color: t.dim }]}>
          {engine === "LIVE" ? "APEX LIVE" : engine === "MOCK" ? "MOCK" : "OFFLINE"}
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 14 },
  burger: { fontSize: 22, fontWeight: "700" },
  brand: { flex: 1, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 10, fontFamily: "monospace", letterSpacing: 1 },
});
