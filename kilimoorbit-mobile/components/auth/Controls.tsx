/**
 * Login building blocks: wordmark, sun (bright-light theme) toggle, language
 * pill, Listen (text-to-speech) pill, back button, banners and buttons.
 * Every control is a real >= 48px box with a visible web focus outline.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Text from "../Text";
import Animated, {
  FadeIn, ReduceMotion, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withSpring, withTiming, Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { useTheme, useThemeControls } from "../../lib/theme-context";
import { useLang } from "../../lib/session";
import { focusRing, isWeb, spaceActivates, webCursor, type PressState } from "../../lib/ui";
import type { Lang } from "../../lib/i18n";
import { PressScale } from "../Motion";
import { B, R, tint } from "../Kit";
import { DISPLAY, ITALIC, LABEL } from "../../lib/typography";
import { OrbitSpinner } from "../SeasonOrbit";
import { ArrowGlyph, CheckGlyph, ChevronGlyph, CrossGlyph, SignalOffGlyph, SpeakerGlyph, SunGlyph } from "../Glyphs";

/* ── Logotype: an orbit mark (a gold seed circling on the forest tile) and "Kilimo" upright, "Orbit" in italic ── */
export function Logotype({ size = 20 }: { size?: number }) {
  const t = useTheme();
  const tile = Math.round(size * 1.3);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: Math.round(size * 0.45) }}>
      <View style={{ width: tile, height: tile, borderRadius: Math.round(tile * 0.3), backgroundColor: t.key === "savanna" ? t.accent : "#1A6642", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: tile * 0.56, height: tile * 0.56, borderRadius: tile, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)" }} />
        <View style={{ position: "absolute", top: tile * 0.17, right: tile * 0.17, width: tile * 0.22, height: tile * 0.22, borderRadius: tile, backgroundColor: "#E9B44C" }} />
      </View>
      <Text maxFontSizeMultiplier={1.4} style={{ color: t.ink, fontFamily: DISPLAY["600"], fontSize: size, lineHeight: Math.round(size * 1.2), letterSpacing: -0.3 }}>
        Kilimo<Text style={{ fontFamily: ITALIC, color: t.accent }}>Orbit</Text>
      </Text>
    </View>
  );
}

/* ── Wordmark (logotype; exempt from the text-contrast rule) ── */
export function Wordmark({ size = "bar" }: { size?: "bar" | "panel" }) {
  const t = useTheme();
  const bar = size === "bar";
  return (
    // A logotype, not a heading: the page headline is the only level-1 heading.
    // Web: role "img" so the label (not the letters) is what is read.
    <View accessible accessibilityLabel="KilimoOrbit Sentinel" {...(isWeb ? ({ role: "img" } as any) : null)} style={{ gap: bar ? 2 : 4 }}>
      <Logotype size={bar ? 19 : 26} />
      <Text maxFontSizeMultiplier={1.4} style={{ color: t.dim, fontFamily: LABEL["600"], fontSize: bar ? 10 : 11, lineHeight: 14, letterSpacing: bar ? 3 : 4, marginLeft: bar ? 34 : 46 /* under the letters: tile + gap */ }}>
        SENTINEL
      </Text>
    </View>
  );
}

