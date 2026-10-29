/**
 * In-app navigation sidebar. Two variants:
 *   "drawer" (< 900px): a left sheet in a Modal with a scrim, opened from MenuButton.
 *   "docked" (>= 900px): a fixed 280px navigation column beside the tab screens.
 * Every row does something real: profile, navigation, language, screen colours,
 * read-aloud, and sign out (with an inline confirm; no Alert).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image,
  Modal, View, Pressable, ScrollView, Switch, useWindowDimensions, type LayoutChangeEvent, type ViewStyle,
} from "react-native";
import Text from "./Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing, ReduceMotion, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { DISPLAY, ITALIC } from "../lib/typography";
import { scheduleOnRN } from "react-native-worklets";
import { useVoicePref } from "../lib/voice";
import Constants from "expo-constants";
import { router, usePathname } from "expo-router";
import { useTheme, useThemeControls } from "../lib/theme-context";
import { useApiBase } from "../lib/config";
import { hostOf } from "../lib/connection";
import { getFontStatus } from "../lib/typography";
import Icon from "./Icon";
import { ConnectionSheet } from "./Connection";
import { THEMES, type Theme } from "../lib/themes";
import { useLang, useSession } from "../lib/session";
import { maskEmail, maskPhone, initials } from "../lib/phone";
import { focusElement, focusRing, focusRingInset, noOutline, radioKeys, spaceActivates, webCursor, isWeb, type PressState } from "../lib/ui";
import type { Key } from "../lib/i18n";
import { useMenu, type CloseOpts } from "./MenuContext";
import { B, R, S, Sheet, T, tint } from "./Kit";
import { PHOTOS, PHOTO_KEYS } from "../lib/photos";
import { openLink } from "../lib/news";
import Segmented from "./Segmented";
import { Logotype } from "./auth/Controls";
import { ArrowGlyph, BarsGlyph, ChatGlyph, CheckCoin, CheckGlyph, ChevronGlyph, CrossGlyph, ExitGlyph, LeafGlyph, LensGlyph, MoonGlyph, PersonGlyph, PhoneGlyph, PlusGlyph, SignalOffGlyph, SpeakerGlyph, SunGlyph } from "./Glyphs";

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
      style={{ width: 280, height: "100%", backgroundColor: t.rail, borderRightWidth: B.line, borderRightColor: t.line }}
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
            backgroundColor: t.rail, borderRightWidth: B.line, borderRightColor: t.line,
            borderTopRightRadius: R.sheet, borderBottomRightRadius: R.sheet, overflow: "hidden",
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
  const [credits, setCredits] = useState(false);
  const { base: apiBase } = useApiBase();
  const appVersion = Constants.expoConfig?.version ?? "?";
  const fontsOk = getFontStatus() === "ready";

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
        !drawer && { borderBottomWidth: B.line, borderBottomColor: t.line },
      ]}>
        {/* Logotype, not a heading. */}
        <View accessible accessibilityLabel="KilimoOrbit" accessibilityLanguage={lang}>
          <Logotype size={18} />
        </View>
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

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: S.md }}>
        {/* 2. Profile card: the one raised surface on the rail. Signed in, the
            whole card is the way to edit the profile. */}
        {signedIn ? (
          <ProfileBlock onEdit={() => toLogin(true)} docked={!drawer} />
        ) : (
          <View style={[cardSurface(t), { marginHorizontal: S.md, padding: S.lg }]}>
            <GuestBlock onSignIn={() => toLogin(false)} />
          </View>
        )}

        {/* 3. Nenda */}
        <Eyebrow text={tt("eyebrow.nav")} />
        <NavRow label={tt("nav.today")} active={isActive("/")} drawer={drawer}
          glyph={(c) => <Icon name="white-balance-sunny" size={24} color={c} />} onPress={() => go("/")} />
        <NavRow label={tt("nav.farm")} active={isActive("/shamba")} drawer={drawer}
          glyph={(c) => <Icon name="barn" size={24} color={c} />} onPress={() => go("/shamba")} />
        <NavRow label={tt("nav.markets")} active={isActive("/masoko")} drawer={drawer}
          glyph={(c) => <Icon name="storefront-outline" size={24} color={c} />} onPress={() => go("/masoko")} />
        <NavRow label={tt("nav.doctor")} active={isActive("/daktari")} drawer={drawer}
          glyph={(c) => <Icon name="stethoscope" size={24} color={c} />} onPress={() => go("/daktari")} />
        <NavRow label={tt("nav.chat")} active={isActive("/chat")} drawer={drawer}
          glyph={(c) => <Icon name="chat-processing-outline" size={24} color={c} />} onPress={() => go("/chat")} />
        <NavRow label={tt("nav.autopilot")} active={isActive("/autopilot")} drawer={drawer}
          glyph={(c) => <Icon name="robot-outline" size={24} color={c} />} onPress={() => go("/autopilot")} />

        {/* 4. Mipangilio */}
        <Eyebrow text={tt("eyebrow.settings")} />
        <SubLabel text={tt("settings.lang")} />
        <View style={{ marginHorizontal: S.md }}>
          <Segmented
            accessibilityLabel={tt("settings.lang")}
            options={[{ value: "sw", label: "Kiswahili" }, { value: "en", label: "English" }]}
            value={lang}
            onChange={setLang}
          />
        </View>

        <SubLabel text={tt("settings.theme")} top={S.xl} />
        <View accessibilityRole="radiogroup" accessibilityLabel={tt("settings.theme")} style={{ flexDirection: "row", marginHorizontal: S.md, gap: drawer ? S.sm : 6 }}>
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

        {/* The working settings share one card; each row lights up under the
            pointer and gives under the finger. */}
        <View style={[cardSurface(t), { marginHorizontal: S.md, marginTop: S.xl, overflow: "hidden" }]}>
          <SettingRow
            onPress={() => toggleVoice(!voice)}
            keys={spaceActivates(() => toggleVoice(!voice))}
            role="switch"
            label={tt("settings.voice")}
            checked={voice}
            glyph={(c) => <SpeakerGlyph size={20} color={c} />}
            title={tt("settings.voice")}
            trailing={<SwitchVisual value={voice} />}
          />
          <RowRule />
          <SettingRow
            onPress={() => setConn(true)}
            label={`${tt("settings.server")}: ${hostOf(apiBase)}`}
            testID="settings-server"
            glyph={(c) => <SignalOffGlyph size={20} color={c} />}
            title={tt("settings.server")}
            sub={hostOf(apiBase)}
            chevron
          />
          <RowRule />
          <SettingRow
            onPress={() => setCredits(true)}
            label={tt("credits.title")}
            testID="settings-credits"
            glyph={(c) => <Icon name="camera-outline" size={20} color={c} />}
            title={tt("credits.title")}
            chevron
          />
          <RowRule />
          {/* What is running: the app version and whether the bundled fonts loaded, so an old bundle or a font that failed is visible at a glance. */}
          <View accessible accessibilityLabel={`${tt("settings.app")}: ${appVersion}, ${tt(fontsOk ? "settings.fontsOk" : "settings.fontsFail")}`} testID="settings-app" style={{ minHeight: 56, paddingHorizontal: S.md, paddingVertical: S.sm, flexDirection: "row", alignItems: "center", gap: S.md }}>
            <IconWell><LeafGlyph size={20} color={t.dim} /></IconWell>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }}>{tt("settings.app")}</Text>
              <Text numberOfLines={1} style={{ color: fontsOk ? t.dim : t.alert, fontSize: 13, lineHeight: 18, fontWeight: "600", fontVariant: ["tabular-nums"] }}>v{appVersion} · {tt(fontsOk ? "settings.fontsOk" : "settings.fontsFail")}</Text>
            </View>
          </View>
        </View>
        <ConnectionSheet visible={conn} onClose={() => setConn(false)} />
        <Sheet visible={credits} onClose={() => setCredits(false)} title={tt("credits.title")} testID="sheet-credits">
          <Text style={{ color: t.dim, fontSize: 15, lineHeight: 21 }}>{tt("credits.body")}</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {PHOTO_KEYS.map((k) => {
              const p = PHOTOS[k];
              return (
                <Pressable key={k} onPress={() => openLink(p.source)} accessibilityRole="link"
                  style={({ focused, hovered }: PressState) => [{ flexDirection: "row", gap: 12, alignItems: "center", padding: 8, borderRadius: R.md, borderWidth: B.line, borderColor: t.line, backgroundColor: hovered ? t.raised : t.panel }, webCursor, focusRing(focused, t.accent)]}>
                  <Image source={p.src} style={{ width: 64, height: 44, borderRadius: 8 }} accessible={false} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ color: t.ink, fontSize: 14, lineHeight: 19, fontWeight: "700" }}>{lang === "sw" ? p.alt.sw : p.alt.en}</Text>
                    <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{p.credit} · {p.license}</Text>
                  </View>
                  <Icon name="open-in-new" size={16} color={t.accent} />
                </Pressable>
              );
            })}
          </View>
        </Sheet>

        {/* The KilimoOrbit motto. */}
        {/* Set like the almanac's epigraph: a short maize-gold rule, the label,
            then the line in the display italic. No box: the rail is the page. */}
        <View style={{ marginHorizontal: S.xxl, marginTop: S.x3, gap: S.sm }} testID="sidebar-motto">
          <View style={{ width: S.x3, height: 2, borderRadius: 1, backgroundColor: GOLD }} />
          <Text style={{ color: t.dim, ...T.label }}>{tt("motto.label")}</Text>
          <Text style={{ color: t.ink, fontFamily: ITALIC, fontSize: 18, lineHeight: 26 }}>{tt("motto")}</Text>
        </View>

        {/* 6. Footer: its own line at the end of the scrolling body, for
            everyone. It never shares the sign-out row, and the pinned block
            gains no height. */}
        <VersionLine style={{ paddingHorizontal: S.xxl, paddingTop: S.xxl, paddingBottom: S.xl }} />
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
export function SwitchVisual({ value }: { value: boolean }) {
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
      <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] }}>
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
        color: t.dim, ...T.label, letterSpacing: 1.8, paddingHorizontal: S.xxl, marginTop: S.x3, marginBottom: S.sm,
      }}
    >
      {text}
    </Text>
  );
}

