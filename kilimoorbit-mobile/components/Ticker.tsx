import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View, StyleSheet } from "react-native";
import { useTheme } from "../lib/theme-context";

/** Apex §4.1 marquee ticker — commodity prices + active alerts. */
export default function Ticker({ items }: { items: string[] }) {
  const t = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (!w) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -w, duration: Math.max(12000, w * 28), easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [w, items.join("|")]);

  const line = items.join("      •      ");
  return (
    <View style={[s.wrap, { backgroundColor: t.panel, borderBottomColor: t.line }]}>
      <Animated.View style={{ flexDirection: "row", transform: [{ translateX: x }] }}>
        <Text onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[s.txt, { color: t.dim }]} numberOfLines={1}>
          {line}      •      
        </Text>
        <Text style={[s.txt, { color: t.dim }]} numberOfLines={1}>{line}      •      </Text>
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { borderBottomWidth: 1, paddingVertical: 6, overflow: "hidden" },
  txt: { fontFamily: "monospace", fontSize: 11 },
});
