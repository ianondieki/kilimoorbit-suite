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
import { DISPLAY, ITALIC, LABEL } from "../lib/typography";
import { CheckGlyph, CrossGlyph, MinusGlyph, PlusGlyph } from "./Glyphs";
import Icon, { type IconName } from "./Icon";

/* ── spacing (4px base) and corner radii: every gap and corner comes from here (DESIGN.md) ── */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, x3: 32, x4: 40, x5: 48, x6: 64, x7: 80 } as const;
export const R = { sm: 8, md: 12, btn: 12, card: 16, sheet: 20, pill: 999 } as const;
/**
 * Border weights (DESIGN.md): one hairline for every surface and divider, one
 * outline for every control, one rule for accent bars. Selection and state
 * change a border's colour, never its weight, so nothing shifts when it changes.
 */
export const B = { line: 1, control: 2, rule: 3 } as const;
/** The smallest touch target for anything a finger presses. */
export const TOUCH = 44;

/**
 * The page rhythm (DESIGN.md): the screen's side padding, the gap between
 * cards in a group, the air between sections, and the padding inside a card.
 * It opens up from phone to wide screens, so a screen breathes instead of
 * stacking boxes edge to edge.
 */
export function useSpace() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const mid = width >= 600;
  return {
    pad: wide ? S.x4 : mid ? S.x3 : S.xl,
    gap: wide ? S.xxl : S.xl,
    section: wide ? S.x7 : mid ? S.x6 : S.x5,
    card: mid ? S.xxl : S.xl,
  };
}

/* ── heading levels: a Section's cards label themselves one level below its title ── */
const HeadingLevel = React.createContext(2);

/**
 * A titled group of cards on a screen: a Fraunces title (and an optional
 * line under it) set apart by whitespace, not by another box. Card labels
 * inside it become level-3 headings.
 */
