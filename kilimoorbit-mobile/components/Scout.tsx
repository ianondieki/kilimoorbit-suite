/**
 * Fall armyworm scouting (FAO FAMEWS / CIMMYT method): a W-walk of five stops
 * × 10 plants, the share of plants with fresh damage against the action
 * threshold for the crop's age, what to do now, an optional anonymous share
 * with the county pest watch, and icipe's push-pull for next season.
 * Logic: lib/scouting.ts. History lives with the farm (lib/farm.ts).
 */
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce } from "../lib/ui";
import { dayMonth, daysBetween, todayKey } from "../lib/dates";
import { acresText, farmActions, useFarm, type Planting } from "../lib/farm";
import { PER_STOP, STOPS, ageOn, pushPullPlan, scoutsFor, verdict, type Scout, type Verdict } from "../lib/scouting";
import { shareScout, usePestWatch } from "../lib/pestwatch";
import type { Key } from "../lib/i18n";
import { Btn, Card, CheckRow, Chip, ChipRow, Eyebrow, Group, Sheet, Stepper, T, Tag } from "./Kit";
import { CropCoin, DemoTag } from "./ShambaPanel";
import { ArrowGlyph, LensGlyph } from "./Glyphs";

const acresFmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""));
/** A field the app doesn't know: the farmer says how old the crop is. */
const AGE_PICK: { key: Key; age: number }[] = [
  { key: "scout.age.early", age: 10 }, { key: "scout.age.whorl", age: 30 }, { key: "scout.age.late", age: 70 },
];

/* ── the walk ── */
export function ScoutSheet({ visible, onClose, plantingId }: { visible: boolean; onClose: () => void; plantingId?: string }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const maize = farm.plantings.filter((p) => p.crop === "maize");
  const [pid, setPid] = useState<string | null>(null);
  const [age, setAge] = useState(30);
  const [stops, setStops] = useState<number[]>(Array(STOPS).fill(0));
  const [share, setShare] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPid(plantingId ?? maize[0]?.id ?? null);
    setAge(30);
    setStops(Array(STOPS).fill(0));
    setShare(farm.sharePest);
  }, [visible]);

  const today = todayKey();
  const planting = maize.find((p) => p.id === pid);
  const ageDays = planting ? ageOn(planting.plantedOn, today) : age;
  const hit = stops.reduce((s, x) => s + x, 0);
  const plants = STOPS * PER_STOP;
  const v = verdict(plants, hit, ageDays);

  const save = () => {
    farmActions.addScout({ plantingId: planting?.id, date: today, plants, hit, ageDays });
    if (share !== farm.sharePest) farmActions.setSharePest(share);
    if (share && farm.county) {
      shareScout({ county: farm.county, plants, hit, ageDays }).then((ok) => announce(tt(ok ? "scout.shared" : "scout.shareFail")));
    }
    announce(tt("scout.saved"));
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("scout.title")}
      testID="sheet-scout"
      footer={<Btn label={tt("scout.save")} onPress={save} style={{ flex: 1 }} testID="scout-save" />}
    >
      <Text style={{ color: t.ink, ...T.body }}>{tt("scout.how")}</Text>
      <Text style={{ color: t.dim, ...T.meta }}>{tt("scout.look")}</Text>

      <Group label={tt("scout.which")}>
        <ChipRow role="radiogroup" label={tt("scout.which")}>
          {maize.map((p) => (
            <Chip
              key={p.id}
              role="radio"
              selected={pid === p.id}
              onPress={() => setPid(p.id)}
              label={`${dayMonth(lang, p.plantedOn)} · ${acresText(tt, p.acres)}`}
              leading={<CropCoin cropKey="maize" size={24} />}
              testID={`scout-planting-${p.id}`}
            />
          ))}
          <Chip role="radio" selected={pid == null} onPress={() => setPid(null)} label={tt("scout.other")} testID="scout-other" />
        </ChipRow>
        {pid == null && (
          <ChipRow role="radiogroup" label={tt("scout.ageLabel")}>
            {AGE_PICK.map((a) => <Chip key={a.key} role="radio" selected={age === a.age} onPress={() => setAge(a.age)} label={tt(a.key)} />)}
          </ChipRow>
        )}
      </Group>

      <Group label={tt("scout.stops", { n: PER_STOP })}>
        {stops.map((n, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID={`scout-stop-${i + 1}`}>
            <Text style={{ width: 64, color: t.ink, fontSize: 15, fontWeight: "700" }}>{tt("scout.stop", { n: i + 1 })}</Text>
            <Stepper
              value={n}
              onChange={(x) => setStops((s) => s.map((y, j) => (j === i ? x : y)))}
              step={1}
              min={0}
              max={PER_STOP}
              format={(x) => `${x}/${PER_STOP}`}
              label={tt("scout.stopA11y", { n: i + 1 })}
            />
          </View>
        ))}
      </Group>

      {v && <VerdictBox v={v} plants={plants} hit={hit} />}

      {farm.county ? (
        <CheckRow
          checked={share}
          onToggle={() => setShare((x) => !x)}
          title={tt("scout.share", { county: farm.county })}
          meta={tt("scout.shareWhat")}
          testID="scout-share"
        />
      ) : (
        <Text style={{ color: t.dim, ...T.meta }}>{tt("scout.noCounty")}</Text>
      )}
    </Sheet>
  );
}

