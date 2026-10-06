/**
 * The weather card's living backdrop: a sky drawn for the day's conditions and
 * the hour (dawn, day, dusk, night), with slow motion — sun rays turning,
 * clouds drifting, rain falling, lightning now and then, stars blinking — over
 * a green hill. Views and a gradient only, so it is crisp at any size, works
 * offline, suits every theme, and goes still under the reduce-motion setting.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import type { Sky } from "../lib/api";
import { MoonGlyph } from "./Glyphs";

export type Daypart = "dawn" | "day" | "dusk" | "night";
export const daypart = (hour: number): Daypart => (hour < 6 ? "night" : hour < 8 ? "dawn" : hour < 17 ? "day" : hour < 19 ? "dusk" : "night");

const WET: Sky[] = ["showers", "rain", "heavy", "storm"];
export const isWet = (sky: Sky) => WET.includes(sky);

/** Top and bottom of the sky, by conditions and hour. */
export function skyColors(sky: Sky, part: Daypart): [string, string] {
  const wet = isWet(sky);
  if (part === "night") return wet ? ["#0A1226", "#1C2740"] : ["#0B1535", "#243458"];
  if (part === "dawn") return wet ? ["#4A5A7A", "#9A98B0"] : ["#E89A5B", "#8FC0E8"];
  if (part === "dusk") return wet ? ["#3A4663", "#746E90"] : ["#D9734A", "#5A6DB0"];
  switch (sky) {
    case "sunny": return ["#2F7DD1", "#8CCBF2"];
    case "partly": return ["#3B7CC0", "#A6CBE8"];
    case "cloudy": return ["#5C7391", "#AEBCCB"];
    case "showers": return ["#4C6A8E", "#8FA8C2"];
    case "rain": return ["#3C5574", "#7A91AB"];
    case "heavy": return ["#2F4660", "#5F7691"];
    default: return ["#27354C", "#525E78"]; // storm
  }
}

/** Whether the sun or moon sits on the right of the scene (the hero text keeps clear of it). */
export const hasSunOrMoon = (sky: Sky, part: Daypart) => part === "night" || sky === "sunny" || sky === "partly" || (!isWet(sky) && part !== "day");

// Deterministic "random" placement so the scene is the same on every render.
const at = (i: number, salt: number) => (Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1;
const frac = (i: number, salt: number) => Math.abs(at(i, salt));

export default function SkyScene({ sky, hour, height, testID }: { sky: Sky; hour: number; height: number; testID?: string }) {
  const part = daypart(hour);
  const [top, bottom] = skyColors(sky, part);
  const wet = isWet(sky);
  const night = part === "night";
  const clouds = sky === "sunny" ? 0 : sky === "partly" ? 2 : 3;
  const drops = sky === "showers" ? 8 : sky === "rain" ? 14 : sky === "heavy" || sky === "storm" ? 22 : 0;
  const hill = night ? "#0F2A1C" : wet ? "#2E6B45" : "#3C8A4B";
  return (
    <View style={{ height, overflow: "hidden" }} testID={testID ?? `sky-${sky}-${part}`} accessible={false} importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={[top, bottom]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      {night ? <Stars /> : null}
      {night ? (
        <View style={{ position: "absolute", right: 28, top: 18 }}><MoonGlyph size={44} color="#F3E9C6" cutout={top} /></View>
      ) : sky === "sunny" || sky === "partly" || (!wet && part !== "day") ? (
        <Sun part={part} />
      ) : null}
      {Array.from({ length: clouds }, (_, i) => <Cloud key={i} i={i} dark={wet} wide={height} />)}
      {drops > 0 ? <Rain count={drops} height={height} /> : null}
      {sky === "storm" ? <Lightning /> : null}
      {/* the hills */}
      <View style={{ position: "absolute", left: "-18%", right: "35%", bottom: -58, height: 96, borderRadius: 999, backgroundColor: hill, opacity: 0.95 }} />
      <View style={{ position: "absolute", left: "40%", right: "-20%", bottom: -66, height: 100, borderRadius: 999, backgroundColor: hill, opacity: 0.85 }} />
      {/* a scrim so the white temperature and sky words stay readable on a bright sky */}
      <LinearGradient colors={["rgba(8, 14, 24, 0.46)", "rgba(8, 14, 24, 0)"]} locations={[0, 0.8]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
    </View>
  );
}

function Sun({ part }: { part: Daypart }) {
  const reduce = useReducedMotion();
  const spin = useSharedValue(0);
  const glow = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    spin.value = withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(360, { duration: 52000, easing: Easing.linear })), -1, false);
    glow.value = withRepeat(withTiming(1.1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => { cancelAnimation(spin); cancelAnimation(glow); };
  }, [reduce]);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: glow.value }] }));
  const color = part === "day" ? "#FFD966" : "#FFC27A";
  const low = part !== "day";
  return (
    <View style={{ position: "absolute", right: low ? 30 : 26, top: low ? 44 : 16, width: 84, height: 84, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: 84, height: 84, borderRadius: 42, backgroundColor: color, opacity: 0.22 }, halo]} />
      <Animated.View style={[{ position: "absolute", width: 84, height: 84 }, rays]}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ position: "absolute", left: 0, top: 0, width: 84, height: 84, alignItems: "center", transform: [{ rotate: `${i * 45}deg` }] }}>
            <View style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: color, opacity: 0.9 }} />
          </View>
        ))}
      </Animated.View>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color }} />
    </View>
  );
}

