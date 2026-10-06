import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";

export default function Pill({
  label, tone, pulse = false,
}: { label: string; tone: "ok" | "warn" | "bad" | "dim"; pulse?: boolean }) {
  const t = useTheme();
  const color = tone === "ok" ? t.ok : tone === "warn" ? t.accent : tone === "bad" ? t.alert : t.dim;

  // A gentle opacity heartbeat draws the eye to crop-critical states (frost /
  // drought / flood / high risk) without shouting. Static otherwise (no cost).
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[s.pill, { borderColor: color, opacity: pulse ? a : 1 }]}>
      <Text style={[s.txt, { color }]}>{label}</Text>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  txt: { fontFamily: "monospace", fontSize: 9.5, letterSpacing: 0.8 },
});
