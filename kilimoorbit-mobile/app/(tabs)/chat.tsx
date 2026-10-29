import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, TextInput, Pressable, FlatList, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import { SwitchVisual } from "../../components/Sidebar";
import Text from "../../components/Text";
import { SANS } from "../../lib/typography";
import { focusRing, webCursor, webLang, type PressState } from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { refreshVoicePref, useVoicePref } from "../../lib/voice";
import Header from "../../components/Header";
import Icon from "../../components/Icon";
import { PhotoHero } from "../../components/PhotoHero";
import { PHOTO_SETS } from "../../lib/photos";
import { useLang } from "../../lib/session";
import { trMaybe } from "../../lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import Pill from "../../components/Pill";
import { Enter, PressScale } from "../../components/Motion";
import { Bounded, CONTENT_MAX_W } from "../../components/Bounded";
import { useTheme } from "../../lib/theme-context";
import { B, Btn, R, S, T, TOUCH, useSpace } from "../../components/Kit";
import { callApex, getMeta, type ChatResult, type ApexError } from "../../lib/api";

// An error bubble keeps the question that failed (`retry`) so it can be sent again.
type Msg = { id: string; from: "user" | "apex"; text: string; intent?: string; err?: boolean; retry?: string };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const WELCOME: Msg = {
  id: "w",
  from: "apex",
  // Shown in the farmer's language (chat.welcome); this English copy is what Apex sees as history.
  text: "Karibu! Ask me about masoko prices, weather windows, or delivery routing.",
  intent: "general_advisory",
};

const CHAT_LOG_KEY = "ko-chat-log";
const HISTORY_TURNS = 6; // prior turns sent to Apex as conversation memory

const QUICK = ["chat.q1", "chat.q2", "chat.q3"] as const;

