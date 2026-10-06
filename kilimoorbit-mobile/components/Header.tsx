import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, Animated, Easing, AccessibilityInfo, StyleSheet, Platform, type StyleProp, type ViewStyle } from "react-native";
import Text from "./Text";
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

export type Engine = "LIVE" | "MOCK" | "OFFLINE";

/**
 * Screen header: menu button (phone/medium), the title, and on the right either
 * a custom slot or the connection status. `brand` shows the KilimoOrbit
 * wordmark on phones (the home screen); docked, the sidebar already shows it,
 * so the header names the page instead.
 */
export default function Header({
  engine, title, brand = false, right,
}: { engine?: Engine; title: string; brand?: boolean; right?: React.ReactNode }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { isDocked } = useMenu();
  return (
    <View style={[s.row, { borderBottomColor: t.line, backgroundColor: t.bg }]}>
      <MenuButton style={{ marginLeft: -12, marginVertical: -8 }} />
      {brand && !isDocked ? (
        <Text style={[s.brand, { color: t.ink }]} numberOfLines={1}>
          KILIMO<Text style={{ color: t.accent }}>ORBIT</Text>
        </Text>
      ) : (
        <Text accessibilityRole="header" {...webLang(lang)} numberOfLines={1} style={[s.brand, { color: t.ink }]}>{title.toUpperCase()}</Text>
      )}
      {right ?? (engine ? <EngineStatus engine={engine} /> : null)}
    </View>
  );
}

/** Connection heartbeat: a halo when connected, a slow blink when offline. */
export function EngineStatus({ engine }: { engine: Engine }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const dot = engine === "LIVE" ? t.ok : engine === "MOCK" ? t.accent : t.alert;
  const online = engine === "LIVE" || engine === "MOCK";

  // Respects the OS reduce-motion switch.
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
  const label = tt(`engine.${engine}`);

  return (
    <View
      style={s.status}
      accessible
      accessibilityLabel={tt("engine.a11y", { state: label })}
      {...webLang(lang)}
      {...(Platform.OS === "web" ? ({ role: "status" } as any) : null)}
    >
      <View style={s.dotWrap}>
        {online && !reduced && (
          <Animated.View
            style={[s.halo, { backgroundColor: dot, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
        )}
        <Animated.View style={[s.dot, { backgroundColor: dot, opacity: dotOpacity }]} />
      </View>
      <Text style={[s.statusTxt, { color: t.dim }]}>{label.toUpperCase()}</Text>
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
  statusTxt: { fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
});