/** A setting's own name above its control: quieter than the eyebrow, never uppercase. */
function SubLabel({ text, top = 0 }: { text: string; top?: number }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.dim, ...T.meta, fontWeight: "600", paddingHorizontal: S.xxl, marginTop: top, marginBottom: S.sm }}>
      {text}
    </Text>
  );
}

/** Maize gold: the almanac's rule colour (DESIGN.md), decorative only. */
const GOLD = "#E9B44C";

/** The one raised surface on the rail: panel, warm hairline, the soft two-layer shadow. */
const cardSurface = (t: Theme): ViewStyle => ({
  backgroundColor: t.panel, borderRadius: R.card, borderWidth: B.line, borderColor: t.line,
  ...(t.key === "savanna"
    ? ({ boxShadow: "0 1px 2px rgba(20, 32, 27, 0.04), 0 8px 24px -8px rgba(20, 32, 27, 0.08)" } as ViewStyle)
    : { borderTopColor: tint(t.ink, 0.14) }),
});

/**
 * Hover and press as motion, not just a colour swap: `h` eases toward 1 while a
 * pointer is over the row (web), `p` while a finger is down. Rows read both
 * to fade in their wash, lift their icon well and give a little under the
 * finger. Reduced motion keeps the wash and drops the movement.
 */
