/**
 * "Will it pay?" (Je, italipa?): a season budget for one crop on the
 * farmer's land, at the farmer's own prices (remembered on the phone), with
 * the price and harvest that just cover the costs, an optional input-loan
 * interest, and the same land under each other crop. Logic: lib/budget.ts.
 */
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { focusRing, noOutline, webCursor, type PressState } from "../lib/ui";
import { cropName } from "../lib/prices";
import { useSentinel } from "../lib/sentinel";
import { CROPS, CROP_KEYS, type CropKey } from "../lib/agronomy";
import { DEFAULT_PRICES, TYPICAL_PRICE, budgetFor, compareCrops, type BudgetLine } from "../lib/budget";
import { acresText, farmActions, fmtMoney, useFarm } from "../lib/farm";
import type { CommodityFeed } from "../lib/api";
import type { Key } from "../lib/i18n";
import { Btn, Chip, ChipRow, Group, Sheet, Stepper, T } from "./Kit";
import { CropCoin } from "./ShambaPanel";
import Field from "./Field";
import { bagsLabel } from "../lib/postharvest";

const acresFmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""));

/** The board's average price for a crop (Soko's fair price), else a typical one. */
function sellPrice(feed: CommodityFeed | undefined, crop: CropKey): { p: number; board: boolean } {
  const c = feed?.commodities?.find((x) => x.crop === crop);
  if (c?.quotes?.length) return { p: Math.round(c.quotes.reduce((s, q) => s + q.price, 0) / c.quotes.length), board: true };
  return { p: TYPICAL_PRICE[crop], board: false };
}

function PriceInput({ value, onChange, onDone, label, testID }: { value: string; onChange: (v: string) => void; onDone: () => void; label: string; testID?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(/[^\d.]/g, "").slice(0, 7))}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onDone(); }}
      onSubmitEditing={onDone}
      keyboardType="numeric"
      inputMode="decimal"
      accessibilityLabel={label}
      selectTextOnFocus
      testID={testID}
      style={[
        { width: 96, height: 44, borderWidth: 2, borderColor: focused ? t.accent : t.line, borderRadius: 10, paddingHorizontal: 10, backgroundColor: t.field, color: t.ink, fontSize: 16, fontWeight: "700" },
        noOutline,
      ]}
    />
  );
}

