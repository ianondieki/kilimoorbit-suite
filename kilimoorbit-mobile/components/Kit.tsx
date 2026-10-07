/**
 * Shared building blocks for the farm screens (Today, Shamba, Masoko,
 * Daktari): one card, one eyebrow, one button, one chip, one checklist row and
 * one sheet, so every screen reads as the same product. Same rules as the
 * login and sidebar: 48px touch targets for primary controls, a keyboard focus
 * ring on web, reduced-motion respected, glyphs decorative.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from "react-native";
import Text from "./Text";
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme-context";
import type { Theme } from "../lib/themes";
import { useLang } from "../lib/session";
import { focusElement, focusRing, isWeb, spaceActivates, webCursor, type PressState } from "../lib/ui";
import { haptic } from "../lib/haptics";
import { DISPLAY } from "../lib/typography";
import { CheckGlyph, CrossGlyph, MinusGlyph, PlusGlyph } from "./Glyphs";

/* ── type scale (Nunito Sans; the three display presets are Space Grotesk) ── */
export const T = {
  title: { fontSize: 17, lineHeight: 22, fontWeight: "700" as const },
  body: { fontSize: 15.5, lineHeight: 22 },
  meta: { fontSize: 13, lineHeight: 18 },
  big: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const },
  /** A headline inside a card: a news title, a show's name, a trivia question. */
  headline: { fontFamily: DISPLAY["600"], fontSize: 19, lineHeight: 26 },
  /** A screen's greeting or a sheet's title. */
  display: { fontFamily: DISPLAY["600"], fontSize: 24, lineHeight: 30 },
  /** The one big line on a screen. */
  displayLg: { fontFamily: DISPLAY["700"], fontSize: 30, lineHeight: 36 },
};

/** "#RRGGBB" + alpha (0..1) → "#RRGGBBAA". Theme colours are all 6-digit hex. */
export const tint = (hex: string, a: number) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex;

/* ── section hues: each kind of card has a colour, worn by its label and icon badge ── */
export type Domain = "weather" | "farm" | "market" | "money" | "doctor" | "alerts" | "news" | "season" | "shows" | "store" | "soil" | "quiz" | "herd";
export function domainColor(t: Theme, d?: Domain): string {
  switch (d) {
    case "weather": return t.water;
    case "farm": return t.ok;
    case "market": case "money": return t.accent;
    case "doctor": case "alerts": return t.alert;
    case "news": case "season": return t.violet;
    case "shows": case "store": case "soil": return t.amber;
    case "quiz": return t.teal;
    case "herd": return t.rose;
    default: return t.dim;
  }
}

/** A small tinted square holding a glyph: the mark of a section. */
export function IconBadge({ color, size = 28, children }: { color: string; size?: number; children: React.ReactNode }) {
  return (
    <View testID="icon-badge" style={{ width: size, height: size, borderRadius: Math.round(size * 0.34), backgroundColor: tint(color, 0.16), alignItems: "center", justifyContent: "center" }}>
      {children}
    </View>
  );
}

/* ── Card ── */
export function Card({
  children, style, tone = "plain",
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: "plain" | "alert" | "accent" }) {
  const t = useTheme();
  const light = t.key === "savanna";
  const border = tone === "alert" ? t.alert : tone === "accent" ? t.accent : t.line;
  // Depth: a soft shadow on the light theme; on the dark ones a lighter top edge, as if lit from above.
  const depth: ViewStyle = light
    ? ({ boxShadow: "0 1px 2px rgba(16, 42, 29, 0.05), 0 2px 8px rgba(16, 42, 29, 0.06)" } as ViewStyle)
    : tone === "plain" ? { borderTopColor: tint(t.ink, 0.14) } : {};
  return (
    <View style={[{ backgroundColor: t.panel, borderColor: border, borderWidth: 1, borderRadius: 18, padding: 16 }, depth, style]}>
      {children}
    </View>
  );
}

