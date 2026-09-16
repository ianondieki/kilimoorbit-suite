import React from "react";
import { Text, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemeControls } from "../../lib/theme-context";
import { useLang, useSession } from "../../lib/session";
import { MenuProvider, useMenu } from "../../components/MenuContext";
import Sidebar from "../../components/Sidebar";

export default function TabLayout() {
  const t = useTheme();
  const { ready } = useThemeControls();
  const { status } = useSession();

  // Until storage has hydrated, paint only the background: no login flash.
  if (status === "loading" || !ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (status === "signedOut") return <Redirect href="/login" />;

  return (
    <MenuProvider>
      <TabShell />
    </MenuProvider>
  );
}

function TabShell() {
  const t = useTheme();
  const { t: tt } = useLang();
  const { isDocked } = useMenu();
  const insets = useSafeAreaInsets();
  const icon = (glyph: string) =>
    ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

  // The Tabs navigator keeps the same tree position at every width, so a resize
  // across 900px swaps drawer <-> docked instantly without resetting tab state.
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.bg }}>
      {isDocked ? <Sidebar variant="docked" /> : null}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: isDocked
              ? { display: "none" }
              : {
                  backgroundColor: t.panel, borderTopColor: t.line,
                  // Room for 13px farmer-facing labels without clipping.
                  height: 68 + insets.bottom, paddingTop: 4, paddingBottom: Math.max(8, insets.bottom),
                },
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.dim,
            tabBarLabelStyle: { fontSize: 13, lineHeight: 16, fontWeight: "600", flexShrink: 0 },
            sceneStyle: { backgroundColor: t.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ title: tt("nav.dashboard"), tabBarIcon: icon("🛰") }} />
          <Tabs.Screen name="chat" options={{ title: tt("nav.chat"), tabBarIcon: icon("💬") }} />
          <Tabs.Screen name="autopilot" options={{ title: tt("nav.autopilot"), tabBarIcon: icon("🧭") }} />
        </Tabs>
      </View>
      {!isDocked ? <Sidebar variant="drawer" /> : null}
    </View>
  );
}
