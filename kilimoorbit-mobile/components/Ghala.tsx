/**
 * Ghala / the farm store: put a harvest into store, sell or use from it, keep
 * up the store checks, and see whether holding to sell later pays in a
 * typical year. Logic lives in lib/postharvest.ts; lots live with the farm
 * (lib/farm.ts), so a sale from store lands in the daftari in the same change.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import Text from "./Text";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import { bestQuote, cropName } from "../lib/prices";
import { useSentinel } from "../lib/sentinel";
import { CROPS } from "../lib/agronomy";
import { TYPICAL_PRICE } from "../lib/budget";
import { addDays, dayMonth, daysBetween, monthShort, todayKey } from "../lib/dates";
import { MONTHS, type Key, type Lang, type Vars } from "../lib/i18n";
import { farmActions, useFarm } from "../lib/farm";
import {
  STORE, STORE_CROPS, bagsLabel, bagsOf, checkKind, dueChecks, holdPlan, isStoreCrop, nextCheck,
  type DueCheck, type HoldPlan, type Lot, type StoreCrop,
} from "../lib/postharvest";
import { Btn, Card, CheckRow, Chip, ChipRow, Eyebrow, Group, Sheet, Stepper, T, Tag } from "./Kit";
import { CropCoin, DemoTag } from "./ShambaPanel";
import { DateNudge } from "./FarmSheets";
import { dueText } from "./TaskRows";
import Field from "./Field";
import Segmented from "./Segmented";
import { ArrowGlyph, CrossGlyph, PlusGlyph, BoxGlyph, CheckGlyph } from "./Glyphs";

type TT = (k: Key, v?: Vars) => string;

const kgText = (n: number) => `${Math.round(n).toLocaleString("en-KE")} kg`;
/** Estimates read as estimates: to the nearest 100 shillings (10 below 1,000). */
const approx = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10).toLocaleString("en-KE");
export const bagsText = (tt: TT, n: number) => tt(n <= 1 ? "store.bag" : "store.bags", { n: bagsLabel(n) });
const checkTitle = (tt: TT, lang: Lang, l: Lot) =>
  tt(`store.check.${checkKind(l)}` as Key, { crop: cropName(lang, l.crop).toLowerCase() });

/** Today's best board price for a crop, or null when it isn't on the board. */
function useBoardPrice(crop: string): number | null {
  const { meta } = useSentinel();
  return bestQuote(meta?.commodity_feed, crop)?.price ?? null;
}

