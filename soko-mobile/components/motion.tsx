import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Easing, Pressable, AccessibilityInfo,
  type StyleProp, type ViewStyle, type TextStyle,
} from "react-native";
import { Text } from "react-native";

/**
 * Lightweight motion kit for Soko, built on React Native's core Animated API
 * (no extra native dep — same approach the Sentinel app uses for its FAB/ticker).
 * Everything here honours the OS "reduce motion" setting and uses the native
 * driver, so it stays smooth on low-end farmer devices and never nauseates.
 */

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (alive) setReduced(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (v: boolean) => setReduced(!!v)
    );
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return reduced;
}

/** Staggered fade + rise on mount — gives lists a sense of arriving. */
export function Enter({
  children, index = 0, style,
}: { children: React.ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { p.setValue(1); return; }
    Animated.timing(p, {
      toValue: 1, duration: 380, delay: Math.min(index, 8) * 70,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [reduced]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: p, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Press micro-interaction: springy scale, so taps feel physical and confirmed. */
export function PressScale({
  children, onPress, disabled, style, scaleTo = 0.97, accessibilityLabel, accessibilityRole,
}: {
  children: React.ReactNode; onPress?: () => void; disabled?: boolean;
  style?: StyleProp<ViewStyle>; scaleTo?: number;
  accessibilityLabel?: string; accessibilityRole?: "button" | "link";
}) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(s, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? "button"}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Count a number up on appear — makes prices/money feel live rather than static. */
export function CountUp({
  value, prefix = "", suffix = "", duration = 800, style,
}: {
  value: number | null | undefined; prefix?: string; suffix?: string;
  duration?: number; style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value ?? 0);
  useEffect(() => {
    if (value == null) return;
    if (reduced) { setShown(value); return; }
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, duration]);
  if (value == null) return <Text style={style}>{prefix}—{suffix}</Text>;
  return <Text style={style}>{prefix}{shown.toLocaleString("en-KE")}{suffix}</Text>;
}

/** Scale + fade "pop" for confirmations (✓ Listed, claim confirmed, delivered). */
export function Pop({
  children, style,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const s = useRef(new Animated.Value(reduced ? 1 : 0.7)).current;
  const o = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.parallel([
      Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }),
      Animated.timing(o, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity: o, transform: [{ scale: s }] }]}>
      {children}
    </Animated.View>
  );
}
