/**
 * The Connection screen behind "Fix connection": which server address the
 * phone is using, whether it answers, why not in plain words, and a field to
 * type the address the server prints at start-up ("From a phone on this
 * Wi-Fi: http://192.168.0.12:4517"). Logic in lib/connection.ts and
 * lib/config.ts.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Text from "./Text";
import { CheckGlyph, LensGlyph } from "./Glyphs";
import { haptic } from "../lib/haptics";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, isWeb } from "../lib/ui";
import { cleanBase, hostOf, probe, type Probe } from "../lib/connection";
import { setApiBaseOverride, useApiBase } from "../lib/config";
import { loadSentinel } from "../lib/sentinel";
import type { Key } from "../lib/i18n";
import { Btn, Group, Sheet, T, Tag } from "./Kit";
import Field from "./Field";

export function ConnectionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { base, override, auto } = useApiBase();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ base: string; p: Probe } | null>(null);

  const test = async (b: string) => {
    setBusy(true);
    const p = await probe(b);
    setResult({ base: b, p });
    if (p.ok) haptic.success(); else haptic.error();
    setBusy(false);
    announce(p.ok ? tt("conn.okA11y") : tt(`conn.fail.${p.reason}` as Key));
  };
  useEffect(() => {
    if (!visible) return;
    setInput(override ?? "");
    setResult(null);
    test(base);
  }, [visible]);

  const typed = cleanBase(input);
  const candidate = input.trim() ? typed : base;
  const save = async () => {
    const v = await setApiBaseOverride(input.trim() ? input : null);
    announce(tt("conn.saved", { host: hostOf(v ?? auto) }));
    loadSentinel();
    onClose();
  };
  const useAuto = async () => { await setApiBaseOverride(null); setInput(""); test(auto); };

  const r = result?.p;
  const tips: Key[] = !r || r.ok ? [] : r.reason === "http" || r.reason === "notSentinel" ? ["conn.tip.wrongServer"] : ["conn.tip.running", "conn.tip.wifi", "conn.tip.firewall", "conn.tip.address"];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("conn.title")}
      testID="sheet-connection"
      footer={
        <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
          {override ? <Btn kind="secondary" label={tt("conn.useAuto")} onPress={useAuto} style={{ flex: 1 }} testID="conn-auto" /> : null}
          <Btn label={tt("conn.save")} onPress={save} disabled={!!input.trim() && !typed} style={{ flex: 1 }} icon={(c) => <CheckGlyph size={15} color={c} />} testID="conn-save" />
        </View>
      }
    >
      <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 8 }} accessibilityLiveRegion="polite" aria-live="polite" testID="conn-status">
        <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt(override ? "conn.custom" : "conn.auto")}</Text>
        <Text selectable style={{ color: t.ink, fontFamily: "monospace", fontSize: 15, lineHeight: 20 }}>{hostOf(result?.base ?? base)}</Text>
        {busy || !r ? (
          <Text style={{ color: t.dim, ...T.meta }}>{tt("conn.testing")}</Text>
        ) : r.ok ? (
          <Tag tone="ok" label={tt("conn.ok", { ms: r.ms, v: r.version })} />
        ) : (
          <Tag tone="bad" block label={`${tt(`conn.fail.${r.reason}` as Key)} (${r.detail})`} />
        )}
      </View>

      {tips.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" }}>{tt("conn.check")}</Text>
          {tips.map((k, i) => (
            <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.accent, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, color: t.ink, ...T.meta }}>{tt(k)}</Text>
            </View>
          ))}
        </View>
      )}

      <Group label={tt("conn.addressLabel")}>
        <Field
          label={tt("conn.address")}
          glyph={null}
          value={input}
          onChangeText={(v) => setInput(v.replace(/\s/g, "").slice(0, 120))}
          height={52}
          inputStyle={{ fontSize: 16, fontFamily: "monospace" }}
          error={!!input.trim() && !typed}
          status={input.trim() && !typed ? { kind: "error", text: tt("conn.addressErr") } : { kind: "rest", text: tt("conn.addressHint", { auto: hostOf(auto) }) }}
          statusMinHeight={0}
          inputProps={{ placeholder: "192.168.0.12:4517", autoCapitalize: "none", autoCorrect: false, keyboardType: isWeb ? undefined : "url", testID: "conn-input" } as any}
        />
        <Btn kind="secondary" small label={tt("conn.test")} onPress={() => candidate && test(candidate)} disabled={busy || !candidate} style={{ alignSelf: "flex-start" }} icon={(c) => <LensGlyph size={15} color={c} />} testID="conn-test" />
      </Group>
      <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("conn.note")}</Text>
    </Sheet>
  );
}
