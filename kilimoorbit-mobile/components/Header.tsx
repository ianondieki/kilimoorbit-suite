import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, AccessibilityInfo, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, webCursor, webLang, type PressState } from "../lib/ui";
import { useMenu } from "./MenuContext";
import { MenuGlyph } from "./Glyphs";

/** 48x48 drawer opener for phone and medium widths (not rendered when docked). */
export function MenuButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { openMenu, isDocked } = useMenu();
  if (isDocked) return null;
  return (
    <Pressable
      onPress={openMenu}
      {...webLang(lang)}
      // Web: data-ko-menu-button, so the drawer can focus the new screen's
      // menu button after it navigates (MenuContext closeMenu "screen").
      {...({ dataSet: { koMenuButton: "1" } } as any)}
      accessibilityRole="button"
      accessibilityLabel={tt("menu.open")}
      style={({ pressed, hovered, focused }: PressState) => [
        { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
        (hovered || pressed) && { backgroundColor: t.raised },
        webCursor,
        focusRing(focused, t.accent),
        style,
      ]}
    >
      <MenuGlyph size={22} color={t.ink} />
    </Pressable>
  );
}

export default function Header({ engine }: { engine: "LIVE" | "MOCK" | "OFFLINE" }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  // Docked: the sidebar beside this header already shows the wordmark, so the
  // header names the page instead of repeating the brand.
  const { isDocked } = useMenu();
  const dot = engine === "LIVE" ? t.ok : engine === "MOCK" ? t.accent : t.alert;
  const online = engine === "LIVE" || engine === "MOCK";

  // Status heartbeat: an expanding halo when connected (the engine is alive and
  // watching), a slow blink when offline. Respects the OS reduce-motion switch.
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => setReduced(!!v)).catch(() => {});
  }, []);
  useEffect(() => {
    pulse.setValue(0);
    if (reduced) return;
    const loop = Animated.loop(
      online
        ? Animated.timing(pulse, {
            toValue: 1, duration: engine === "LIVE" ? 1600 : 2400,
            easing: Easing.out(Easing.ease), useNativeDriver: true,
          })
        : Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 620, useNativeDriver: true }),
          ])
    );
    loop.start();
    return () => loop.stop();
  }, [engine, reduced]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const dotOpacity = online ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });

  return (
    <View style={[s.row, { borderBottomColor: t.line, backgroundColor: t.bg }]}>
      <MenuButton style={{ marginLeft: -12, marginVertical: -8 }} />
      {isDocked ? (
        <Text accessibilityRole="header" {...webLang(lang)} style={[s.brand, { color: t.ink }]}>{tt("nav.dashboard").toUpperCase()}</Text>
      ) : (
        <Text style={[s.brand, { color: t.ink }]}>
          KILIMO<Text style={{ color: t.accent }}>ORBIT</Text> SENTINEL
        </Text>
      )}
      <View style={s.status}>
        <View style={s.dotWrap}>
          {online && !reduced && (
            <Animated.View
              style={[s.halo, { backgroundColor: dot, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
            />
          )}
          <Animated.View style={[s.dot, { backgroundColor: dot, opacity: dotOpacity }]} />
        </View>
        <Text style={[s.statusTxt, { color: t.dim }]}>
          {engine === "LIVE" ? "APEX LIVE" : engine === "MOCK" ? "MOCK" : "OFFLINE"}
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  // minHeight 56 (border included) lines up with the docked sidebar head row.
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, minHeight: 56, borderBottomWidth: 1, gap: 14 },
  brand: { flex: 1, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dotWrap: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 10, fontFamily: "monospace", letterSpacing: 1 },
});
