/**
 * Signature motif: the farming year as an orbit. January sits at 12 o'clock,
 * months run clockwise; rainy months are green streaks, dry months dots, and
 * a gold satellite marks today. Derived from the date alone — no data needed.
 */
import React, { useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import Animated, {
  Easing, ReduceMotion, cancelAnimation, interpolate, useAnimatedStyle, useReducedMotion,
  useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { isRainy, monthName, seasonFor, seasonOfMonth } from "../lib/season";

type Props = { size: number; variant: "mini" | "full"; date?: Date };

export default function SeasonOrbit({ size, variant, date }: Props) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const reduce = useReducedMotion();
  const now = useMemo(() => date ?? new Date(), [date]);
  const season = seasonFor(now);
  const full = variant === "full";
  const ringW = full ? 3 : 2;
  const angle = (season.monthIndex + season.dayFrac) * 30;
  // Mini: a 10px solid satellite with no panel-coloured border, so it sits on
  // the ring instead of punching a hole in it (and slicing a nearby streak).
  const sat = full ? Math.max(8, Math.round(size * 0.08)) : 10;
  const satBorder = full ? 3 : 0;

  // Motion (full only): ticks fade in clockwise, then the satellite travels to
  // today and its halo pulses three times before resting.
  const ticks = useSharedValue(full && !reduce ? 0 : 12);
  const rot = useSharedValue(full && !reduce ? 0 : angle);
  const halo = useSharedValue(0);
  useEffect(() => {
    if (!full || reduce) {
      ticks.value = 12;
      rot.value = angle;
      halo.value = 0;
      return;
    }
    const cfg = { reduceMotion: ReduceMotion.System };
    ticks.value = withTiming(12, { duration: 12 * 25 + 120, easing: Easing.linear, ...cfg });
    rot.value = withDelay(200, withTiming(angle, { duration: 900, easing: Easing.out(Easing.cubic), ...cfg }));
    halo.value = withDelay(
      1100,
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad), ...cfg })), 3, false)
    );
    return () => { cancelAnimation(ticks); cancelAnimation(rot); cancelAnimation(halo); };
  }, [full, reduce, angle]);

  const rotStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value === 0 ? 0 : interpolate(halo.value, [0, 1], [0.45, 0]),
    transform: [{ scale: interpolate(halo.value, [0, 1], [1, 2.6]) }],
  }));

  const ringTop = ringW / 2; // centre of the ring stroke, measured from the top edge
  const a11yLabel = full
    ? tt("orbit.a11y", {
        name: tt(`season.${season.key}.name` as any),
        desc: tt(`season.${season.key}.desc` as any),
        months: tt(`season.${season.key}.months` as any),
        day: season.day,
        month: monthName(lang, season.monthIndex),
      })
    : undefined;

  return (
    <View
      accessible={full}
      accessibilityRole={full ? "image" : undefined}
      accessibilityLabel={a11yLabel}
      importantForAccessibility={full ? "yes" : "no-hide-descendants"}
      aria-hidden={full ? undefined : true}
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size / 2,
          borderWidth: ringW, borderColor: full ? t.line : t.dim,
        }}
      />
      {Array.from({ length: 12 }, (_, i) => {
          const s = seasonOfMonth(i);
          const current = s === season.key;
          // Mini draws only the rainy streaks, so it reads as the same object as the full orbit.
          if (!full && !isRainy(s)) return null;
          // Mini: a streak under or beside the satellite would poke out as a
          // small green cap, so ticks within 18 degrees of today are left out.
          if (!full) {
            const diff = Math.abs(((i * 30 - angle) % 360 + 540) % 360 - 180);
            if (diff < 18) return null;
          }
          return (
            <Tick
              key={i} i={i} size={size} progress={ticks}
              rainy={isRainy(s)} current={current} ringTop={ringTop}
              ok={t.ok} dim={t.dim} mini={!full}
            />
          );
        })}

      {full && (
        <View style={{ pointerEvents: "none", position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <View style={{ maxWidth: size * 0.7, alignItems: "center" }}>
            <Text style={{ color: t.ink, fontSize: 26, lineHeight: 32, fontWeight: "800", textAlign: "center" }} numberOfLines={2}>
              {tt(`season.${season.key}.name` as any)}
            </Text>
            <Text style={{ color: t.dim, fontSize: 13, lineHeight: 18, fontFamily: "monospace", textAlign: "center", marginTop: 2 }}>
              {tt(`season.${season.key}.months` as any)}
            </Text>
          </View>
        </View>
      )}

      <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: size, height: size }, rotStyle]}>
        {full && (
          <Animated.View
            style={[{
              position: "absolute", width: sat, height: sat, borderRadius: sat / 2, backgroundColor: t.accent,
              left: (size - sat) / 2, top: ringTop - sat / 2,
            }, haloStyle]}
          />
        )}
        <View
          style={{
            position: "absolute", width: sat, height: sat, borderRadius: sat / 2,
            backgroundColor: t.accent, borderWidth: satBorder, borderColor: t.panel,
            left: (size - sat) / 2, top: ringTop - sat / 2,
          }}
        />
      </Animated.View>
    </View>
  );
}

function Tick({
  i, size, progress, rainy, current, ringTop, ok, dim, mini,
}: {
  i: number; size: number; progress: SharedValue<number>; rainy: boolean; current: boolean;
  ringTop: number; ok: string; dim: string; mini?: boolean;
}) {
  const target = current ? 1 : mini ? 0.7 : 0.45;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.value - i)) * target,
  }));
  const len = mini ? Math.max(6, Math.round(size * 0.18)) : Math.round(size * 0.08 * (current ? 1.2 : 1));
  const w = mini ? 2 : rainy ? 4 : 6;
  const h = rainy ? len : 6;
  return (
    <View style={{ pointerEvents: "none", position: "absolute", left: 0, top: 0, width: size, height: size, transform: [{ rotate: `${i * 30}deg` }] }}>
      <Animated.View
        style={[{
          position: "absolute", width: w, height: h, borderRadius: rainy ? 2 : 3,
          backgroundColor: rainy ? ok : dim, left: (size - w) / 2, top: ringTop - h / 2,
        }, style]}
      />
    </View>
  );
}

/** CTA loading indicator: a 20px orbit whose satellite circles until unmounted. */
export function OrbitSpinner({ size = 20, color }: { size?: number; color: string }) {
  const reduce = useReducedMotion();
  const rot = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    rot.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const d = 6;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: size, height: size }}>
      <View style={{ position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, opacity: 0.5 }} />
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: size, height: size }, style]}>
        <View style={{ position: "absolute", width: d, height: d, borderRadius: d / 2, backgroundColor: color, left: (size - d) / 2, top: 1 - d / 2 }} />
      </Animated.View>
    </View>
  );
}
