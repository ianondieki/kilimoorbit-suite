import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { webLang } from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { refreshVoicePref, useVoicePref } from "../../lib/voice";
import Header from "../../components/Header";
import { useLang } from "../../lib/session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import Pill from "../../components/Pill";
import { Enter, PressScale } from "../../components/Motion";
import { Bounded, CONTENT_MAX_W } from "../../components/Bounded";
import { useTheme } from "../../lib/theme-context";
import { callApex, getMeta, type ChatResult, type ApexError } from "../../lib/api";

type Msg = { id: string; from: "user" | "apex"; text: string; intent?: string; err?: boolean };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const WELCOME: Msg = {
  id: "w",
  from: "apex",
  text: "Karibu! Ask me about masoko prices, weather windows, or delivery routing. 🌿",
  intent: "general_advisory",
};

const CHAT_LOG_KEY = "ko-chat-log";
const HISTORY_TURNS = 6; // prior turns sent to Apex as conversation memory

const QUICK = [
  "Je, bei ya nyanya iko juu wiki hii?",
  "Will the rain block my delivery today?",
  "How do I change my notification settings?",
];

// RN core types only expose `pressed`; react-native-web also provides `hovered`.
type PressState = { pressed: boolean; hovered?: boolean };
const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : null;

export default function Chat() {
  const t = useTheme();
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Shared with the sidebar switch (lib/voice.ts): one value, always in sync.
  const [voice, setVoicePref] = useVoicePref();
  const list = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const market = useRef<any>(null);
  const hydrated = useRef(false);
  const { t: tt } = useLang();
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
          const saved = JSON.parse(raw);
          if (Array.isArray(saved) && saved.length) {
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

  const speak = (text: string) => {
    if (!voice) return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
    const sw = /\b(bei|nyanya|soko|shamba|karibu|mvua|iko|kwa)\b/i.test(text);
    Speech.stop();
    Speech.speak(clean, { language: sw ? "sw" : "en", rate: 1.02 });
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    // Prior turns only (connection-error bubbles excluded) — the new message
    // travels as user_message, the context as chat_history.
    const chat_history = msgs
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
      const reply =
        (r as ApexError).execution_mode === "error"
          ? `Apex error: ${(r as ApexError).error_message}`
          : (r as ChatResult).chat_response;
      const intent = (r as ChatResult).intent_detected;
      setMsgs((m) => [...m, { id: `a${Date.now()}`, from: "apex", text: reply, intent }]);
      speak(reply);
    } catch (e: any) {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, from: "apex", text: `Cannot reach Sentinel server — ${e.message}`, err: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang("en")}>
      <Header
        title={tt("nav.chat")}
        right={
          <View style={s.voiceRow}>
            <Pressable
              onPress={clearChat}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear conversation"
              style={({ pressed, hovered }: PressState) => [
                { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
                webCursor,
                (hovered || pressed) && { backgroundColor: t.raised },
              ]}
            >
              <Text style={{ color: t.dim, fontSize: 18 }}>↺</Text>
            </Pressable>
            <Text style={{ color: t.dim, fontFamily: "monospace", fontSize: 10 }}>VOICE</Text>
            <Switch
              value={voice}
              onValueChange={toggleVoice}
              accessibilityLabel="Read replies aloud"
              trackColor={{ true: t.accent, false: t.line }}
              thumbColor={t.panel}
            />
          </View>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.chatContent}
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
              <Text style={{ color: t.ink, fontSize: 15 }}>{item.text}</Text>
              {item.from === "apex" && (
                <View style={s.metaRow}>
                  {item.intent ? <Pill label={item.intent.toUpperCase()} tone="warn" /> : null}
                  <Pressable
                    onPress={() => speak(item.text)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Speak this reply aloud"
                    style={({ pressed, hovered }: PressState) => [
                      webCursor,
                      (hovered || pressed) && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={{ color: t.dim, fontSize: 12 }}>🔊 speak</Text>
                  </Pressable>
                </View>
              )}
            </View>
            </Enter>
          )}
          ListFooterComponent={
            busy ? (
              <View style={[s.bubble, { alignSelf: "flex-start", borderColor: t.line, backgroundColor: t.panel }]}>
                <Text style={{ color: t.dim, fontSize: 15 }}>Apex inaandika…</Text>
              </View>
            ) : null
          }
        />

        {/* Quick prompts scroll sideways at full length, never truncated. */}
        <Bounded>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>
            {QUICK.map((q) => (
              <Pressable
                key={q}
                onPress={() => send(q)}
                accessibilityRole="button"
                accessibilityLabel={`Ask: ${q}`}
                style={({ pressed, hovered }: PressState) => [
                  s.quick,
                  { borderColor: hovered ? t.accent : t.line, backgroundColor: hovered ? t.raised : "transparent", opacity: pressed ? 0.6 : 1 },
                  webCursor,
                ]}
              >
                <Text style={{ color: t.ink, fontSize: 13, lineHeight: 18 }}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Bounded>

        <View style={[s.inputRow, { borderTopColor: t.line, backgroundColor: t.panel }]}>
          <Bounded style={s.inputInner}>
          <TextInput
            ref={inputRef}
            testID="chat-input"
            accessibilityLabel="Message to Apex"
            style={[s.input, { color: t.ink, backgroundColor: t.field, borderColor: t.line }]}
            placeholder="Uliza Apex…"
            placeholderTextColor={t.dim}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!busy}
          />
          <PressScale onPress={() => send()} disabled={busy} accessibilityLabel="Send message" focusColor={t.accent}
            outerStyle={{ alignSelf: "stretch" }}
            style={[s.send, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}>
            <Text style={{ color: t.bg, fontWeight: "800" }}>{busy ? "…" : "Send"}</Text>
          </PressScale>
          </Bounded>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatContent: { padding: 14, gap: 10, width: "100%", maxWidth: CONTENT_MAX_W, alignSelf: "center" },
  bubble: { maxWidth: "86%", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
  quickRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  quick: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderRadius: 999, paddingHorizontal: 14 },
  inputRow: { padding: 12, borderTopWidth: 1 },
  inputInner: { flexDirection: "row", gap: 10 },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
});
