/**
 * A swipeable slider for the Today cards (news, shows, trivia): snaps page by
 * page on a phone, and on the web adds ‹ › buttons and arrow keys since a
 * mouse can't swipe. Dots show where you are and are tappable.
 *
 * Optional, for the news and the shows:
 * - `autoplay` (ms): the slider turns by itself, looping, and the active dot
 *   fills as the next turn comes. It holds while a pointer is over it or
 *   focus is inside it, stops for good once the farmer swipes, taps a dot or
 *   an arrow, and always has a pause/play button (WCAG 2.2.2). With reduced
 *   motion, or while the screen is out of focus, nothing moves on its own.
 *   Turning by itself never buzzes the phone or interrupts a screen reader.
 * - `peek` (px): the next card shows at the edge, so a row reads as a row
 *   and it is plain there is more to see.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, isWeb, webCursor, type PressState } from "../lib/ui";
import { haptic } from "../lib/haptics";
import { ChevronGlyph } from "./Glyphs";
import Icon from "./Icon";
import { S, TOUCH, tint } from "./Kit";

// Web: scroll-snap keeps a mouse-wheel or drag landing on a page too.
const snapPage: any = isWeb ? { scrollSnapAlign: "start" } : null;
const snapRow: any = isWeb ? { scrollSnapType: "x mandatory" } : null;
/** A programmatic scroll settles within this; a scroll after it is the farmer's own. */
const OWN_SCROLL = 900;

export type PagerHandle = { go: (index: number) => void; index: () => number };