/* ── Put a harvest into store ── */
export function StoreSheet({
  visible, onClose, crop: initialCrop, kg: suggestKg, acres,
}: { visible: boolean; onClose: () => void; crop?: StoreCrop; kg?: number; acres?: number }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [crop, setCrop] = useState<StoreCrop>("maize");
  const [bags, setBags] = useState(10);
  const [hermetic, setHermetic] = useState(true);
  const [since, setSince] = useState(todayKey());

  useEffect(() => {
    if (!visible) return;
    const c = initialCrop ?? "maize";
    setCrop(c);
    setBags(suggestKg ? Math.max(0.5, bagsOf(c, suggestKg)) : 10);
    setHermetic(STORE[c].hermeticOk);
    setSince(todayKey());
  }, [visible]);

  const spec = STORE[crop];
  const kg = Math.round(bags * spec.bagKg);
  const perAcre = acres ? Math.round(kg / acres) : null;
  const [lo, hi] = CROPS[crop].yieldPerAcre;
  const today = todayKey();

  const save = () => {
    farmActions.addLot({ crop, kg, since, hermetic: hermetic && spec.hermeticOk });
    announce(tt("store.added", { crop: cropName(lang, crop) }));
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("store.addTitle")}
      testID="sheet-store"
      footer={<Btn label={tt("store.save")} onPress={save} style={{ flex: 1 }} icon={(c) => <CheckGlyph size={15} color={c} />} testID="store-save" />}
    >
      <Group label={tt("store.crop")}>
        <ChipRow role="radiogroup" label={tt("store.crop")}>
          {STORE_CROPS.map((k) => (
            <Chip
              key={k}
              role="radio"
              selected={k === crop}
              onPress={() => { setCrop(k); setHermetic(STORE[k].hermeticOk); }}
              label={cropName(lang, k)}
              leading={<CropCoin cropKey={k} size={26} />}
              testID={`store-crop-${k}`}
            />
          ))}
        </ChipRow>
      </Group>

      <Group label={tt("store.howMany", { kg: spec.bagKg })}>
        <Stepper value={bags} onChange={setBags} step={0.5} min={0.5} max={5000} format={(v) => bagsText(tt, v)} label={tt("store.howMany", { kg: spec.bagKg })} />
        <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }} testID="store-kg">= {kgText(kg)}</Text>
        {perAcre != null && (
          <Tag
            block
            tone={perAcre >= lo ? "ok" : "warn"}
            label={tt("store.perAcre", { n: perAcre.toLocaleString("en-KE"), lo: lo.toLocaleString("en-KE"), hi: hi.toLocaleString("en-KE") })}
          />
        )}
      </Group>

      {spec.hermeticOk && (
        <Group label={tt("store.kind")}>
          <ChipRow role="radiogroup" label={tt("store.kind")}>
            <Chip role="radio" selected={hermetic} onPress={() => setHermetic(true)} label={tt("store.hermetic")} testID="store-hermetic" />
            <Chip role="radio" selected={!hermetic} onPress={() => setHermetic(false)} label={tt("store.open")} testID="store-open" />
          </ChipRow>
        </Group>
      )}

      <Group label={tt("store.sinceLabel")}>
        <ChipRow role="radiogroup" label={tt("store.sinceLabel")}>
          <Chip role="radio" selected={since === today} onPress={() => setSince(today)} label={tt("common.today")} />
          <Chip role="radio" selected={since === addDays(today, -1)} onPress={() => setSince(addDays(today, -1))} label={tt("common.yesterday")} />
        </ChipRow>
        <DateNudge value={since} onChange={(k) => setSince(k > today ? today : k)} label={tt("store.sinceLabel")} />
      </Group>

      <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 8 }}>
        <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{tt("store.tipsTitle")}</Text>
        {(crop === "potatoes" ? ["store.tip.cure", "store.tip.dark", "store.tip.rot"] : ["store.tip.dry", "store.tip.sort", "store.tip.pallets"]).map((k) => (
          <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.ok, marginTop: 8 }} />
            <Text style={{ flex: 1, color: t.ink, ...T.meta }}>{tt(k as Key)}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/* ── Sell or use from a lot ── */
export function LotSheet({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const board = useBoardPrice(lot?.crop ?? "");
  const [mode, setMode] = useState<"sold" | "used">("sold");
  const [bags, setBags] = useState(1);
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayKey());
  const [tried, setTried] = useState(false);

  const bagKg = lot ? STORE[lot.crop].bagKg : 90;
  // Up to the half bag that covers what is left, so the last few kilos can go too.
  const maxBags = lot ? Math.max(0.5, Math.ceil((lot.kg / bagKg) * 2) / 2) : 1;

  useEffect(() => {
    if (!lot) return;
    setMode("sold");
    setBags(Math.min(maxBags, 1));
    setPrice(String(board ?? TYPICAL_PRICE[lot.crop]));
    setDate(todayKey());
    setTried(false);
  }, [lot?.id]);

  if (!lot) return null;
  const kg = Math.min(lot.kg, Math.round(bags * bagKg));
  const p = Number(price);
  const validPrice = Number.isFinite(p) && p > 0 && p < 100000;
  const total = validPrice ? Math.round(kg * p) : 0;
  const today = todayKey();
  const name = cropName(lang, lot.crop);

  const save = () => {
    if (mode === "sold") {
      if (!validPrice) { setTried(true); return; }
      farmActions.sellFromStore(lot.id, kg, total, date, tt("store.fromStore"));
      announce(tt("store.sold", { crop: name }));
    } else {
      farmActions.takeFromLot(lot.id, kg);
      announce(tt("store.taken"));
    }
    onClose();
  };

  return (
    <Sheet
      visible={!!lot}
      onClose={onClose}
      title={tt("store.sellTitle", { crop: name })}
      testID="sheet-lot"
      footer={<Btn label={tt(mode === "sold" ? "store.sellSave" : "store.useSave")} onPress={save} style={{ flex: 1 }} testID="lot-save" />}
    >
      <Text style={{ color: t.dim, ...T.body }}>{tt("store.have", { bags: bagsText(tt, bagsOf(lot.crop, lot.kg)), kg: kgText(lot.kg) })}</Text>
      <Segmented
        accessibilityLabel={tt("store.sellTitle", { crop: name })}
        options={[{ value: "sold", label: tt("store.modeSold") }, { value: "used", label: tt("store.modeUsed") }]}
        value={mode}
        onChange={setMode}
      />
      <Group label={tt("store.howManyOut")}>
        <Stepper value={bags} onChange={setBags} step={0.5} min={0.5} max={maxBags} format={(v) => bagsText(tt, v)} label={tt("store.howManyOut")} />
        <ChipRow>
          <Chip label={tt("store.all", { kg: kgText(lot.kg) })} onPress={() => setBags(maxBags)} selected={kg === lot.kg} testID="lot-all" />
        </ChipRow>
        <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>= {kgText(kg)}</Text>
      </Group>
      {mode === "sold" ? (
        <>
          <Field
            label={tt("store.price")}
            glyph={null}
            value={price}
            onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, "").slice(0, 7))}
            height={52}
            inputStyle={{ fontSize: 18, fontWeight: "700" }}
            error={tried && !validPrice}
            status={tried && !validPrice ? { kind: "error", text: tt("store.priceErr") } : validPrice ? { kind: "note", text: tt("store.total", { v: total.toLocaleString("en-KE") }) } : null}
            statusMinHeight={0}
            inputProps={{ keyboardType: "numeric", inputMode: "decimal", testID: "lot-price" } as any}
          />
          <Group label={tt("rec.date")}>
            <ChipRow role="radiogroup" label={tt("rec.date")}>
              <Chip role="radio" selected={date === today} onPress={() => setDate(today)} label={tt("common.today")} />
              <Chip role="radio" selected={date === addDays(today, -1)} onPress={() => setDate(addDays(today, -1))} label={tt("common.yesterday")} />
            </ChipRow>
            <DateNudge value={date} onChange={(k) => setDate(k > today ? today : k)} label={tt("rec.date")} />
          </Group>
          <Text style={{ color: t.dim, ...T.meta }}>{tt("store.toRecords")}</Text>
        </>
      ) : (
        <Text style={{ color: t.dim, ...T.meta }}>{tt("store.usedNote")}</Text>
      )}
    </Sheet>
  );
}