export function BudgetSheet({
  visible, onClose, crop: initialCrop, acres: initialAcres, onPlant,
}: { visible: boolean; onClose: () => void; crop?: CropKey; acres?: number; onPlant?: (c: CropKey) => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const { meta } = useSentinel();
  const feed = meta?.commodity_feed;
  const [crop, setCrop] = useState<CropKey>("maize");
  const [acres, setAcres] = useState(1);
  const [level, setLevel] = useState<0 | 1>(0);
  const [sell, setSell] = useState("");
  const [interest, setInterest] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    const c = initialCrop ?? farm.plantings[0]?.crop ?? "maize";
    setCrop(c);
    setAcres(initialAcres ?? Math.min(farm.acres ?? 1, 50));
    setLevel(0);
    setSell(String(sellPrice(feed, c).p));
    setInterest(0);
    setEdits({});
  }, [visible]);

  const pick = (k: CropKey) => { setCrop(k); setSell(String(sellPrice(feed, k).p)); };

  // Remembered prices, overlaid with what is being typed now.
  const prices: Record<string, number> = { ...farm.prices };
  for (const [k, v] of Object.entries(edits)) {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n) && n >= 0) prices[k] = n;
  }
  const unit = (k: string) => edits[k] ?? String(prices[k] ?? DEFAULT_PRICES[k] ?? "");
  const commit = (k: string) => {
    const v = edits[k];
    if (v === undefined) return;
    const n = Number(v);
    farmActions.setPrice(k, v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null);
  };
  const close = () => { Object.keys(edits).forEach(commit); onClose(); };

  const p = Number(sell);
  const board = sellPrice(feed, crop);
  const b = budgetFor(crop, acres, { prices, level, pricePerKg: p, interestPct: interest });
  const cmp = compareCrops(acres, { prices, level, interestPct: interest, priceOf: (c) => (c === crop && p > 0 ? p : sellPrice(feed, c).p) });
  const loss = b.profit < 0;
  const yields = CROPS[crop].yieldPerAcre;

  const lineLabel = (l: BudgetLine) =>
    l.key === "seed" ? tt(l.unit === "seedlings" ? "bud.line.seedlings" : "bud.line.seed")
    : l.key === "interest" ? tt("bud.line.interest", { n: interest })
    : tt(`bud.line.${l.key}` as Key);
  const qtyText = (l: BudgetLine) =>
    l.unit === "kg" ? tt("bud.qty.kg", { n: (l.qty ?? 0).toLocaleString("en-KE") })
    : l.unit === "seedlings" ? tt("bud.qty.seedlings", { n: (l.qty ?? 0).toLocaleString("en-KE") })
    : l.unit === "bags" ? tt((l.qty ?? 0) <= 1 ? "store.bag" : "store.bags", { n: bagsLabel(l.qty ?? 0) })
    : acresText(tt, l.qty ?? 0);
  const perText = (l: BudgetLine) =>
    l.unit === "kg" ? tt("bud.per.kg") : l.unit === "seedlings" ? tt("bud.per.k") : l.unit === "bags" ? tt("bud.per.bag") : tt("bud.per.acre");

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={tt("bud.title")}
      testID="sheet-budget"
      footer={
        onPlant
          ? <Btn label={tt("bud.plant", { crop: cropName(lang, crop) })} onPress={() => { Object.keys(edits).forEach(commit); onPlant(crop); }} style={{ flex: 1 }} testID="bud-plant" />
          : <Btn label={tt("common.close")} onPress={close} style={{ flex: 1 }} />
      }
    >
      <Group label={tt("bud.crop")}>
        <ChipRow role="radiogroup" label={tt("bud.crop")}>
          {CROP_KEYS.map((k) => (
            <Chip key={k} role="radio" selected={k === crop} onPress={() => pick(k)} label={cropName(lang, k)} leading={<CropCoin cropKey={k} size={26} />} testID={`bud-crop-${k}`} />
          ))}
        </ChipRow>
      </Group>

      <Group label={tt("bud.acres")}>
        <Stepper value={acres} onChange={setAcres} step={0.25} min={0.25} max={100} format={acresFmt} label={tt("bud.acres")} />
      </Group>

      <Group label={tt("bud.level")}>
        <ChipRow role="radiogroup" label={tt("bud.level")}>
          <Chip role="radio" selected={level === 0} onPress={() => setLevel(0)} label={tt("bud.level0", { kg: yields[0].toLocaleString("en-KE") })} testID="bud-level-0" />
          <Chip role="radio" selected={level === 1} onPress={() => setLevel(1)} label={tt("bud.level1", { kg: yields[1].toLocaleString("en-KE") })} testID="bud-level-1" />
        </ChipRow>
      </Group>

      <Field
        label={tt("bud.sell")}
        glyph={null}
        value={sell}
        onChangeText={(v) => setSell(v.replace(/[^\d.]/g, "").slice(0, 7))}
        height={52}
        inputStyle={{ fontSize: 18, fontWeight: "700" }}
        status={{ kind: "note", text: board.board ? tt("bud.sellBoard", { p: board.p }) : tt("bud.sellTypical") }}
        statusMinHeight={0}
        inputProps={{ keyboardType: "numeric", inputMode: "decimal", testID: "bud-sell" } as any}
      />

      {/* The answer first, then what it is made of. */}
      <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 4 }} accessibilityLiveRegion="polite" aria-live="polite">
        <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 16, fontWeight: "700" }}>{tt(loss ? "bud.loss" : "bud.profit")}</Text>
        <Text style={{ color: loss ? t.alert : t.ok, fontSize: 28, lineHeight: 34, fontWeight: "800" }} testID="bud-profit">
          {loss ? "−" : ""}{fmtMoney(Math.abs(b.profit))}
        </Text>
        <Text style={{ color: t.ink, ...T.meta }}>{tt("bud.revenueLine", { kg: b.kg.toLocaleString("en-KE"), p: p > 0 ? p : 0, v: b.revenue.toLocaleString("en-KE") })}</Text>
        <Text style={{ color: t.ink, ...T.meta }}>{tt("bud.costLine", { v: b.cost.toLocaleString("en-KE") })}</Text>
        {b.breakEvenPrice != null && b.breakEvenKg != null ? (
          <Text style={{ color: t.ink, ...T.meta, fontWeight: "700", marginTop: 4 }} testID="bud-breakeven">
            {tt("bud.breakEven", { p: b.breakEvenPrice, kg: b.breakEvenKg.toLocaleString("en-KE") })}
          </Text>
        ) : null}
      </View>

      <Group label={tt("bud.costs")}>
        {b.lines.map((l) => (
          <View key={l.key} style={{ paddingVertical: 6, gap: 6, borderBottomWidth: 1, borderBottomColor: t.line }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{lineLabel(l)}</Text>
              <Text style={{ color: t.ink, fontFamily: "monospace", fontWeight: "700", fontSize: 14 }}>{fmtMoney(l.cost)}</Text>
            </View>
            {l.priceKey ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ color: t.dim, ...T.meta }}>{qtyText(l)} × KES</Text>
                <PriceInput
                  value={unit(l.priceKey)}
                  onChange={(v) => setEdits((e) => ({ ...e, [l.priceKey!]: v }))}
                  onDone={() => commit(l.priceKey!)}
                  label={`${lineLabel(l)}, KES ${perText(l)}`}
                  testID={`bud-price-${l.key}`}
                />
                <Text style={{ color: t.dim, ...T.meta }}>{perText(l)}</Text>
              </View>
            ) : null}
          </View>
        ))}
        <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("bud.note")}</Text>
      </Group>

      <Group label={tt("bud.interest")}>
        <Stepper value={interest} onChange={setInterest} step={1} min={0} max={40} format={(v) => `${v}%`} label={tt("bud.interest")} />
      </Group>

      <Group label={tt("bud.compare", { acres: acresText(tt, acres) })}>
        <View accessibilityRole="radiogroup" accessibilityLabel={tt("bud.compare", { acres: acresText(tt, acres) })}>
          {cmp.map((c) => {
            const sel = c.crop === crop;
            return (
              <Pressable
                key={c.crop}
                onPress={() => pick(c.crop)}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel, selected: sel }}
                aria-checked={sel}
                accessibilityLabel={`${cropName(lang, c.crop)}: ${c.profit < 0 ? tt("bud.loss") : tt("bud.profit")} ${fmtMoney(Math.abs(c.profit))}`}
                testID={`bud-cmp-${c.crop}`}
                style={({ pressed, hovered, focused }: PressState) => [
                  { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 },
                  (sel || hovered) && { backgroundColor: t.raised },
                  pressed && { opacity: 0.8 },
                  webCursor, focusRing(focused, t.accent),
                ]}
              >
                <CropCoin cropKey={c.crop} size={28} />
                <Text style={{ flex: 1, color: t.ink, ...T.body, fontWeight: sel ? "800" : "600" }}>{cropName(lang, c.crop)}</Text>
                <Text style={{ color: c.profit < 0 ? t.alert : t.ok, fontFamily: "monospace", fontWeight: "700", fontSize: 14 }}>
                  {c.profit < 0 ? "−" : "+"}{fmtMoney(Math.abs(c.profit))}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("bud.compareNote")}</Text>
      </Group>
    </Sheet>
  );
}
