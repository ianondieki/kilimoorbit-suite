/**
 * Shared building blocks for the farm screens (Today, Shamba, Masoko,
 * Daktari): one card, one eyebrow, one button, one chip, one checklist row and
 * one sheet, so every screen reads as the same product. Same rules as the
 * login and sidebar: 48px touch targets for primary controls, a keyboard focus
 * ring on web, reduced-motion respected, glyphs decorative.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from "react-native";
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusElement, focusRing, isWeb, spaceActivates, webCursor, type PressState } from "../lib/ui";
import { CheckGlyph, CrossGlyph, MinusGlyph, PlusGlyph } from "./Glyphs";

/* ── type scale ── */
export const T = {
  title: { fontSize: 17, lineHeight: 22, fontWeight: "800" as const },
  body: { fontSize: 15, lineHeight: 22 },
  meta: { fontSize: 13, lineHeight: 18 },
  big: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const },
};

/** "#RRGGBB" + alpha (0..1) → "#RRGGBBAA". Theme colours are all 6-digit hex. */
export const tint = (hex: string, a: number) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex;

/* ── Card ── */
export function Card({
  children, style, tone = "plain",
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: "plain" | "alert" | "accent" }) {
  const t = useTheme();
  const border = tone === "alert" ? t.alert : tone === "accent" ? t.accent : t.line;
  return (
    <View style={[{ backgroundColor: t.panel, borderColor: border, borderWidth: 1, borderRadius: 16, padding: 16 }, style]}>
      {children}
    </View>
  );
}

/* ── Eyebrow: the small mono section label, with an optional right slot ── */
export function Eyebrow({ text, right, style }: { text: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 22, marginBottom: 10 }, style]}>
      <Text
        accessibilityRole="header"
        aria-level={2}
        style={{ flexShrink: 1, color: t.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace", fontWeight: "700", letterSpacing: 1.6 }}
      >
        {text}
      </Text>
      {right}
    </View>
  );
}

