import React from "react";
import { Text } from "react-native";
import { Tabs } from "expo-router";
import { useTheme } from "../../lib/theme-context";

export default function TabLayout() {
  const t = useTheme();
  const icon = (glyph: string) =>
    ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.panel, borderTopColor: t.line },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.dim,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.5 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: icon("🛰") }} />
      <Tabs.Screen name="chat" options={{ title: "Apex Chat", tabBarIcon: icon("💬") }} />
      <Tabs.Screen name="autopilot" options={{ title: "Autopilot", tabBarIcon: icon("🧭") }} />
    </Tabs>
  );
}