/* ── Sun toggle: one tap to the high-contrast daylight theme, and back ── */
export function SunToggle({ variant }: { variant: "icon" | "pill" }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { setThemeKey } = useThemeControls();
  const isSavanna = t.key === "savanna";
  const rot = useSharedValue(0);
  const rotStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  const toggle = async () => {
    rot.value = withSpring(rot.value + 45, { damping: 14, stiffness: 180, reduceMotion: ReduceMotion.System });
    if (!isSavanna) {
      AsyncStorage.setItem("ko-theme-prev", t.key).catch(() => {});
      setThemeKey("savanna");
    } else {
      const prev = await AsyncStorage.getItem("ko-theme-prev").catch(() => null);
      setThemeKey(prev && prev !== "savanna" ? prev : "loam");
    }
  };

  const fg = isSavanna ? t.field : t.ink;
  return (
    <Pressable
      onPress={toggle}
      {...spaceActivates(toggle)}
      accessibilityRole="switch"
      // The pill shows a visible label: keep it at the start of the name (WCAG 2.5.3).
      accessibilityLabel={variant === "pill" ? `${tt("sun.label")}, ${tt("sun.a11y")}` : tt("sun.a11y")}
      accessibilityState={{ checked: isSavanna }}
      aria-checked={isSavanna}
      style={({ pressed, hovered, focused }: PressState) => [
        {
          height: 48, borderRadius: 24, borderWidth: B.control, borderColor: isSavanna ? t.accent : t.dim,
          backgroundColor: isSavanna ? t.accent : hovered ? t.raised : "transparent",
          alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
          opacity: pressed ? 0.8 : 1,
        },
        variant === "icon" ? { width: 48 } : { paddingHorizontal: 16 },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <Animated.View style={rotStyle}>
        <SunGlyph size={variant === "icon" ? 22 : 20} color={fg} />
      </Animated.View>
      {variant === "pill" && (
        <Text maxFontSizeMultiplier={1.4} style={{ color: fg, fontSize: 15, fontWeight: "700" }}>{tt("sun.label")}</Text>
      )}
    </Pressable>
  );
}

/* ── Language pill: shows the OTHER language, written in itself ── */
export function LangPill() {
  const t = useTheme();
  const { lang, setLang, t: tt } = useLang();
  const other: Lang = lang === "sw" ? "en" : "sw";
  return (
    <Pressable
      onPress={() => setLang(other)}
      accessibilityRole="button"
      accessibilityLabel={tt("lang.a11y")}
      style={({ pressed, hovered, focused }: PressState) => [
        {
          height: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: B.control, borderColor: t.dim,
          alignItems: "center", justifyContent: "center",
          backgroundColor: hovered ? t.raised : "transparent", opacity: pressed ? 0.8 : 1,
        },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <Text maxFontSizeMultiplier={1.4} {...({ lang: other } as any)} style={{ color: t.ink, fontSize: 15, fontWeight: "700" }}>
        {tt("lang.pill")}
      </Text>
    </Pressable>
  );
}

/* ── Back (edit mode) ── */
export function BackButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tt("back")}
      style={({ pressed, hovered, focused }: PressState) => [
        // marginLeft -14: the chevron lines up optically with the content edge
        // while the 48px touch box stays (as MenuButton does with -12).
        { minWidth: 96, height: 48, flexDirection: "row", alignItems: "center", paddingRight: 12, borderRadius: 12, marginLeft: -14 },
        (hovered || pressed) && { backgroundColor: t.raised },
        webCursor, focusRing(focused, t.accent), style,
      ]}
    >
      <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <ChevronGlyph size={20} color={t.ink} dir="left" />
      </View>
      <Text maxFontSizeMultiplier={1.4} style={{ color: t.ink, fontSize: 15, fontWeight: "700" }}>{tt("back")}</Text>
    </Pressable>
  );
}

/* ── Listen: only when a voice for the current language exists ── */
type VoiceInfo = { identifier: string; language: string };

function useVoiceFor(lang: Lang): VoiceInfo | null {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Speech.getAvailableVoicesAsync()
        .then((v) => { if (alive && v?.length) setVoices(v.map((x) => ({ identifier: x.identifier, language: x.language }))); })
        .catch(() => {});
    load();
    const id = setTimeout(load, 800); // web voices load late
    return () => { alive = false; clearTimeout(id); };
  }, []);
  const norm = (l: string) => (l || "").toLowerCase().replace(/_/g, "-");
  const matches = voices.filter((v) => norm(v.language).startsWith(lang));
  return matches.find((v) => norm(v.language) === `${lang}-ke`) ?? matches[0] ?? null;
}

