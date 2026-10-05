/**
 * Shamba / My farm: the crop calendar (stages, dated tasks, what inputs to
 * buy) and the daftari (money in and out, profit per crop). All on the phone.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "../../components/Header";
import TaskRows from "../../components/TaskRows";
import Segmented from "../../components/Segmented";
import { Bounded } from "../../components/Bounded";
import { AddCropSheet, FarmProfileSheet, RecordSheet } from "../../components/FarmSheets";
import { Btn, Card, Chip, ChipRow, Empty, Eyebrow, T, Tag, tint } from "../../components/Kit";
import { Enter, LevelBar } from "../../components/Motion";
import { CropCoin } from "../../components/ShambaPanel";
import { ChevronGlyph, CrossGlyph, PlusGlyph, SproutGlyph } from "../../components/Glyphs";
import { useTheme } from "../../lib/theme-context";
import { useLang } from "../../lib/session";
import { focusRing, webCursor, webLang, type PressState } from "../../lib/ui";
import { cropName } from "../../lib/prices";
import { CROPS, cropsForSeason, inputsFor, pick, stageAt, type CropKey } from "../../lib/agronomy";
import { daysBetween, dayMonth, todayKey } from "../../lib/dates";
import { SEASON_START, seasonFor } from "../../lib/season";
import { acresText, byCrop, farmActions, fmtMoney, tasksOf, totals, useFarm, type Entry, type Planting } from "../../lib/farm";
import type { Key } from "../../lib/i18n";

type Tab = "calendar" | "records";

export default function Shamba() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const [tab, setTab] = useState<Tab>("calendar");
  const [sheet, setSheet] = useState<null | "county" | "crop" | "record">(null);
  const [preset, setPreset] = useState<CropKey | undefined>(undefined);

  const addCrop = (k?: CropKey) => { setPreset(k); setSheet("crop"); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang(lang)}>
      <Header title={tt("farm.title")} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}>
        <Bounded style={{ padding: 16, gap: 14 }}>
          {/* Farm profile row */}
          <Pressable
            onPress={() => setSheet("county")}
            accessibilityRole="button"
            accessibilityLabel={`${farm.county ? `${farm.county}${farm.acres ? `, ${acresText(tt, farm.acres)}` : ""}` : tt("farm.noCounty")}. ${tt("farm.editA11y")}`}
            testID="farm-profile"
            style={({ pressed, hovered, focused }: PressState) => [
              { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: hovered ? t.raised : t.panel, opacity: pressed ? 0.85 : 1 },
              webCursor, focusRing(focused, t.accent),
            ]}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tint(t.ok, 0.18), alignItems: "center", justifyContent: "center" }}>
              <SproutGlyph size={24} color={t.ok} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, ...T.title }}>{farm.county ?? tt("farm.noCounty")}</Text>
              {farm.acres ? <Text style={{ color: t.dim, ...T.meta }}>{acresText(tt, farm.acres)}</Text> : null}
            </View>
            <Text style={{ color: t.accent, fontSize: 15, fontWeight: "700" }}>{tt("profile.edit")}</Text>
            <ChevronGlyph size={12} color={t.accent} dir="right" />
          </Pressable>

          <Segmented
            accessibilityLabel={tt("farm.tabs")}
            options={[{ value: "calendar", label: tt("farm.tab.calendar") }, { value: "records", label: tt("farm.tab.records") }]}
            value={tab}
            onChange={setTab}
          />

          {tab === "calendar" ? (
            <Calendar onAdd={addCrop} />
          ) : (
            <Records onAdd={() => setSheet("record")} />
          )}
        </Bounded>
      </ScrollView>

      <FarmProfileSheet visible={sheet === "county"} onClose={() => setSheet(null)} />
      <AddCropSheet visible={sheet === "crop"} onClose={() => setSheet(null)} initialCrop={preset} />
      <RecordSheet visible={sheet === "record"} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

