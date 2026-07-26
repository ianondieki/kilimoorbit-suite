import React, { useEffect, useState } from "react";
import { Platform, Pressable, View, ViewStyle, StyleProp, Text, TextStyle } from "react-native";
import Animated, {
  FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle,
  withSpring, withRepeat, withTiming, Easing,
} from "react-native-reanimated";

/* ── Staggered spring entrance (your F1-app signature) ── */
export function Enter({
  children, index = 0, from = "down", style,
}: {
  children: React.ReactNode; index?: number;
  from?: "down" | "up"; style?: StyleProp<ViewStyle>;
}) {
  const anim = (from === "down" ? FadeInDown : FadeInUp)
    .delay(index * 90)
    .springify()
    .damping(15)
    .stiffness(140);
  return (
    <Animated.View entering={anim} style={style}>
      {children}
    </Animated.View>
  );
}

/* ── Press micro-interaction: spring scale ── */
export function PressScale({
  children, onPress, disabled, style, scaleTo = 0.96, accessibilityLabel,
}: {
  children: React.ReactNode; onPress?: () => void; disabled?: boolean;
  style?: StyleProp<ViewStyle>; scaleTo?: number; accessibilityLabel?: string;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={Platform.OS === "web" ? { cursor: "pointer" } : undefined}
      onPressIn={() => { s.value = withSpring(scaleTo, { damping: 18, stiffness: 320 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 14, stiffness: 220 }); }}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ── Animated KES count-up with ease-out ── */
export function CountUp({
  value, prefix = "KES ", suppressedLabel = "— suppressed",
  duration = 900, style,
}: {
  value: number | null | undefined; prefix?: string;
  suppressedLabel?: string; duration?: number; style?: StyleProp<TextStyle>;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value == null) return;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // cubic ease-out
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (value == null) return <Text style={style}>{suppressedLabel}</Text>;
  return <Text style={style}>{prefix}{shown.toLocaleString("en-KE")}</Text>;
}

/* ── Shimmer skeleton block ── */
export function Skeleton({
  height = 16, width = "100%" as ViewStyle["width"], radius = 8, color = "#888",
  style,
}: {
  height?: number; width?: ViewStyle["width"]; radius?: number; color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withRepeat(
      withTiming(0.9, { duration: 750, easing: Easing.inOut(Easing.quad) }),
      -1, true
    );
  }, []);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ height, width, borderRadius: radius, backgroundColor: color }, a, style]}
    />
  );
}

/* ── Narrated "thinking" indicator — turns a long LIVE wait into a story
      of what the engine is doing (masoko prices → weather → net profit) ── */
export function Thinking({
  color, messages = ["Working…"],
}: { color: string; messages?: string[] }) {
  const [i, setI] = useState(0);
  const [dots, setDots] = useState("");
  useEffect(() => {
    const m = setInterval(() => setI((x) => (x + 1) % messages.length), 1600);
    const d = setInterval(() => setDots((s) => (s.length >= 3 ? "" : s + "•")), 450);
    return () => { clearInterval(m); clearInterval(d); };
  }, [messages.length]);
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, a]} />
      <Text style={{ color, fontFamily: "monospace", fontSize: 11, letterSpacing: 1 }}>
        {messages[i]} {dots}
      </Text>
    </View>
  );
}

/* ── Animated risk bar: fills to a level on mount ── */
export function LevelBar({
  pct, color, track, height = 6,
}: { pct: number; color: string; track: string; height?: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withSpring(pct, { damping: 18, stiffness: 90 });
  }, [pct]);
  const a = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, a]} />
    </Animated.View>
  );
}
