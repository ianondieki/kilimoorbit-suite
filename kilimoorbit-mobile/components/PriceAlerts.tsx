/**
 * Price alerts UI: set a target for a crop from Markets; Today shows the ones
 * the board has reached. In-app only (said plainly in the sheet).
 */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import { cropName } from "../lib/prices";
import { alertActions, useAlerts } from "../lib/alerts";
import { alertHits, suggestTarget } from "../lib/pricewatch";
import { useSentinel } from "../lib/sentinel";
import type { Commodity } from "../lib/api";
import { Btn, Card, Eyebrow, Group, Sheet, Stepper, T } from "./Kit";
import { CropCoin } from "./ShambaPanel";
import { ArrowGlyph, CrossGlyph } from "./Glyphs";

const bestOf = (c: Commodity) => c.quotes.reduce((m, q) => (q.price > m.price ? q : m));

function AlertSheet({ visible, onClose, c }: { visible: boolean; onClose: () => void; c: Commodity }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const alerts = useAlerts();
  const best = bestOf(c);
  const [target, setTarget] = useState(suggestTarget(best.price));
  useEffect(() => {
    if (!visible) return;
    setTarget(alerts.find((a) => a.crop === c.crop)?.target ?? suggestTarget(best.price));
  }, [visible]);
  const save = () => { alertActions.set(c.crop, target); announce(tt("alert.saved")); onClose(); };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("alert.title", { crop: cropName(lang, c.crop) })}
      testID="sheet-alert"
      footer={<Btn label={tt("alert.save")} onPress={save} style={{ flex: 1 }} testID="alert-save" />}
    >
      <Text style={{ color: t.dim, ...T.body }}>{tt("alert.now", { p: best.price, market: best.market })}</Text>
      <Group label={tt("alert.target")}>
        <Stepper value={target} onChange={setTarget} step={1} min={1} max={10000} format={(v) => `KES ${v}`} label={tt("alert.target")} />
      </Group>
      <Text style={{ color: t.dim, ...T.meta }}>{tt("alert.body")}</Text>
    </Sheet>
  );
}

/** Markets: the crop's alert status, or the button to set one. */
export function AlertRow({ c }: { c: Commodity }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const mine = alerts.find((a) => a.crop === c.crop);
  const best = bestOf(c);
  return (
    <View style={{ marginTop: 8 }}>
      {mine ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }} testID="alert-status">
          <Text style={{ flex: 1, minWidth: 180, color: best.price >= mine.target ? t.ok : t.ink, ...T.meta, fontWeight: "700" }}>
            {tt("alert.set", { p: mine.target, b: best.price })}
          </Text>
          <Btn kind="ghost" small label={tt("alert.remove")} onPress={() => alertActions.remove(mine.id)} icon={(col) => <CrossGlyph size={11} color={col} />} testID="alert-remove" />
        </View>
      ) : (
        <Btn kind="ghost" small label={tt("alert.cta")} onPress={() => setOpen(true)} style={{ alignSelf: "flex-start" }} testID="alert-open" />
      )}
      <AlertSheet visible={open} onClose={() => setOpen(false)} c={c} />
    </View>
  );
}

/** Today: alerts the board has reached. Nothing when none have. */
export function AlertsCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const alerts = useAlerts();
  const { meta } = useSentinel();
  const hits = alertHits(alerts, meta?.commodity_feed);
  if (!hits.length) return null;
  return (
    <Card tone="accent">
      <Eyebrow text={tt("alert.eyebrow")} />
      {hits.map((h) => (
        <View key={h.alert.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 }} testID={`alert-hit-${h.alert.crop}`}>
          <CropCoin cropKey={h.alert.crop} size={30} />
          <Text style={{ flex: 1, color: t.ink, ...T.body, fontWeight: "600" }}>
            {tt("alert.hit", { crop: cropName(lang, h.alert.crop), p: h.price, market: h.market, target: h.alert.target })}
          </Text>
          <Pressable
            onPress={() => alertActions.remove(h.alert.id)}
            accessibilityRole="button"
            accessibilityLabel={`${tt("alert.remove")}: ${cropName(lang, h.alert.crop)}`}
            style={({ pressed, hovered, focused }: PressState) => [
              { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
              (hovered || pressed) && { backgroundColor: t.raised },
              webCursor, focusRing(focused, t.accent),
            ]}
          >
            <CrossGlyph size={12} color={t.dim} />
          </Pressable>
        </View>
      ))}
      <Btn kind="secondary" small label={tt("alert.markets")} onPress={() => router.navigate("/masoko")} icon={(col) => <ArrowGlyph size={14} color={col} />} style={{ marginTop: 6, alignSelf: "flex-start" }} />
    </Card>
  );
}