function Cloud({ i, dark, wide }: { i: number; dark: boolean; wide: number }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(-26 + frac(i, 3) * 20);
  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withTiming(26, { duration: 24000 + i * 7000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(x);
  }, [reduce]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const c = dark ? "rgba(205, 214, 226, 0.78)" : "rgba(255, 255, 255, 0.92)";
  const scale = 0.8 + frac(i, 5) * 0.5;
  const left = 10 + i * 34 + frac(i, 7) * 10;
  const top = 10 + frac(i, 9) * Math.max(10, wide * 0.3);
  return (
    <Animated.View style={[{ position: "absolute", left: `${left}%` as any, top, width: 92 * scale, height: 36 * scale }, drift]}>
      <View style={{ position: "absolute", left: 0, bottom: 0, width: 92 * scale, height: 22 * scale, borderRadius: 999, backgroundColor: c }} />
      <View style={{ position: "absolute", left: 12 * scale, bottom: 10 * scale, width: 28 * scale, height: 28 * scale, borderRadius: 999, backgroundColor: c }} />
      <View style={{ position: "absolute", left: 32 * scale, bottom: 10 * scale, width: 38 * scale, height: 38 * scale, borderRadius: 999, backgroundColor: c }} />
      <View style={{ position: "absolute", left: 60 * scale, bottom: 10 * scale, width: 24 * scale, height: 24 * scale, borderRadius: 999, backgroundColor: c }} />
    </Animated.View>
  );
}

function Rain({ count, height }: { count: number; height: number }) {
  return <>{Array.from({ length: count }, (_, i) => <Drop key={i} i={i} height={height} />)}</>;
}

function Drop({ i, height }: { i: number; height: number }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? frac(i, 11) * height : -24);
  useEffect(() => {
    if (reduce) return;
    const fall = 900 + frac(i, 13) * 500;
    y.value = withDelay(frac(i, 17) * fall, withRepeat(withSequence(withTiming(-24, { duration: 0 }), withTiming(height + 24, { duration: fall, easing: Easing.linear })), -1, false));
    return () => cancelAnimation(y);
  }, [reduce]);
  const fall = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: `${4 + frac(i, 19) * 92}%` as any, top: 0, width: 2, height: 12 + frac(i, 23) * 8, borderRadius: 2, backgroundColor: "rgba(220, 236, 255, 0.75)", transform: [{ rotate: "12deg" }] }, fall]} />
  );
}

function Lightning() {
  const reduce = useReducedMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withSequence(withDelay(3600, withTiming(0.55, { duration: 50 })), withTiming(0, { duration: 160 }), withTiming(0.35, { duration: 50 }), withTiming(0, { duration: 260 })), -1, false);
    return () => cancelAnimation(o);
  }, [reduce]);
  const flash = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#F5F0FF" }, flash]} />;
}

function Stars() {
  return <>{Array.from({ length: 14 }, (_, i) => <Star key={i} i={i} />)}</>;
}

function Star({ i }: { i: number }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.9);
  useEffect(() => {
    if (reduce) return;
    o.value = withDelay(frac(i, 29) * 1500, withRepeat(withTiming(0.2, { duration: 1100 + frac(i, 31) * 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(o);
  }, [reduce]);
  const twinkle = useAnimatedStyle(() => ({ opacity: o.value }));
  const size = 2 + Math.round(frac(i, 37) * 2);
  return <Animated.View style={[{ position: "absolute", left: `${3 + frac(i, 41) * 90}%` as any, top: 6 + frac(i, 43) * 70, width: size, height: size, borderRadius: size, backgroundColor: "#FFFFFF" }, twinkle]} />;
}
