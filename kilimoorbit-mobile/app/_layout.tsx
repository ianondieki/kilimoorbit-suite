import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../lib/theme-context";

function Shell() {
  const t = useTheme();
  const dark = t.key !== "savanna";
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} backgroundColor={t.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