export function Section({
  title, sub, children, testID, style,
}: { title: string; sub?: string; children: React.ReactNode; testID?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const sp = useSpace();
  const { width } = useWindowDimensions();
  return (
    <View style={[{ gap: sp.gap }, style]} testID={testID}>
      <View style={{ gap: S.sm, maxWidth: 640 }}>
        <Text accessibilityRole="header" aria-level={2} style={{ color: t.ink, ...(width >= 600 ? T.section : T.sectionSm) }}>{title}</Text>
        {sub ? <Text style={{ color: t.dim, ...T.body }}>{sub}</Text> : null}
      </View>
      <HeadingLevel.Provider value={3}>{children}</HeadingLevel.Provider>
    </View>
  );
}

/* ── type scale (DESIGN.md): Nunito Sans text, Space Grotesk labels, Fraunces display ── */
export const T = {
  /** Uppercase section labels and stat captions: the smallest text a farmer must read. */
  label: { fontFamily: LABEL["600"], fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: "uppercase" as const },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "700" as const },
  body: { fontSize: 16, lineHeight: 24 },
  meta: { fontSize: 14, lineHeight: 20 },
  big: { fontFamily: DISPLAY["600"], fontSize: 34, lineHeight: 38, letterSpacing: -0.6, fontVariant: ["tabular-nums" as const] },
  /** A headline inside a card: a news title, a show's name, a trivia question. */
  headline: { fontFamily: DISPLAY["600"], fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  /** A screen's greeting or a sheet's title. */
  display: { fontFamily: DISPLAY["500"], fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  /** A section's title on a screen (Today's "On the farm today"). */
  section: { fontFamily: DISPLAY["500"], fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  sectionSm: { fontFamily: DISPLAY["500"], fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  /** The one big line on a screen. */
  displayLg: { fontFamily: DISPLAY["500"], fontSize: 36, lineHeight: 40, letterSpacing: -1 },
  /** The accent word inside a display line (set on a nested Text). */
  accent: { fontFamily: ITALIC },
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

/* ── Surfaces: how a card answers the pointer (web) ──
   A card at rest wears the warm hairline. Under the pointer the same 1px border
   takes its section's colour (its `domain`, or the eyebrow inside it), the shadow
   deepens and the card rises 2px; with keyboard focus inside, the border colours
   without the lift. Plain CSS, so nothing re-renders. The weight never changes, so
   nothing moves. Reduced motion: the colour still fades, nothing rises. Phones have no hover. */
type SurfaceTone = "plain" | "alert" | "accent";
const DOMAINS: Domain[] = ["weather", "farm", "market", "money", "doctor", "alerts", "news", "season", "shows", "store", "soil", "quiz", "herd"];

/** Marks a view as a surface, optionally of a section (for cards whose eyebrow sits outside them). Spread on the outer View. */
export const surfaceAttr = (tone: SurfaceTone = "plain", domain?: Domain): Record<string, unknown> =>
  isWeb ? { dataSet: domain ? { koSurface: tone, koDomain: domain } : { koSurface: tone } } : {};

function surfaceCSS(t: Theme): string {
  const light = t.key === "savanna";
  const a = light ? 0.55 : 0.65;
  const lift = light
    ? "0 2px 4px rgba(20, 32, 27, 0.05), 0 16px 32px -14px rgba(20, 32, 27, 0.18)"
    : "0 16px 32px -14px rgba(0, 0, 0, 0.6)";
  const S0 = "[data-ko-surface]";
  const on = (sel: string, color: string) =>
    `@media (hover:hover){${sel}:hover{border-color:${color}!important;box-shadow:${lift}!important}}` +
    // Keyboard focus only: a mouse click inside must not leave the border coloured.
    `${sel}:has(:focus-visible){border-color:${color}!important}`;
  let css =
    `${S0}{transition:border-color 180ms ease-out,box-shadow 240ms ease-out,transform 240ms cubic-bezier(0.2,0.7,0.2,1)}` +
    `@media (hover:hover){${S0}:hover{transform:translateY(-2px)}` +
    // The risen card keeps the 2px it left under the pointer, so its bottom edge never flickers.
    `${S0}:hover::after{content:"";position:absolute;left:0;right:0;bottom:-3px;height:3px}}` +
    // Inside a horizontal pager the scroll box clips a rising card, so there it only colours.
    `@media (hover:hover){[data-ko-pager] ${S0}:hover{transform:none}}` +
    on(`${S0}[data-ko-surface="plain"]`, tint(t.accent, a));
  for (const d of DOMAINS) css += on(`${S0}[data-ko-surface="plain"]:has([data-ko-eyebrow="${d}"])`, tint(domainColor(t, d), a));
  // A declared domain wins over an eyebrow found inside (same specificity, later rule).
  for (const d of DOMAINS) css += on(`${S0}[data-ko-surface="plain"][data-ko-domain="${d}"]`, tint(domainColor(t, d), a));
  css += on(`${S0}[data-ko-surface="alert"]`, t.alert) + on(`${S0}[data-ko-surface="accent"]`, t.accent);
  css += `@media (prefers-reduced-motion:reduce){${S0}{transition:border-color 120ms linear,box-shadow 120ms linear}${S0}:hover{transform:none!important}}`;
  return css;
}

/** Web: keeps one stylesheet of surface states in step with the theme. Called once by the root layout. */
export function useSurfaceStyles(t: Theme) {
  useEffect(() => {
    if (!isWeb || typeof document === "undefined") return;
    let el = document.getElementById("ko-surface") as HTMLStyleElement | null;
    if (el?.dataset.theme === t.key) return;
    if (!el) {
      el = document.createElement("style");
      el.id = "ko-surface";
      document.head.appendChild(el);
    }
    el.textContent = surfaceCSS(t);
    el.dataset.theme = t.key;
  }, [t.key]);
}

/* ── Card ── */
export function Card({
  children, style, tone = "plain", domain,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: SurfaceTone; domain?: Domain }) {
  const t = useTheme();
  const sp = useSpace();
  const light = t.key === "savanna";
  const border = tone === "alert" ? t.alert : tone === "accent" ? t.accent : t.line;
  // Depth: a soft shadow on the light theme; on the dark ones a lighter top edge, as if lit from above.
  const depth: ViewStyle = light
    ? ({ boxShadow: "0 1px 2px rgba(20, 32, 27, 0.04), 0 8px 24px -8px rgba(20, 32, 27, 0.08)" } as ViewStyle)
    : tone === "plain" ? { borderTopColor: tint(t.ink, 0.14) } : {};
  return (
    <View {...surfaceAttr(tone, domain)} style={[{ backgroundColor: t.panel, borderColor: border, borderWidth: B.line, borderRadius: R.card, padding: sp.card }, depth, style]}>
      {children}
    </View>
  );
}

/* ── Eyebrow: the section label, in its section's colour with an icon badge, and an optional right slot ── */
export function Eyebrow({
  text, right, style, domain, icon,
}: { text: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>; domain?: Domain; icon?: (color: string) => React.ReactNode }) {
  const t = useTheme();
  const level = React.useContext(HeadingLevel);
  const c = domainColor(t, domain);
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: icon ? 28 : 22, marginBottom: S.lg }, style]} testID={domain ? `eyebrow-${domain}` : undefined} {...(isWeb && domain ? { dataSet: { koEyebrow: domain } } : null)}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
        {icon ? <IconBadge color={c}>{icon(c)}</IconBadge> : null}
        <Text
          accessibilityRole="header"
          aria-level={level}
          numberOfLines={2}
          style={{ flexShrink: 1, color: domain ? c : t.dim, ...T.label }}
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
            minHeight: small ? 44 : 52, borderRadius: R.btn, paddingHorizontal: kind === "ghost" ? 4 : 18,
            flexDirection: "row", alignItems: "center", justifyContent: kind === "ghost" ? "flex-start" : "center", gap: 8,
            backgroundColor: kind === "secondary" ? t.panel : bg,
            ...(kind === "secondary" ? { borderWidth: B.control, borderColor: t.dim } : null),
            ...(kind === "primary" || kind === "danger" ? ({ boxShadow: "0 1px 2px rgba(20, 32, 27, 0.08), 0 8px 20px -10px rgba(20, 32, 27, 0.45)" } as ViewStyle) : null),
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
          borderWidth: B.control, borderColor: selected ? t.accent : hovered ? t.dim : t.line,
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
          width: 26, height: 26, borderRadius: R.sm, borderWidth: B.control,
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
            color: checked ? t.dim : t.ink, fontSize: 16, lineHeight: 22, fontWeight: "600",
            textDecorationLine: checked ? "line-through" : "none",
          }}
        >
          {title}
        </Text>
        {meta ? (
          <Text style={{ color: metaTone === "late" && !checked ? t.alert : t.dim, ...T.meta, fontWeight: metaTone ? "700" : "500" }}>
            {checked ? tt("tasks.doneA11y") : meta}
          </Text>
        ) : null}
        {hint && !checked ? (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 7, backgroundColor: hint.tone === "ok" ? t.ok : t.accent }} />
            <Text style={{ flex: 1, color: t.ink, ...T.meta }}>{hint.text}</Text>
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
          { width: 52, height: 52, borderRadius: R.btn, borderWidth: B.control, borderColor: t.dim, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.75 : 1 },
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

/* ── Notice: an inline state (loading, error, offline, info) with an optional action ──
   A callout with a coloured left bar and an icon, so the tone never rests on colour alone.
   Errors and offline notes are announced (role alert); loading is a polite live region. */
export function Notice({
  tone = "info", title, body, action, testID, style,
}: {
  tone?: "info" | "error" | "offline" | "loading" | "ok";
  title?: string; body?: string;
  action?: { label: string; onPress: () => void; testID?: string; disabled?: boolean };
  testID?: string; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const c = tone === "error" ? t.alert : tone === "offline" ? t.dim : tone === "ok" ? t.ok : tone === "loading" ? t.accent : t.water;
  const icon: IconName = tone === "error" ? "alert-circle-outline" : tone === "offline" ? "wifi-off" : tone === "ok" ? "check-circle-outline" : tone === "loading" ? "progress-clock" : "information-outline";
  const loud = tone === "error" || tone === "offline";
  return (
    <View
      testID={testID}
      accessibilityRole={loud ? "alert" : undefined}
      accessibilityLiveRegion={loud ? "assertive" : "polite"}
      aria-live={loud ? "assertive" : "polite"}
      style={[{
        flexDirection: "row", gap: S.md, padding: S.md, paddingLeft: S.lg, borderRadius: R.md,
        backgroundColor: tone === "offline" ? t.panel : tint(c, 0.08), borderLeftWidth: B.rule, borderLeftColor: c,
        borderWidth: tone === "offline" ? B.line : 0, borderColor: t.line,
      }, style]}
    >
      <Icon name={icon} size={20} color={c} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: S.xs }}>
        {title ? <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>{title}</Text> : null}
        {body ? <Text style={{ color: t.ink, ...T.meta }}>{body}</Text> : null}
        {action ? (
          // Secondary (ink on the tint), not ghost: accent text on a tinted callout falls under 4.5:1.
          <Btn kind="secondary" small label={action.label} onPress={action.onPress} disabled={action.disabled} testID={action.testID} style={{ alignSelf: "flex-start" }} />
        ) : null}
      </View>
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
            <Text accessibilityRole="header" aria-level={2} style={{ flex: 1, color: t.ink, ...T.display, fontSize: 21, lineHeight: 27 }}>{title}</Text>
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
