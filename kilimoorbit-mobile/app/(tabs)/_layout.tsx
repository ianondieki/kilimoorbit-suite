import React from "react";
import { View, type ColorValue } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemeControls } from "../../lib/theme-context";
import { useLang, useSession } from "../../lib/session";
import { MenuProvider, useMenu } from "../../components/MenuContext";
import Sidebar from "../../components/Sidebar";
import Icon from "../../components/Icon";
import { SANS } from "../../lib/typography";
import { tint } from "../../components/Kit";

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

/** The active tab's icon sits on a tinted pill, the others on nothing. */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ width: 54, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: focused ? tint(t.accent, 0.2) : "transparent" }}>
      {children}
    </View>
  );
}

function TabShell() {
  const t = useTheme();
  const { t: tt } = useLang();
  const { isDocked } = useMenu();
  const insets = useSafeAreaInsets();

  // The bar hands icons our own tint colours (theme hex strings); a platform colour object can't reach the glyphs.
  const ink = (c: ColorValue) => (typeof c === "string" ? c : t.dim);

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
                  height: 72 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom),
                },
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.dim,
            // Five tabs: labels are kept to one short word or two so 12px fits a 360px phone.
            tabBarLabelStyle: { fontFamily: SANS["700"], fontSize: 12, lineHeight: 16, flexShrink: 0 },
            sceneStyle: { backgroundColor: t.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ title: tt("nav.today"), tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Icon name="white-balance-sunny" size={24} color={ink(color)} /></TabIcon> }} />
          <Tabs.Screen name="shamba" options={{ title: tt("nav.farm"), tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Icon name="barn" size={24} color={ink(color)} /></TabIcon> }} />
          <Tabs.Screen name="masoko" options={{ title: tt("nav.markets"), tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Icon name="storefront-outline" size={24} color={ink(color)} /></TabIcon> }} />
          <Tabs.Screen name="daktari" options={{ title: tt("nav.doctorTab"), tabBarAccessibilityLabel: tt("nav.doctor"), tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Icon name="stethoscope" size={24} color={ink(color)} /></TabIcon> }} />
          <Tabs.Screen name="chat" options={{ title: tt("nav.chatTab"), tabBarAccessibilityLabel: tt("nav.chat"), tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Icon name="chat-processing-outline" size={24} color={ink(color)} /></TabIcon> }} />
          {/* Reached from Markets and the sidebar; not a bar tab (five is the most a phone bar holds well). */}
          <Tabs.Screen name="autopilot" options={{ title: tt("nav.autopilot"), href: null }} />
        </Tabs>
      </View>
      {!isDocked ? <Sidebar variant="drawer" /> : null}
    </View>
  );
}

// A screen that throws shows a "try again" card, never a blank app.
export { ScreenErrorBoundary as ErrorBoundary } from "../../components/ScreenError";
