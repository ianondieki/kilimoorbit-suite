/**
 * "Seedlings near you": the farmer picks what they need (avocado, seed potato,
 * tree seedlings…), optionally shares the phone's position, and the server's
 * agent (Scout → Planner → Advisor) returns the nearest sources with the fare
 * there and back, how many an acre needs, and a short plan. Every result says
 * to confirm stock before travelling; the plan is labelled when no model
 * wrote it. lib/nurseries.ts holds the pure helpers.
 */
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Text from "./Text";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { useFarm } from "../lib/farm";
import { planNurseries, type Nursery, type NurseryPlan } from "../lib/api";
import { NEEDS, fareText, kmText, mapsUrl, needLabel, type NeedKey } from "../lib/nurseries";
import { openLink } from "../lib/news";
import { haptic } from "../lib/haptics";
import type { Key } from "../lib/i18n";
import { Btn, Card, Chip, ChipRow, Sheet, T, Tag, tint } from "./Kit";
import { PhotoHero } from "./PhotoHero";
import { DemoTag } from "./ShambaPanel";
import Icon from "./Icon";
import { CheckCoin } from "./Glyphs";

type Fix = { lat: number; lon: number };

/** The phone's position, when the farmer asks and allows it; null otherwise. Never throws. */
async function locate(): Promise<Fix | null> {
  try {
    const Location = await import("expo-location");
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

export function NurseriesCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const county = farm.county ?? "Nakuru";
  const [need, setNeedState] = useState<NeedKey>("avocado");
  const touched = useRef(false);
  const setNeed = (k: NeedKey) => { touched.current = true; setNeedState(k); };
  // A potato grower starts on seed potato. The farm store hydrates after the first render, so this waits for it.
  const growsPotatoes = farm.plantings.some((p) => p.crop === "potatoes");
  useEffect(() => { if (growsPotatoes && !touched.current) setNeedState("potato"); }, [growsPotatoes]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const [open, setOpen] = useState(false);

  const useLocation = async () => {
    if (fix) { setFix(null); return; }
    setLocating("busy");
    const f = await locate();
    setFix(f);
    setLocating(f ? "idle" : "failed");
    if (f) haptic.success(); else haptic.warn();
  };

  return (
    <Card>
      <View style={{ gap: 12 }} testID="nurseries-card">
        <PhotoHero photo="nursery" compact height={176} icon="sprout" eyebrow={tt("nz.eyebrow")} title={tt("nz.title")} />
        <Text style={{ color: t.dim, ...T.body }}>{tt("nz.body")}</Text>
        <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{tt("nz.need")}</Text>
        <ChipRow role="radiogroup" label={tt("nz.need")}>
          {NEEDS.map((n) => (
            <Chip key={n.key} role="radio" label={`${n.emoji} ${lang === "sw" ? n.sw : n.en}`} selected={need === n.key} onPress={() => setNeed(n.key)} testID={`nz-need-${n.key}`} />
          ))}
        </ChipRow>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Chip
            role="checkbox"
            label={locating === "busy" ? tt("nz.locating") : fix ? tt("nz.located") : tt("nz.useLocation")}
            selected={!!fix}
            onPress={useLocation}
            leading={<Icon name={fix ? "crosshairs-gps" : "crosshairs"} size={16} color={fix ? t.accent : t.dim} />}
            testID="nz-locate"
          />
          {locating === "failed" && <Text style={{ color: t.dim, ...T.meta }}>{tt("nz.noLocation", { county })}</Text>}
        </View>
        <Btn label={tt("nz.find")} onPress={() => setOpen(true)} icon={(c) => <Icon name="map-search-outline" size={18} color={c} />} testID="nz-find" />
      </View>
      <PlanSheet visible={open} onClose={() => setOpen(false)} need={need} county={county} acres={farm.acres ?? 1} fix={fix} />
    </Card>
  );
}

export function PlanSheet({ visible, onClose, need, county, acres, fix, pondM2 }: { visible: boolean; onClose: () => void; need: NeedKey; county: string; acres: number; fix: Fix | null; pondM2?: number }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"working" | "done" | "failed">("working");
  const [plan, setPlan] = useState<NurseryPlan | null>(null);
  const [shown, setShown] = useState(0);
  const alive = useRef(true);
  const seq = useRef(0);

  // Runs once per opening: the need, position and acreage are fixed while the sheet is up.
  useEffect(() => {
    if (!visible) return;
    alive.current = true;
    const my = ++seq.current;
    setPhase("working"); setPlan(null); setShown(0);
    planNurseries({ need, county, acres, lang, ...(pondM2 ? { pond_m2: pondM2 } : {}), ...(fix ?? {}) })
      .then((p) => { if (alive.current && my === seq.current) { setPlan(p); setShown(1); } })
      .catch(() => { if (alive.current && my === seq.current) { haptic.error(); setPhase("failed"); } });
    return () => { alive.current = false; };
  }, [visible]);

  // The agent's steps appear one by one, then the results.
  useEffect(() => {
    if (!plan || phase !== "working") return;
    if (shown > plan.steps.length) { haptic.success(); setPhase("done"); return; }
    const id = setTimeout(() => setShown((s) => s + 1), reduce ? 0 : 420);
    return () => clearTimeout(id);
  }, [plan, shown, phase]);

  const unit = (u: string) => (tt(`nz.unit.${u}` as Key) || u);
  return (
    <Sheet visible={visible} onClose={onClose} title={tt("nz.sheetTitle")} testID="sheet-nurseries">
      <Text style={{ color: t.dim, ...T.meta }}>{needLabel(lang, need)} · {tt("nz.from", { where: fix ? tt("nz.fromGps") : tt("nz.fromCounty", { county }) })}</Text>

      {phase === "failed" ? (
        <Tag block tone="warn" label={tt("nz.failed")} />
      ) : (
        <View style={{ gap: 10 }} testID="nz-steps">
          {(plan?.steps ?? [{ agent: "Scout", action: tt("nz.working"), latency_ms: 0 }]).slice(0, Math.max(1, shown)).map((s, i) => (
            <Animated.View key={i} entering={reduce ? undefined : FadeInDown.duration(220)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }} testID={`nz-step-${i}`}>
              {plan && i < shown ? <CheckCoin size={22} bg={t.ok} fg={t.field} /> : <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.dim }} />}
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{s.agent}</Text>
                <Text style={{ color: t.dim, ...T.meta }}>{s.action}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      )}

      {phase === "done" && plan && (
        <Animated.View entering={reduce ? undefined : FadeInDown.duration(260)} style={{ gap: 14 }} testID="nz-results">
          <Text style={{ color: t.dim, ...T.meta }}>
            {plan.quantity?.basis === "pond_m2"
              ? tt("nz.pond", { m2: plan.quantity.amount, n: plan.quantity.n.toLocaleString("en-KE"), spacing: plan.per_acre.spacing })
              : tt("nz.perAcre", { acres: plan.acres, n: Math.round(plan.per_acre.n * plan.acres).toLocaleString("en-KE"), unit: unit(plan.per_acre.unit), spacing: plan.per_acre.spacing })}
          </Text>
          <View style={{ gap: 10 }}>
            {plan.nurseries.map((n, i) => <NurseryRow key={n.id} n={n} first={i === 0} need={need} />)}
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{tt("nz.advice")}</Text>
              {plan.advice.source !== "LIVE" && <DemoTag />}
            </View>
            <Tag block tone="ok" label={plan.advice.text} />
            {plan.advice.source !== "LIVE" && <Text style={{ color: t.dim, ...T.meta }}>{tt("nz.adviceSample")}</Text>}
          </View>
          <Text style={{ color: t.dim, ...T.meta }}>{tt("nz.verify")}</Text>
        </Animated.View>
      )}
    </Sheet>
  );
}

function NurseryRow({ n, first, need }: { n: Nursery; first: boolean; need: NeedKey }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const kindIcon = n.kind === "research" ? "flask-outline" : n.kind === "forestry" ? "pine-tree" : n.kind === "training" ? "school-outline" : n.kind === "seed" ? "seed-outline" : n.kind === "hatchery" ? "fish" : "storefront-outline";
  return (
    <View style={{ borderRadius: 14, borderWidth: first ? 2 : 1, borderColor: first ? t.accent : t.line, backgroundColor: first ? tint(t.accent, 0.08) : t.raised, padding: 12, gap: 8 }} testID={`nz-row-${n.id}`}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tint(n.carries_need ? t.ok : t.dim, 0.16), alignItems: "center", justifyContent: "center" }}>
          <Icon name={kindIcon as any} size={19} color={n.carries_need ? t.ok : t.dim} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 15.5, lineHeight: 21, fontWeight: "800" }}>{n.name}</Text>
          <Text style={{ color: t.dim, ...T.meta }}>{tt(`nz.kind.${n.kind}` as Key)} · {n.town === n.county ? n.town : `${n.town}, ${n.county}`}</Text>
        </View>
        <Text style={{ color: t.ink, fontSize: 16, lineHeight: 20, fontWeight: "800" }}>{kmText(n.distance_km)}</Text>
      </View>
      <Text style={{ color: n.carries_need ? t.ok : t.dim, ...T.meta, fontWeight: "700" }}>
        {n.carries_need ? tt("nz.carries", { need: needLabel(lang, need).toLowerCase() }) : tt("nz.other")} · {fareText(lang, n.transport)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {n.carries.slice(0, 6).map((c) => <Tag key={c} label={needLabel(lang, c)} tone={c === need ? "ok" : "dim"} />)}
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Btn kind="secondary" small label={tt("nz.directions")} onPress={() => openLink(mapsUrl(n.lat, n.lon))} icon={(c) => <Icon name="directions" size={16} color={c} />} style={{ alignSelf: "flex-start" }} testID={`nz-directions-${n.id}`} />
        {n.url ? <Btn kind="ghost" small label={tt("nz.site")} onPress={() => openLink(n.url!)} icon={(c) => <Icon name="open-in-new" size={15} color={c} />} style={{ alignSelf: "flex-start" }} /> : null}
      </View>
    </View>
  );
}
