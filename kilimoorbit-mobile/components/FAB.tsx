import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View, Modal, StyleSheet, Platform } from "react-native";
import { useTheme } from "../lib/theme-context";

// RN core types only expose `pressed`; react-native-web also provides `hovered`.
type PressState = { pressed: boolean; hovered?: boolean };

/** Apex §4.1 pulsing FAB → quick-action modal. */
export default function FAB({ actions }: { actions: { label: string; onPress: () => void }[] }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return (
    <>
      <Animated.View style={[s.fab, { backgroundColor: t.accent, transform: [{ scale }] }]}>
        <Pressable
          onPress={() => setOpen(true)}
          hitSlop={10}
          accessibilityLabel="Open quick actions"
          accessibilityRole="button"
          style={({ pressed, hovered }: PressState) => [
            Platform.OS === "web" && { cursor: "pointer" as const },
            (hovered || pressed) && { opacity: 0.8 },
          ]}
        >
          <Text style={[s.plus, { color: t.bg }]}>＋</Text>
        </Pressable>
      </Animated.View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={s.scrim}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close quick actions"
        >
          <View style={[s.sheet, { backgroundColor: t.panel, borderColor: t.line }]}>
            <Text style={[s.head, { color: t.dim }]}>QUICK ACTIONS</Text>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={() => { setOpen(false); a.onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                style={({ pressed, hovered }: PressState) => [
                  s.action,
                  { borderColor: hovered ? t.accent : t.line, opacity: pressed ? 0.6 : 1 },
                  Platform.OS === "web" && { cursor: "pointer" as const },
                ]}>
                <Text style={{ color: t.ink, fontSize: 15 }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
const s = StyleSheet.create({
  fab: { position: "absolute", right: 20, bottom: 26, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", elevation: 6 },
  plus: { fontSize: 28, fontWeight: "800", lineHeight: 32 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "flex-end" },
  sheet: { margin: 14, marginBottom: 100, borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  head: { fontFamily: "monospace", fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  action: { borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
});