/* ───────────────────────── Calendar ───────────────────────── */
function Calendar({ onAdd }: { onAdd: (k?: CropKey) => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { farm } = useFarm();
  const sorted = [...farm.plantings].sort((a, b) => (a.plantedOn < b.plantedOn ? -1 : 1));

  return (
    <View style={{ gap: 14 }}>
      {sorted.length === 0 ? (
        <Card>
          <Empty
            glyph={<View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tint(t.ok, 0.18), alignItems: "center", justifyContent: "center" }}><SproutGlyph size={30} color={t.ok} /></View>}
            title={tt("farm.empty.title")}
            body={tt("farm.empty.body")}
            action={<Btn label={tt("tasks.addCrop")} onPress={() => onAdd()} icon={(c) => <PlusGlyph size={14} color={c} />} testID="farm-add-crop" />}
          />
        </Card>
      ) : (
        <>
          {sorted.map((p, i) => (
            <Enter key={p.id} index={i}>
              <PlantingCard p={p} />
            </Enter>
          ))}
          <Btn kind="secondary" label={tt("tasks.addCrop")} onPress={() => onAdd()} icon={(c) => <PlusGlyph size={14} color={c} />} testID="farm-add-crop" />
        </>
      )}
      <SuggestCard onPick={onAdd} />
    </View>
  );
}

