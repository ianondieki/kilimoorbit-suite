/**
 * A screen's opening photograph: real scenes from Kenyan farming under a
 * deep-forest scrim that keeps the white text above WCAG AA contrast on any
 * part of the photo, with the section's eyebrow, a display title, a line of
 * context and room for actions or numbers.
 *
 * With more than one photo the hero turns by itself: each slide drifts slowly
 * (Ken Burns, 1.00 → 1.07 with a small pan), and every 7s the next one slides
 * in from the right while cross-fading (700ms ease-out). Dots show position and
 * switch the photo; a pause/play control stops all movement (WCAG 2.2.2). The
 * turning stops while the screen is out of focus. With reduced motion the
 * first photo stands still, nothing auto-advances and the dots switch
 * instantly. Photos are decorative (hidden from screen readers) and carry no
 * words: their credits (author, licence, source) are listed together under
 * Settings → Photo credits, so nothing is printed over the picture.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, View, Pressable, Platform, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Text from "./Text";
import Icon, { type IconName } from "./Icon";
import { B, T, S, R, TOUCH } from "./Kit";
import { DISPLAY } from "../lib/typography";
import { PHOTOS, type PhotoKey } from "../lib/photos";
import { useLang } from "../lib/session";
import { focusRing, webCursor, type PressState } from "../lib/ui";

export const HERO_INK = "#FFFFFF";
export const HERO_DIM = "rgba(255, 255, 255, 0.86)";
/** Maize gold: the marks on forest and photographs (8.1:1 on the forest). */
export const HERO_GOLD = "#E9B44C";
/** @deprecated The old lime; kept as an alias so older imports still work. */
export const HERO_LEAF = HERO_GOLD;
export const HERO_FOREST = "#0F2A21";

/** How long each photo holds before the next one comes in. */
const HOLD = 7000;
/** The cross-fade and slide-in of a new photo. */
const ENTER = 700;
/** The drift runs a little past the hold so it never stops on screen. */
const DRIFT = HOLD + ENTER + 300;
const PAN = 10;

const hidden = Platform.OS === "web" ? ({ "aria-hidden": true } as object) : null;

/**
 * One photograph layer. It drifts on the UI thread, fades (and on later slides
 * slides) in once loaded, and fades out when it is leaving.
 */
function Slide({
  photo, height, entering, leaving, still, paused, dir, onReady,
}: {
  photo: PhotoKey; height: number; entering: "fade" | "slide" | "none"; leaving: boolean;
  still: boolean; paused: boolean; dir: 1 | -1; onReady: () => void;
}) {
  const p = PHOTOS[photo];
  const shown = useSharedValue(entering === "none" ? 1 : 0);
  const drift = useSharedValue(0);
  const ready = useRef(entering === "none");
  const [failed, setFailed] = useState(false);

  const show = useCallback(() => {
    if (ready.current) return;
    ready.current = true;
    shown.value = withTiming(1, { duration: ENTER, easing: Easing.out(Easing.cubic) });
    onReady();
  }, [onReady, shown]);

  // A slide that needs no entrance is ready at once (on mount only, so through a ref).
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const instant = useRef(entering === "none").current;
  useEffect(() => { if (instant) readyRef.current(); }, [instant]);
  // Never leave a photo hidden if a platform skips onLoad for a cached image.
  useEffect(() => { const id = setTimeout(show, 1500); return () => clearTimeout(id); }, [show]);

  // The drift: run what is left of it, stop where it is when paused.
  useEffect(() => {
    if (still || paused) { cancelAnimation(drift); return; }
    drift.value = withTiming(1, { duration: Math.max(0, (1 - drift.value) * DRIFT), easing: Easing.linear });
    return () => cancelAnimation(drift);
  }, [still, paused, drift]);

  useEffect(() => {
    if (leaving) shown.value = still ? 0 : withTiming(0, { duration: ENTER, easing: Easing.out(Easing.cubic) });
  }, [leaving, still, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: (entering === "slide" ? 24 * (1 - shown.value) : 0) + dir * PAN * drift.value },
      { translateY: -PAN * 0.6 * drift.value },
      { scale: 1 + 0.07 * drift.value + (entering === "fade" ? 0.04 * (1 - shown.value) : 0) },
    ],
  }));

  if (failed) return null;
  const extra = height * 0.3;
  return (
    <Animated.View
      style={[{ position: "absolute", left: 0, right: 0, top: -extra * p.focusY, bottom: -extra * (1 - p.focusY) }, style]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" {...hidden}
    >
      <Image
        source={p.src} onLoad={show} resizeMode="cover" style={{ width: "100%", height: "100%" }} accessible={false}
        // A failed photo leaves the forest background (and lets the old one go).
        onError={() => { setFailed(true); ready.current = true; onReady(); }}
      />
    </Animated.View>
  );
}