function useLift() {
  const reduce = useReducedMotion();
  const h = useSharedValue(0);
  const p = useSharedValue(0);
  const handlers = {
    onHoverIn: () => { h.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }); },
    onHoverOut: () => { h.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }); },
    onPressIn: () => { p.value = withTiming(1, { duration: 90 }); },
    onPressOut: () => { p.value = withSpring(0, { damping: 16, stiffness: 320, reduceMotion: ReduceMotion.System }); },
  };
  return { h, p, handlers, reduce };
}

/** A 36px rounded well that holds a row's icon; the active row fills it with the accent. */
function IconWell({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Animated.View style={[{ width: 36, height: 36, borderRadius: R.md - 2, alignItems: "center", justifyContent: "center" }, style]}>
      {children}
    </Animated.View>
  );
}

function RowRule() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.line, marginLeft: S.md + 36 + S.md }} />;
}

function SettingRow({
  onPress, keys, role = "button", label, checked, glyph, title, sub, trailing, chevron, testID,
}: {
  onPress: () => void; keys?: Record<string, unknown>; role?: "button" | "switch"; label: string; checked?: boolean;
  glyph: (color: string) => React.ReactNode; title: string; sub?: string; trailing?: React.ReactNode; chevron?: boolean; testID?: string;
}) {
  const t = useTheme();
  const { h, p, handlers, reduce } = useLift();
  // Colours are worked out here, on the JS thread: the worklets below only interpolate strings.
  const wellFrom = tint(t.ink, 0.05);
  const wellTo = tint(t.accent, 0.14);
  const wash = useAnimatedStyle(() => ({ opacity: Math.max(h.value, p.value) }));
  const well = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(h.value, [0, 1], [wellFrom, wellTo]),
    transform: [{ scale: reduce ? 1 : 1 - 0.06 * p.value }],
  }));
  const nudge = useAnimatedStyle(() => ({ transform: [{ translateX: reduce ? 0 : 3 * h.value }] }));
  const sw = role === "switch";
  return (
    <Pressable
      onPress={onPress}
      {...handlers}
      {...keys}
      accessibilityRole={role}
      accessibilityLabel={label}
      {...(sw ? { accessibilityState: { checked }, "aria-checked": checked } : null)}
      testID={testID}
      style={({ focused }: PressState) => [
        { minHeight: 56, paddingHorizontal: S.md, paddingVertical: S.sm, flexDirection: "row", alignItems: "center", gap: S.md },
        webCursor, focusRingInset(focused, t.accent),
      ]}
    >
      <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: tint(t.ink, 0.04) }, wash]} />
      <IconWell style={well}>{glyph(t.accent)}</IconWell>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }}>{title}</Text>
        {!!sub && <Text numberOfLines={1} style={{ color: t.dim, fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] }}>{sub}</Text>}
      </View>
      {trailing}
      {chevron && <Animated.View style={nudge}><ChevronGlyph size={12} color={t.dim} dir="right" /></Animated.View>}
    </Pressable>
  );
}