function VerdictBox({ v, plants, hit }: { v: Verdict; plants: number; hit: number }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const tone = v.stage === "late" ? "dim" : v.act ? "bad" : v.near ? "warn" : "ok";
  const head =
    v.stage === "late" ? tt("scout.v.late")
    : v.act ? tt("scout.v.act", { th: v.threshold })
    : v.near ? tt("scout.v.near", { th: v.threshold })
    : tt("scout.v.ok", { th: v.threshold });
  return (
    <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 6 }} accessibilityLiveRegion="polite" aria-live="polite" testID="scout-verdict">
      <Text style={{ color: t.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" }}>{tt("scout.pct", { hit, plants, p: v.pct })}</Text>
      <Tag block tone={tone} label={head} />
    </View>
  );
}

/** What to do, IPM first (FAO / CIMMYT guidance for smallholders). */
function Actions({ v }: { v: Verdict }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const keys: Key[] =
    v.stage === "late" ? ["scout.do.late1", "scout.do.late2"]
    : v.act ? ["scout.do.act1", "scout.do.act2", "scout.do.act3", "scout.do.act4"]
    : v.near ? ["scout.do.near1", "scout.do.act1"]
    : ["scout.do.ok1", "scout.do.act1"];
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      {keys.map((k, i) => (
        <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.accent, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
          </View>
          <Text style={{ flex: 1, color: t.ink, ...T.meta }}>{tt(k)}</Text>
        </View>
      ))}
    </View>
  );
}

/* ── the crop doctor's scouting card ── */
export function ScoutCard({ onScout, onPushPull }: { onScout: () => void; onPushPull: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const last: Scout | undefined = [...farm.scouts].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))[0];
  const v = last ? verdict(last.plants, last.hit, last.ageDays) : null;
  const ago = last ? daysBetween(last.date, todayKey()) : 0;
  return (
    <Card tone={v?.act ? "alert" : "plain"}>
      <Eyebrow text={tt("scout.eyebrow")} />
      {last && v ? (
        <View testID="scout-last">
          <Text style={{ color: t.dim, ...T.meta }}>{tt("scout.lastOn", { date: ago === 0 ? tt("common.today") : dayMonth(lang, last.date) })}</Text>
          <VerdictBox v={v} plants={last.plants} hit={last.hit} />
          <Actions v={v} />
        </View>
      ) : (
        <Text style={{ color: t.ink, ...T.body }}>{tt("scout.intro")}</Text>
      )}
      <Btn label={tt(last ? "scout.again" : "scout.start")} onPress={onScout} icon={(c) => <LensGlyph size={18} color={c} />} style={{ marginTop: 14 }} testID="scout-open" />
      <Btn kind="ghost" small label={tt("pp.open")} onPress={onPushPull} icon={(c) => <ArrowGlyph size={13} color={c} />} style={{ flexDirection: "row-reverse", alignSelf: "flex-start", marginTop: 6 }} testID="pp-open" />
    </Card>
  );
}