/* ── Shamba: what is in store ── */
function holdLine(tt: TT, lang: Lang, plan: HoldPlan) {
  return plan.worthIt
    ? tt("store.holdYes", { month: MONTHS[lang][plan.best.month], gain: approx(plan.best.gain) })
    : tt("store.holdNo");
}

function LotRow({ lot, last, onSell }: { lot: Lot; last: boolean; onSell: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const board = useBoardPrice(lot.crop);
  const [confirm, setConfirm] = useState(false);
  const today = todayKey();
  const plan = board ? holdPlan(lot.crop, lot.kg, board, new Date().getMonth(), lot.hermetic) : null;
  const due = nextCheck(lot);
  const inDays = daysBetween(today, due);
  const name = cropName(lang, lot.crop);
  const kind = lot.crop === "potatoes" ? "" : ` · ${tt(lot.hermetic ? "store.hermetic" : "store.open")}`;

  return (
    <View style={{ paddingVertical: 10, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }} testID={`lot-${lot.crop}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <CropCoin cropKey={lot.crop} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{name} · {bagsText(tt, bagsOf(lot.crop, lot.kg))}</Text>
          <Text style={{ color: t.dim, ...T.meta }}>{kgText(lot.kg)} · {tt("store.since", { date: dayMonth(lang, lot.since) })}{kind}</Text>
        </View>
        <Btn kind="secondary" small label={tt("store.sell")} onPress={onSell} testID={`lot-sell-${lot.crop}`} />
      </View>
      {plan ? <Tag block tone={plan.worthIt ? "ok" : "dim"} label={holdLine(tt, lang, plan)} /> : null}
      {inDays <= 2 ? (
        <CheckRow
          checked={false}
          onToggle={() => { farmActions.setChecked(lot.id, today); announce(tt("store.checkedSaved")); }}
          title={checkTitle(tt, lang, lot)}
          meta={dueText(tt, inDays)}
          metaTone={inDays < 0 ? "late" : "soon"}
          testID={`lot-check-${lot.crop}`}
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {inDays > 2 ? <Text style={{ flex: 1, color: t.dim, ...T.meta }}>{tt("store.nextCheck", { date: dayMonth(lang, due) })}</Text> : <View style={{ flex: 1 }} />}
        <Btn
          kind="ghost"
          small
          label={tt("store.when")}
          onPress={() => router.navigate({ pathname: "/masoko", params: { crop: lot.crop } })}
          icon={(c) => <ArrowGlyph size={13} color={c} />}
          style={{ flexDirection: "row-reverse" }}
        />
        <Pressable
          onPress={() => setConfirm((c) => !c)}
          accessibilityRole="button"
          accessibilityLabel={tt("store.remove", { crop: name })}
          accessibilityState={{ expanded: confirm }}
          style={({ pressed, hovered, focused }: PressState) => [
            { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
            (hovered || pressed || confirm) && { backgroundColor: t.raised },
            webCursor, focusRing(focused, t.accent),
          ]}
        >
          <CrossGlyph size={12} color={t.dim} />
        </Pressable>
      </View>
      {confirm && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.ink, ...T.meta, fontWeight: "700" }}>{tt("store.removeAsk", { crop: name })}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn kind="secondary" small label={tt("common.cancel")} onPress={() => setConfirm(false)} style={{ flex: 1 }} />
            <Btn kind="danger" small label={tt("store.removeYes")} onPress={() => farmActions.removeLot(lot.id)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </View>
  );
}

export function StoreCard({ onAdd, onSell }: { onAdd: () => void; onSell: (l: Lot) => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { farm } = useFarm();
  const lots = farm.store;
  return (
    <Card>
      <Eyebrow domain="store" icon={(c) => <BoxGlyph size={15} color={c} />} text={tt("store.eyebrow")} />
      {lots.length === 0 ? (
        <>
          <Text style={{ color: t.ink, ...T.body }}>{tt("store.emptyBody")}</Text>
          <Btn kind="secondary" label={tt("store.add")} onPress={onAdd} icon={(c) => <PlusGlyph size={14} color={c} />} style={{ marginTop: 12 }} testID="store-add" />
        </>
      ) : (
        <>
          {lots.map((l, i) => <LotRow key={l.id} lot={l} last={i === lots.length - 1} onSell={() => onSell(l)} />)}
          <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17, marginTop: 4 }}>{tt("store.typicalNote")}</Text>
          <Btn kind="ghost" small label={tt("store.add")} onPress={onAdd} icon={(c) => <PlusGlyph size={13} color={c} />} style={{ alignSelf: "flex-start", marginTop: 4 }} testID="store-add" />
        </>
      )}
    </Card>
  );
}

/* ── Today: store checks due ── */
export function StoreRows() {
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const today = todayKey();
  // Ticked on this visit: kept, struck through, with the previous check date for undo.
  const [ticked, setTicked] = useState<{ c: DueCheck; prev?: string }[]>([]);
  useFocusEffect(useCallback(() => () => setTicked([]), []));
  const open = dueChecks(farm.store, today, 1);
  const shown = [...ticked.map((x) => x.c), ...open.filter((c) => !ticked.some((x) => x.c.lot.id === c.lot.id))]
    .sort((a, b) => a.inDays - b.inDays);
  if (!shown.length) return null;
  return (
    <View>
      {shown.map((c) => {
        const done = ticked.some((x) => x.c.lot.id === c.lot.id);
        const toggle = () => {
          if (done) {
            const x = ticked.find((y) => y.c.lot.id === c.lot.id)!;
            farmActions.setChecked(c.lot.id, x.prev);
            setTicked((s) => s.filter((y) => y.c.lot.id !== c.lot.id));
            return;
          }
          setTicked((s) => [...s, { c, prev: c.lot.checked }]);
          farmActions.setChecked(c.lot.id, today);
          announce(tt("store.checkedSaved"));
        };
        return (
          <CheckRow
            key={c.lot.id}
            testID={`store-check-${c.lot.crop}`}
            checked={done}
            onToggle={toggle}
            title={checkTitle(tt, lang, c.lot)}
            meta={`${dueText(tt, c.inDays)} · ${tt("store.short")}`}
            metaTone={c.inDays < 0 ? "late" : c.inDays <= 1 ? "soon" : undefined}
            leading={<CropCoin cropKey={c.lot.crop} size={30} />}
          />
        );
      })}
    </View>
  );
}

/* ── Masoko: sell now or store? ── */
function HoldBars({ plan }: { plan: HoldPlan }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const prices = plan.months.map((m) => m.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const h = (p: number) => 18 + (hi > lo ? ((p - lo) / (hi - lo)) * 46 : 23);
  const summary = plan.months.map((m) => `${MONTHS[lang][m.month]} ${m.price}`).join(", ");
  return (
    <View
      accessible
      accessibilityLabel={tt("hold.barsA11y", { list: summary })}
      style={{ marginTop: 14, gap: 6 }}
      testID="hold-bars"
    >
      <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("hold.bars")}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 96 }}>
        {plan.months.map((m) => {
          const best = plan.worthIt && m.k === plan.best.k;
          const now = m.k === 0;
          return (
            <View key={m.k} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <Text style={{ color: best ? t.accent : t.dim, fontSize: 11.5, lineHeight: 14, fontWeight: "700" }}>{m.price}</Text>
              <View style={{ width: "100%", maxWidth: 34, height: h(m.price), borderRadius: 6, backgroundColor: best ? t.accent : now ? t.dim : t.raised, borderWidth: now || best ? 0 : 1, borderColor: t.line }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {plan.months.map((m) => (
          <Text key={m.k} style={{ flex: 1, textAlign: "center", color: m.k === 0 ? t.ink : t.dim, fontSize: 11.5, lineHeight: 14, fontWeight: m.k === 0 ? "800" : "600" }}>
            {m.k === 0 ? tt("hold.now") : monthShort(lang, m.month)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function HoldCard({ crop, qtyKg, demo }: { crop: string; qtyKg: number; demo: boolean }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const price = useBoardPrice(crop);
  const mine = farm.store.filter((l) => l.crop === crop);
  const [hermetic, setHermetic] = useState(true);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setHermetic(mine.length ? mine.some((l) => l.hermetic) : true); }, [crop]);
  if (!isStoreCrop(crop) || !price) return null;

  const inStore = mine.reduce((s, l) => s + l.kg, 0);
  const kg = inStore || qtyKg;
  const spec = STORE[crop];
  const herm = hermetic && spec.hermeticOk;
  const month = new Date().getMonth();
  const plan = holdPlan(crop, kg, price, month, herm);
  if (!plan) return null;
  const alt = !herm && spec.hermeticOk && !plan.worthIt ? holdPlan(crop, kg, price, month, true) : null;
  const best = plan.best;
  // "Falling" only when no later month beats today's price; otherwise storage losses are what eat the gain.
  const falling = Math.max(...plan.months.slice(1).map((m) => m.price)) <= plan.months[0].price;

  return (
    <Card>
      <Eyebrow domain="store" icon={(c) => <BoxGlyph size={15} color={c} />} text={tt("hold.eyebrow", { crop: cropName(lang, crop).toUpperCase() })} right={demo ? <DemoTag /> : null} />
      {inStore > 0 && <Text style={{ color: t.dim, ...T.meta, marginTop: -6, marginBottom: 8 }}>{tt("hold.mine", { kg: inStore.toLocaleString("en-KE") })}</Text>}
      <Text style={{ color: plan.worthIt ? t.ok : t.ink, ...T.title }} testID="hold-verdict">
        {plan.worthIt ? tt("hold.yes", { month: MONTHS[lang][best.month], gain: approx(best.gain) }) : tt("hold.no")}
      </Text>
      <Text style={{ color: t.ink, ...T.meta, marginTop: 4 }}>
        {plan.worthIt
          ? tt("hold.detail", {
              kg: kg.toLocaleString("en-KE"), p: plan.months[0].price, v0: plan.months[0].value.toLocaleString("en-KE"),
              month: MONTHS[lang][best.month], p2: best.price, loss: plan.lossPct, v: approx(best.value),
            })
          : tt(falling ? "hold.falling" : "hold.flat")}
      </Text>
      {alt?.worthIt ? (
        <View style={{ marginTop: 10 }}>
          <Tag block tone="warn" label={tt("hold.altHermetic", { gain: approx(alt.best.gain), month: MONTHS[lang][alt.best.month] })} />
        </View>
      ) : null}

      <HoldBars plan={plan} />

      {spec.hermeticOk && (
        <View style={{ marginTop: 14 }}>
          <ChipRow role="radiogroup" label={tt("store.kind")}>
            <Chip role="radio" selected={hermetic} onPress={() => setHermetic(true)} label={tt("store.hermetic")} testID="hold-hermetic" />
            <Chip role="radio" selected={!hermetic} onPress={() => setHermetic(false)} label={tt("store.open")} testID="hold-open" />
          </ChipRow>
        </View>
      )}
      <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17, marginTop: 12 }}>{tt("hold.note")}</Text>
      {inStore === 0 && (
        <Btn kind="ghost" small label={tt("hold.track")} onPress={() => setAdding(true)} icon={(c) => <PlusGlyph size={13} color={c} />} style={{ alignSelf: "flex-start", marginTop: 6 }} testID="hold-track" />
      )}
      <StoreSheet visible={adding} onClose={() => setAdding(false)} crop={crop} kg={qtyKg} />
    </Card>
  );
}
