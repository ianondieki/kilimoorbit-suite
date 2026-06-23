import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ViewStyle } from "react-native";
import { useTheme, useThemeControls } from "../lib/theme-context";
import type { Theme } from "../lib/themes";

/** App header: title + a tap-to-cycle theme chip (mirrors the Sentinel app's themes). */
export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTheme();
  const { theme, cycle } = useThemeControls();
  return (
    <View style={[s.header, { backgroundColor: t.panel, borderBottomColor: t.line }]}>
      <View>
        <Text style={[s.brand, { color: t.ink }]}>
          🧺 {title}
        </Text>
        {subtitle ? <Text style={[s.sub, { color: t.dim }]}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={cycle} style={[s.themeChip, { borderColor: t.line, backgroundColor: t.raised }]}>
        <Text style={{ color: t.accent, fontSize: 11, fontWeight: "700" }}>◐ {theme.name}</Text>
      </Pressable>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.panel, borderColor: t.line }, style]}>{children}</View>;
}

type Tone = "ok" | "alert" | "accent" | "dim";
function toneColor(t: Theme, tone: Tone) {
  return tone === "ok" ? t.ok : tone === "alert" ? t.alert : tone === "accent" ? t.accent : t.dim;
}
export function Badge({ label, tone = "accent" }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColor(t, tone);
  return (
    <View style={[s.badge, { borderColor: c }]}>
      <Text style={{ color: c, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

export function Button({
  label, onPress, disabled, tone = "accent",
}: { label: string; onPress: () => void; disabled?: boolean; tone?: Tone }) {
  const t = useTheme();
  const c = toneColor(t, tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: c, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={{ color: t.bg, fontWeight: "800", letterSpacing: 0.3 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label, value, onChangeText, placeholder, keyboardType,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: "default" | "numeric";
}) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[s.fieldLabel, { color: t.dim }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.dim}
        keyboardType={keyboardType ?? "default"}
        style={[s.input, { backgroundColor: t.field, borderColor: t.line, color: t.ink }]}
      />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={s.empty}>
      <Text style={{ color: t.dim, textAlign: "center" }}>{text}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  brand: { fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },
  sub: { fontSize: 11, marginTop: 2 },
  themeChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  empty: { padding: 32, alignItems: "center" },
});
