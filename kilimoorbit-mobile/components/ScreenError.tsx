/**
 * Crash containment, at two levels:
 *   ScreenErrorBoundary: exported as `ErrorBoundary` from every route, so a
 *     screen that throws shows a calm "try again" card instead of a blank app.
 *   Guard: wraps one card or section, so a broken card can't take its screen
 *     down with it.
 * Both work without providers (theme and language fall back to defaults), and
 * both say the farmer's data is safe: nothing on the phone is touched.
 */
import React, { Component, type ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { Btn, T } from "./Kit";
import { SignalOffGlyph } from "./Glyphs";

export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
      <View accessibilityRole="alert" testID="screen-error" style={{ maxWidth: 480, width: "100%", alignSelf: "center", gap: 12, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.panel }}>
        <SignalOffGlyph size={28} color={t.dim} />
        <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" }}>{tt("crash.title")}</Text>
        <Text style={{ color: t.ink, ...T.body }}>{tt("crash.body")}</Text>
        {__DEV__ && error?.message ? (
          <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16, fontFamily: "monospace" }} numberOfLines={4}>{error.message}</Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Btn label={tt("result.retry")} onPress={() => { retry().catch(() => {}); }} style={{ flex: 1 }} testID="screen-error-retry" />
          <Btn kind="secondary" label={tt("crash.home")} onPress={() => { try { router.replace("/"); } catch {} }} style={{ flex: 1 }} />
        </View>
      </View>
    </ScrollView>
  );
}

function GuardFallback({ onRetry }: { onRetry: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <View accessibilityRole="alert" testID="guard-error" style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.panel, gap: 8 }}>
      <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>{tt("crash.part")}</Text>
      <Btn kind="ghost" small label={tt("result.retry")} onPress={onRetry} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}

export class Guard extends Component<{ children: ReactNode; name?: string }, { error: Error | null; key: number }> {
  state = { error: null as Error | null, key: 0 };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    // Logged for the developer; the farmer sees the fallback card.
    console.warn(`[Guard${this.props.name ? `:${this.props.name}` : ""}]`, error?.message ?? error);
  }
  render() {
    if (this.state.error) return <GuardFallback onRetry={() => this.setState((s) => ({ error: null, key: s.key + 1 }))} />;
    // A fresh key on retry remounts the children from scratch.
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}