function ProfileBlock({ onEdit, docked }: { onEdit: () => void; docked?: boolean }) {
  const t = useTheme();
  const { tt } = useT();
  const p = useSession().profile!;
  const sub = p.phone ? maskPhone(p.phone) : p.email ? maskEmail(p.email) : "";
  const legacy = p.method === "email" && !p.phone;
  const { h, p: down, handlers, reduce } = useLift();
  const lineFrom = t.line;
  const lineTo = tint(t.accent, 0.55);
  const lift = useAnimatedStyle(() => ({
    borderColor: interpolateColor(h.value, [0, 1], [lineFrom, lineTo]),
    transform: [{ translateY: reduce ? 0 : -2 * h.value }, { scale: reduce ? 1 : 1 - 0.015 * down.value }],
  }));
  const nudge = useAnimatedStyle(() => ({ transform: [{ translateX: reduce ? 0 : 3 * h.value }] }));
  // Docked column is 280 wide: a 44 avatar and an 18/24 name keep an
  // ordinary two-word name on one line.
  const av = docked ? 44 : 52;
  const status = p.serverAck ? tt("chip.saved") : tt("chip.localOnly");
  return (
    // The whole card edits the profile: one target instead of a small "Edit"
    // link and a chip doing the same thing. The visible "Edit" starts the name.
    <Pressable
      onPress={onEdit}
      {...handlers}
      accessibilityRole="button"
      accessibilityLabel={`${tt("profile.edit")}: ${p.name}${sub ? `, ${sub}` : ""}. ${status}${legacy ? `. ${tt("chip.addPhone")}` : ""}`}
      style={[{ marginHorizontal: S.md, borderRadius: R.card }, webCursor, noOutline]}
    >
      {({ focused }: PressState) => (
      // The ring is drawn on the card itself, so it rises with the card on hover.
      <Animated.View style={[cardSurface(t), { padding: S.lg, gap: S.md }, lift, focusRing(focused, t.accent)]}>
        <View style={{ flexDirection: "row", gap: S.md, alignItems: "center" }}>
          {/* The avatar repeats the logotype: a forest coin, a gold seed on its rim. */}
          <View style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={1.2} style={{ color: t.field, fontFamily: DISPLAY["600"], fontSize: docked ? 17 : 20, lineHeight: docked ? 22 : 26 }}>{initials(p.name)}</Text>
            <View style={{ position: "absolute", top: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent === GOLD ? t.ok : GOLD, borderWidth: 2, borderColor: t.panel }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: t.ink, fontFamily: DISPLAY["600"], fontSize: docked ? 18 : 20, lineHeight: docked ? 24 : 26, letterSpacing: -0.2 }}>{p.name}</Text>
            {!!sub && <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"], letterSpacing: 0.3 }}>{sub}</Text>}
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, alignItems: "center" }}>
          {p.serverAck ? (
            <Chip glyph={<PhoneGlyph size={14} color={t.ok} />} text={tt("chip.saved")} tone={t.ok} />
          ) : (
            <Chip glyph={<SignalOffGlyph size={14} color={t.dim} />} text={tt("chip.localOnly")} tone={t.dim} />
          )}
          {legacy && <Chip glyph={<PlusGlyph size={14} color={t.accent} />} text={tt("chip.addPhone")} tone={t.accent} />}
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs }}>
            <Text style={{ color: t.accent, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{tt("profile.edit")}</Text>
            <Animated.View style={nudge}><ChevronGlyph size={11} color={t.accent} dir="right" /></Animated.View>
          </View>
        </View>
      </Animated.View>
      )}
    </Pressable>
  );
}

