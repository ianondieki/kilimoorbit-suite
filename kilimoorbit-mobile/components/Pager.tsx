/**
 * A swipeable, one-page-at-a-time slider for the Today cards (news, shows,
 * trivia): snaps page by page on a phone, and on the web adds ‹ › buttons
 * and arrow keys since a mouse can't swipe. Dots show where you are and are
 * tappable. Nothing moves on its own: a farmer reads at their own pace.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Text from "./Text";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, isWeb, webCursor, type PressState } from "../lib/ui";
import { haptic } from "../lib/haptics";
import { ChevronGlyph } from "./Glyphs";

// Web: scroll-snap keeps a mouse-wheel or drag landing on a page too.
const snapPage: any = isWeb ? { scrollSnapAlign: "start" } : null;

export type PagerHandle = { go: (index: number) => void; index: () => number };

export default function Pager<T>({
  items, render, keyOf, label, testID, onIndexChange, arrows = isWeb, controller, dotTone,
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

  const land = useCallback((i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    haptic.select();
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
    settle.current = setTimeout(() => land(Math.round(x / w)), 90);
  };

  useEffect(() => {
    if (!controller) return;
    controller.current = { go, index: () => indexRef.current };
    return () => { controller.current = null; };
  });

  if (!n) return null;
  const keys = isWeb
    ? {
        tabIndex: 0,
        onKeyDown: (e: any) => {
          if (e.key === "ArrowRight") { e.preventDefault?.(); go(indexRef.current + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault?.(); go(indexRef.current - 1); }
        },
      }
    : {};

  return (
    <View
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      accessibilityLabel={label}
      {...(isWeb ? ({ role: "group" } as any) : null)}
      {...(keys as any)}
      style={{ width: "100%" }}
      testID={testID}
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
          {arrows && <Arrow dir="left" disabled={index === 0} onPress={() => go(index - 1)} label={tt("pager.prev")} />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 }}>
            {items.map((it, i) => {
              const tone = dotTone?.(i);
              const fill = tone === "ok" ? t.ok : tone === "bad" ? t.alert : i === index ? t.accent : t.line;
              return (
              <Pressable
                key={keyOf(it, i)}
                onPress={() => go(i)}
                accessibilityRole="button"
                accessibilityLabel={tt("pager.page", { n: i + 1, of: n })}
                accessibilityState={{ selected: i === index }}
                {...(isWeb ? ({ "aria-selected": i === index } as any) : null)}
                hitSlop={8}
                testID={testID ? `${testID}-dot-${i}` : undefined}
                style={({ focused }: PressState) => [{ padding: 2, borderRadius: 999 }, webCursor, focusRing(focused, t.accent)]}
              >
                <View style={{ width: i === index ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: fill }} />
              </Pressable>
              );
            })}
          </View>
          {arrows && <Arrow dir="right" disabled={index === n - 1} onPress={() => go(index + 1)} label={tt("pager.next")} />}
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
