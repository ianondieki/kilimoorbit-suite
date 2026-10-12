/**
 * A swipeable, one-page-at-a-time slider for the Today cards (news, shows,
 * trivia): snaps page by page on a phone, and on the web adds ‹ › buttons
 * and arrow keys since a mouse can't swipe. Dots show where you are and are
 * tappable.
 *
 * With `autoplay`, the slider turns its own pages every few seconds so the
 * card reads as live (the active dot fills up as the next turn approaches).
 * It never fights the farmer: a touch, a drag, a tap on a dot, a hover or a
 * keyboard focus pauses it for a while; the screen going behind another
 * tab, a sheet opening (`paused`), the app going to the background, a
 * screen reader being on, or the system's reduce-motion setting stops it.
 * Only the farmer's own page turns tick (haptics); automatic ones are silent.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, View, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Text from "./Text";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, isWeb, webCursor, type PressState } from "../lib/ui";
import { haptic } from "../lib/haptics";
import { ChevronGlyph } from "./Glyphs";
import { useScreenFocused } from "./Motion";

// Web: scroll-snap keeps a mouse-wheel or drag landing on a page too.
const snapPage: any = isWeb ? { scrollSnapAlign: "start" } : null;

/** How long a farmer's touch keeps the autoplay quiet. */
export const AUTOPLAY_REST_MS = 15_000;

export type PagerHandle = { go: (index: number) => void; index: () => number };

