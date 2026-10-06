/**
 * Labelled input: glyph + label row, a 2px-bordered well with an animated
 * accent focus ring, a right-side validity slot, and a reserved status line
 * (helper / echo / error) announced politely to screen readers.
 */
import React, { useEffect, useId, useState } from "react";
import {
  View, TextInput, StyleSheet, type TextInputProps, type TextStyle, type StyleProp,
  type ViewStyle, type LayoutChangeEvent,
} from "react-native";
import Text from "./Text";
import { SANS, isBundled, weightKey } from "../lib/typography";
import Animated, {
  FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue,
  withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { isWeb, noOutline } from "../lib/ui";
import { CheckCoin, CheckGlyph, CrossGlyph } from "./Glyphs";

export type FieldStatus =
  | { kind: "rest"; text: string }
  | { kind: "note"; text: string }
  | { kind: "valid"; text: string }
  | { kind: "error"; text: string }
  | null;

type Props = {
  label: string;
  glyph: React.ReactNode;
  labelRight?: React.ReactNode;
  value: string;
  onChangeText: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  height: number;
  inputStyle: StyleProp<TextStyle>;
  status: FieldStatus;
  valid?: boolean;
  error?: boolean;
  /** Increment to shake the field (skipped under reduced motion). */
  shakeKey?: number;
  statusMinHeight?: number;
  inputProps?: TextInputProps;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

export default function Field({
  label, glyph, labelRight, value, onChangeText, onFocus, onBlur, inputRef, height, inputStyle,
  status, valid, error, shakeKey = 0, statusMinHeight = 24, inputProps, onLayout, style,
}: Props) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);
  // Ties the status line (helper / error) to the input for web screen readers.
  const statusId = "ko-status-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withTiming(focused ? 1 : 0, { duration: 140, reduceMotion: ReduceMotion.System });
  }, [focused]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value }));

  const tx = useSharedValue(0);
  useEffect(() => {
    if (!shakeKey || reduce) return;
    const d = { duration: 50 };
    tx.value = withSequence(withTiming(-6, d), withTiming(6, d), withTiming(-4, d), withTiming(4, d), withTiming(0, d));
  }, [shakeKey]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const coin = useSharedValue(valid ? 1 : 0);
  useEffect(() => {
    coin.value = valid
      ? withSpring(1, { damping: 14, stiffness: 260, reduceMotion: ReduceMotion.System })
      : 0;
  }, [valid]);
  const coinStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, coin.value * 2),
    transform: [{ scale: 0.5 + 0.5 * coin.value }],
  }));

  const hint = status && (status.kind === "error" || status.kind === "rest" || status.kind === "note") ? status.text : undefined;
  // TextInput bypasses the Text wrapper, so the bundled sans is picked here from the weight asked for.
  const inp = (StyleSheet.flatten(inputStyle) || {}) as TextStyle;
  const typed: TextStyle = { ...inp, fontFamily: isBundled(inp.fontFamily) ? inp.fontFamily : SANS[weightKey(inp.fontWeight)], fontWeight: undefined };

  return (
    <Animated.View style={[shakeStyle, style]} onLayout={onLayout}>
      <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {glyph}
        <Text
          style={{ flex: 1, color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}
          onPress={() => inputRef?.current?.focus()}
          accessible={false}
          importantForAccessibility="no"
        >
          {label}
        </Text>
        {labelRight}
      </View>

      <View
        style={{
          height, borderRadius: 14, backgroundColor: t.field, borderWidth: 2,
          borderColor: error ? t.alert : t.dim, flexDirection: "row", alignItems: "center",
        }}
      >
        <Animated.View
          style={[{ pointerEvents: "none",
            // Absolute offsets count from inside the 2px border, so -8 puts the
            // ring 6px outside the border's outer edge: a clear 3px gap of
            // background between the 3px ring and the border, so a red error
            // border still reads as red while the field is focused after a
            // failed submit. Radius 20 = the well's 14 + 6.
            position: "absolute", left: -8, right: -8, top: -8, bottom: -8,
            borderRadius: 20, borderWidth: 3, borderColor: t.accent,
          }, ringStyle]}
        />
        <TextInput
          ref={inputRef as any}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          placeholderTextColor={t.dim}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={label}
          accessibilityHint={hint}
          aria-invalid={error ? true : undefined}
          {...(isWeb && status?.text ? ({ "aria-describedby": statusId } as any) : null)}
          {...inputProps}
          style={[{ flex: 1, alignSelf: "stretch", paddingLeft: 16, paddingRight: 4, color: t.ink }, noOutline, typed]}
        />
        <View style={{ width: 48, alignItems: "center", justifyContent: "center" }}>
          {valid && !error ? (
            <Animated.View style={coinStyle}>
              <CheckCoin size={28} bg={t.ok} fg={t.field} />
            </Animated.View>
          ) : error ? (
            <CrossGlyph size={18} color={t.alert} />
          ) : null}
        </View>
      </View>

      <View
        id={statusId}
        accessibilityLiveRegion="polite"
        aria-live="polite"
        style={{ marginTop: 6, minHeight: statusMinHeight }}
      >
        {status && status.text ? (
          <StatusLine key={`${status.kind}:${status.text}`} status={status} reduce={reduce} />
        ) : null}
      </View>
    </Animated.View>
  );
}

function StatusLine({ status, reduce }: { status: NonNullable<FieldStatus>; reduce: boolean }) {
  const t = useTheme();
  const entering = status.kind === "error" && !reduce ? FadeInDown.duration(160) : undefined;
  const row: ViewStyle = { flexDirection: "row", gap: 6, alignItems: "flex-start" };
  if (status.kind === "error")
    return (
      <Animated.View entering={entering} style={row}>
        <CrossGlyph size={12} color={t.alert} style={{ marginTop: 5 }} />
        <Text numberOfLines={2} style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" }}>
          {status.text}
        </Text>
      </Animated.View>
    );
  if (status.kind === "valid")
    return (
      <View style={row}>
        <CheckGlyph size={12} color={t.ok} style={{ marginTop: 4 }} />
        <Text style={{ flex: 1, color: t.ink, fontSize: 14, lineHeight: 20, fontWeight: "700", fontFamily: "monospace" }}>
          {status.text}
        </Text>
      </View>
    );
  return (
    <Text
      style={{
        color: status.kind === "note" ? t.ink : t.dim, fontSize: 14, lineHeight: 20,
        fontWeight: "500",
      }}
    >
      {status.text}
    </Text>
  );
}

