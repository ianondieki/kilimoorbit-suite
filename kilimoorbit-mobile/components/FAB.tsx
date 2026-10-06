import React, { useState } from "react";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, webCursor, type PressState } from "../lib/ui";
import { PlusGlyph } from "./Glyphs";
import { Sheet } from "./Kit";

export type FabAction = { label: string; glyph: (color: string) => React.ReactNode; onPress: () => void; testID?: string };

/**
 * Apex §4.1 floating action button → quick-action sheet. Still (no looping
 * pulse): it sits on every visit, so motion there would only distract.
 */
export default function FAB({ actions }: { actions: FabAction[] }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID="fab"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tt("fab.open")}
        style={({ pressed, hovered, focused }: PressState) => [
          s.fab,
          { backgroundColor: t.accent, opacity: pressed ? 0.85 : hovered ? 0.92 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
          webCursor, focusRing(focused, t.ink),
        ]}
      >
        <PlusGlyph size={24} color={t.field} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={tt("fab.open")}>
        <View style={{ gap: 4 }}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              testID={a.testID}
              onPress={() => { setOpen(false); a.onPress(); }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed, hovered, focused }: PressState) => [
                s.action,
                (hovered || pressed) && { backgroundColor: t.raised },
                webCursor, focusRing(focused, t.accent),
              ]}
            >
              <View style={[s.coin, { backgroundColor: t.raised, borderColor: t.line }]}>{a.glyph(t.accent)}</View>
              <Text style={{ flex: 1, color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}
const s = StyleSheet.create({
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29,
    alignItems: "center", justifyContent: "center", elevation: 6,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 4px 14px rgba(0,0,0,0.35)" } as object)
      : { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  action: { minHeight: 60, borderRadius: 14, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: -8 },
  coin: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
