/**
 * In-app navigation sidebar. Two variants:
 *   "drawer" (< 900px): a left sheet in a Modal with a scrim, opened from MenuButton.
 *   "docked" (>= 900px): a fixed 280px navigation column beside the tab screens.
 * Every row does something real: profile, navigation, language, screen colours,
 * read-aloud, and sign out (with an inline confirm; no Alert).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, Pressable, ScrollView, Switch, useWindowDimensions, type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useVoicePref } from "../lib/voice";
import Constants from "expo-constants";
import { router, usePathname } from "expo-router";
import { useTheme, useThemeControls } from "../lib/theme-context";
import { useApiBase } from "../lib/config";
import { hostOf } from "../lib/connection";
import { ConnectionSheet } from "./Connection";
import { THEMES, type Theme } from "../lib/themes";
import { useLang, useSession } from "../lib/session";
import { maskEmail, maskPhone, initials } from "../lib/phone";
import { focusElement, focusRing, radioKeys, spaceActivates, webCursor, isWeb, type PressState } from "../lib/ui";
import type { Key } from "../lib/i18n";
import { useMenu, type CloseOpts } from "./MenuContext";
import Segmented from "./Segmented";
import { ArrowGlyph, BarsGlyph, ChatGlyph, CheckCoin, CheckGlyph, ChevronGlyph, CrossGlyph, ExitGlyph, LeafGlyph, LensGlyph, MoonGlyph, PersonGlyph, PhoneGlyph, PlusGlyph, RouteGlyph, SignalOffGlyph, SpeakerGlyph, SproutGlyph, SunGlyph } from "./Glyphs";

type Variant = "drawer" | "docked";

export default function Sidebar({ variant }: { variant: Variant }) {
  return variant === "docked" ? <Docked /> : <Drawer />;
}

/* ───────────────────────── Docked (>= 900) ───────────────────────── */
function Docked() {
  const t = useTheme();
  return (
    <View
      role="navigation"
      style={{ width: 280, height: "100%", backgroundColor: t.panel, borderRightWidth: 1, borderRightColor: t.line }}
    >
      <SidebarBody variant="docked" open />
    </View>
  );
}

/* ───────────────────────── Drawer (< 900) ───────────────────────── */
function Drawer() {
  const t = useTheme();
  const { tt } = useT();
  const { open, closeMenu, drawerUnmounted } = useMenu();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const W = Math.min(Math.round(width * 0.86), 340);

  const [mounted, setMounted] = useState(open);
  const x = useSharedValue(-W);
  const o = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduce) {
        x.value = 0;
        o.value = withTiming(1, { duration: 120 });
      } else {
        x.value = -W;
        x.value = withSpring(0, { damping: 24, stiffness: 240, overshootClamping: true, reduceMotion: ReduceMotion.System });
        o.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System });
      }
    } else if (mounted) {
      // Keep the Modal mounted until the close animation ends.
      const unmount = (finished?: boolean) => {
        "worklet";
        if (finished) scheduleOnRN(setMounted, false);
      };
      if (reduce) {
        o.value = withTiming(0, { duration: 120 }, unmount);
      } else {
        o.value = withTiming(0, { duration: 180 });
        x.value = withTiming(-W, { duration: 180, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System }, unmount);
      }
    }
  }, [open]);

  // Once the Modal is gone, settle keyboard focus (see MenuContext).
  const wasMounted = useRef(mounted);
  useEffect(() => {
    if (wasMounted.current && !mounted) drawerUnmounted();
    wasMounted.current = mounted;
  }, [mounted]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: reduce ? o.value : 1,
  }));

  if (!mounted) return null;
  return (
    <Modal transparent animationType="none" statusBarTranslucent visible onRequestClose={() => closeMenu()}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }, scrimStyle]}>
          {/* Pointer-only: keyboard users have Esc and the Close button. A plain
              responder View (not a Pressable) is never focusable, so neither Tab
              nor the web Modal's focus trap can land on this screen-sized box. */}
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => closeMenu()}
            accessible={false}
            importantForAccessibility="no"
            {...(isWeb ? ({ "aria-hidden": true } as any) : null)}
            style={[{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }, webCursor]}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={tt("menu.a11y")}
          style={[{
            position: "absolute", left: 0, top: 0, bottom: 0, width: W,
            backgroundColor: t.panel, borderRightWidth: 1, borderRightColor: t.line,
            borderTopRightRadius: 20, borderBottomRightRadius: 20, overflow: "hidden",
            paddingTop: insets.top, paddingBottom: insets.bottom,
          }, panelStyle]}
        >
          <SidebarBody variant="drawer" open={open} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function useT() {
  const { t: tt, lang, setLang } = useLang();
  return { tt, lang, setLang };
}

