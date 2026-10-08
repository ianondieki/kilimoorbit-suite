/**
 * Fish farming (samaki): the farmer's ponds with today's feed, the projected
 * harvest and its worth, the pond's next jobs, weighings and losses, where to
 * get fingerlings (the nursery agent's hatcheries), what to do when fish look
 * sick, and the harvest sale into Records. Logic in lib/aquaculture.ts.
 */
import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import Text from "./Text";
import Field from "./Field";
import Icon from "./Icon";
import { Btn, Card, CheckRow, Chip, ChipRow, Empty, Eyebrow, Group, Sheet, Stepper, T, Tag, tint } from "./Kit";
import { PlanSheet } from "./Nurseries";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { useFarm, farmActions, fmtMoney } from "../lib/farm";
import { fishActions, useFish } from "../lib/fish";
import {
  FEED_PELLET, FISH_PROBLEMS, FISH_SPECIES, POND_KINDS, POND_PREP, SPECIES_INFO, anchorOf, feedToday, harvestPlan, pondTasks, stockingFor,
  type FishSpecies, type Pond, type PondKind,
} from "../lib/aquaculture";
import { pick } from "../lib/agronomy";
import { addDays, dayMonth, daysBetween, todayKey } from "../lib/dates";
import { haptic } from "../lib/haptics";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import type { Key } from "../lib/i18n";

const kg1 = (n: number) => (n < 10 ? (Math.round(n * 10) / 10).toLocaleString("en-KE") : Math.round(n).toLocaleString("en-KE"));

export function FishSection() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { fish } = useFish();
  const { farm } = useFarm();
  const [adding, setAdding] = useState(false);
  const [entry, setEntry] = useState<{ pond: Pond; kind: "weigh" | "loss" | "sale" } | null>(null);
  const [finding, setFinding] = useState<Pond | null | "new">(null);
  const county = farm.county ?? "Nakuru";

  return (
    <View style={{ gap: 14 }} testID="fish-section">
      {fish.ponds.length === 0 ? (
        <Card>
          <Empty
            glyph={<View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tint(t.water, 0.16), alignItems: "center", justifyContent: "center" }}><Icon name="fish" size={30} color={t.water} /></View>}
            title={tt("fs.empty.title")}
            body={tt("fs.empty.body")}
            action={<Btn label={tt("fs.add")} onPress={() => setAdding(true)} icon={(c) => <Icon name="plus" size={18} color={c} />} testID="fish-add" />}
          />
        </Card>
      ) : (
        <>
          {fish.ponds.map((p) => (
            <PondCard key={p.id} pond={p} onWeigh={() => setEntry({ pond: p, kind: "weigh" })} onLoss={() => setEntry({ pond: p, kind: "loss" })}
              onSell={() => setEntry({ pond: p, kind: "sale" })} onFind={() => setFinding(p)} />
          ))}
          <Btn kind="secondary" label={tt("fs.add")} onPress={() => setAdding(true)} icon={(c) => <Icon name="plus" size={18} color={c} />} testID="fish-add" />
        </>
      )}
      <PrepCard onFind={() => setFinding("new")} />
      <HealthCard />
      <AddPondSheet visible={adding} onClose={() => setAdding(false)} />
      <EntrySheet entry={entry} onClose={() => setEntry(null)} />
      <PlanSheet visible={finding !== null} onClose={() => setFinding(null)} need="fingerlings" county={county} acres={1} fix={null}
        pondM2={finding && finding !== "new" ? finding.areaM2 : 300} />
    </View>
  );
}