/** A status word with its icon, tinted by its meaning (the word carries it too). */
function Chip({ glyph, text, tone }: { glyph: React.ReactNode; text: string; tone: string }) {
  const t = useTheme();
  return (
    <View style={{
      minHeight: 28, borderRadius: R.pill, paddingHorizontal: 10, backgroundColor: tint(tone, 0.1),
      flexDirection: "row", alignItems: "center", gap: 6,
    }}>
      {glyph}
      <Text style={{ color: t.ink, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

function GuestBlock({ onSignIn }: { onSignIn: () => void }) {
  const t = useTheme();
  const { tt } = useT();
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tint(t.ink, 0.06), alignItems: "center", justifyContent: "center" }}>
          <PersonGlyph size={24} color={t.dim} />
        </View>
        <Text style={{ flex: 1, color: t.ink, ...T.headline }}>{tt("guest.title")}</Text>
      </View>
      <Text style={{ color: t.dim, fontSize: 15, lineHeight: 22, marginTop: S.md }}>{tt("guest.body")}</Text>
      <Pressable
        onPress={onSignIn}
        accessibilityRole="button"
        accessibilityLabel={tt("guest.cta")}
        style={({ pressed, hovered, focused }: PressState) => [
          {
            minHeight: 52, borderRadius: R.btn, backgroundColor: t.accent, marginTop: 12,
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
  const { h, p, handlers, reduce } = useLift();
  // The selected row eases in (and out) rather than jumping when the page changes.
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = reduce ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [active, reduce]);
  const wash = useAnimatedStyle(() => ({ opacity: Math.max(h.value * 0.8, p.value) * (1 - on.value) }));
  const sel = useAnimatedStyle(() => ({ opacity: on.value }));
  const wellFrom = tint(t.accent, 0);
  const wellTo = t.accent;
  const well = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [wellFrom, wellTo]),
    transform: [{ scale: reduce ? 1 : 1 - 0.08 * p.value }, { translateX: reduce ? 0 : 2 * h.value * (1 - on.value) }],
  }));
  const text = useAnimatedStyle(() => ({ transform: [{ translateX: reduce ? 0 : 3 * h.value * (1 - on.value) }] }));
  return (
    <Pressable
      onPress={onPress}
      {...handlers}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-current={active ? "page" : undefined}
      style={({ focused }: PressState) => [
        {
          minHeight: 52, marginHorizontal: S.md, borderRadius: R.md + 2, paddingHorizontal: S.sm,
          flexDirection: "row", alignItems: "center", gap: S.md,
        },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      {/* Hover wash and the selected fill: two still layers whose opacity moves. */}
      <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: R.md + 2, backgroundColor: tint(t.ink, 0.06) }, wash]} />
      <Animated.View style={[{ pointerEvents: "none", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: R.md + 2, backgroundColor: t.panel }, cardRaise(t), sel]} />
      <IconWell style={well}>{glyph(active ? t.field : t.dim)}</IconWell>
      <Animated.View style={[{ flex: 1 }, text]}>
        <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: active ? "700" : "600" }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** The selected nav row sits on the card surface, so "you are here" reads as a page pulled forward. */
