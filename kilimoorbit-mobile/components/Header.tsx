import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, AccessibilityInfo, StyleSheet, Platform } from "react-native";
import { useTheme } from "../lib/theme-context";

// RN core types only expose `pressed`; react-native-web also provides `hovered`.
type PressState = { pressed: boolean; hovered?: boolean };

export default function Header({
  engine, onMenu,
}: { engine: "LIVE" | "MOCK" | "OFFLINE"; onMenu: () => void }) {
  const t = useTheme();
  const dot = engine === "LIVE" ? t.ok : engine === "MOCK" ? t.accent : t.alert;
  const online = engine === "LIVE" || engine === "MOCK";

  // Status heartbeat: an expanding halo when connected (the engine is alive and
  // watching), a slow blink when offline. Respects the OS reduce-motion switch.
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => setReduced(!!v)).catch(() => {});
  }, []);
  useEffect(() => {
    pulse.setValue(0);
    if (reduced) return;
    const loop = Animated.loop(
      online
        ? Animated.timing(pulse, {
            toValue: 1, duration: engine === "LIVE" ? 1600 : 2400,
            easing: Easing.out(Easing.ease), useNativeDriver: true,
          })
        : Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 620, useNativeDriver: true }),
          ])
    );
    loop.start();
    return () => loop.stop();
  }, [engine, reduced]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const dotOpacity = online ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });

  return (
    <View style={[s.row, { borderBottomColor: t.line, backgroundColor: t.bg }]}>
      <Pressable
        onPress={onMenu}
        hitSlop={12}
        accessibilityLabel="Open menu"
        accessibilityRole="button"
        style={({ pressed, hovered }: PressState) => [
          Platform.OS === "web" && { cursor: "pointer" as const },
          (hovered || pressed) && { opacity: 0.7 },
        ]}
      >
        <Text style={[s.burger, { color: t.ink }]}>☰</Text>
      </Pressable>
      <Text style={[s.brand, { color: t.ink }]}>
        KILIMO<Text style={{ color: t.accent }}>ORBIT</Text> SENTINEL
      </Text>
      <View style={s.status}>
        <View style={s.dotWrap}>
          {online && !reduced && (
            <Animated.View
              style={[s.halo, { backgroundColor: dot, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
            />
          )}
          <Animated.View style={[s.dot, { backgroundColor: dot, opacity: dotOpacity }]} />
        </View>
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
  dotWrap: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 10, fontFamily: "monospace", letterSpacing: 1 },
});