function PlantingCard({ p }: { p: Planting }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const plan = CROPS[p.crop];
  const today = todayKey();
  const day = daysBetween(p.plantedOn, today);
  const all = tasksOf(p, farm.done, today);
  const openTasks = all.filter((x) => !x.done && x.inDays >= -14);
  const next = openTasks.slice(0, 2);
  const { stage } = stageAt(p.crop, day);
  const transplant = plan.seed.unit === "seedlings";
  const pct = Math.max(0, Math.min(100, (day / plan.daysToHarvest) * 100));
  const harvesting = day >= plan.daysToHarvest;
  const dateLine =
    day < 0 ? tt("plant.planned", { date: dayMonth(lang, p.plantedOn) })
    : tt(transplant ? "plant.transplanted" : "plant.planted", { date: dayMonth(lang, p.plantedOn) });

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <CropCoin cropKey={p.crop} size={44} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" aria-level={2} style={{ color: t.ink, fontSize: 19, lineHeight: 24, fontWeight: "800" }}>{cropName(lang, p.crop)}</Text>
          <Text style={{ color: t.dim, ...T.meta }}>{dateLine} · {acresText(tt, p.acres)}</Text>
        </View>
      </View>

      <View style={{ marginTop: 14, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Tag label={day < 0 ? tt("plant.startsIn", { n: -day }) : pick(lang, stage.name)} tone={day < 0 ? "dim" : harvesting ? "warn" : "ok"} />
          <Text style={{ color: t.dim, ...T.meta }}>
            {day < 0 ? "" : harvesting ? tt("plant.harvesting") : tt("plant.harvestIn", { n: plan.daysToHarvest - day })}
          </Text>
        </View>
        <LevelBar pct={pct} color={harvesting ? t.accent : t.ok} track={t.raised} height={8} />
        {day >= 0 && !harvesting ? (
          <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16 }}>{tt("plant.day", { n: day, total: plan.daysToHarvest })}</Text>
        ) : null}
      </View>

      {/* Collapsed: the next two open tasks. Open: the whole calendar instead. */}
      {!open && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: t.dim, ...T.meta, fontWeight: "700", marginBottom: 2 }}>{tt("plant.next")}</Text>
          {next.length ? <TaskRows tasks={next} /> : <Text style={{ color: t.dim, ...T.body, paddingVertical: 8 }}>{tt("plant.noOpen")}</Text>}
        </View>
      )}

      {open && (
        <View style={{ marginTop: 12, gap: 14 }}>
          <TaskRows tasks={all} dates />
          <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 8 }}>
            <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{tt("plant.inputs")}</Text>
            {inputsFor(p.crop, p.acres, lang).map((n) => (
              <View key={n.label} style={{ flexDirection: "row", gap: 12 }}>
                <Text style={{ width: 84, color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{n.label}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{n.amount}</Text>
                  {n.when || n.note ? <Text style={{ color: t.dim, ...T.meta }}>{pick(lang, (n.when ?? n.note)!)}</Text> : null}
                </View>
              </View>
            ))}
            <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>
              {tt("plant.spacing", { s: plan.spacing })} · {tt("plant.inputsNote")}
            </Text>
          </View>
          {confirm ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>{tt("plant.removeAsk", { crop: cropName(lang, p.crop) })}</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Btn kind="secondary" label={tt("common.cancel")} onPress={() => setConfirm(false)} style={{ flex: 1 }} />
                <Btn kind="danger" label={tt("plant.removeYes")} onPress={() => farmActions.removePlanting(p.id)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Btn kind="ghost" small label={tt("plant.remove")} onPress={() => setConfirm(true)} icon={(c) => <CrossGlyph size={12} color={c} />} style={{ alignSelf: "flex-start" }} />
          )}
        </View>
      )}

      <Pressable
        onPress={() => { setOpen((o) => !o); setConfirm(false); }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        testID={`planting-toggle-${p.crop}`}
        style={({ pressed, hovered, focused }: PressState) => [
          { minHeight: 48, marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12 },
          (hovered || pressed) && { backgroundColor: t.raised },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <Text style={{ color: t.accent, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>
          {open ? tt("plant.hide") : tt("plant.calendar", { n: all.length })}
        </Text>
        <ChevronGlyph size={12} color={t.accent} dir={open ? "up" : "down"} />
      </Pressable>
    </Card>
  );
}

function SuggestCard({ onPick }: { onPick: (k: CropKey) => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const season = seasonFor();
  const { rainfed, irrigated } = cropsForSeason(season.key);
  const chips = (keys: CropKey[]) => (
    <ChipRow>
      {keys.map((k) => (
        <Chip key={k} label={cropName(lang, k)} onPress={() => onPick(k)} leading={<CropCoin cropKey={k} size={24} />} a11yLabel={`${tt("tasks.addCrop")}: ${cropName(lang, k)}`} />
      ))}
    </ChipRow>
  );
  return (
    <Card>
      <Eyebrow text={tt("suggest.eyebrow", { season: tt(`season.${season.key}.name` as Key).toUpperCase() })} />
      {rainfed.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.ink, ...T.body }}>{tt("suggest.rains")}</Text>
          {chips(rainfed)}
        </View>
      ) : (
        <Text style={{ color: t.ink, ...T.body }}>
          {tt("suggest.dry", { next: tt(`season.${season.next}.name` as Key) })}
        </Text>
      )}
      <View style={{ gap: 8, marginTop: 12 }}>
        <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("suggest.water")}</Text>
        {chips(irrigated)}
      </View>
    </Card>
  );
}

