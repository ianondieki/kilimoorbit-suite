import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme, useThemeControls } from "../lib/theme-context";
import { THEMES } from "../lib/themes";

/** Apex §4.1 hamburger sidebar: Settings, Notification Profiles, Sign Out. */
export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const { setThemeKey } = useThemeControls();
  const Item = ({ label }: { label: string }) => (
    <Pressable onPress={onClose} style={({ pressed }) => [s.item, { borderBottomColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: t.ink, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose}>
        <Pressable style={[s.panel, { backgroundColor: t.panel, borderRightColor: t.line }]} onPress={() => {}}>
          <Text style={[s.head, { color: t.dim }]}>KILIMOORBIT MENU</Text>
          <Item label="⚙  Settings" />
          <Item label="🔔  Notification Profiles" />
          <Item label="🗂  Quick Access Tabs" />
          <Text style={[s.head, { color: t.dim, marginTop: 18 }]}>THEME</Text>
          <View style={s.swatches}>
            {THEMES.map((th) => (
              <Pressable key={th.key} onPress={() => setThemeKey(th.key)}
                style={[s.swatch, { backgroundColor: th.bg, borderColor: th.accent }]}>
                <Text style={{ color: th.accent, fontSize: 11, fontWeight: "700" }}>{th.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Item label="↩  Sign Out" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,.45)" },
  panel: { width: 270, flex: 1, padding: 18, borderRightWidth: 1 },
  head: { fontFamily: "monospace", fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  item: { paddingVertical: 14, borderBottomWidth: 1 },
  swatches: { flexDirection: "row", gap: 8 },
  swatch: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
});