const cardRaise = (t: Theme): ViewStyle => (t.key === "savanna"
  ? ({ boxShadow: "0 1px 2px rgba(20, 32, 27, 0.06), 0 4px 12px -6px rgba(20, 32, 27, 0.12)" } as ViewStyle)
  : { borderWidth: B.line, borderColor: t.line, borderTopColor: tint(t.ink, 0.14) });

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
          // Border + padding stays 10/12 so content sits where it always did;
          // selection changes the border colour only, never its weight.
          flex: 1, minHeight: 96, borderRadius: R.md, padding: (narrow ? 10 : 12) - B.control, gap: 4,
          // Room for the theme name pinned to the bottom edge.
          ...(narrow ? null : { paddingBottom: 24 - B.control }),
          backgroundColor: theme.bg, borderWidth: B.control, borderColor: selected ? t.accent : theme.line,
          opacity: pressed ? 0.85 : 1,
        },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      {glyph}
      {/* A fixed two-line block: "Bora juani" wraps on a 360px phone, and the
          theme names must still share one baseline across the three tiles. */}
      <Text numberOfLines={2} style={{ color: theme.ink, fontSize: narrow ? 13 : 14, lineHeight: 18, minHeight: 36, fontWeight: "700" }}>{hint}</Text>
      {/* Docked tiles are ~80px wide: the monospace theme name (still in the
          label) is left out there to keep the column short. */}
      {!narrow && (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute", left: 12 - B.control, right: 6, bottom: 8 - B.control,
            color: theme.dim, fontSize: 12, lineHeight: 16, fontFamily: "monospace",
          }}
        >
          {theme.name}
        </Text>
      )}
      {selected && (
        <Animated.View style={[{ position: "absolute", top: 9 - B.control, right: 9 - B.control }, coinStyle]}>
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
    <View style={{ borderTopWidth: B.line, borderTopColor: t.line, backgroundColor: t.rail }}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={tt("signout.row")}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        style={({ pressed, hovered, focused }: PressState) => [
          { minHeight: 56, paddingHorizontal: S.xl, flexDirection: "row", alignItems: "center", gap: S.md },
          (hovered || expanded) && { backgroundColor: tint(t.alert, 0.06) },
          pressed && { opacity: 0.7 },
          webCursor, focusRingInset(focused, t.accent),
        ]}
      >
        {({ hovered }: PressState) => (
          <>
            <ExitGlyph size={20} color={hovered || expanded ? t.alert : t.dim} />
            <Text numberOfLines={1} style={{ flex: 1, color: hovered || expanded ? t.alert : t.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }}>{tt("signout.row")}</Text>
            <ChevronGlyph size={11} color={t.dim} dir={expanded ? "up" : "down"} />
          </>
        )}
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
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: B.control, borderColor: forget ? t.accent : t.dim, backgroundColor: forget ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
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
                    { flex: 1, minHeight: 52, borderRadius: R.btn, borderWidth: B.control, borderColor: t.dim, alignItems: "center", justifyContent: "center" },
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
                    { flex: 1, minHeight: 52, borderRadius: R.btn, backgroundColor: t.alert, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : hovered ? 0.92 : 1 },
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