/* ───────────────────────── Shared body ───────────────────────── */
function SidebarBody({ variant, open }: { variant: Variant; open: boolean }) {
  const t = useTheme();
  const { tt, lang, setLang } = useT();
  const { setThemeKey } = useThemeControls();
  const session = useSession();
  const { closeMenu } = useMenu();
  const pathname = usePathname();
  const drawer = variant === "drawer";
  const closeRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const tileRefs = useRef<(View | null)[]>([]);
  const [conn, setConn] = useState(false);
  const { base: apiBase } = useApiBase();

  useEffect(() => {
    if (!drawer) return;
    const id = setTimeout(() => focusElement(closeRef), 80);
    return () => clearTimeout(id);
  }, []);

  const closeIfDrawer = useCallback((opts?: CloseOpts) => { if (drawer) closeMenu(opts); }, [drawer, closeMenu]);

  // Read-aloud preference: one shared store with Apex Chat (lib/voice.ts).
  const [voice, toggleVoice] = useVoicePref();

  type Route = "/" | "/shamba" | "/masoko" | "/daktari" | "/chat" | "/autopilot";
  const isActive = (route: Route) =>
    route === "/" ? pathname === "/" || pathname === "/index" : pathname === route;
  const go = (route: Route) => {
    // Navigating to another screen: focus goes to that screen, not back to the
    // menu button of the screen being left (hidden under aria-hidden on web).
    const leaving = !isActive(route);
    router.navigate(route);
    closeIfDrawer({ focus: leaving ? "screen" : "opener" });
  };
  const toLogin = (edit: boolean) => {
    closeIfDrawer({ focus: "none" });
    router.push(edit ? "/login?mode=edit" : "/login");
  };

  const signedIn = session.status === "signedIn" && !!session.profile;

  return (
    <View style={{ flex: 1 }}>
      {/* 1. Head row */}
      <View style={[
        { height: 56, paddingLeft: 20, paddingRight: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        // Docked: the hairline lines up with the page headers beside it.
        !drawer && { borderBottomWidth: 1, borderBottomColor: t.line },
      ]}>
        {/* Logotype, not a heading. */}
        <Text
          accessibilityLanguage={lang}
          maxFontSizeMultiplier={1.4}
          style={{ color: t.ink, fontSize: 14, lineHeight: 18, fontWeight: "800", letterSpacing: 2 }}
        >
          KILIMO<Text style={{ color: t.accent }}>ORBIT</Text>
        </Text>
        {drawer && (
          <Pressable
            ref={closeRef}
            onPress={() => closeMenu()}
            accessibilityRole="button"
            accessibilityLabel={tt("menu.close")}
            style={({ pressed, hovered, focused }: PressState) => [
              { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
              (hovered || pressed) && { backgroundColor: t.raised },
              webCursor, focusRing(focused, t.accent),
            ]}
          >
            <CrossGlyph size={20} color={t.ink} />
          </Pressable>
        )}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        {/* 2. Profile card */}
        <View style={{ marginHorizontal: 12, marginTop: 4, padding: 16, borderRadius: 16, backgroundColor: t.raised, borderWidth: 1, borderColor: t.line }}>
          {signedIn ? (
            <ProfileBlock onEdit={() => toLogin(true)} docked={!drawer} />
          ) : (
            <GuestBlock onSignIn={() => toLogin(false)} />
          )}
        </View>

        {/* 3. Nenda */}
        <Eyebrow text={tt("eyebrow.nav")} />
        <NavRow label={tt("nav.today")} active={isActive("/")} drawer={drawer}
          glyph={(c) => <SunGlyph size={22} color={c} />} onPress={() => go("/")} />
        <NavRow label={tt("nav.farm")} active={isActive("/shamba")} drawer={drawer}
          glyph={(c) => <SproutGlyph size={24} color={c} />} onPress={() => go("/shamba")} />
        <NavRow label={tt("nav.markets")} active={isActive("/masoko")} drawer={drawer}
          glyph={(c) => <BarsGlyph size={22} color={c} />} onPress={() => go("/masoko")} />
        <NavRow label={tt("nav.doctor")} active={isActive("/daktari")} drawer={drawer}
          glyph={(c) => <LensGlyph size={22} color={c} />} onPress={() => go("/daktari")} />
        <NavRow label={tt("nav.chat")} active={isActive("/chat")} drawer={drawer}
          glyph={(c) => <ChatGlyph size={24} color={c} />} onPress={() => go("/chat")} />
        <NavRow label={tt("nav.autopilot")} active={isActive("/autopilot")} drawer={drawer}
          glyph={(c) => <RouteGlyph size={26} color={c} />} onPress={() => go("/autopilot")} />

        {/* 4. Mipangilio */}
        <Eyebrow text={tt("eyebrow.settings")} />
        <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "700", paddingHorizontal: 20, marginBottom: 8 }}>
          {tt("settings.lang")}
        </Text>
        <View style={{ marginHorizontal: 16 }}>
          <Segmented
            accessibilityLabel={tt("settings.lang")}
            options={[{ value: "sw", label: "Kiswahili" }, { value: "en", label: "English" }]}
            value={lang}
            onChange={setLang}
          />
        </View>

        <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "700", paddingHorizontal: 20, marginBottom: 8, marginTop: 16 }}>
          {tt("settings.theme")}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={tt("settings.theme")} style={{ flexDirection: "row", marginHorizontal: drawer ? 16 : 12, gap: drawer ? 8 : 6 }}>
          {THEMES.map((th, i) => (
            <ThemeTile key={th.key} theme={th} selected={t.key === th.key} onPress={() => setThemeKey(th.key)}
              hint={tt(`theme.${th.key}` as Key)} narrow={!drawer}
              pressRef={(el) => { tileRefs.current[i] = el; }}
              keys={radioKeys({
                index: i, count: THEMES.length, selected: t.key === th.key,
                onSelect: (n) => setThemeKey(THEMES[n].key),
                focusAt: (n) => focusElement({ current: tileRefs.current[n] }),
              })}
            />
          ))}
        </View>

        <Pressable
          onPress={() => toggleVoice(!voice)}
          {...spaceActivates(() => toggleVoice(!voice))}
          accessibilityRole="switch"
          accessibilityLabel={tt("settings.voice")}
          accessibilityState={{ checked: voice }}
          aria-checked={voice}
          style={({ pressed, hovered, focused }: PressState) => [
            { marginTop: 12, minHeight: 56, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
            hovered && { backgroundColor: drawer ? t.raised : t.bg },
            pressed && { opacity: 0.7 },
            webCursor, focusRing(focused, t.accent),
          ]}
        >
          <SpeakerGlyph size={22} color={t.ink} />
          <Text style={{ flex: 1, color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" }}>{tt("settings.voice")}</Text>
          <SwitchVisual value={voice} />
        </Pressable>

        <Pressable
          onPress={() => setConn(true)}
          accessibilityRole="button"
          accessibilityLabel={`${tt("settings.server")}: ${hostOf(apiBase)}`}
          testID="settings-server"
          style={({ pressed, hovered, focused }: PressState) => [
            { minHeight: 56, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
            hovered && { backgroundColor: drawer ? t.raised : t.bg },
            pressed && { opacity: 0.7 },
            webCursor, focusRing(focused, t.accent),
          ]}
        >
          <SignalOffGlyph size={22} color={t.ink} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" }}>{tt("settings.server")}</Text>
            <Text numberOfLines={1} style={{ color: t.dim, fontSize: 12, lineHeight: 16, fontFamily: "monospace" }}>{hostOf(apiBase)}</Text>
          </View>
          <ChevronGlyph size={12} color={t.dim} dir="right" />
        </Pressable>
        <ConnectionSheet visible={conn} onClose={() => setConn(false)} />

        {/* 6. Footer: its own line at the end of the scrolling body, for
            everyone. It never shares the sign-out row, and the pinned block
            gains no height. */}
        <VersionLine style={{ paddingHorizontal: 20, paddingVertical: 14 }} />
      </ScrollView>

      {/* 5. Sign out: pinned below the scrolling body in both variants. */}
      {signedIn && <SignOutBlock variant={variant} open={open} />}
    </View>
  );
}

/**
 * The voice row itself is the one accessible switch. The toggle drawn at its
 * right is purely visual: on native an RN Switch hidden from accessibility and
 * touches; on web a View track (RNW's Switch always adds a focusable input).
 */
function SwitchVisual({ value }: { value: boolean }) {
  const t = useTheme();
  if (!isWeb) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ pointerEvents: "none" }}>
        <Switch value={value} trackColor={{ true: t.accent, false: t.dim }} thumbColor={t.field} />
      </View>
    );
  }
  return (
    <View
      aria-hidden
      style={{
        pointerEvents: "none", width: 44, height: 26, borderRadius: 13, padding: 3,
        backgroundColor: value ? t.accent : t.dim, alignItems: value ? "flex-end" : "flex-start", justifyContent: "center",
      }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.field }} />
    </View>
  );
}