/* ── Button ── */
export function Btn({
  label, onPress, kind = "primary", icon, disabled, a11yLabel, style, small, testID,
}: {
  label: string; onPress: () => void; kind?: "primary" | "secondary" | "ghost" | "danger";
  icon?: (color: string) => React.ReactNode; disabled?: boolean; a11yLabel?: string;
  style?: StyleProp<ViewStyle>; small?: boolean; testID?: string;
}) {
  const t = useTheme();
  const fg = kind === "primary" || kind === "danger" ? t.field : kind === "ghost" ? t.accent : t.ink;
  const bg = kind === "primary" ? t.accent : kind === "danger" ? t.alert : "transparent";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed, hovered, focused }: PressState) => [
        {
          minHeight: small ? 44 : 52, borderRadius: 14, paddingHorizontal: kind === "ghost" ? 4 : 18,
          flexDirection: "row", alignItems: "center", justifyContent: kind === "ghost" ? "flex-start" : "center", gap: 8,
          backgroundColor: bg,
          ...(kind === "secondary" ? { borderWidth: 2, borderColor: t.dim } : null),
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        hovered && !disabled && (kind === "secondary" ? { backgroundColor: t.raised } : kind === "ghost" ? { opacity: 0.8 } : { opacity: 0.92 }),
        webCursor,
        focusRing(focused, t.accent),
        style,
      ]}
    >
      {icon?.(fg)}
      <Text maxFontSizeMultiplier={1.4} style={{ color: fg, fontSize: small ? 15 : 16, lineHeight: 22, fontWeight: kind === "primary" || kind === "danger" ? "800" : "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ── Chip: selectable pill (checkbox / radio / plain button) ── */
export function Chip({
  label, selected = false, onPress, leading, role = "button", a11yLabel, pressRef, keys, testID,
}: {
  label: string; selected?: boolean; onPress: () => void; leading?: React.ReactNode;
  role?: "button" | "checkbox" | "radio"; a11yLabel?: string;
  pressRef?: (el: View | null) => void; keys?: Record<string, unknown>; testID?: string;
}) {
  const t = useTheme();
  const toggle = role !== "button";
  return (
    <Pressable
      ref={pressRef}
      testID={testID}
      onPress={onPress}
      {...(role === "checkbox" ? spaceActivates(onPress) : null)}
      {...keys}
      accessibilityRole={role}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={toggle ? { checked: selected, selected } : undefined}
      {...(toggle ? { "aria-checked": selected } : null)}
      style={({ pressed, hovered, focused }: PressState) => [
        {
          minHeight: 44, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: "row", alignItems: "center", gap: 8,
          borderWidth: selected ? 2 : 1.5, borderColor: selected ? t.accent : t.line,
          backgroundColor: selected ? tint(t.accent, 0.14) : hovered ? t.raised : "transparent",
          opacity: pressed ? 0.8 : 1,
        },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      {toggle && selected && role === "checkbox" ? <CheckGlyph size={14} color={t.accent} /> : null}
      {leading}
      <Text maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: selected ? "700" : "500" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ── Tag: small status label (tinted, ink text for contrast in every theme) ── */
export function Tag({ label, tone = "dim" }: { label: string; tone?: "ok" | "warn" | "bad" | "dim" | "water" }) {
  const t = useTheme();
  const c = tone === "ok" ? t.ok : tone === "warn" ? t.accent : tone === "bad" ? t.alert : tone === "water" ? t.water : t.dim;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: tint(c, 0.16) }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
      <Text maxFontSizeMultiplier={1.3} style={{ color: t.ink, fontSize: 12.5, lineHeight: 16, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/* ── CheckRow: a task you can tick off ── */
export function CheckRow({
  checked, onToggle, title, meta, metaTone, leading, a11yLabel, testID,
}: {
  checked: boolean; onToggle: () => void; title: string; meta?: string; metaTone?: "late" | "soon";
  leading?: React.ReactNode; a11yLabel?: string; testID?: string;
}) {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      {...spaceActivates(onToggle)}
      accessibilityRole="checkbox"
      accessibilityLabel={a11yLabel ?? [title, meta].filter(Boolean).join(", ")}
      accessibilityState={{ checked }}
      aria-checked={checked}
      style={({ pressed, hovered, focused }: PressState) => [
        { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 },
        hovered && { backgroundColor: t.raised },
        pressed && { opacity: 0.75 },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <View
        style={{
          width: 26, height: 26, borderRadius: 8, borderWidth: 2,
          borderColor: checked ? t.ok : t.dim, backgroundColor: checked ? t.ok : "transparent",
          alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && <CheckGlyph size={15} color={t.field} />}
      </View>
      {leading}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: checked ? t.dim : t.ink, fontSize: 15, lineHeight: 20, fontWeight: "600",
            textDecorationLine: checked ? "line-through" : "none",
          }}
        >
          {title}
        </Text>
        {meta ? (
          <Text style={{ color: metaTone === "late" && !checked ? t.alert : t.dim, fontSize: 13, lineHeight: 18, fontWeight: metaTone ? "700" : "500" }}>
            {checked ? tt("tasks.doneA11y") : meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ── Stepper: − value + ── */
export function Stepper({
  value, onChange, step, min, max, format, label,
}: {
  value: number; onChange: (v: number) => void; step: number; min: number; max: number;
  format: (v: number) => string; label: string;
}) {
  const t = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const btn = (dir: -1 | 1) => {
    const disabled = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => onChange(clamp(value + dir * step))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${dir < 0 ? "−" : "+"}${format(step)}`}
        style={({ pressed, hovered, focused }: PressState) => [
          { width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderColor: t.dim, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.75 : 1 },
          hovered && !disabled && { backgroundColor: t.raised },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        {dir < 0 ? <MinusGlyph size={18} color={t.ink} /> : <PlusGlyph size={18} color={t.ink} />}
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {btn(-1)}
      <Text
        accessibilityLiveRegion="polite"
        aria-live="polite"
        style={{ minWidth: 88, textAlign: "center", color: t.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" }}
      >
        {format(value)}
      </Text>
      {btn(1)}
    </View>
  );
}

/* ── Empty state ── */
export function Empty({ glyph, title, body, action }: { glyph?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 20, paddingHorizontal: 8, gap: 8 }}>
      {glyph}
      <Text style={{ color: t.ink, ...T.title, textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ color: t.dim, ...T.body, textAlign: "center", maxWidth: 420 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 8, alignSelf: "stretch", alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}

/* ── Sheet: bottom sheet on phones, centred dialog from 600px ── */
export function Sheet({
  visible, onClose, title, children, footer, testID,
}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
  footer?: React.ReactNode; testID?: string;
}) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const dialog = width >= 600;
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(dialog ? 24 : height);
  const o = useSharedValue(0);
  const closeRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const from = dialog ? 24 : Math.min(height, 640);
      y.value = reduce ? 0 : from;
      y.value = reduce ? 0 : withSpring(0, { damping: 26, stiffness: 260, overshootClamping: true, reduceMotion: ReduceMotion.System });
      o.value = withTiming(1, { duration: reduce ? 100 : 180 });
      const id = setTimeout(() => focusElement(closeRef), 90);
      return () => clearTimeout(id);
    }
    if (!mounted) return;
    const done = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(setMounted, false);
    };
    if (reduce) { o.value = withTiming(0, { duration: 100 }, done); return; }
    o.value = withTiming(0, { duration: 160 });
    y.value = withTiming(dialog ? 24 : Math.min(height, 640), { duration: 180, easing: Easing.in(Easing.quad) }, done);
  }, [visible]);

  const scrim = useAnimatedStyle(() => ({ opacity: o.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: dialog || reduce ? o.value : 1 }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: dialog ? "center" : "flex-end", alignItems: dialog ? "center" : "stretch" }}>
        <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }, scrim]}>
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={onClose}
            accessible={false}
            importantForAccessibility="no"
            {...(isWeb ? ({ "aria-hidden": true } as any) : null)}
            style={[{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }, webCursor]}
          />
        </Animated.View>
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={title}
          style={[
            {
              backgroundColor: t.panel, borderColor: t.line, borderWidth: 1,
              maxHeight: dialog ? Math.min(height - 48, 760) : height - insets.top - 24,
              ...(dialog
                ? { width: Math.min(560, width - 48), borderRadius: 20 }
                : { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomWidth: 0, paddingBottom: insets.bottom }),
              overflow: "hidden",
            },
            panel,
          ]}
        >
          {!dialog && <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: t.line, marginTop: 8 }} />}
          <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 6, minHeight: 56 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, fontSize: 19, lineHeight: 24, fontWeight: "800" }}>{title}</Text>
            <Pressable
              ref={closeRef}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={tt("common.close")}
              style={({ pressed, hovered, focused }: PressState) => [
                { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
                (hovered || pressed) && { backgroundColor: t.raised },
                webCursor, focusRing(focused, t.accent),
              ]}
            >
              <CrossGlyph size={18} color={t.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 18 }}>
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ borderTopWidth: 1, borderTopColor: t.line, padding: 16, flexDirection: "row", gap: 10 }}>{footer}</View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A labelled group inside a sheet or card. */
export function Group({ label, children, style }: { label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 10 }, style]}>
      <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{label}</Text>
      {children}
    </View>
  );
}

/** Wrapping row of chips. */
export function ChipRow({ children, label, role }: { children: React.ReactNode; label?: string; role?: "radiogroup" | "group" }) {
  return (
    <View accessibilityRole={role === "radiogroup" ? "radiogroup" : undefined} {...(role === "group" ? { role: "group" } : null)} accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {children}
    </View>
  );
}
