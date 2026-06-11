import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, useThemeControls } from "../lib/theme-context";
import { THEMES } from "../lib/themes";
import { signIn } from "../lib/api";

type Profile = { name: string; email: string };
const PROFILE_KEY = "ko-profile";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Apex §4.1 hamburger sidebar: Settings, Notification Profiles, Account, Themes. */
export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const { setThemeKey } = useThemeControls();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then((raw) => { if (raw) try { setProfile(JSON.parse(raw)); } catch {} })
      .catch(() => {});
  }, []);

  const doSignIn = async () => {
    const n = name.trim(), e = email.trim();
    if (!n || !EMAIL_RE.test(e)) {
      setNotice("Enter your name and a valid email address.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await signIn(n, e);
      const p = { name: n, email: e };
      setProfile(p);
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p)).catch(() => {});
      setNotice(
        res.status === "SENT"
          ? `📧 Karibu! A welcome email was sent to ${e}.`
          : "Signed in — email delivery isn't configured on the server yet (SMTP_* in .env)."
      );
    } catch (err: any) {
      setNotice(`Sign-in failed — ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    setProfile(null);
    setNotice(null);
    setName("");
    setEmail("");
    AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
  };

  const Item = ({ label }: { label: string }) => (
    <Pressable onPress={onClose} style={({ pressed }) => [s.item, { borderBottomColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: t.ink, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose}>
        <Pressable style={[s.panel, { backgroundColor: t.panel, borderRightColor: t.line }]} onPress={() => {}}>
          <Text style={[s.head, { color: t.dim }]}>KILIMOORBIT MENU</Text>
          <Item label="⚙  Settings" />
          <Item label="🔔  Notification Profiles" />
          <Item label="🗂  Quick Access Tabs" />
          <Text style={[s.head, { color: t.dim, marginTop: 18 }]}>THEME</Text>
          <View style={s.swatches}>
            {THEMES.map((th) => (
              <Pressable key={th.key} onPress={() => setThemeKey(th.key)}
                style={[s.swatch, { backgroundColor: th.bg, borderColor: th.accent }]}>
                <Text style={{ color: th.accent, fontSize: 11, fontWeight: "700" }}>{th.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.head, { color: t.dim, marginTop: 18 }]}>ACCOUNT</Text>
          {profile ? (
            <View>
              <Text style={{ color: t.ink, fontWeight: "700" }}>{profile.name}</Text>
              <Text style={{ color: t.dim, fontSize: 12, marginBottom: 10 }}>{profile.email}</Text>
              <Pressable onPress={signOut}
                style={({ pressed }) => [s.btn, { borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
                <Text style={{ color: t.ink, fontSize: 14 }}>↩  Sign Out</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <TextInput
                style={[s.input, { color: t.ink, backgroundColor: t.field, borderColor: t.line }]}
                placeholder="Name" placeholderTextColor={t.dim}
                value={name} onChangeText={setName} editable={!busy}
              />
              <TextInput
                style={[s.input, { color: t.ink, backgroundColor: t.field, borderColor: t.line }]}
                placeholder="Email" placeholderTextColor={t.dim}
                value={email} onChangeText={setEmail} editable={!busy}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              />
              <Pressable onPress={doSignIn} disabled={busy}
                style={({ pressed }) => [s.btn, { backgroundColor: t.accent, borderColor: t.accent, opacity: busy || pressed ? 0.6 : 1 }]}>
                <Text style={{ color: t.bg, fontWeight: "700", fontSize: 14 }}>{busy ? "Signing in…" : "Sign In"}</Text>
              </Pressable>
            </View>
          )}
          {notice && <Text style={{ color: t.dim, fontSize: 12, marginTop: 10, lineHeight: 17 }}>{notice}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,.45)" },
  panel: { width: 270, flex: 1, padding: 18, borderRightWidth: 1 },
  head: { fontFamily: "monospace", fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  item: { paddingVertical: 14, borderBottomWidth: 1 },
  swatches: { flexDirection: "row", gap: 8 },
  swatch: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  btn: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
});