/** Shamba: one line on a maize card with its last walk, and a way to walk again. */
export function LastScoutLine({ p, onScout }: { p: Planting; onScout: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const last = scoutsFor(farm.scouts, p.id)[0];
  const v = last ? verdict(last.plants, last.hit, last.ageDays) : null;
  return (
    <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }} testID={`scout-line-${p.id}`}>
      <Text style={{ flex: 1, color: v?.act ? t.alert : t.dim, ...T.meta, fontWeight: v?.act ? "700" : "500" }}>
        {last && v
          ? tt(v.act ? "scout.lineAct" : "scout.line", { date: dayMonth(lang, last.date), p: v.pct, th: v.threshold })
          : tt("scout.lineNone")}
      </Text>
      <Btn kind="ghost" small label={tt("scout.short")} onPress={onScout} icon={(c) => <LensGlyph size={14} color={c} />} testID={`scout-${p.id}`} />
    </View>
  );
}

/* ── county pest watch ── */
export function PestWatchCard({ county, compact = false }: { county: string; compact?: boolean }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const w = usePestWatch(county);
  // Today raises it only when at least two farms are above the action level, so one report can't cry wolf.
  if (!w || (compact && (w.level !== "high" || w.over_threshold < 2))) return null;
  const tone = w.level === "high" ? "bad" : w.level === "low" ? "warn" : "ok";
  return (
    <Card tone={compact ? "alert" : "plain"}>
      <Eyebrow text={tt("watch.eyebrow", { county: w.county.toUpperCase() })} right={w.source === "SAMPLE" ? <DemoTag /> : null} />
      <View testID="pest-watch">
        <Text style={{ color: t.ink, ...T.title }}>
          {w.reports === 0 ? tt("watch.none", { n: w.window_days }) : tt(w.reports === 1 ? "watch.one" : "watch.some", { n: w.reports, d: w.window_days })}
        </Text>
        {w.reports > 0 && (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Tag block tone={tone} label={tt(w.level === "high" ? "watch.high" : "watch.low", { over: w.over_threshold, avg: w.avg_pct, max: w.max_pct })} />
          </View>
        )}
        <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17, marginTop: 8 }}>{tt("watch.note")}</Text>
      </View>
      {compact && (
        <Btn kind="secondary" small label={tt("watch.scout")} onPress={() => router.navigate({ pathname: "/daktari", params: { crop: "maize" } })} icon={(c) => <LensGlyph size={16} color={c} />} style={{ marginTop: 10, alignSelf: "flex-start" }} testID="watch-scout" />
      )}
    </Card>
  );
}

/* ── push-pull for next season ── */
export function PushPullSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { farm } = useFarm();
  const [acres, setAcres] = useState(1);
  useEffect(() => {
    if (!visible) return;
    setAcres(farm.plantings.find((p) => p.crop === "maize")?.acres ?? Math.min(farm.acres ?? 1, 20));
  }, [visible]);
  const plan = pushPullPlan(acres);
  const steps: Key[] = ["pp.step1", "pp.step2", "pp.step3", "pp.step4", "pp.step5"];
  return (
    <Sheet visible={visible} onClose={onClose} title={tt("pp.title")} testID="sheet-pushpull" footer={<Btn label={tt("common.close")} onPress={onClose} style={{ flex: 1 }} />}>
      <Text style={{ color: t.ink, ...T.body }}>{tt("pp.what")}</Text>
      <Group label={tt("bud.acres")}>
        <Stepper value={acres} onChange={setAcres} step={0.25} min={0.25} max={50} format={acresFmt} label={tt("bud.acres")} />
      </Group>
      {plan ? (
        <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 8 }} testID="pp-plan">
          <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{tt("pp.need")}</Text>
          {[
            [tt("pp.plots"), tt("pp.plotsVal", { n: plan.plots, side: plan.side })],
            [tt("pp.desmodium"), tt("pp.desmodiumVal", { kg: plan.desmodiumKg })],
            [tt("pp.napier"), tt("pp.napierVal", { n: plan.napier.toLocaleString("en-KE") })],
            [tt("pp.brachiaria"), tt("pp.brachiariaVal", { n: plan.brachiaria.toLocaleString("en-KE") })],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", gap: 12 }}>
              <Text style={{ width: 96, color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{k}</Text>
              <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{v}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: t.dim, ...T.body }}>{tt("pp.tooSmall")}</Text>
      )}
      <Group label={tt("pp.how")}>
        {steps.map((k, i) => (
          <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: t.accent, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, color: t.ink, ...T.meta }}>{tt(k)}</Text>
          </View>
        ))}
      </Group>
      <Tag block tone="ok" label={tt("pp.gain")} />
      <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("pp.source")}</Text>
    </Sheet>
  );
}

