import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { SessionProvider, useLang } from "../lib/session";

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
      <StatusBar style={dark ? "light" : "dark"} backgroundColor={t.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="login" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
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