function PondCard({ pond, onWeigh, onLoss, onSell, onFind }: { pond: Pond; onWeigh: () => void; onLoss: () => void; onSell: () => void; onFind: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { fish } = useFish();
  const today = todayKey();
  const price = fish.prices[pond.species] ?? SPECIES_INFO[pond.species].price;
  const f = feedToday(pond, fish.samples, fish.losses, today);
  const h = harvestPlan(pond, fish.samples, fish.losses, today, price);
  const a = anchorOf(pond, fish.samples, today);
  const tasks = useMemo(() => pondTasks(pond, fish.samples, fish.losses, today).slice(0, 3), [pond, fish.samples, fish.losses, today]);
  const day = Math.max(0, daysBetween(pond.stocked, today));
  return (
    <Card>
      <Eyebrow domain="weather" icon={(c) => <Icon name="fish" size={17} color={c} />} text={`${tt(`fs.species.${pond.species}` as Key)} · ${tt(`fs.kind.${pond.kind}` as Key)} · ${pond.areaM2} m²`} />
      <View style={{ gap: 12 }} testID={`pond-${pond.id}`}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, ...T.headline }}>{pond.name}</Text>
            <Text style={{ color: t.dim, ...T.meta }}>{tt("fs.age", { d: day, g: Math.round(f.g) })}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: t.ink, fontSize: 18, lineHeight: 22, fontWeight: "800" }}>{tt("fs.alive", { n: f.alive.toLocaleString("en-KE") })}</Text>
            <Text style={{ color: t.dim, ...T.meta }}>{tt("fs.biomass", { kg: kg1(f.biomassKg) })}</Text>
          </View>
        </View>
        <Text style={{ color: t.dim, ...T.meta }} testID="pond-anchor">{a.sampled ? tt("fs.sampled", { date: dayMonth(lang, a.date), g: a.g }) : tt("fs.projected")}</Text>

        <View style={{ borderRadius: 14, padding: 12, gap: 6, backgroundColor: tint(t.water, 0.1), borderWidth: 1, borderColor: tint(t.water, 0.25) }} testID="pond-feed">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="silverware-fork-knife" size={16} color={t.water} />
            <Text style={{ color: t.water, fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{tt("fs.feed.title")}</Text>
          </View>
          <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>
            {tt("fs.feed.body", { kg: kg1(f.kgPerDay), pellet: pick(lang, FEED_PELLET[f.stage]), protein: f.protein, meals: f.meals })}
          </Text>
          <Text style={{ color: t.dim, ...T.meta }}>{tt("fs.feed.tip")}</Text>
        </View>

        <View style={{ borderRadius: 14, padding: 12, gap: 6, backgroundColor: tint(t.ok, 0.08), borderWidth: 1, borderColor: tint(t.ok, 0.22) }} testID="pond-harvest">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="basket-outline" size={16} color={t.ok} />
            <Text style={{ color: t.ok, fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{tt("fs.harvest.title")}</Text>
          </View>
          <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>
            {h.reached ? tt("fs.harvest.ready", { kg: h.kg.toLocaleString("en-KE"), value: fmtMoney(h.value) })
              : tt("fs.harvest.body", { date: dayMonth(lang, h.date), days: h.daysLeft, kg: h.kg.toLocaleString("en-KE"), value: fmtMoney(h.value), price })}
          </Text>
          {!h.reached && <Text style={{ color: t.dim, ...T.meta }}>{tt("fs.harvest.feed", { kg: h.feedKg.toLocaleString("en-KE"), bags: h.bags })}{h.fcr ? ` · ${tt("fs.harvest.fcr", { fcr: h.fcr })}` : ""}</Text>}
          <Text style={{ color: t.dim, ...T.meta }}>{tt("fs.harvest.loss")}</Text>
          <Stepper label={tt("fs.price")} value={price} onChange={(v) => fishActions.setPrice(pond.species, v)} step={10} min={50} max={1500} format={(v) => `KES ${v}`} />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{tt("fs.tasks")}</Text>
          {tasks.map((x) => {
            const late = x.due < today;
            return (
              <CheckRow key={x.id} checked={!!fish.done[`${pond.id}:${x.id}`]} onToggle={() => fishActions.toggleDone(pond.id, x.id)}
                title={pick(lang, x.title).replace(`${pond.name}: `, "")} meta={x.due === today ? tt("common.today") : dayMonth(lang, x.due)} metaTone={late ? "late" : x.due <= addDays(today, 3) ? "soon" : undefined}
                testID={`pond-task-${x.kind}`} />
            );
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Btn small kind="secondary" label={tt("fs.weigh")} onPress={onWeigh} icon={(c) => <Icon name="scale" size={16} color={c} />} testID="pond-weigh" />
          <Btn small kind="secondary" label={tt("fs.loss")} onPress={onLoss} icon={(c) => <Icon name="minus-circle-outline" size={16} color={c} />} testID="pond-loss" />
          <Btn small kind="secondary" label={tt("fs.fingerlingsFind")} onPress={onFind} icon={(c) => <Icon name="map-search-outline" size={16} color={c} />} testID="pond-find" />
          <Btn small label={tt("fs.sell")} onPress={onSell} icon={(c) => <Icon name="cash-plus" size={16} color={c} />} testID="pond-sell" />
        </View>
        <Text style={{ color: t.dim, ...T.meta }}>{tt("fs.estimate")}</Text>
      </View>
    </Card>
  );
}

function PrepCard({ onFind }: { onFind: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ focused }: PressState) => [{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }, webCursor, focusRing(focused, t.accent)]} testID="fish-prep-toggle">
        <Icon name="clipboard-list-outline" size={20} color={t.water} />
        <Text style={{ color: t.ink, ...T.title, flex: 1 }}>{tt("fs.prep")}</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={22} color={t.dim} />
      </Pressable>
      {open && (
        <View style={{ gap: 10, marginTop: 6 }} testID="fish-prep">
          {POND_PREP.map((s, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: tint(t.water, 0.16), alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.water, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
              </View>
              <Text style={{ color: t.ink, ...T.body, flex: 1 }}>{pick(lang, s)}</Text>
            </View>
          ))}
          <Btn kind="secondary" label={tt("fs.fingerlingsFind")} onPress={onFind} icon={(c) => <Icon name="map-search-outline" size={18} color={c} />} testID="fish-find" />
        </View>
      )}
    </Card>
  );
}

function HealthCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <Eyebrow domain="doctor" icon={(c) => <Icon name="medical-bag" size={17} color={c} />} text={tt("fs.health")} />
      <View style={{ gap: 8 }} testID="fish-health">
        {FISH_PROBLEMS.map((p) => {
          const on = open === p.id;
          return (
            <View key={p.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: on ? t.alert : t.line, backgroundColor: on ? tint(t.alert, 0.06) : t.raised }}>
              <Pressable onPress={() => setOpen(on ? null : p.id)} accessibilityRole="button" accessibilityState={{ expanded: on }}
                style={({ focused }: PressState) => [{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minHeight: 48 }, webCursor, focusRing(focused, t.accent)]} testID={`fish-problem-${p.id}`}>
                <Icon name={p.urgent ? "alert-circle-outline" : "information-outline"} size={20} color={p.urgent ? t.alert : t.dim} />
                <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700", flex: 1 }}>{pick(lang, p.sign)}</Text>
                <Icon name={on ? "chevron-up" : "chevron-down"} size={20} color={t.dim} />
              </Pressable>
              {on && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
                  <Text style={{ color: t.dim, ...T.body }}>{pick(lang, p.cause)}</Text>
                  <Tag block tone={p.urgent ? "warn" : "ok"} label={`${tt("fs.health.do")}: ${pick(lang, p.act)}`} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function AddPondSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { fish } = useFish();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<FishSpecies>("tilapia");
  const [kind, setKind] = useState<PondKind>("earthen");
  const [area, setArea] = useState("300");
  const [ago, setAgo] = useState(0);
  const [count, setCount] = useState("");
  const [tried, setTried] = useState(false);
  const areaN = Number(area);
  const areaOk = Number.isFinite(areaN) && areaN >= 1 && areaN <= 100000;
  const suggested = areaOk ? stockingFor(species, kind, areaN) : 0;
  const countN = count ? Number(count) : suggested;
  const countOk = Number.isInteger(countN) && countN >= 1 && countN <= 1000000;
  const save = () => {
    setTried(true);
    if (!areaOk || !countOk) { haptic.warn(); return; }
    fishActions.addPond({ name: name.trim() || `${tt("fs.namePh").replace(/^(mf\.|e\.g\.)\s*/, "").replace(/\d+$/, "")}${fish.ponds.length + 1}`, species, kind, areaM2: Math.round(areaN), stocked: addDays(todayKey(), -ago), fingerlings: countN, startG: 5 });
    haptic.success(); announce(tt("fs.save"));
    setName(""); setCount(""); setAgo(0); setTried(false);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={tt("fs.add")} testID="sheet-pond"
      footer={<Btn label={tt("fs.save")} onPress={save} icon={(c) => <Icon name="check" size={18} color={c} />} testID="pond-save" />}>
      <View style={{ gap: 12 }}>
        <Field label={tt("fs.name")} glyph={null} value={name} onChangeText={(v) => setName(v.slice(0, 40))} height={52} inputStyle={{ fontSize: 16 }} status={null} statusMinHeight={0}
          inputProps={{ placeholder: tt("fs.namePh"), testID: "pond-name" } as any} />
        <Group label={tt("fs.species")}>
          <ChipRow role="radiogroup" label={tt("fs.species")}>
            {FISH_SPECIES.map((s) => <Chip key={s} role="radio" label={tt(`fs.species.${s}` as Key)} selected={species === s} onPress={() => setSpecies(s)} testID={`pond-species-${s}`} />)}
          </ChipRow>
        </Group>
        <Group label={tt("fs.kind")}>
          <ChipRow role="radiogroup" label={tt("fs.kind")}>
            {POND_KINDS.map((k) => <Chip key={k} role="radio" label={tt(`fs.kind.${k}` as Key)} selected={kind === k} onPress={() => setKind(k)} testID={`pond-kind-${k}`} />)}
          </ChipRow>
        </Group>
        <Field label={tt("fs.area")} glyph={null} value={area} onChangeText={(v) => setArea(v.replace(/[^\d.]/g, "").slice(0, 7))} height={52} inputStyle={{ fontSize: 16 }}
          error={tried && !areaOk} status={null} statusMinHeight={0} inputProps={{ keyboardType: "decimal-pad", testID: "pond-area" } as any} />
        <Stepper label={tt("fs.stockedAgo")} value={ago} onChange={setAgo} step={7} min={0} max={364} format={(v) => (v === 0 ? tt("common.today") : `${v}`)} />
        <Field label={tt("fs.fingerlings")} glyph={null} value={count} onChangeText={(v) => setCount(v.replace(/\D/g, "").slice(0, 7))} height={52} inputStyle={{ fontSize: 16 }}
          error={tried && !countOk}
          status={areaOk ? { kind: "note", text: tt("fs.suggest", { n: suggested.toLocaleString("en-KE"), d: SPECIES_INFO[species].density[kind] }) } : null} statusMinHeight={0}
          inputProps={{ keyboardType: "number-pad", placeholder: suggested ? String(suggested) : "", testID: "pond-count" } as any} />
      </View>
    </Sheet>
  );
}

function EntrySheet({ entry, onClose }: { entry: { pond: Pond; kind: "weigh" | "loss" | "sale" } | null; onClose: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { fish } = useFish();
  const [value, setValue] = useState("");
  const [amount, setAmount] = useState("");
  const kind = entry?.kind;
  const n = Number(value);
  const ok = kind === "weigh" ? Number.isFinite(n) && n >= 0.5 && n <= 5000 : kind === "loss" ? Number.isInteger(n) && n >= 1 : Number.isFinite(n) && n > 0 && Number(amount) > 0;
  const price = entry ? fish.prices[entry.pond.species] ?? SPECIES_INFO[entry.pond.species].price : 0;
  const save = () => {
    if (!entry || !ok) { haptic.warn(); return; }
    const today = todayKey();
    if (kind === "weigh") fishActions.addSample(entry.pond.id, today, n);
    else if (kind === "loss") fishActions.addLoss(entry.pond.id, today, Math.round(n));
    else { farmActions.addEntry({ kind: "income", category: "fish", amount: Math.round(Number(amount)), kg: Math.round(n * 10) / 10, note: entry.pond.name, date: today }); announce(tt("fs.sold")); }
    haptic.success();
    setValue(""); setAmount("");
    onClose();
  };
  const title = kind === "weigh" ? tt("fs.weigh") : kind === "loss" ? tt("fs.loss") : tt("fs.sell");
  return (
    <Sheet visible={!!entry} onClose={onClose} title={entry ? `${title} · ${entry.pond.name}` : title} testID="sheet-pond-entry"
      footer={<Btn label={tt("fs.saveEntry")} onPress={save} disabled={!ok} icon={(c) => <Icon name="check" size={18} color={c} />} testID="pond-entry-save" />}>
      <View style={{ gap: 12 }}>
        <Field label={kind === "weigh" ? tt("fs.weigh.label") : kind === "loss" ? tt("fs.loss.label") : tt("fs.kgSold")} glyph={null} value={value}
          onChangeText={(v) => { setValue(v.replace(/[^\d.]/g, "").slice(0, 7)); if (kind === "sale") { const k = Number(v); if (k > 0 && !amount) setAmount(""); } }}
          height={52} inputStyle={{ fontSize: 16 }} status={kind === "weigh" ? { kind: "note", text: tt("fs.weigh.hint") } : null} statusMinHeight={0}
          inputProps={{ keyboardType: "decimal-pad", testID: "pond-entry-value" } as any} />
        {kind === "sale" && (
          <Field label={tt("fs.amount")} glyph={null} value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, "").slice(0, 9))} height={52} inputStyle={{ fontSize: 16 }}
            status={Number(value) > 0 ? { kind: "note", text: `≈ ${fmtMoney(Number(value) * price)} @ KES ${price}/kg` } : null} statusMinHeight={0}
            inputProps={{ keyboardType: "number-pad", testID: "pond-entry-amount" } as any} />
        )}
      </View>
    </Sheet>
  );
}

/** Today's line for fish farmers: each pond's feed, and the next job. */
export function FishTodayLines() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { fish } = useFish();
  if (!fish.ponds.length) return null;
  const today = todayKey();
  return (
    <View style={{ gap: 6 }} testID="fish-today">
      {fish.ponds.slice(0, 3).map((p) => {
        const f = feedToday(p, fish.samples, fish.losses, today);
        return (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="fish" size={18} color={t.water} />
            <Text style={{ color: t.ink, ...T.body, flex: 1 }}>{tt("fs.today.line", { pond: p.name, kg: kg1(f.kgPerDay) })} · {pick(lang, FEED_PELLET[f.stage])}</Text>
          </View>
        );
      })}
    </View>
  );
}
