import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View, StyleSheet, Platform } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";

const nowrap: any = Platform.OS === "web" ? { whiteSpace: "nowrap" } : null;

/**
 * Apex §4.1 marquee ticker: commodity prices + active alerts. Decorative
 * duplicate of data shown in full on the screen, so it is hidden from screen
 * readers. Reduced motion: a still, single line.
 */
export default function Ticker({ items }: { items: string[] }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (!w || reduce) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -w, duration: Math.max(12000, w * 28), easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [w, reduce, items.join("|")]);

  const line = items.join("      •      ") + "      •      ";
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[s.wrap, { backgroundColor: t.panel, borderBottomColor: t.line }]}
    >
      {reduce ? (
        <Text style={[s.txt, { color: t.dim, paddingHorizontal: 16 }]} numberOfLines={1}>{line}</Text>
      ) : (
        // Each copy keeps its natural width (no shrink, no ellipsis) so the loop is seamless.
        <Animated.View style={{ flexDirection: "row", alignSelf: "flex-start", transform: [{ translateX: x }] }}>
          <Text onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[s.txt, s.copy, nowrap, { color: t.dim }]}>{line}</Text>
          <Text style={[s.txt, s.copy, nowrap, { color: t.dim }]}>{line}</Text>
        </Animated.View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { borderBottomWidth: 1, paddingVertical: 6, overflow: "hidden" },
  txt: { fontFamily: "monospace", fontSize: 11 },
  copy: { flexShrink: 0 },
});
