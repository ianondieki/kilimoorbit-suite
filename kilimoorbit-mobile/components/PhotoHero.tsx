/**
 * A screen's opening photograph: a real scene from Kenyan farming under a
 * deep-green gradient that keeps the white text above WCAG AA contrast on any
 * part of the photo, with the section's eyebrow, a display title, a line of
 * context and room for actions or numbers. The photo is decorative (hidden
 * from screen readers); its credit is always visible. It eases in once
 * (a short fade and a 4% settle), and stays still with reduced motion.
 */
import React, { useEffect, useState } from "react";
import { Image, View, Platform, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Text from "./Text";
import Icon, { type IconName } from "./Icon";
import { T } from "./Kit";
import { PHOTOS, creditLine, type PhotoKey } from "../lib/photos";
import { useLang } from "../lib/session";

export const HERO_INK = "#FFFFFF";
export const HERO_DIM = "rgba(255, 255, 255, 0.86)";
export const HERO_LEAF = "#B9E27A";

export function PhotoHero({
  photo, eyebrow, icon, title, subtitle, children, height = 210, compact = false, style, testID,
}: {
  photo: PhotoKey; eyebrow?: string; icon?: IconName; title: string; subtitle?: string;
  children?: React.ReactNode; height?: number; compact?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const { lang } = useLang();
  const p = PHOTOS[photo];
  const reduce = useReducedMotion();
  const shown = useSharedValue(reduce ? 1 : 0);
  const [failed, setFailed] = useState(false);
  const imgStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: 1.04 - 0.04 * shown.value }] }));
  const onLoad = () => { shown.value = reduce ? 1 : withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }); };
  // Never leave the photo hidden if a platform skips onLoad for a cached image.
  useEffect(() => { const id = setTimeout(() => { if (shown.value === 0) shown.value = 1; }, 1500); return () => clearTimeout(id); }, []);
  const extra = height * 0.3;
  return (
    <View
      style={[{ minHeight: height, borderRadius: compact ? 16 : 22, overflow: "hidden", backgroundColor: "#173A2C", justifyContent: "flex-end" }, style]}
      testID={testID ?? `photo-hero-${photo}`}
    >
      {!failed && (
        <Animated.View
          style={[{ position: "absolute", left: 0, right: 0, top: -extra * p.focusY, bottom: -extra * (1 - p.focusY) }, imgStyle]}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" {...(Platform.OS === "web" ? { "aria-hidden": true } : null)}
        >
          <Image source={p.src} onLoad={onLoad} onError={() => setFailed(true)} resizeMode="cover" style={{ width: "100%", height: "100%" }} accessible={false} />
        </Animated.View>
      )}
      <LinearGradient
        colors={["rgba(0, 35, 26, 0.28)", "rgba(0, 35, 26, 0.62)", "rgba(0, 28, 20, 0.94)"]}
        locations={[0, 0.42, 1]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        pointerEvents="none"
      />
      <View style={{ position: "absolute", top: 10, right: 10, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "rgba(0, 0, 0, 0.42)", flexDirection: "row", alignItems: "center", gap: 4 }} testID="photo-credit">
        <Icon name="camera-outline" size={11} color={HERO_DIM} />
        <Text style={{ color: HERO_DIM, fontSize: 10, lineHeight: 13, fontWeight: "600" }} accessibilityLabel={(lang === "sw" ? "Picha: " : "Photo: ") + creditLine(p)}>{creditLine(p)}</Text>
      </View>
      {/* paddingTop keeps the text clear of the credit pill however tall the content grows. */}
      <View style={{ padding: compact ? 14 : 18, paddingTop: 40, gap: compact ? 4 : 6 }}>
        {eyebrow ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {icon && <Icon name={icon} size={15} color={HERO_LEAF} />}
            <Text style={{ color: HERO_LEAF, fontSize: 11.5, lineHeight: 15, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" }}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text accessibilityRole="header" style={{ color: HERO_INK, ...(compact ? T.headline : T.display) }}>{title}</Text>
        {subtitle ? <Text style={{ color: HERO_DIM, ...T.body }}>{subtitle}</Text> : null}
        {children ? <View style={{ marginTop: compact ? 6 : 10 }}>{children}</View> : null}
      </View>
    </View>
  );
}

/** A frosted chip for numbers on a photo: "KES 49 · potatoes / kg". */
export function HeroChip({ icon, label, value, testID }: { icon?: IconName; label: string; value: string; testID?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 80, minWidth: 0, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "rgba(255, 255, 255, 0.14)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.18)", gap: 2 }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {icon && <Icon name={icon} size={14} color={HERO_LEAF} />}
        <Text numberOfLines={1} style={{ color: HERO_INK, fontSize: 15, lineHeight: 19, fontWeight: "800" }}>{value}</Text>
      </View>
      <Text numberOfLines={2} style={{ color: HERO_DIM, fontSize: 10.5, lineHeight: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}
