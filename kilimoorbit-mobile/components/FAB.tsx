/**
 * Apex §4.1 floating action button → quick-action sheet. The button breathes
 * like the connection heartbeat in the header (two halos rising off it in
 * turn), so a farmer new to the app sees that it is the way in; it is still
 * while the sheet is open and under the system's reduce-motion setting. The
 * button itself keeps its box (only the halos move), so a tap, a screen
 * reader or an automated test always finds it where it is.
 * Each action carries a picture (assets/icons) next to its label.
 */
import React, { useEffect, useState } from "react";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, webCursor, type PressState } from "../lib/ui";
import { PlusGlyph } from "./Glyphs";
import { Sheet } from "./Kit";
import Pic, { type PicName } from "./Pic";

export type FabAction = { label: string; glyph?: (color: string) => React.ReactNode; pic?: PicName; onPress: () => void; testID?: string };

export default function FAB({ actions }: { actions: FabAction[] }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  // Breathing: two halos rise off the button in turn.
  const halo1 = useSharedValue(0);
  const halo2 = useSharedValue(0);
  const live = !reduce && !open;
  useEffect(() => {
    if (!live) {
      cancelAnimation(halo1); cancelAnimation(halo2);
      halo1.value = 0; halo2.value = 0;
      return;
    }
    const rise = withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) })), -1, false);
    halo1.value = rise;
    halo2.value = withDelay(1300, rise);
    return () => { cancelAnimation(halo1); cancelAnimation(halo2); };
  }, [live]);
  const ring1 = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - halo1.value), transform: [{ scale: 1 + halo1.value * 1.1 }] }));
  const ring2 = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - halo2.value), transform: [{ scale: 1 + halo2.value * 1.1 }] }));

  return (
    <>
      <View style={s.wrap}>
        <Animated.View style={[s.halo, { backgroundColor: t.accent }, ring1]} />
        <Animated.View style={[s.halo, { backgroundColor: t.accent }, ring2]} />
        <View>
          <Pressable
            testID="fab"
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={tt("fab.open")}
            style={({ pressed, hovered, focused }: PressState) => [
              s.fab,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : hovered ? 0.92 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
              webCursor, focusRing(focused, t.ink),
            ]}
          >
            <PlusGlyph size={24} color={t.field} />
          </Pressable>
        </View>
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={tt("fab.open")}>
        <View style={{ gap: 4 }}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              testID={a.testID}
              onPress={() => { setOpen(false); a.onPress(); }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed, hovered, focused }: PressState) => [
                s.action,
                (hovered || pressed) && { backgroundColor: t.raised },
                webCursor, focusRing(focused, t.accent),
              ]}
            >
              <View style={[s.coin, { backgroundColor: t.raised, borderColor: t.line }]}>
                {a.pic ? <Pic name={a.pic} size={30} /> : a.glyph?.(t.accent)}
              </View>
              <Text style={{ flex: 1, color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}
const s = StyleSheet.create({
  wrap: { position: "absolute", right: 20, bottom: 24, width: 58, height: 58, alignItems: "center", justifyContent: "center", pointerEvents: "box-none" },
  halo: { position: "absolute", width: 58, height: 58, borderRadius: 29, pointerEvents: "none" },
  fab: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: "center", justifyContent: "center", elevation: 6,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.3)",
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 4px 14px rgba(0,0,0,0.35)" } as object)
      : { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  action: { minHeight: 60, borderRadius: 14, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: -8 },
  coin: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