/* ── Eyebrow: the section label, in its section's colour with an icon badge, and an optional right slot ── */
export function Eyebrow({
  text, right, style, domain, icon,
}: { text: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>; domain?: Domain; icon?: (color: string) => React.ReactNode }) {
  const t = useTheme();
  const c = domainColor(t, domain);
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: icon ? 28 : 22, marginBottom: 12 }, style]} testID={domain ? `eyebrow-${domain}` : undefined}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
        {icon ? <IconBadge color={c}>{icon(c)}</IconBadge> : null}
        <Text
          accessibilityRole="header"
          aria-level={2}
          numberOfLines={2}
          style={{ flexShrink: 1, color: domain ? c : t.dim, fontSize: 11.5, lineHeight: 14, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase" }}
        >
          {text}
        </Text>
      </View>
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
  // The whole pill springs under the finger; the actions that commit something
  // (primary, danger) also give a light tap. The caller's style (flex, alignSelf)
  // sits on the outer view so the pill keeps its own shape.
  const s = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const down = () => {
    s.value = withSpring(0.97, { damping: 20, stiffness: 420, reduceMotion: ReduceMotion.System });
    if (kind === "primary" || kind === "danger") haptic.tap();
  };
  const up = () => { s.value = withSpring(1, { damping: 14, stiffness: 260, reduceMotion: ReduceMotion.System }); };
  return (
    <Animated.View style={[style, press]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={down}
        onPressOut={up}
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
            ...(kind === "primary" || kind === "danger" ? { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.28)" } : null),
            opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
          },
          hovered && !disabled && (kind === "secondary" ? { backgroundColor: t.raised } : kind === "ghost" ? { opacity: 0.8 } : { opacity: 0.92 }),
          webCursor,
          focusRing(focused, t.accent),
        ]}
      >
        {icon?.(fg)}
        <Text maxFontSizeMultiplier={1.4} style={{ color: fg, fontSize: small ? 15 : 16, lineHeight: 22, fontWeight: kind === "primary" || kind === "danger" ? "800" : "700" }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ── Chip: selectable pill (checkbox / radio / plain button) ── */
export function Chip({
  label, sub, selected = false, onPress, leading, role = "button", a11yLabel, pressRef, keys, testID,
}: {
  label: string; sub?: string; selected?: boolean; onPress: () => void; leading?: React.ReactNode;
  role?: "button" | "checkbox" | "radio"; a11yLabel?: string;
  pressRef?: (el: View | null) => void; keys?: Record<string, unknown>; testID?: string;
}) {
  const t = useTheme();
  const toggle = role !== "button";
  const press = () => { haptic.select(); onPress(); };
  return (
    <Pressable
      ref={pressRef}
      testID={testID}
      onPress={press}
      {...(role === "checkbox" ? spaceActivates(onPress) : null)}
      {...keys}
      accessibilityRole={role}
      accessibilityLabel={a11yLabel ?? (sub ? `${label}, ${sub}` : label)}
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
      <View style={{ flexShrink: 1 }}>
        <Text maxFontSizeMultiplier={1.4} style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: selected ? "700" : "500" }}>
          {label}
        </Text>
        {sub ? <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ color: t.dim, fontSize: 12.5, lineHeight: 15, fontWeight: "700" }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/* ── Tag: small status label (tinted, ink text for contrast in every theme) ── */
export function Tag({ label, tone = "dim", block = false }: { label: string; tone?: "ok" | "warn" | "bad" | "dim" | "water"; block?: boolean }) {
  const t = useTheme();
  const c = tone === "ok" ? t.ok : tone === "warn" ? t.accent : tone === "bad" ? t.alert : tone === "water" ? t.water : t.dim;
  // block: a sentence-length note (may wrap), so a soft rectangle instead of a pill.
  // A pill pins itself to the start (alignSelf), so in a row wrap it in a View to centre it.
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: block ? "flex-start" : "center", gap: 8, minHeight: 26, paddingHorizontal: 10, backgroundColor: tint(c, 0.16) },
        block ? { alignSelf: "stretch", borderRadius: 12, paddingVertical: 9, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: c } : { alignSelf: "flex-start", borderRadius: 999 },
      ]}
    >
      {!block && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />}
      <Text maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, color: t.ink, fontSize: block ? 13.5 : 12.5, lineHeight: block ? 18 : 16, fontWeight: block ? "600" : "700" }}>{label}</Text>
    </View>
  );
}

/* ── CheckRow: a task you can tick off ── */
export function CheckRow({
  checked, onToggle, title, meta, metaTone, leading, a11yLabel, testID, hint,
}: {
  checked: boolean; onToggle: () => void; title: string; meta?: string; metaTone?: "late" | "soon";
  leading?: React.ReactNode; a11yLabel?: string; testID?: string;
  /** Weather advice for this task (lib/advice.ts), shown under the due date. */
  hint?: { tone: "ok" | "warn"; text: string } | null;
}) {
  const t = useTheme();
  const { t: tt } = useLang();
  // The box pops when a task gets ticked (not on first paint), with a success tick.
  const pop = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (checked) pop.value = withSequence(
      withSpring(1.22, { damping: 9, stiffness: 420, reduceMotion: ReduceMotion.System }),
      withSpring(1, { damping: 12, stiffness: 240, reduceMotion: ReduceMotion.System }),
    );
  }, [checked]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const toggle = () => { if (checked) haptic.select(); else haptic.success(); onToggle(); };
  return (
    <Pressable
      testID={testID}
      onPress={toggle}
      {...spaceActivates(toggle)}
      accessibilityRole="checkbox"
      accessibilityLabel={a11yLabel ?? [title, meta, !checked && hint ? hint.text : null].filter(Boolean).join(", ")}
      accessibilityState={{ checked }}
      aria-checked={checked}
      style={({ pressed, hovered, focused }: PressState) => [
        { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 },
        hovered && { backgroundColor: t.raised },
        pressed && { opacity: 0.75 },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <Animated.View
        style={[{
          width: 26, height: 26, borderRadius: 8, borderWidth: 2,
          borderColor: checked ? t.ok : t.dim, backgroundColor: checked ? t.ok : "transparent",
          alignItems: "center", justifyContent: "center",
        }, popStyle]}
      >
        {checked && <CheckGlyph size={15} color={t.field} />}
      </Animated.View>
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
        {hint && !checked ? (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: hint.tone === "ok" ? t.ok : t.accent }} />
            <Text style={{ flex: 1, color: t.ink, fontSize: 13, lineHeight: 18 }}>{hint.text}</Text>
          </View>
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
        onPress={() => { haptic.select(); onChange(clamp(value + dir * step)); }}
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
            <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, ...T.display, fontSize: 21, lineHeight: 27 }}>{title}</Text>
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