function VersionLine({ style }: { style?: object }) {
  const t = useTheme();
  const { tt } = useT();
  return (
    <View style={style}>
      <Text style={{ color: t.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace" }}>
        {tt("footer", { version: Constants.expoConfig?.version ?? "1.0.0" })}
      </Text>
    </View>
  );
}

function Eyebrow({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      aria-level={2}
      style={{
        color: t.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace", fontWeight: "700",
        letterSpacing: 2, paddingHorizontal: 20, marginTop: 20, marginBottom: 4,
      }}
    >
      {text}
    </Text>
  );
}

function ProfileBlock({ onEdit, docked }: { onEdit: () => void; docked?: boolean }) {
  const t = useTheme();
  const { tt } = useT();
  const p = useSession().profile!;
  const sub = p.phone ? maskPhone(p.phone) : p.email ? maskEmail(p.email) : "";
  const legacy = p.method === "email" && !p.phone;
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        {/* Docked column is 280 wide: a 48 avatar and a 17/22 name keep an
            ordinary two-word name on one line. */}
        <View style={{ width: docked ? 48 : 56, height: docked ? 48 : 56, borderRadius: 28, backgroundColor: t.panel, borderWidth: 2, borderColor: t.accent, alignItems: "center", justifyContent: "center" }}>
          <Text maxFontSizeMultiplier={1.2} style={{ color: t.accent, fontSize: docked ? 19 : 22, fontWeight: "800" }}>{initials(p.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: t.ink, fontSize: docked ? 17 : 20, lineHeight: docked ? 22 : 26, fontWeight: "800" }}>{p.name}</Text>
          {!!sub && <Text style={{ color: t.dim, fontSize: 15, lineHeight: 20, fontFamily: "monospace" }}>{sub}</Text>}
        </View>
      </View>
      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {p.serverAck ? (
          <Chip glyph={<PhoneGlyph size={16} color={t.ink} />} text={tt("chip.saved")} />
        ) : (
          <Chip glyph={<SignalOffGlyph size={14} color={t.ink} />} text={tt("chip.localOnly")} />
        )}
        {legacy && <Chip glyph={<PlusGlyph size={14} color={t.ink} />} text={tt("chip.addPhone")} onPress={onEdit} />}
      </View>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={tt("profile.edit")}
        style={({ pressed, hovered, focused }: PressState) => [
          // marginBottom -12 balances the card: the 48px touch box stays, but the
          // label sits about 16px from the bottom edge, like the avatar from the top.
          { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 4, marginBottom: -12, paddingRight: 8, borderRadius: 8 },
          (hovered || pressed) && { opacity: 0.75 },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <Text style={{ color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "700" }}>{tt("profile.edit")}</Text>
        <ChevronGlyph size={12} color={t.ink} dir="right" />
      </Pressable>
    </View>
  );
}

function Chip({ glyph, text, onPress }: { glyph: React.ReactNode; text: string; onPress?: () => void }) {
  const t = useTheme();
  const body = (
    <>
      {glyph}
      <Text style={{ color: t.ink, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{text}</Text>
    </>
  );
  const base = {
    minHeight: 32, borderRadius: 999, paddingHorizontal: 10, borderWidth: 1.5, borderColor: t.dim,
    flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
  };
  if (!onPress) return <View style={base}>{body}</View>;
  // Pressable chips keep a 48px touch box around the 32px visual chip.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={({ pressed, hovered, focused }: PressState) => [
        { minHeight: 48, justifyContent: "center", borderRadius: 999 },
        (hovered || pressed) && { opacity: 0.8 },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <View style={base}>{body}</View>
    </Pressable>
  );
}

function GuestBlock({ onSignIn }: { onSignIn: () => void }) {
  const t = useTheme();
  const { tt } = useT();
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: t.dim, alignItems: "center", justifyContent: "center" }}>
          <PersonGlyph size={26} color={t.dim} />
        </View>
        <Text style={{ flex: 1, color: t.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" }}>{tt("guest.title")}</Text>
      </View>
      <Text style={{ color: t.dim, fontSize: 15, lineHeight: 22, fontWeight: "500", marginTop: 10 }}>{tt("guest.body")}</Text>
      <Pressable
        onPress={onSignIn}
        accessibilityRole="button"
        accessibilityLabel={tt("guest.cta")}
        style={({ pressed, hovered, focused }: PressState) => [
          {
            minHeight: 52, borderRadius: 14, backgroundColor: t.accent, marginTop: 12,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
          },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <Text maxFontSizeMultiplier={1.4} style={{ color: t.field, fontSize: 17, lineHeight: 22, fontWeight: "800" }}>{tt("guest.cta")}</Text>
        <ArrowGlyph size={18} color={t.field} />
      </Pressable>
    </View>
  );
}

function NavRow({
  label, active, glyph, onPress, drawer,
}: { label: string; active: boolean; glyph: (color: string) => React.ReactNode; onPress: () => void; drawer: boolean }) {
  const t = useTheme();
  const activeBg = drawer ? t.bg : t.raised;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      aria-current={active ? "page" : undefined}
      style={({ pressed, hovered, focused }: PressState) => [
        {
          minHeight: 56, marginHorizontal: 8, borderRadius: 12, paddingHorizontal: 12,
          flexDirection: "row", alignItems: "center", gap: 14,
          backgroundColor: active || hovered ? activeBg : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      {active && (
        <View style={{ position: "absolute", left: 0, top: "50%", marginTop: -16, width: 4, height: 32, borderRadius: 2, backgroundColor: t.accent }} />
      )}
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        {glyph(active ? t.accent : t.ink)}
      </View>
      <Text style={{ flex: 1, color: t.ink, fontSize: 17, lineHeight: 22, fontWeight: active ? "800" : "700" }}>{label}</Text>
    </Pressable>
  );
}

function ThemeTile({
  theme, selected, onPress, hint, narrow, pressRef, keys,
}: {
  theme: Theme; selected: boolean; onPress: () => void; hint: string; narrow?: boolean;
  pressRef?: (el: View | null) => void; keys?: Record<string, unknown>;
}) {
  const t = useTheme();
  const s = useSharedValue(selected ? 1 : 0.6);
  useEffect(() => {
    s.value = selected ? withSpring(1, { damping: 14, stiffness: 260, reduceMotion: ReduceMotion.System }) : 0.6;
  }, [selected]);
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const glyph =
    theme.key === "nyota" ? <MoonGlyph size={22} color={theme.accent} cutout={theme.bg} /> :
    theme.key === "savanna" ? <SunGlyph size={22} color={theme.accent} /> :
    <LeafGlyph size={22} color={theme.accent} />;
  return (
    <Pressable
      ref={pressRef}
      onPress={onPress}
      {...keys}
      accessibilityRole="radio"
      accessibilityLabel={`${hint}, ${theme.name}`}
      accessibilityState={{ checked: selected, selected }}
      aria-checked={selected}
      style={({ pressed, focused }: PressState) => [
        {
          flex: 1, minHeight: 96, borderRadius: 14, padding: (narrow ? 8 : 10) - (selected ? 1 : 0), gap: 4,
          // Room for the theme name pinned to the bottom edge.
          ...(narrow ? null : { paddingBottom: 20 - (selected ? 1 : 0) }),
          backgroundColor: theme.bg, borderWidth: selected ? 3 : 2, borderColor: selected ? t.accent : theme.line,
          opacity: pressed ? 0.85 : 1,
        },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      {glyph}
      {/* A fixed two-line block: "Bora juani" wraps on a 360px phone, and the
          theme names must still share one baseline across the three tiles. */}
      <Text numberOfLines={2} style={{ color: theme.ink, fontSize: narrow ? 13 : 14, lineHeight: 18, minHeight: 36, fontWeight: "800" }}>{hint}</Text>
      {/* Docked tiles are ~80px wide: the monospace theme name (still in the
          label) is left out there to keep the column short. */}
      {!narrow && (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute", left: 10 - (selected ? 1 : 0), right: 6, bottom: 6 - (selected ? 1 : 0),
            color: theme.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace",
          }}
        >
          {theme.name}
        </Text>
      )}
      {selected && (
        <Animated.View style={[{ position: "absolute", top: 6, right: 6 }, coinStyle]}>
          <CheckCoin size={20} bg={t.accent} fg={t.field} />
        </Animated.View>
      )}
    </Pressable>
  );
}

function SignOutBlock({ variant, open }: { variant: Variant; open: boolean }) {
  const t = useTheme();
  const { tt } = useT();
  const session = useSession();
  const { closeMenu } = useMenu();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [forget, setForget] = useState(false);
  const [contentH, setContentH] = useState(0);
  const busy = useRef(false);

  // The confirm resets whenever the drawer closes.
  useEffect(() => { if (!open) { setExpanded(false); setForget(false); } }, [open]);

  // The confirm controls are mounted only while expanded (and during the
  // collapse animation), so collapsed they are never in the tab order.
  const [mounted, setMounted] = useState(false);
  const h = useSharedValue(0);
  useEffect(() => {
    if (expanded) setMounted(true);
    const target = expanded ? contentH : 0;
    if (reduce) {
      h.value = target;
      if (!expanded) setMounted(false);
      return;
    }
    const done = (finished?: boolean) => {
      "worklet";
      if (finished && !expanded) scheduleOnRN(setMounted, false);
    };
    h.value = withTiming(target, { duration: 220, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }, done);
  }, [expanded, contentH, reduce]);
  const hStyle = useAnimatedStyle(() => ({ height: h.value }));

  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    if (variant === "drawer") closeMenu();
    await session.signOut({ forget });
    router.replace("/login");
  };

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: t.line }}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={tt("signout.row")}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        style={({ pressed, hovered, focused }: PressState) => [
          { minHeight: 56, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
          hovered && { backgroundColor: t.raised },
          pressed && { opacity: 0.7 },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <ExitGlyph size={22} color={t.ink} />
        <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 17, lineHeight: 22, fontWeight: "700" }}>{tt("signout.row")}</Text>
      </Pressable>
      <Animated.View style={[{ overflow: "hidden" }, hStyle]}>
        {mounted && <View
          onLayout={(e: LayoutChangeEvent) => setContentH(Math.ceil(e.nativeEvent.layout.height))}
          style={{ position: "absolute", left: 0, right: 0, top: 0, padding: 16, paddingTop: 4, gap: 10 }}
        >
          {(
            <>
              <Text accessibilityRole="header" aria-level={2} style={{ color: t.ink, fontSize: 17, lineHeight: 22, fontWeight: "800" }}>{tt("signout.title")}</Text>
              <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>{tt("signout.body")}</Text>
              <Pressable
                onPress={() => setForget((f) => !f)}
                {...spaceActivates(() => setForget((f) => !f))}
                accessibilityRole="checkbox"
                accessibilityLabel={tt("signout.forget")}
                accessibilityState={{ checked: forget }}
                aria-checked={forget}
                style={({ focused }: PressState) => [
                  { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8 },
                  webCursor, focusRing(focused, t.accent),
                ]}
              >
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: forget ? t.accent : t.dim, backgroundColor: forget ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {forget && <CheckGlyph size={14} color={t.field} />}
                </View>
                <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "500" }}>{tt("signout.forget")}</Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => { setExpanded(false); setForget(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={tt("signout.stay")}
                  style={({ pressed, hovered, focused }: PressState) => [
                    { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 2, borderColor: t.dim, alignItems: "center", justifyContent: "center" },
                    (hovered || pressed) && { backgroundColor: t.raised },
                    webCursor, focusRing(focused, t.accent),
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.4} style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>{tt("signout.stay")}</Text>
                </Pressable>
                <Pressable
                  onPress={confirm}
                  accessibilityRole="button"
                  accessibilityLabel={tt("signout.confirm")}
                  style={({ pressed, hovered, focused }: PressState) => [
                    { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: t.alert, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : hovered ? 0.92 : 1 },
                    webCursor, focusRing(focused, t.accent),
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.4} style={{ color: t.field, fontSize: 16, fontWeight: "800" }}>{tt("signout.confirm")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>}
      </Animated.View>
    </View>
  );
}
