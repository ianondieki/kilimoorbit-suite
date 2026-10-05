/**
 * Sell on Soko from Markets: post surplus to the suite's own marketplace
 * (the Soko app's buyers and e-boda riders see it), with the ask checked
 * against today's fair price (the market average, as Soko computes it).
 * "My Soko listings" follows each listing to claimed / delivered.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang, useSession } from "../lib/session";
import { announce } from "../lib/ui";
import { cropName } from "../lib/prices";
import { dayMonth, dateKey } from "../lib/dates";
import { useFarm } from "../lib/farm";
import { sokoActions, useMyListings } from "../lib/soko";
import { ApiError, type SokoStatus } from "../lib/api";
import type { Key } from "../lib/i18n";
import { Btn, Card, Eyebrow, Sheet, T, Tag } from "./Kit";
import { CropCoin } from "./ShambaPanel";
import Field from "./Field";

const digits = (v: string) => v.replace(/[^\d]/g, "").slice(0, 6);

export function SokoSheet({
  visible, onClose, crop, qty, fair, onNeedCounty,
}: {
  visible: boolean; onClose: () => void; crop: string; qty: number; fair: number | null; onNeedCounty: () => void;
}) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { profile } = useSession();
  const { farm } = useFarm();
  const [kg, setKg] = useState("");
  const [ask, setAsk] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const askRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setKg(qty > 0 ? String(qty) : "");
    setAsk(fair ? String(fair) : "");
    setName(profile?.name ?? "");
    setError(null); setTried(false); setBusy(false);
  }, [visible]);

  const q = Number(kg) || 0;
  const a = Number(ask) || 0;
  const diff = fair && a ? Math.round(((a - fair) / fair) * 100) : null;
  const verdict =
    diff == null ? null
    : diff <= -10 ? { tone: "warn" as const, text: tt("soko.below", { n: -diff }) }
    : diff >= 10 ? { tone: "warn" as const, text: tt("soko.above", { n: diff }) }
    : { tone: "ok" as const, text: tt("soko.fairOk") };
  const valid = q > 0 && a > 0 && name.trim().length >= 2 && !!farm.county;

  const submit = async () => {
    setTried(true);
    if (!farm.county) return;
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      await sokoActions.list({ farmer_name: name.trim(), crop, county: farm.county, qty_kg: q, ask_per_kg: a });
      announce(tt("soko.posted"));
      onClose();
    } catch (e) {
      setError(tt(e instanceof ApiError && e.status === 400 ? "soko.errInvalid" : "soko.err"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("soko.title", { crop: cropName(lang, crop) })}
      testID="sheet-soko"
      footer={<Btn label={busy ? tt("soko.posting") : tt("soko.submit")} onPress={submit} disabled={busy} style={{ flex: 1 }} testID="soko-submit" />}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <CropCoin cropKey={crop} size={40} />
        <Text style={{ flex: 1, color: t.dim, ...T.body }}>{tt("soko.intro")}</Text>
      </View>

      {!farm.county ? (
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: t.raised, gap: 10 }}>
          <Text style={{ color: t.ink, ...T.body, fontWeight: "600" }}>{tt("soko.needCounty")}</Text>
          <Btn kind="secondary" small label={tt("wx.chooseCounty")} onPress={onNeedCounty} style={{ alignSelf: "flex-start" }} testID="soko-county" />
        </View>
      ) : (
        <Text style={{ color: t.dim, ...T.meta }}>{tt("soko.county", { county: farm.county })}</Text>
      )}

      {!profile && (
        <Field
          label={tt("name.label")}
          glyph={null}
          value={name}
          onChangeText={setName}
          height={52}
          inputStyle={{ fontSize: 16 }}
          error={tried && name.trim().length < 2}
          status={tried && name.trim().length < 2 ? { kind: "error", text: tt("name.err") } : null}
          statusMinHeight={0}
          inputProps={{ placeholder: tt("name.placeholder"), autoCapitalize: "words" }}
        />
      )}

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field
          style={{ flex: 1 }}
          label={tt("soko.qty")}
          glyph={null}
          value={kg}
          onChangeText={(v) => setKg(digits(v))}
          height={52}
          inputStyle={{ fontSize: 18, fontWeight: "700" }}
          error={tried && q <= 0}
          status={null}
          statusMinHeight={0}
          inputProps={{ keyboardType: "numeric", inputMode: "numeric", testID: "soko-qty" } as any}
        />
        <Field
          style={{ flex: 1 }}
          label={tt("soko.ask")}
          glyph={null}
          value={ask}
          onChangeText={(v) => setAsk(digits(v))}
          inputRef={askRef}
          height={52}
          inputStyle={{ fontSize: 18, fontWeight: "700" }}
          error={tried && a <= 0}
          status={null}
          statusMinHeight={0}
          inputProps={{ keyboardType: "numeric", inputMode: "numeric", testID: "soko-ask" } as any}
        />
      </View>

      <View style={{ gap: 8 }} aria-live="polite" accessibilityLiveRegion="polite">
        {fair ? <Text style={{ color: t.dim, ...T.meta }}>{tt("soko.fair", { p: fair })}</Text> : null}
        {verdict ? <Tag block label={verdict.text} tone={verdict.tone} /> : null}
        {q > 0 && a > 0 ? (
          <Text style={{ color: t.ink, fontSize: 17, lineHeight: 22, fontWeight: "800" }}>{tt("soko.total", { v: (q * a).toLocaleString("en-KE") })}</Text>
        ) : null}
      </View>

      {error ? (
        <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.alert }}>
          <Text style={{ color: t.ink, ...T.meta, fontWeight: "600" }}>{error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const TONE: Record<SokoStatus, "ok" | "warn" | "dim" | "water"> = { open: "water", claimed: "warn", delivered: "ok", cancelled: "dim" };

export function MyListings() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const mine = useMyListings();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { sokoActions.refresh().catch(() => {}); }, []);
  if (!mine.length) return null;

  const withdraw = async (id: string) => {
    setBusy(id);
    try { await sokoActions.cancel(id); setConfirm(null); } catch { /* offline: stays open, try later */ } finally { setBusy(null); }
  };

  return (
    <Card>
      <Eyebrow text={tt("soko.mine")} />
      {mine.map((l, i) => (
        <View key={l.id} style={{ paddingVertical: 10, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }} testID={`listing-${l.crop}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <CropCoin cropKey={l.crop} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>
                {cropName(lang, l.crop)} · {tt("soko.line", { qty: l.qty_kg.toLocaleString("en-KE"), ask: l.ask_per_kg })}
              </Text>
              <Text style={{ color: t.dim, ...T.meta }}>{tt("soko.listedOn", { date: dayMonth(lang, dateKey(new Date(l.created_at))) })}</Text>
            </View>
          </View>
          {confirm === l.id ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: t.ink, ...T.meta, fontWeight: "700" }}>{tt("soko.cancelAsk")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Btn kind="secondary" small label={tt("common.cancel")} onPress={() => setConfirm(null)} style={{ flex: 1 }} />
                <Btn kind="danger" small label={tt("soko.cancelYes")} onPress={() => withdraw(l.id)} disabled={busy === l.id} style={{ flex: 1 }} testID="soko-withdraw-yes" />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 44 }}>
              <View><Tag label={tt(`soko.status.${l.status}` as Key)} tone={TONE[l.status] ?? "dim"} /></View>
              {l.status === "open" ? (
                <Btn kind="ghost" small label={tt("soko.cancel")} onPress={() => setConfirm(l.id)} testID="soko-withdraw" />
              ) : l.status === "cancelled" || l.status === "delivered" ? (
                <Btn kind="ghost" small label={tt("soko.dismiss")} onPress={() => sokoActions.remove(l.id)} />
              ) : null}
            </View>
          )}
        </View>
      ))}
    </Card>
  );
}