export default function Chat() {
  const t = useTheme();
  const sp = useSpace();
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Shared with the sidebar switch (lib/voice.ts): one value, always in sync.
  const [voice, setVoicePref] = useVoicePref();
  const list = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const market = useRef<any>(null);
  const hydrated = useRef(false);
  const { lang, t: tt } = useLang();
  const { q } = useLocalSearchParams<{ q?: string }>();

  // A question handed over from another screen (e.g. Crop doctor's "Ask
  // Apex") is put in the box, not sent: the farmer reads it and presses Send.
  useEffect(() => {
    if (typeof q !== "string" || !q.trim()) return;
    setInput(q);
    router.setParams({ q: undefined });
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [q]);

  // Hydrate persisted conversation + preferences, and pull live market context
  // once so price questions get real quotes; chat still works without any of it.
  useEffect(() => {
    AsyncStorage.getItem(CHAT_LOG_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          // A stored log is re-checked: only well-formed messages are shown.
          const saved = (JSON.parse(raw) as unknown[] | null ?? [])
            .filter((m: any): m is Msg => !!m && typeof m.id === "string" && (m.from === "user" || m.from === "apex") && typeof m.text === "string")
            .map((m) => ({ id: m.id, from: m.from, text: m.text.slice(0, 2000), intent: typeof m.intent === "string" ? m.intent : undefined, err: m.err === true, retry: typeof m.retry === "string" ? m.retry : undefined }));
          if (saved.length) {
            setMsgs(saved);
            setTimeout(() => list.current?.scrollToEnd({ animated: false }), 80);
          }
        } catch {}
      })
      .catch(() => {})
      .finally(() => { hydrated.current = true; });
    getMeta()
      .then((m) => {
        market.current =
          m.payloads?.user_chat?.market_data ?? m.payloads?.arbitrage?.market_data ?? null;
      })
      .catch(() => {});
  }, []);

  // Re-read the stored voice preference on every focus (the shared store
  // already keeps the sidebar and this screen in sync while mounted).
  useFocusEffect(useCallback(() => { refreshVoicePref(); }, []));

  // Turning read-aloud off anywhere (e.g. from the sidebar) stops speech now.
  useEffect(() => { if (!voice) Speech.stop(); }, [voice]);

  // Persist the conversation so it survives app restarts (capped at 50 turns).
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(CHAT_LOG_KEY, JSON.stringify(msgs.slice(-50))).catch(() => {});
  }, [msgs]);

  const toggleVoice = (v: boolean) => setVoicePref(v);

  const clearChat = () => {
    Speech.stop();
    setMsgs([WELCOME]);
    AsyncStorage.removeItem(CHAT_LOG_KEY).catch(() => {});
  };

  // Send a failed question again: the error bubble and the question it answered make way for a fresh try.
  const retry = (item: Msg) => {
    if (!item.retry || busy) return;
    const i = msgs.findIndex((m) => m.id === item.id);
    const asked = i > 0 && msgs[i - 1].from === "user" && msgs[i - 1].text === item.retry ? i - 1 : -1;
    const base = msgs.filter((_, j) => j !== i && j !== asked);
    setMsgs(base);
    send(item.retry, base);
  };

  // The welcome is written in the farmer's language; everything else as sent or received.
  const textOf = (m: Msg) => (m.id === WELCOME.id ? tt("chat.welcome") : m.text);

  const speak = (text: string) => {
    if (!voice) return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
    const sw = /\b(bei|nyanya|soko|shamba|karibu|mvua|iko|kwa)\b/i.test(text);
    Speech.stop();
    Speech.speak(clean, { language: sw ? "sw" : "en", rate: 1.02 });
  };

  const send = async (raw?: string, base: Msg[] = msgs) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    // Prior turns only (connection-error bubbles excluded) — the new message
    // travels as user_message, the context as chat_history.
    const chat_history = base
      .filter((m) => !m.err)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.from, text: m.text }));
    setMsgs((m) => [...m, { id: `u${Date.now()}`, from: "user", text }]);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await callApex<ChatResult | ApexError>({
        execution_mode: "user_chat",
        current_screen: "mobile_chat",
        current_month: MONTHS[new Date().getMonth()],
        user_message: text,
        chat_history,
        ...(market.current ? { market_data: market.current } : {}),
      });
      const r = res.result;
      if ((r as ApexError).execution_mode === "error") {
        // Apex's own error text is for developers; the farmer gets a plain line and a retry.
        setMsgs((m) => [...m, { id: `e${Date.now()}`, from: "apex", text: tt("chat.apexError"), err: true, retry: text }]);
      } else {
        const reply = (r as ChatResult).chat_response;
        const intent = (r as ChatResult).intent_detected;
        setMsgs((m) => [...m, { id: `a${Date.now()}`, from: "apex", text: reply, intent }]);
        speak(reply);
      }
    } catch {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, from: "apex", text: tt("chat.failed"), err: true, retry: text }]);
    } finally {
      setBusy(false);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang(lang)}>
      <Header
        title={tt("nav.chat")}
        right={
          <View style={s.voiceRow}>
            <Pressable
              onPress={clearChat}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tt("chat.clear")}
              style={({ pressed, hovered, focused }: PressState) => [
                { width: TOUCH, height: TOUCH, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
                webCursor,
                (hovered || pressed) && { backgroundColor: t.raised },
                focusRing(focused, t.accent),
              ]}
            >
              {/* "New conversation": a fresh page reads at a glance where a broom did not. */}
              <Icon name="message-plus-outline" size={22} color={t.ink} />
            </Pressable>
            {/* The whole control is one switch with a full-size touch target; the toggle is drawn. */}
            <Pressable
              onPress={() => toggleVoice(!voice)}
              accessibilityRole="switch"
              accessibilityState={{ checked: voice }}
              aria-checked={voice}
              accessibilityLabel={tt("chat.voice")}
              style={({ pressed, hovered, focused }: PressState) => [
                s.voiceToggle,
                webCursor,
                (hovered || pressed) && { backgroundColor: t.raised },
                focusRing(focused, t.accent),
              ]}
            >
              <Icon name={voice ? "volume-high" : "volume-off"} size={22} color={voice ? t.accent : t.dim} />
              <SwitchVisual value={voice} />
            </Pressable>
          </View>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[s.chatContent, { paddingHorizontal: sp.pad, paddingTop: sp.gap }]}
          ListHeaderComponent={<View style={{ marginBottom: S.xl }}><PhotoHero photo="chat" photos={PHOTO_SETS.chat} icon="chat-processing-outline" eyebrow={tt("ph.chat.eyebrow")} title={tt("ph.chat.title")} subtitle={tt("ph.chat.sub")} compact height={170} testID="chat-hero" /></View>}
          renderItem={({ item }) => (
            <Enter from={item.from === "user" ? "up" : "down"}>
            <View
              style={[
                s.bubble,
                item.from === "user"
                  ? { alignSelf: "flex-end", borderColor: t.accent, backgroundColor: t.raised }
                  : { alignSelf: "flex-start", borderColor: item.err ? t.alert : t.line, backgroundColor: t.panel },
              ]}
            >
              {item.err ? (
                // Not colour alone: a failed reply also carries an alert icon.
                <View style={s.errRow}>
                  <Icon name="alert-circle-outline" size={18} color={t.alert} style={{ marginTop: 3 }} />
                  <Text style={{ flex: 1, color: t.ink, ...T.body }}>{item.text}</Text>
                </View>
              ) : (
                <Text style={{ color: t.ink, ...T.body }}>{textOf(item)}</Text>
              )}
              {item.err && item.retry ? (
                <Btn kind="secondary" small label={tt("result.retry")} onPress={() => retry(item)} disabled={busy} style={{ alignSelf: "flex-start", marginTop: S.md }} testID="chat-retry" />
              ) : null}
              {item.from === "apex" && !item.err && (
                <View style={s.metaRow}>
                  {item.intent ? <Pill label={(trMaybe(lang, `intent.${item.intent}`) ?? item.intent).toUpperCase()} tone="dim" /> : null}
                  <Pressable
                    onPress={() => speak(textOf(item))}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={tt("chat.speak")}
                    style={({ pressed, hovered, focused }: PressState) => [
                      s.speak,
                      webCursor,
                      (hovered || pressed) && { opacity: 0.7 },
                      focusRing(focused, t.accent),
                    ]}
                  >
                    <Icon name="volume-high" size={16} color={t.accent} />
                    <Text style={{ color: t.accent, ...T.meta, fontWeight: "700" }}>{tt("chat.speak")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            </Enter>
          )}
          ListFooterComponent={
            busy ? (
              <View
                accessibilityLiveRegion="polite"
                aria-live="polite"
                style={[s.bubble, { alignSelf: "flex-start", borderColor: t.line, backgroundColor: t.panel }]}
              >
                <Text style={{ color: t.dim, ...T.body }}>{tt("chat.typing")}</Text>
              </View>
            ) : null
          }
        />

        {/* Quick prompts scroll sideways at full length, never truncated. */}
        <Bounded>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.quickRow, { paddingHorizontal: sp.pad }]}>
            {QUICK.map((k) => tt(k)).map((q) => (
              <Pressable
                key={q}
                onPress={() => send(q)}
                accessibilityRole="button"
                accessibilityLabel={tt("chat.ask", { q })}
                style={({ pressed, hovered, focused }: PressState) => [
                  s.quick,
                  { borderColor: hovered ? t.accent : t.line, backgroundColor: hovered ? t.raised : "transparent", opacity: pressed ? 0.6 : 1 },
                  webCursor,
                  focusRing(focused, t.accent),
                ]}
              >
                <Text style={{ color: t.ink, ...T.meta }}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Bounded>

        <View style={[s.inputRow, { paddingHorizontal: sp.pad, borderTopColor: t.line, backgroundColor: t.panel }]}>
          <Bounded style={s.inputInner}>
          <TextInput
            ref={inputRef}
            testID="chat-input"
            accessibilityLabel={tt("chat.inputLabel")}
            style={[s.input, { color: t.ink, backgroundColor: t.field, borderColor: t.line }]}
            placeholder={tt("chat.placeholder")}
            placeholderTextColor={t.dim}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!busy}
          />
          <PressScale onPress={() => send()} disabled={busy} accessibilityLabel={tt("chat.sendLabel")} accessibilityState={{ busy, disabled: busy }} focusColor={t.accent}
            outerStyle={{ alignSelf: "stretch" }}
            style={[s.send, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ color: t.field, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{busy ? "…" : tt("chat.send")}</Text>
          </PressScale>
          </Bounded>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  voiceRow: { flexDirection: "row", alignItems: "center", gap: S.xs },
  voiceToggle: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: TOUCH, paddingHorizontal: S.sm, borderRadius: R.md },
  chatContent: { padding: S.lg, gap: S.md, width: "100%", maxWidth: CONTENT_MAX_W, alignSelf: "center" },
  bubble: { maxWidth: "86%", borderWidth: B.line, borderRadius: R.btn, paddingHorizontal: S.lg, paddingVertical: S.md },
  errRow: { flexDirection: "row", alignItems: "flex-start", gap: S.sm },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: S.md, marginTop: S.xs },
  speak: { flexDirection: "row", alignItems: "center", gap: S.xs, minHeight: TOUCH, paddingHorizontal: S.xs, marginHorizontal: -S.xs, borderRadius: R.sm },
  quickRow: { flexDirection: "row", gap: S.sm, paddingHorizontal: S.lg, paddingBottom: S.md },
  quick: { minHeight: TOUCH, justifyContent: "center", borderWidth: B.control, borderRadius: R.pill, paddingHorizontal: S.lg },
  inputRow: { paddingVertical: S.md, paddingHorizontal: S.lg, borderTopWidth: B.line },
  inputInner: { flexDirection: "row", gap: S.md },
  input: { flex: 1, minHeight: 48, borderWidth: B.control, borderRadius: R.md, paddingHorizontal: S.lg, paddingVertical: S.md, fontSize: 16, fontFamily: SANS["500"] },
  send: { flex: 1, minHeight: 48, borderRadius: R.md, paddingHorizontal: S.lg, justifyContent: "center" },
});

// A screen that throws shows a "try again" card, never a blank app.
export { ScreenErrorBoundary as ErrorBoundary } from "../../components/ScreenError";
