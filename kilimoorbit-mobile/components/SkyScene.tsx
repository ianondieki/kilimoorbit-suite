/**
 * The weather card's living backdrop: a photograph of the sky as it is today
 * (assets/sky, by conditions and hour: dawn, day, dusk, night) that drifts
 * and breathes very slowly, with rain falling, lightning now and then and
 * stars blinking drawn over it, and a soft scrim so the temperature and the
 * sky words stay readable. Everything is bundled, so it works offline, and
 * the motion stops under the system's reduce-motion setting.
 * Photo credits: assets/CREDITS.md.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import type { Sky } from "../lib/api";
import { daypart, isWet, skyColors, skyPhoto, type Daypart, type SkyPhoto } from "../lib/sky";
import { useScreenFocused } from "./Motion";

export { daypart, isWet, skyColors, skyPhoto, type Daypart, type SkyPhoto };

const PHOTOS: Record<SkyPhoto, number> = {
  "sunny-day": require("../assets/sky/sunny-day.jpg"),
  "partly-day": require("../assets/sky/partly-day.jpg"),
  "cloudy-day": require("../assets/sky/cloudy-day.jpg"),
  "rain-day": require("../assets/sky/rain-day.jpg"),
  "heavy-day": require("../assets/sky/heavy-day.jpg"),
  "heavy-night": require("../assets/sky/heavy-night.jpg"),
  storm: require("../assets/sky/storm.jpg"),
  "clear-night": require("../assets/sky/clear-night.jpg"),
  "sunny-dawn": require("../assets/sky/sunny-dawn.jpg"),
  "sunny-dusk": require("../assets/sky/sunny-dusk.jpg"),
  "cloudy-dawn": require("../assets/sky/cloudy-dawn.jpg"),
  "cloudy-dusk": require("../assets/sky/cloudy-dusk.jpg"),
};

// Deterministic "random" placement so the scene is the same on every render.
const at = (i: number, salt: number) => (Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1;
const frac = (i: number, salt: number) => Math.abs(at(i, salt));

export default function SkyScene({ sky, hour, height, testID }: { sky: Sky; hour: number; height: number; testID?: string }) {
  const part = daypart(hour);
  const [top, bottom] = skyColors(sky, part);
  const wet = isWet(sky);
  const night = part === "night";
  const drops = sky === "showers" ? 8 : sky === "rain" ? 14 : sky === "heavy" || sky === "storm" ? 22 : 0;
  // One decision for every moving part: still under reduce-motion and while another screen is in front.
  const reduce = useReducedMotion();
  const focused = useScreenFocused();
  const live = !reduce && focused;
  return (
    <View style={{ height, overflow: "hidden", backgroundColor: bottom }} testID={testID ?? `sky-${sky}-${part}`} accessible={false} importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={[top, bottom]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      <Photo name={skyPhoto(sky, part)} live={live} />
      {night && !wet ? <Stars live={live} /> : null}
      {drops > 0 ? <Rain count={drops} height={height} live={live} /> : null}
      {sky === "storm" ? <Lightning live={live} /> : null}
      {/* a scrim so the white temperature and sky words stay readable on a bright or busy sky */}
      <LinearGradient colors={["rgba(8, 14, 24, 0.58)", "rgba(8, 14, 24, 0.12)", "rgba(8, 14, 24, 0)"]} locations={[0, 0.55, 0.9]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      <LinearGradient colors={["rgba(8, 14, 24, 0.5)", "rgba(8, 14, 24, 0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 0.7, y: 0.5 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
    </View>
  );
}

/** The photograph, drifting and breathing very slowly (a slow zoom and pan over half a minute). */
function Photo({ name, live }: { name: SkyPhoto; live: boolean }) {
  const zoom = useSharedValue(1.04);
  const pan = useSharedValue(0);
  useEffect(() => {
    if (!live) return;
    zoom.value = withRepeat(withTiming(1.12, { duration: 32000, easing: Easing.inOut(Easing.sin) }), -1, true);
    pan.value = withRepeat(withTiming(-14, { duration: 26000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => { cancelAnimation(zoom); cancelAnimation(pan); };
  }, [live]);
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }, { translateX: pan.value }] }));
  return (
    <Animated.Image
      source={PHOTOS[name]}
      resizeMode="cover"
      accessible={false}
      style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" }, drift]}
      testID={`sky-photo-${name}`}
    />
  );
}

function Rain({ count, height, live }: { count: number; height: number; live: boolean }) {
  return <>{Array.from({ length: count }, (_, i) => <Drop key={i} i={i} height={height} live={live} />)}</>;
}

function Drop({ i, height, live }: { i: number; height: number; live: boolean }) {
  const y = useSharedValue(live ? -24 : frac(i, 11) * height);
  useEffect(() => {
    if (!live) { y.value = frac(i, 11) * height; return; }
    const fall = 900 + frac(i, 13) * 500;
    y.value = withDelay(frac(i, 17) * fall, withRepeat(withSequence(withTiming(-24, { duration: 0 }), withTiming(height + 24, { duration: fall, easing: Easing.linear })), -1, false));
    return () => cancelAnimation(y);
  }, [live]);
  const fall = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: `${4 + frac(i, 19) * 92}%` as any, top: 0, width: 2, height: 12 + frac(i, 23) * 8, borderRadius: 2, backgroundColor: "rgba(220, 236, 255, 0.7)", transform: [{ rotate: "12deg" }] }, fall]} />
  );
}

function Lightning({ live }: { live: boolean }) {
  const o = useSharedValue(0);
  useEffect(() => {
    if (!live) { o.value = 0; return; }
    o.value = withRepeat(withSequence(withDelay(3600, withTiming(0.55, { duration: 50 })), withTiming(0, { duration: 160 }), withTiming(0.35, { duration: 50 }), withTiming(0, { duration: 260 })), -1, false);
    return () => cancelAnimation(o);
  }, [live]);
  const flash = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#F5F0FF" }, flash]} />;
}

function Stars({ live }: { live: boolean }) {
  return <>{Array.from({ length: 10 }, (_, i) => <Star key={i} i={i} live={live} />)}</>;
}

function Star({ i, live }: { i: number; live: boolean }) {
  const o = useSharedValue(0.9);
  useEffect(() => {
    if (!live) { o.value = 0.9; return; }
    o.value = withDelay(frac(i, 29) * 1500, withRepeat(withTiming(0.15, { duration: 1100 + frac(i, 31) * 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(o);
  }, [live]);
  const twinkle = useAnimatedStyle(() => ({ opacity: o.value }));
  const size = 2 + Math.round(frac(i, 37) * 2);
  return <Animated.View style={[{ position: "absolute", left: `${3 + frac(i, 41) * 90}%` as any, top: 6 + frac(i, 43) * 60, width: size, height: size, borderRadius: size, backgroundColor: "#FFFFFF" }, twinkle]} />;
}