export function PhotoHero({
  photo, photos, eyebrow, icon, title, titleAccent, subtitle, children, height = 230, compact = false, heading = true, style, testID,
}: {
  photo: PhotoKey; photos?: PhotoKey[]; eyebrow?: string; icon?: IconName; title: string; titleAccent?: string; subtitle?: string;
  /** False where the title is a motto above the page's own heading (login), so heading order stays right. */
  heading?: boolean;
  children?: React.ReactNode; height?: number; compact?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const { t: tt } = useLang();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const list = photos?.length ? photos : [photo];
  const sig = list.join("|");
  const many = list.length > 1;

  // gen counts slide changes, so every new slide is a fresh layer and the
  // outgoing one keeps its drift while it fades out underneath.
  const [state, setState] = useState({ sig, index: 0, gen: 0, prev: null as null | { index: number; gen: number } });
  if (state.sig !== sig) setState({ sig, index: 0, gen: state.gen + 1, prev: null });
  const { index, gen, prev } = state;
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  // The incoming slide is on screen: fade the old one out, then drop it.
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goTo = useCallback((i: number) => {
    if (dropTimer.current) { clearTimeout(dropTimer.current); dropTimer.current = null; }
    setLeaving(false);
    setState((s) => (s.index === i ? s : { ...s, index: i, gen: s.gen + 1, prev: { index: s.index, gen: s.gen } }));
  }, []);
  const onReady = useCallback(() => {
    setLeaving(true);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    dropTimer.current = setTimeout(() => setState((s) => (s.prev ? { ...s, prev: null } : s)), reduce ? 0 : ENTER + 50);
  }, [reduce]);
  useEffect(() => () => { if (dropTimer.current) clearTimeout(dropTimer.current); }, []);

  // One timer per hero for the next slide; none with reduced motion or when paused or away.
  const moving = many && !reduce && !paused && focused;
  useEffect(() => {
    if (!moving) return;
    const id = setTimeout(() => goTo((index + 1) % list.length), HOLD);
    return () => clearTimeout(id);
  }, [moving, index, gen, list.length, goTo]);

  const current = list[Math.min(index, list.length - 1)];
  const titleStyle = compact ? T.headline : width >= 600 ? T.displayLg : T.display;

  return (
    <View
      style={[{ minHeight: height, borderRadius: compact ? R.card : R.sheet, overflow: "hidden", backgroundColor: HERO_FOREST, justifyContent: "space-between" }, style]}
      testID={testID ?? `photo-hero-${photo}`}
    >
      {prev && list[prev.index] && (
        <Slide
          key={`s${prev.gen}`} photo={list[prev.index]} height={height} entering="none" leaving={leaving}
          still={!!reduce} paused={paused || !focused} dir={prev.index % 2 ? -1 : 1} onReady={noop}
        />
      )}
      <Slide
        key={`s${gen}`} photo={current} height={height}
        entering={reduce ? "none" : gen === 0 || !prev ? "fade" : "slide"} leaving={false}
        still={!!reduce} paused={paused || !focused} dir={index % 2 ? -1 : 1}
        onReady={prev ? onReady : noop}
      />
      <LinearGradient
        // Dark enough from the top (where the eyebrow sits) that every label holds AA on any photo.
        colors={["rgba(15, 42, 33, 0.5)", "rgba(15, 42, 33, 0.74)", "rgba(15, 42, 33, 0.95)"]}
        locations={[0, 0.38, 1]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        pointerEvents="none"
      />
      {/* The top bar sits in the flow, so the text below never runs under it. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingHorizontal: S.xs, paddingTop: S.xs, gap: S.xs, minHeight: many ? TOUCH + S.xs : 0 }}>
        {many && (
          <View style={{ flexDirection: "row", alignItems: "center" }} testID="hero-dots">
            {!reduce && (
              <Pressable
                onPress={() => setPaused((v) => !v)} accessibilityRole="button" accessibilityLabel={tt(paused ? "hero.play" : "hero.pause")}
                style={({ pressed, focused }: PressState) => [{ width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center", borderRadius: R.pill, opacity: pressed ? 0.7 : 1 }, webCursor, focusRing(focused, HERO_GOLD)]}
                testID="hero-pause"
              >
                <View style={{ width: 28, height: 28, borderRadius: R.pill, backgroundColor: "rgba(15, 42, 33, 0.55)", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={paused ? "play" : "pause"} size={16} color={HERO_INK} />
                </View>
              </Pressable>
            )}
            {list.map((k, i) => {
              const on = i === index;
              return (
                <Pressable
                  key={`${k}${i}`} onPress={() => goTo(i)} accessibilityRole="button"
                  accessibilityLabel={tt("hero.photo", { n: String(i + 1), of: String(list.length) })} accessibilityState={{ selected: on }} {...(Platform.OS === "web" ? { "aria-current": on ? "true" : undefined } : null)}
                  style={({ pressed, focused }: PressState) => [{ width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center", borderRadius: R.pill, opacity: pressed ? 0.7 : 1 }, webCursor, focusRing(focused, HERO_GOLD)]}
                  testID={`hero-dot-${i}`}
                >
                  <View style={{ width: on ? 18 : 6, height: 6, borderRadius: R.pill, backgroundColor: on ? HERO_GOLD : "rgba(255, 255, 255, 0.7)" }} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      <View style={{ padding: compact ? S.lg : S.xxl, paddingTop: S.sm, gap: compact ? S.xs : S.sm }}>
        {eyebrow ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {icon && <Icon name={icon} size={15} color={HERO_GOLD} />}
            {/* Gold marks the icon; the 12px words stay near-white for contrast on any photo. */}
            <Text style={{ color: HERO_INK, ...T.label, flexShrink: 1 }}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text {...(heading ? { accessibilityRole: "header" as const, "aria-level": 2 } : null)} style={{ color: HERO_INK, ...titleStyle }}>
          {title}
          {titleAccent ? <Text style={{ ...T.accent, color: HERO_GOLD }}>{" "}{titleAccent}</Text> : null}
        </Text>
        {subtitle ? <Text style={{ color: HERO_DIM, ...T.body }}>{subtitle}</Text> : null}
        {children ? <View style={{ marginTop: compact ? 6 : 10 }}>{children}</View> : null}
      </View>
    </View>
  );
}

const noop = () => {};

/** A chip for numbers on a photo: "KES 49 · potatoes / kg". */
export function HeroChip({ icon, label, value, testID }: { icon?: IconName; label: string; value: string; testID?: string }) {
  return (
    <View
      style={{ flexGrow: 1, flexBasis: 80, minWidth: 0, borderRadius: R.md, paddingVertical: S.sm, paddingHorizontal: 10, backgroundColor: "rgba(255, 255, 255, 0.10)", borderWidth: B.line, borderColor: "rgba(255, 255, 255, 0.16)", gap: 2 }}
      testID={testID}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon && <Icon name={icon} size={15} color={HERO_GOLD} />}
        <Text numberOfLines={1} style={{ flexShrink: 1, color: HERO_INK, fontFamily: DISPLAY["600"], fontSize: 18, lineHeight: 22, fontVariant: ["tabular-nums"] }}>{value}</Text>
      </View>
      <Text numberOfLines={2} style={{ color: HERO_DIM, ...T.label }}>{label}</Text>
    </View>
  );
}
