import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { SessionProvider, useLang } from "../lib/session";
import { FONTS, setFontStatus } from "../lib/typography";

// The splash stays up until the bundled fonts are ready, so no screen is ever
// drawn in the system font and then redrawn.
SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const t = useTheme();
  const { lang } = useLang();
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

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts(FONTS);
  const ready = fontsReady || !!fontError; // a font that fails to load falls back to the system font, never a blank app
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