/* ───────────────────────── Records (daftari) ───────────────────────── */
function seasonStartKey(): string {
  const s = seasonFor();
  const d = new Date(s.year, SEASON_START[s.key], 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function Records({ onAdd }: { onAdd: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const [period, setPeriod] = useState<"season" | "all">("season");
  const [limit, setLimit] = useState(12);
  const from = seasonStartKey();
  const entries = [...farm.entries]
    .filter((e) => period === "all" || e.date >= from)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const sum = totals(entries);
  const crops = byCrop(entries);

  if (!farm.entries.length)
    return (
      <Card>
        <Empty
          title={tt("farm.tab.records")}
          body={tt("rec.empty")}
          action={<Btn label={tt("rec.add")} onPress={onAdd} icon={(c) => <PlusGlyph size={14} color={c} />} testID="records-add" />}
        />
      </Card>
    );

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <ChipRow role="radiogroup" label={tt("rec.period")}>
          <Chip role="radio" selected={period === "season"} onPress={() => setPeriod("season")} label={tt("rec.season")} />
          <Chip role="radio" selected={period === "all"} onPress={() => setPeriod("all")} label={tt("rec.all")} />
        </ChipRow>
        <View style={{ flexDirection: "row", marginTop: 14, gap: 8 }}>
          <Figure label={tt("rec.income")} value={fmtMoney(sum.income)} color={t.ink} />
          <Figure label={tt("rec.expense")} value={fmtMoney(sum.expense)} color={t.ink} />
          <Figure label={sum.profit < 0 ? tt("rec.loss") : tt("rec.profit")} value={fmtMoney(Math.abs(sum.profit))} color={sum.profit < 0 ? t.alert : t.ok} strong />
        </View>
        {crops.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Eyebrow text={tt("rec.byCrop")} />
            {crops.map(({ crop, t: c }) => (
              <View key={crop} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                <CropCoin cropKey={crop} size={28} />
                <Text style={{ flex: 1, color: t.ink, ...T.body, fontWeight: "600" }}>{cropName(lang, crop)}</Text>
                <Text style={{ color: c.profit < 0 ? t.alert : t.ok, fontFamily: "monospace", fontWeight: "700", fontSize: 14 }}>
                  {c.profit < 0 ? "−" : "+"}{fmtMoney(Math.abs(c.profit))}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Btn label={tt("rec.add")} onPress={onAdd} icon={(c) => <PlusGlyph size={14} color={c} />} testID="records-add" />

      <Card>
        <Eyebrow text={tt("rec.recent")} />
        {entries.length === 0 ? (
          <Text style={{ color: t.dim, ...T.body }}>{tt("rec.emptyPeriod")}</Text>
        ) : (
          entries.slice(0, limit).map((e, i) => <EntryRow key={e.id} e={e} last={i === Math.min(limit, entries.length) - 1} />)
        )}
        {entries.length > limit && (
          <Btn kind="ghost" small label={tt("common.more")} onPress={() => setLimit((l) => l + 12)} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        )}
      </Card>
    </View>
  );
}

function Figure({ label, value, color, strong }: { label: string; value: string; color: string; strong?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: t.raised, gap: 2 }}>
      <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 16, fontWeight: "700" }}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ color, fontSize: strong ? 17 : 15, lineHeight: 22, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function EntryRow({ e, last }: { e: Entry; last: boolean }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [confirm, setConfirm] = useState(false);
  const what = [tt(`rec.cat.${e.category}` as Key), e.crop ? cropName(lang, e.crop) : null].filter(Boolean).join(" · ");
  const sign = e.kind === "income" ? "+" : "−";
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line, paddingVertical: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
        <View style={{ width: 52 }}>
          <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 16, fontWeight: "700" }}>{dayMonth(lang, e.date)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, ...T.body, fontWeight: "600" }}>{what}</Text>
          {e.note ? <Text style={{ color: t.dim, ...T.meta }} numberOfLines={1}>{e.note}</Text> : null}
        </View>
        <Text style={{ color: e.kind === "income" ? t.ok : t.ink, fontFamily: "monospace", fontWeight: "700", fontSize: 14 }}>
          {sign}{Math.round(e.amount).toLocaleString("en-KE")}
        </Text>
        <Pressable
          onPress={() => setConfirm((c) => !c)}
          accessibilityRole="button"
          accessibilityLabel={tt("rec.delete", { what: `${what}, ${sign}${fmtMoney(e.amount)}` })}
          accessibilityState={{ expanded: confirm }}
          style={({ pressed, hovered, focused }: PressState) => [
            { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: -8 },
            (hovered || pressed || confirm) && { backgroundColor: t.raised },
            webCursor, focusRing(focused, t.accent),
          ]}
        >
          <CrossGlyph size={12} color={t.dim} />
        </Pressable>
      </View>
      {confirm && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <Btn kind="secondary" small label={tt("common.cancel")} onPress={() => setConfirm(false)} style={{ flex: 1 }} />
          <Btn kind="danger" small label={tt("rec.deleteYes")} onPress={() => farmActions.removeEntry(e.id)} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}