export function ListenPill({ script, style }: { script: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const reduce = useReducedMotion();
  const voice = useVoiceFor(lang);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => { Speech.stop(); }, []);
  useEffect(() => { Speech.stop(); setSpeaking(false); }, [lang]);

  const arc = useSharedValue(1);
  useEffect(() => {
    if (speaking && !reduce) arc.value = withRepeat(withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.quad) }), -1, true);
    else { cancelAnimation(arc); arc.value = 1; }
    return () => cancelAnimation(arc);
  }, [speaking, reduce]);
  const arcStyle = useAnimatedStyle(() => ({ opacity: arc.value }));

  // Breathing: the pill swells a little and a soft ring leaves it, to say
  // "press me". Three breaths (under 5s, so it never needs a pause control,
  // WCAG 2.2.2) when it appears, and again when a pointer or focus reaches it.
  // Never while it speaks, never on reduced motion.
  const BREATH = 1500;
  const breath = useSharedValue(1);
  const breathingUntil = useRef(0);
  const breathe = () => {
    // A cycle already running finishes as it is: restarting would snap the pill back.
    if (reduce || speaking || Date.now() < breathingUntil.current) return;
    breathingUntil.current = Date.now() + BREATH * 3;
    breath.value = 0;
    breath.value = withRepeat(withTiming(1, { duration: BREATH, easing: Easing.inOut(Easing.sin) }), 3, false);
  };
  const hasVoice = !!voice;
  useEffect(() => {
    if (!hasVoice) return;
    breathe();
    return () => cancelAnimation(breath);
  }, [hasVoice, reduce]);
  const rest = () => { cancelAnimation(breath); breath.value = 1; breathingUntil.current = 0; };
  useEffect(() => { if (speaking) rest(); }, [speaking]);
  const swell = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.035 * Math.sin(Math.PI * breath.value) }] }));
  // One scale on both axes keeps the ring's rounded ends round as it leaves.
  const halo = useAnimatedStyle(() => ({
    opacity: 0.5 * Math.sin(Math.PI * Math.min(1, breath.value * 1.4)) * (1 - breath.value * 0.4),
    transform: [{ scale: 1 + 0.16 * breath.value }],
  }));

  if (!voice) return null;
  const press = () => {
    rest();
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    Speech.stop();
    setSpeaking(true);
    const end = () => setSpeaking(false);
    Speech.speak(script, { language: voice.language, voice: voice.identifier, onDone: end, onStopped: end, onError: end });
  };
  // Tinted with the accent so it reads as an invitation, not a secondary outline.
  const fill = (hovered?: boolean) => tint(t.accent, speaking ? 0.2 : hovered ? 0.16 : 0.1);
  return (
    <Animated.View style={[style, swell]}>
      {/* The ring that leaves the pill on each breath: drawn behind it, never in the way. */}
      <Animated.View
        aria-hidden
        style={[{ pointerEvents: "none", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 24, borderWidth: 2, borderColor: t.accent }, halo]}
      />
      <Pressable
        onPress={press}
        onHoverIn={breathe}
        onFocus={breathe}
        accessibilityRole="button"
        // Speaking, the name starts with the visible "Reading…" and says what a press does (WCAG 2.5.3).
        accessibilityLabel={speaking ? `${tt("listen.busy")}, ${tt("listen.stopA11y")}` : tt("listen.label")}
        accessibilityState={{ busy: speaking }}
        style={({ pressed, hovered, focused }: PressState) => [
          {
            height: 48, paddingLeft: 14, paddingRight: 18, borderRadius: 24, borderWidth: B.control, borderColor: tint(t.accent, 0.55),
            flexDirection: "row", alignItems: "center", gap: 8,
            backgroundColor: fill(hovered), opacity: pressed ? 0.85 : 1,
          },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <SpeakerGlyph size={20} color={t.accent} arcStyle={arcStyle} />
        <Text maxFontSizeMultiplier={1.4} style={{ color: t.ink, fontSize: 15, fontWeight: "700" }}>
          {speaking ? tt("listen.busy") : tt("listen.label")}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ── Banners (offline / server rejected) ── */
export function Banner({ kind, text, style }: { kind: "offline" | "rejected"; text: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={[{
        borderRadius: R.md, backgroundColor: t.raised, borderLeftWidth: B.rule,
        borderLeftColor: kind === "offline" ? t.accent : t.alert,
        paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", gap: 10, alignItems: "flex-start",
      }, style]}
    >
      {kind === "offline" ? (
        <SignalOffGlyph size={18} color={t.ink} style={{ marginTop: 2 }} />
      ) : (
        <CrossGlyph size={16} color={t.alert} style={{ marginTop: 3 }} />
      )}
      <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "500" }}>{text}</Text>
    </View>
  );
}

/* ── Primary CTA (never disabled; the caller guards double submits) ── */
export type CtaState = "idle" | "loading" | "success";

export function Cta({
  label, state = "idle", loadingLabel, onPress, pressRef, style, outerStyle, arrow = true,
}: {
  label: string; state?: CtaState; loadingLabel?: string; onPress: () => void;
  pressRef?: React.Ref<View>;
  /** Visual button style (inside the press-scale view). */
  style?: StyleProp<ViewStyle>;
  /** Layout margins: applied to the outer Pressable so its hit box and focus
   *  outline match the visible button. */
  outerStyle?: StyleProp<ViewStyle>;
  arrow?: boolean;
}) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const check = useSharedValue(0);
  useEffect(() => {
    check.value = state === "success" ? withSpring(1, { damping: 14, stiffness: 260, reduceMotion: ReduceMotion.System }) : 0;
  }, [state]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + 0.6 * check.value }], opacity: Math.min(1, check.value * 2) }));
  const text = state === "loading" ? loadingLabel ?? label : label;
  const fade = reduce ? undefined : FadeIn.duration(120);
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.97}
      pressableRef={pressRef}
      accessibilityLabel={text}
      accessibilityState={{ busy: state === "loading" }}
      focusColor={t.accent}
      hoverOpacity={0.92}
      outerStyle={[{ borderRadius: 16 }, outerStyle]}
      style={[{
        height: 60, borderRadius: 16, backgroundColor: t.accent,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16,
      }, style]}
    >
      <Animated.View key={state} entering={fade} style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
        {state === "loading" && <OrbitSpinner size={20} color={t.field} />}
        {state === "success" && (
          <Animated.View style={checkStyle}>
            <CheckGlyph size={22} color={t.field} />
          </Animated.View>
        )}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={{ color: t.field, fontSize: 20, lineHeight: 24, fontWeight: "800", letterSpacing: 0.3, flexShrink: 1 }}
        >
          {text}
        </Text>
        {state === "idle" && arrow && <ArrowGlyph size={20} color={t.field} />}
      </Animated.View>
    </PressScale>
  );
}

export function OutlineButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered, focused }: PressState) => [
        {
          minHeight: 56, borderRadius: 16, borderWidth: B.control, borderColor: t.dim, paddingHorizontal: 16,
          alignItems: "center", justifyContent: "center",
          backgroundColor: hovered ? t.raised : "transparent", opacity: pressed ? 0.8 : 1,
        },
        webCursor, focusRing(focused, t.accent), style,
      ]}
    >
      <Text maxFontSizeMultiplier={1.4} style={{ color: t.ink, fontSize: 17, lineHeight: 22, fontWeight: "700", textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

/** Underlined text button (guest link, "remove from this phone"). */
export function LinkButton({
  label, onPress, chevron, style,
}: { label: string; onPress: () => void; chevron?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={chevron ? "link" : "button"}
      accessibilityLabel={label}
      style={({ pressed, hovered, focused }: PressState) => [
        { minHeight: 48, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingRight: 4 },
        (pressed || hovered) && { opacity: 0.75 },
        webCursor, focusRing(focused, t.accent), style,
      ]}
    >
      <Text style={{ color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "700", textDecorationLine: "underline" }}>{label}</Text>
      {chevron && <ChevronGlyph size={12} color={t.ink} dir="right" />}
    </Pressable>
  );
}
