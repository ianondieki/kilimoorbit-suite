import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { FontDisplay, useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { SessionProvider, useLang } from "../lib/session";
import { useSurfaceStyles } from "../components/Kit";
import { FONTS, setFontStatus } from "../lib/typography";

// On the phone the splash stays up until the bundled fonts are ready, so no
// screen is drawn in the system font and then redrawn. The web waits at most
// WEB_FONT_WAIT_MS (below).
SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const t = useTheme();
  const { lang } = useLang();
  // Web: the surfaces' hover and focus states, for every screen (cards and hand-built surfaces alike).
  useSurfaceStyles(t);
  const dark = t.key !== "savanna";

  // Keep the document language in sync for screen readers and hyphenation.
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  // The navigator always renders; the auth gates live in (tabs)/_layout and
  // login.tsx and show a plain background until storage has hydrated.
  return (
    <>
      {/* Edge-to-edge (SDK 55+): the bar is transparent over each screen's own background. */}
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="login" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
}

// Web: each face is declared with font-display: swap, so text is readable at once
// and the bundled letters replace it the moment they arrive.
// The icon font loads with them, so icons and text appear together.
const ALL_FONTS = { ...FONTS, ...MaterialCommunityIcons.font };
const FONT_SOURCES = Platform.OS === "web"
  ? Object.fromEntries(Object.entries(ALL_FONTS).map(([k, uri]) => [k, { uri, display: FontDisplay.SWAP }]))
  : ALL_FONTS;

// Web: the browser reads farther than a phone's bundle, so the page never waits
// on the fonts longer than this before it draws (a slow dev server, a slow link).
const WEB_FONT_WAIT_MS = 1200;

/** Web only: smoother letterforms and a calm tap highlight, set once on the document. */
function useWebTextRendering() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("ko-text")) return;
    const el = document.createElement("style");
    el.id = "ko-text";
    el.textContent =
      "html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;" +
      "font-kerning:normal;-webkit-tap-highlight-color:transparent}";
    document.head.appendChild(el);
  }, []);
}

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts(FONT_SOURCES);
  const [waited, setWaited] = useState(false);
  useWebTextRendering();
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const id = setTimeout(() => setWaited(true), WEB_FONT_WAIT_MS);
    return () => clearTimeout(id);
  }, []);
  // A font that fails to load falls back to the system font, never a blank app.
  const ready = fontsReady || !!fontError || waited;
  useEffect(() => {
    if (fontsReady) setFontStatus("ready");
    else if (fontError) {
      setFontStatus("failed");
      console.warn("[KilimoOrbit] the bundled fonts did not load; using the system font", fontError);
    }
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsReady, fontError]);
  if (!ready) return null;
  return (
    <ThemeProvider>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </ThemeProvider>
  );
}

// A screen that throws shows a "try again" card, never a blank app.
export { ScreenErrorBoundary as ErrorBoundary } from "../components/ScreenError";
