import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { B, R, T, tint } from "./Kit";

export default function Pill({
  label, tone, pulse = false,
}: { label: string; tone: "ok" | "warn" | "bad" | "dim"; pulse?: boolean }) {
  const t = useTheme();
  const color = tone === "ok" ? t.ok : tone === "warn" ? t.accent : tone === "bad" ? t.alert : t.dim;

  // A gentle opacity heartbeat draws the eye to crop-critical states (frost /
  // drought / flood / high risk) without shouting. Static otherwise (no cost),
  // and static under the system's reduce-motion setting.
  const reduce = useReducedMotion();
  const animate = pulse && !reduce;
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animate) { a.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animate]);

  // The dot repeats the tone in shape as well as colour; the label is ink, so it reads in every theme.
  // Machine codes (GENERAL_ADVISORY, DISPATCH_APPROVED) are shown as words, never with underscores.
  return (
    <Animated.View style={[s.pill, { borderColor: color, backgroundColor: tint(color, 0.1), opacity: animate ? a : 1 }]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text maxFontSizeMultiplier={1.3} style={[s.txt, { color: t.ink }]}>{label.replace(/_/g, " ")}</Text>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%", minHeight: 24, borderWidth: B.control, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  txt: { ...T.label, letterSpacing: 0.8, flexShrink: 1 },
});