export default function Pager<T>({
  items, render, keyOf, label, testID, onIndexChange, arrows = isWeb, controller, dotTone, autoplay, peek = 0, gap = S.lg,
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
  /** Turn by itself every this many ms. */
  autoplay?: number;
  /** How much of the next card shows at the edge. */
  peek?: number;
  /** Space between a card and the one peeking. */
  gap?: number;
}) {
  const t = useTheme();
  const { t: tt } = useLang();
  const reduce = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownScrollAfter = useRef(0);
  const n = items.length;

  const edge = n > 1 ? peek : 0;
  const spacing = edge ? gap : 0;
  const pageW = w ? w - edge - spacing : 0;
  const step = pageW + spacing;
  const stops = n;
  // The last card rests flush right, the one before it peeking in on the left.
  const maxX = Math.max(0, n * pageW + (n - 1) * spacing - w);

  // Autoplay: playing until the farmer stops it; held while they point at it or work inside it.
  const [stopped, setStopped] = useState(false);
  const [held, setHeld] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  useFocusEffect(useCallback(() => { setOnScreen(true); return () => setOnScreen(false); }, []));
  const canPlay = !!autoplay && !reduce && stops > 1;
  // Web: only the rows the farmer can see turn, so a long screen never has three things moving at once.
  const box = useRef<View>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const node = box.current as unknown as Element | null;
    if (!isWeb || !canPlay || !node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.5 });
    io.observe(node);
    return () => io.disconnect();
  }, [canPlay]);
  const playing = canPlay && !stopped && !held && onScreen && inView && w > 0;

  const land = useCallback((i: number, own: boolean) => {
    const next = Math.max(0, Math.min(stops - 1, i));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    if (own) haptic.select();
    onIndexChange?.(next);
  }, [stops, onIndexChange]);

  const scrollTo = (i: number, own: boolean) => {
    const next = Math.max(0, Math.min(stops - 1, i));
    ownScrollAfter.current = Date.now() + OWN_SCROLL;
    ref.current?.scrollTo({ x: Math.min(next * step, maxX), animated: !reduce });
    land(next, own);
  };
  // Anything the farmer does to the slider takes over from the autoplay.
  const go = (i: number) => { setStopped(true); scrollTo(i, true); };

  const xToStop = (x: number) => (x >= maxX - 2 ? stops - 1 : Math.round(x / (step || 1)));

  // The dots follow the scroll position once it has settled (web fires no momentum-end event).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!w) return;
    const x = e.nativeEvent.contentOffset.x;
    const own = Date.now() > ownScrollAfter.current;
    if (own && canPlay) setStopped(true); // a mouse wheel or trackpad swipe on the web
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => land(xToStop(x), own), 90);
  };
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  // A new list (fresh news, a refresh that swaps live stories for tips) starts again at its first card.
  const sig = items.map((it, i) => keyOf(it, i)).join("|");
  useEffect(() => {
    if (indexRef.current === 0) return;
    indexRef.current = 0;
    setIndex(0);
    ownScrollAfter.current = Date.now() + OWN_SCROLL;
    ref.current?.scrollTo({ x: 0, animated: false });
  }, [sig]);
  // A resize or a turned phone changes the card width: keep the same card in place.
  useEffect(() => {
    if (!step) return;
    ownScrollAfter.current = Date.now() + OWN_SCROLL;
    ref.current?.scrollTo({ x: Math.min(indexRef.current * step, maxX), animated: false });
  }, [step]);

  // The next turn, and the fill of the active dot that counts down to it. Held, the fill
  // waits where it is and carries on from there; stopped, the dot is a plain full bar.
  const fill = useSharedValue(1);
  const filledFor = useRef(-1);
  useEffect(() => {
    if (!canPlay || stopped || !autoplay) { cancelAnimation(fill); fill.value = 1; filledFor.current = -1; return; }
    if (filledFor.current !== index) { cancelAnimation(fill); fill.value = 0; filledFor.current = index; }
    if (!playing) { cancelAnimation(fill); return; }
    const left = Math.max(0, (1 - fill.value) * autoplay);
    fill.value = withTiming(1, { duration: left, easing: Easing.linear });
    const id = setTimeout(() => scrollTo((indexRef.current + 1) % stops, false), left);
    return () => { clearTimeout(id); cancelAnimation(fill); };
  }, [playing, canPlay, stopped, index, autoplay, stops, step]);
  // scaleX, not width: the bar moves on the compositor and never re-lays out the page.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  useEffect(() => {
    if (!controller) return;
    controller.current = { go, index: () => indexRef.current };
    return () => { controller.current = null; };
  });

  if (!n) return null;
  const web = isWeb
    ? {
        tabIndex: 0,
        onKeyDown: (e: any) => {
          if (e.key === "ArrowRight") { e.preventDefault?.(); go(indexRef.current + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault?.(); go(indexRef.current - 1); }
        },
        ...(canPlay
          ? {
              onPointerEnter: (e: any) => { if (e?.pointerType !== "touch") setHeld(true); },
              onPointerLeave: () => setHeld(false),
              onFocus: () => setHeld(true),
              onBlur: (e: any) => { if (!e?.currentTarget?.contains?.(e?.relatedTarget)) setHeld(false); },
            }
          : null),
      }
    : {};

  return (
    <View
      // Web: cards inside the clipping scroll row colour on hover but do not rise (Kit surfaces).
      {...(isWeb ? ({ dataSet: { koPager: "1" } } as any) : null)}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      accessibilityLabel={label}
      {...(isWeb ? ({ role: "group", "aria-roledescription": "carousel" } as any) : null)}
      {...(web as any)}
      ref={box}
      // The controls come first in the page, so Tab reaches pause before the cards; they still show below.
      style={{ width: "100%", flexDirection: "column-reverse" }}
      testID={testID}
    >
      {stops > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs, marginTop: S.sm }}>
          {canPlay && (
            <Pressable
              // Play means play now, even with the pointer still over the slider.
              onPress={() => { if (stopped) setHeld(false); setStopped((v) => !v); }}
              accessibilityRole="button"
              accessibilityLabel={tt(stopped ? "pager.play" : "pager.pause")}
              testID={testID ? `${testID}-pause` : undefined}
              style={({ pressed, hovered, focused }: PressState) => [
                { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 },
                hovered && { backgroundColor: t.raised }, webCursor, focusRing(focused, t.accent),
              ]}
            >
              <Icon name={stopped ? "play" : "pause"} size={18} color={t.ink} />
            </Pressable>
          )}
          {arrows && <Arrow dir="left" disabled={index === 0} onPress={() => go(index - 1)} label={tt("pager.prev")} />}
          {/* Each dot owns a 28×44 cell (hitSlop doesn't grow the target on web); the arrows stay the 44px path. */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {Array.from({ length: stops }, (_, i) => {
              const tone = dotTone?.(i);
              const on = i === index;
              // Unselected dots hold about 3:1 on the page, so the row still reads in sunlight.
              const color = tone === "ok" ? t.ok : tone === "bad" ? t.alert : on ? t.accent : tint(t.dim, 0.7);
              return (
                <Pressable
                  key={keyOf(items[i], i)}
                  onPress={() => go(i)}
                  accessibilityRole="button"
                  accessibilityLabel={tt("pager.page", { n: i + 1, of: stops })}
                  accessibilityState={{ selected: on }}
                  {...(isWeb ? ({ "aria-selected": on, "aria-current": on ? "true" : undefined } as any) : null)}
                  testID={testID ? `${testID}-dot-${i}` : undefined}
                  style={({ focused }: PressState) => [{ minWidth: on ? 36 : 24, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8 }, webCursor, focusRing(focused, t.accent)]}
                >
                  {on && canPlay && !tone ? (
                    // The active dot is a track that fills toward the next turn.
                    <View style={{ width: 24, height: 6, borderRadius: 3, backgroundColor: tint(t.accent, 0.25), overflow: "hidden" }}>
                      <Animated.View style={[{ width: "100%", height: 6, borderRadius: 3, backgroundColor: t.accent, transformOrigin: "left" }, fillStyle]} />
                    </View>
                  ) : (
                    <View style={{ width: on ? 24 : 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                  )}
                </Pressable>
              );
            })}
          </View>
          {arrows && <Arrow dir="right" disabled={index === stops - 1} onPress={() => go(index + 1)} label={tt("pager.next")} />}
        </View>
      )}

      <ScrollView
        ref={ref}
        horizontal
        // Web pages snap through snapPage; its own paging wraps each page and stops the cards stretching to one height.
        pagingEnabled={!edge && !isWeb}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step || undefined}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        onScrollBeginDrag={() => canPlay && setStopped(true)}
        onMomentumScrollEnd={(e) => w && land(xToStop(e.nativeEvent.contentOffset.x), true)}
        scrollEventThrottle={32}
        style={[{ width: "100%" }, snapRow]}
        contentContainerStyle={{ alignItems: "stretch", gap: spacing }}
      >
        {pageW > 0
          ? items.map((it, i) => (
              <View
                key={keyOf(it, i)}
                style={[{ width: pageW }, snapPage]}
                testID={testID ? `${testID}-page-${i}` : undefined}
                {...(isWeb ? ({ role: "group", "aria-roledescription": "slide", "aria-label": tt("pager.page", { n: i + 1, of: n }) } as any) : null)}
              >
                {render(it, i)}
              </View>
            ))
          : null}
      </ScrollView>
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
        { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : pressed ? 0.7 : 1 },
        hovered && !disabled && { backgroundColor: t.raised },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <ChevronGlyph size={14} color={t.ink} dir={dir} />
    </Pressable>
  );
}