export default function Pager<T>({
  items, render, keyOf, label, testID, onIndexChange, arrows = isWeb, controller, dotTone, autoplay = 0, paused = false,
}: {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  keyOf: (item: T, index: number) => string;
  /** Screen-reader name of the slider, e.g. "Farm news". */
  label: string;
  testID?: string;
  onIndexChange?: (index: number) => void;
  /** ‹ › buttons (always on the web, where there is a mouse). */
  arrows?: boolean;
  /** Lets a page turn the slider itself (a "Next" button inside a page). */
  controller?: React.MutableRefObject<PagerHandle | null>;
  /** Colours a dot by what happened on that page (the trivia: right or wrong). */
  dotTone?: (index: number) => "ok" | "bad" | null | undefined;
  /** Milliseconds between automatic page turns; 0 (the default) keeps the slider still. */
  autoplay?: number;
  /** Holds the automatic turns (a sheet is open over the card). */
  paused?: boolean;
}) {
  const t = useTheme();
  const { t: tt } = useLang();
  const reduce = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const n = items.length;

  // A page turn the slider started itself: no haptic tick for it.
  const autoTurn = useRef(false);
  const land = useCallback((i: number, byFarmer = true) => {
    const next = Math.max(0, Math.min(n - 1, i));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    if (byFarmer && !autoTurn.current) haptic.select();
    autoTurn.current = false;
    onIndexChange?.(next);
  }, [n, onIndexChange]);

  const go = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    ref.current?.scrollTo({ x: next * w, animated: !reduce });
    land(next);
  };

  // The dots follow the scroll position once it has settled (web fires no momentum-end event).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!w) return;
    const x = e.nativeEvent.contentOffset.x;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => land(Math.round(x / w), !autoTurn.current), 90);
  };
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  useEffect(() => {
    if (!controller) return;
    controller.current = { go, index: () => indexRef.current };
    return () => { controller.current = null; };
  });

  /* ── autoplay ── */
  const [resting, setResting] = useState(false);   // the farmer touched it: wait
  const [hovering, setHovering] = useState(false); // a mouse is over it
  const [awake, setAwake] = useState(true);        // the app is in front
  const [reader, setReader] = useState(false);     // a screen reader is on: the slider never moves by itself
  const focused = useScreenFocused();              // this screen is the one showing
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rest = useCallback(() => {
    setResting(true);
    if (restTimer.current) clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => setResting(false), AUTOPLAY_REST_MS);
  }, []);
  useEffect(() => () => { if (restTimer.current) clearTimeout(restTimer.current); }, []);
  useEffect(() => {
    if (!autoplay) return;
    let alive = true;
    const sub = AppState.addEventListener("change", (s) => setAwake(s === "active"));
    const onVis = () => setAwake(typeof document === "undefined" || !document.hidden);
    if (isWeb && typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    AccessibilityInfo.isScreenReaderEnabled().then((v) => { if (alive) setReader(!!v); }).catch(() => {});
    const srSub = AccessibilityInfo.addEventListener("screenReaderChanged", (v) => setReader(!!v));
    return () => {
      alive = false;
      sub.remove();
      srSub.remove();
      if (isWeb && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
  }, [autoplay]);
  const playing = autoplay > 0 && n > 1 && w > 0 && !reduce && !resting && !hovering && awake && focused && !paused && !reader;

  // The next turn, and the active dot filling up towards it.
  const fill = useSharedValue(0);
  useEffect(() => {
    if (!playing) { cancelAnimation(fill); fill.value = withTiming(0, { duration: 160 }); return; }
    fill.value = 0;
    fill.value = withTiming(1, { duration: autoplay, easing: Easing.linear });
    const id = setTimeout(() => {
      const next = (indexRef.current + 1) % n;
      autoTurn.current = true;
      ref.current?.scrollTo({ x: next * w, animated: true });
      land(next, false);
    }, autoplay);
    return () => { clearTimeout(id); cancelAnimation(fill); };
  }, [playing, index, autoplay, n, w]);
  // A transform, not a width: no layout pass per frame on a slow phone.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  if (!n) return null;
  const keys = isWeb
    ? {
        tabIndex: 0,
        onKeyDown: (e: any) => {
          if (e.key === "ArrowRight") { e.preventDefault?.(); rest(); go(indexRef.current + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault?.(); rest(); go(indexRef.current - 1); }
        },
        onFocus: rest,
        onMouseEnter: () => setHovering(true),
        onMouseLeave: () => setHovering(false),
      }
    : {};

  return (
    <View
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      accessibilityLabel={label}
      {...(isWeb ? ({ role: "group" } as any) : null)}
      {...(keys as any)}
      onTouchStart={autoplay ? rest : undefined}
      {...(autoplay && isWeb ? { onPointerDown: rest } : null)}
      style={{ width: "100%" }}
      testID={testID}
      {...(autoplay ? ({ dataSet: { autoplay: playing ? "on" : "off" } } as any) : null)}
    >
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={w || undefined}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        onScrollBeginDrag={autoplay ? rest : undefined}
        onMomentumScrollEnd={(e) => w && land(Math.round(e.nativeEvent.contentOffset.x / w))}
        scrollEventThrottle={32}
        style={{ width: "100%" }}
        contentContainerStyle={{ alignItems: "stretch" }}
      >
        {w > 0
          ? items.map((it, i) => (
              <View key={keyOf(it, i)} style={[{ width: w }, snapPage]} testID={testID ? `${testID}-page-${i}` : undefined}>
                {render(it, i)}
              </View>
            ))
          : null}
      </ScrollView>

      {n > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {arrows && <Arrow dir="left" disabled={index === 0} onPress={() => { rest(); go(index - 1); }} label={tt("pager.prev")} />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 }}>
            {items.map((it, i) => {
              const tone = dotTone?.(i);
              const active = i === index;
              const fillColor = tone === "ok" ? t.ok : tone === "bad" ? t.alert : active ? t.accent : t.line;
              return (
              <Pressable
                key={keyOf(it, i)}
                onPress={() => { rest(); go(i); }}
                accessibilityRole="button"
                accessibilityLabel={tt("pager.page", { n: i + 1, of: n })}
                accessibilityState={{ selected: active }}
                {...(isWeb ? ({ "aria-selected": active } as any) : null)}
                hitSlop={8}
                testID={testID ? `${testID}-dot-${i}` : undefined}
                style={({ focused }: PressState) => [{ padding: 2, borderRadius: 999 }, webCursor, focusRing(focused, t.accent)]}
              >
                <View style={{ width: active ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: active && !tone ? t.line : fillColor, overflow: "hidden" }}>
                  {/* The active dot fills up as the next automatic turn approaches. */}
                  {active && !tone ? <Animated.View style={[{ height: 7, width: 22, borderRadius: 4, backgroundColor: t.accent, transformOrigin: "left" }, autoplay ? fillStyle : null]} /> : null}
                </View>
              </Pressable>
              );
            })}
          </View>
          {arrows && <Arrow dir="right" disabled={index === n - 1} onPress={() => { rest(); go(index + 1); }} label={tt("pager.next")} />}
        </View>
      )}
    </View>
  );
}

function Arrow({ dir, disabled, onPress, label }: { dir: "left" | "right"; disabled: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed, hovered, focused }: PressState) => [
        { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : pressed ? 0.7 : 1 },
        hovered && !disabled && { backgroundColor: t.raised },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <ChevronGlyph size={14} color={t.ink} dir={dir} />
    </Pressable>
  );
}
