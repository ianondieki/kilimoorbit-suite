/**
 * Leo / Today: the farmer's morning glance. Weather and the work windows for
 * their county, this week's farm tasks, where their crop sells best, and the
 * season's climate watch. Detail lives one tap away (Shamba, Masoko).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, RefreshControl, useWindowDimensions } from "react-native";
import Text from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Header from "../../components/Header";
import FAB from "../../components/FAB";
import WeatherCard, { windowText, type Win } from "../../components/WeatherCard";
import { Guard } from "../../components/ScreenError";
import { AddAnimalSheet, EggSheet, HatchRows, HerdRows, MilkSheet, herdHasLayers, herdHasMilkers } from "../../components/Herd";
import { dueHatchSteps } from "../../lib/livestock";
import { StoreRows } from "../../components/Ghala";
import { PestWatchCard } from "../../components/Scout";
import { NewsCard } from "../../components/News";
import { ShowsCard } from "../../components/Events";
import { TriviaCard } from "../../components/Trivia";
import { BeliefCard } from "../../components/Belief";
import { ConnectionSheet } from "../../components/Connection";
import { checkKind, dueChecks } from "../../lib/postharvest";
import { AlertsCard } from "../../components/PriceAlerts";
import { useAlerts } from "../../lib/alerts";
import { alertHits } from "../../lib/pricewatch";
import { useHerd } from "../../lib/herd";
import { fill, openReminders } from "../../lib/livestock";
import { ListenPill } from "../../components/auth/Controls";
import Pic from "../../components/Pic";
import { proverbFor } from "../../lib/proverbs";
import { sendBriefIfDue, sendBriefNow, useBriefPref } from "../../lib/brief";
import { buildDigest, flushPendingDigest, useDigestPref } from "../../lib/digest-store";
import { mailFailure, resendConfirmation, type BriefInput, type BriefSection } from "../../lib/api";
import TaskRows from "../../components/TaskRows";
import { useMenu } from "../../components/MenuContext";
import { AddCropSheet, FarmProfileSheet, RecordSheet } from "../../components/FarmSheets";
import { Btn, Card, Eyebrow, T, Tag, domainColor } from "../../components/Kit";
import { Enter, CountUp, Skeleton } from "../../components/Motion";
import { DemoTag } from "../../components/ShambaPanel";
import { ArrowGlyph, CheckCoin, PlusGlyph, SignalOffGlyph } from "../../components/Glyphs";
import { useTheme } from "../../lib/theme-context";
import { useLang, useSession } from "../../lib/session";
import { announce, webLang } from "../../lib/ui";
import { cropName, isDemoBoard } from "../../lib/prices";
import { seasonFor } from "../../lib/season";
import { longDay, todayKey } from "../../lib/dates";
import { useFarm, upcomingTasks } from "../../lib/farm";
import { pick } from "../../lib/agronomy";
import { useForecast } from "../../lib/weather";
import { useSentinel } from "../../lib/sentinel";
import { DEMO_COUNTY } from "../../lib/counties";
import type { Key } from "../../lib/i18n";
import type { WxDay } from "../../lib/api";

const SHOWN_TASKS = 4;

export default function Today() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { profile } = useSession();
  const { farm, ready: farmReady } = useFarm();
  const sentinel = useSentinel();
  const county = farm.county ?? DEMO_COUNTY;
  const wx = useForecast(county);
  const { width } = useWindowDimensions();
  const { isDocked } = useMenu();
  const [sheet, setSheet] = useState<null | "county" | "crop" | "record" | "animal" | "milk" | "eggs" | "connection">(null);
  const { herd, ready: herdReady } = useHerd();
  const alerts = useAlerts();
  const [refreshing, setRefreshing] = useState(false);

  // Two columns once the content area (window minus the docked sidebar) is wide enough.
  const contentW = width - (isDocked ? 280 : 0);
  const wide = contentW >= 980;

  const hour = new Date().getHours();
  const hello = tt(hour < 12 ? "today.morning" : hour < 17 ? "today.afternoon" : "today.evening");
  const first = profile?.name.trim().split(/\s+/)[0];
  const season = seasonFor();

  // The day in sections: what "Listen" reads aloud and what the morning brief emails.
  const sections = useMemo<BriefSection[]>(() => {
    const out: BriefSection[] = [];
    const days = wx.data?.days;
    if (days?.length) {
      const d = days[0];
      out.push({ title: tt("brief.weather"), lines: [
        tt("listen.today.weather", { county, sky: tt(`wx.sky.${d.sky}` as Key), tmax: d.tmax, p: d.rain_chance }),
        ...(["spray", "plant", "dry"] as Win[]).map((k) => `${tt(`win.${k}` as Key)}: ${windowText(k, days, lang, tt)}.`),
      ] });
    }
    const due = upcomingTasks(farm).slice(0, 3).map((x) => `${pick(lang, x.title)} (${cropName(lang, x.planting.crop)})`);
    const herdDue = openReminders(herd.animals, herd.done, todayKey(), 7).slice(0, 2)
      .map((r) => fill(pick(lang, r.title), herd.animals.find((a) => a.id === r.animalId)?.name ?? ""));
    const storeDue = dueChecks(farm.store, todayKey(), 1).slice(0, 2)
      .map((c) => tt(`store.check.${checkKind(c.lot)}` as Key, { crop: cropName(lang, c.lot.crop).toLowerCase() }));
    const all = [...due, ...herdDue, ...storeDue];
    if (all.length) out.push({ title: tt("brief.tasks"), lines: all });
    const hits = alertHits(alerts, sentinel.meta?.commodity_feed)
      .map((h) => tt("listen.today.alert", { crop: cropName(lang, h.alert.crop), p: h.price, market: h.market }));
    if (hits.length) out.push({ title: tt("brief.alerts"), lines: hits });
    const c = sentinel.arb?.cargo_optimized_route;
    if (c?.live_market_wholesale_price_per_kg != null)
      out.push({ title: tt("brief.market"), lines: [tt("listen.today.market", { crop: cropName(lang, c.crop_type), market: c.optimal_market_destination, p: c.live_market_wholesale_price_per_kg })] });
    const p = proverbFor(todayKey());
    out.push({ title: tt("brief.belief"), lines: [`“${p.sw}” ${p.meaning[lang]}`, p.farm[lang]] });
    return out;
  }, [wx.data, farm, herd, alerts, sentinel.arb, sentinel.meta, lang, county]);

  // "Listen": the same, read aloud (low-literacy friendly), in the farmer's language.
  const script = useMemo(() => {
    const parts = [`${first ? `${hello}, ${first}` : hello}.`];
    for (const s of sections) {
      if (s.title === tt("brief.tasks")) parts.push(tt("listen.today.tasks", { list: s.lines.join("; ") }));
      else parts.push(...s.lines);
    }
    return parts.join(" ").replace(/°/g, "");
  }, [sections, first, hello, tt]);

  // The morning brief by email: once a day, when the farmer has an email and left it on; and the button to send it now.
  const [briefOn] = useBriefPref();
  const briefInput = useCallback((): BriefInput | null =>
    profile?.email ? { name: profile.name, email: profile.email, lang, date: longDay(lang, todayKey()), county: farm.county, sections } : null,
  [profile?.email, profile?.name, lang, farm.county, sections]);
  const briefReady = !!wx.data && sentinel.status === "ready" && farmReady && herdReady;
  useEffect(() => {
    if (!briefOn || !briefReady) return;
    const input = briefInput();
    if (input) sendBriefIfDue(input).catch(() => {});
  }, [briefOn, briefReady, profile?.email]);

  // A records digest the last session never sent (the app was closed first) goes now.
  const [digestOn] = useDigestPref();
  useEffect(() => {
    if (!farmReady || !profile?.email || !digestOn) return;
    flushPendingDigest(() => buildDigest({ lang, tt, profile, farm, period: "season" })).catch(() => {});
  }, [farmReady, profile?.email, digestOn]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([sentinel.reload(), Promise.resolve(wx.reload())]);
    setRefreshing(false);
  };

  // Each card is guarded: one that fails shows a small note, the rest of Today keeps working.
  const weather = (
    <Guard name="weather"><WeatherCard wx={wx} county={county} countySet={!!farm.county} onChooseCounty={() => setSheet("county")} /></Guard>
  );
  const tasks = <Guard name="tasks"><TasksCard onAddCrop={() => setSheet("crop")} onAddAnimal={() => setSheet("animal")} days={wx.data?.days} /></Guard>;
  const market = <Guard name="market"><MarketCard /></Guard>;
  const climate = <Guard name="climate"><ClimateCard /></Guard>;
  // Discover: the county's farm news, the shows near it, and five questions a day.
  const news = <Guard name="news"><NewsCard county={farm.county} /></Guard>;
  const shows = <Guard name="shows"><ShowsCard county={county} /></Guard>;
  const trivia = <Guard name="trivia"><TriviaCard /></Guard>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang(lang)}>
      <Header brand title={tt("nav.today")} engine={sentinel.engine} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
      >
        <View style={{ width: "100%", maxWidth: wide ? 1120 : 760, alignSelf: "center", padding: 16, gap: 14 }}>
          <Enter index={0}>
            <View style={{ paddingTop: 4, paddingBottom: 2 }}>
              <Text accessibilityRole="header" style={{ color: t.ink, ...T.display }}>
                {first ? `${hello}, ${first}` : hello}
              </Text>
              <Text style={{ color: t.dim, ...T.meta, fontFamily: "monospace", fontWeight: "700", letterSpacing: 0.3, marginTop: 4 }}>
                {longDay(lang, todayKey())} · <Text style={{ color: domainColor(t, "season"), fontFamily: "monospace", fontWeight: "700" }}>{tt(`season.${season.key}.name` as Key)}</Text>
              </Text>
              {/* Hidden by ListenPill itself when the phone has no voice for the language. */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 10 }}>
                <ListenPill script={script} />
                {profile?.email && briefOn ? <BriefButton build={briefInput} email={profile.email} name={profile.name} /> : null}
              </View>
            </View>
          </Enter>

          <ProblemBanner onFix={() => setSheet("connection")} />
          {/* Imani ya leo: one proverb a day, the same for everyone. */}
          <Enter index={1}><Guard name="belief"><BeliefCard /></Guard></Enter>
          <Guard name="alerts"><AlertsCard /></Guard>
          {/* Only when neighbours are finding fall armyworm above the threshold, and only for maize growers. */}
          {farm.plantings.some((p) => p.crop === "maize") && <Guard name="pest-watch"><PestWatchCard county={county} compact /></Guard>}

          {wide ? (
            <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 14 }}>
                <Enter index={1}>{weather}</Enter>
                <Enter index={3}>{climate}</Enter>
                <Enter index={5}>{news}</Enter>
                <Enter index={7}>{trivia}</Enter>
              </View>
              <View style={{ flex: 1, gap: 14 }}>
                <Enter index={2}>{tasks}</Enter>
                <Enter index={4}>{market}</Enter>
                <Enter index={6}>{shows}</Enter>
              </View>
            </View>
          ) : (
            <>
              <Enter index={1}>{weather}</Enter>
              <Enter index={2}>{tasks}</Enter>
              <Enter index={3}>{market}</Enter>
              <Enter index={4}>{climate}</Enter>
              <Enter index={5}>{news}</Enter>
              <Enter index={6}>{shows}</Enter>
              <Enter index={7}>{trivia}</Enter>
            </>
          )}
        </View>
      </ScrollView>

      <FAB
        actions={[
          { label: tt("fab.record"), pic: "record", onPress: () => setSheet("record"), testID: "fab-record" },
          { label: tt("fab.addCrop"), pic: "farm", onPress: () => setSheet("crop"), testID: "fab-add-crop" },
          // Dairy farmers record milk daily, poultry farmers eggs; everyone else gets "add an animal".
          herdHasMilkers(herd.animals)
            ? { label: tt("fab.milk"), pic: "milk", onPress: () => setSheet("milk"), testID: "fab-milk" }
            : herdHasLayers(herd.animals)
              ? { label: tt("fab.eggs"), pic: "egg", onPress: () => setSheet("eggs"), testID: "fab-eggs" }
              : { label: tt("fab.addAnimal"), pic: "herd", onPress: () => setSheet("animal"), testID: "fab-add-animal" },
          { label: tt("fab.diagnose"), pic: "doctor", onPress: () => router.navigate("/daktari") },
          { label: tt("fab.ask"), pic: "chat", onPress: () => router.navigate("/chat") },
        ]}
      />

      <FarmProfileSheet visible={sheet === "county"} onClose={() => setSheet(null)} />
      <AddCropSheet visible={sheet === "crop"} onClose={() => setSheet(null)} />
      <RecordSheet visible={sheet === "record"} onClose={() => setSheet(null)} />
      <AddAnimalSheet visible={sheet === "animal"} onClose={() => setSheet(null)} />
      <MilkSheet visible={sheet === "milk"} onClose={() => setSheet(null)} />
      <EggSheet visible={sheet === "eggs"} onClose={() => setSheet(null)} />
      <ConnectionSheet visible={sheet === "connection"} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

/* ── "Email me this brief": the day's sections to the farmer's address, now ── */
function BriefButton({ build, email, name }: { build: () => BriefInput | null; email: string; name: string }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [state, setState] = useState<null | "sending" | "SENT" | "SIMULATED" | "unconfirmed" | "cap" | "failed" | "resent" | "resendFail">(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (ms: number) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setState(null), ms); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const press = async () => {
    const input = build();
    if (!input) return;
    setState("sending");
    try {
      const r = await sendBriefNow(input);
      setState(r.status);
      announce(r.status === "SENT" ? tt("brief.sent", { email }) : tt("brief.logged"));
      later(5000);
    } catch (e) {
      const why = mailFailure(e);
      setState(why);
      announce(tt(why === "unconfirmed" ? "mail.unconfirmed" : why === "cap" ? "mail.cap" : "brief.fail"));
      if (why !== "unconfirmed") later(5000);
    }
  };
  // The pill keeps a short label; what happened is said on its own wrapping line beneath.
  const label = state === "sending" ? tt("brief.sending") : state === "SENT" || state === "SIMULATED" ? tt("brief.done") : tt("brief.send");
  const status = state === "SENT" ? tt("brief.sent", { email }) : state === "SIMULATED" ? tt("brief.logged") : state === "cap" ? tt("mail.cap") : state === "failed" ? tt("brief.fail") : null;
  return (
    <View style={{ gap: 4, flexShrink: 1, flexBasis: "100%" }}>
      <Btn kind="ghost" small label={label} onPress={press} disabled={state === "sending" || state === "unconfirmed"} icon={() => <Pic name="mail" size={20} />} style={{ alignSelf: "flex-start" }} testID="today-brief" />
      {status ? <Text style={{ color: t.dim, ...T.meta }} testID="today-brief-status">{status}</Text> : null}
      {state === "unconfirmed" || state === "resent" || state === "resendFail" ? (
        <View style={{ gap: 4 }} testID="today-brief-unconfirmed">
          <Tag block tone="warn" label={tt("mail.unconfirmed")} />
          <Btn
            kind="ghost" small
            label={state === "resent" ? tt("mail.resent") : state === "resendFail" ? tt("mail.resendFail") : tt("mail.resend")}
            onPress={async () => { try { await resendConfirmation({ name, email, lang }); setState("resent"); } catch { setState("resendFail"); } later(6000); }}
            style={{ alignSelf: "flex-start" }}
            testID="today-brief-resend"
          />
        </View>
      ) : null}
    </View>
  );
}

/* ── Offline / Apex problem: one quiet line, not a red card ── */
function ProblemBanner({ onFix }: { onFix: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { problem, reload, refreshing } = useSentinel();
  if (!problem) return null;
  const text = problem.kind === "cached" ? tt("sentinel.cached", { n: problem.mins }) : problem.kind === "offline" ? tt("sentinel.offline") : tt("sentinel.apex");
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingLeft: 14, paddingRight: 6, borderRadius: 14, backgroundColor: t.raised, borderWidth: 1, borderColor: t.line }}
    >
      <SignalOffGlyph size={18} color={t.ink} />
      <Text style={{ flex: 1, color: t.ink, ...T.meta, fontWeight: "600" }}>{text}</Text>
      {problem.kind === "apex"
        ? <Btn kind="ghost" small label={tt("result.retry")} onPress={reload} disabled={refreshing} />
        : <Btn kind="ghost" small label={tt("sentinel.fix")} onPress={onFix} icon={(c) => <SignalOffGlyph size={14} color={c} />} testID="fix-connection" />}
    </View>
  );
}

/* ── This week's tasks ── */
function TasksCard({ onAddCrop, onAddAnimal, days }: { onAddCrop: () => void; onAddAnimal: () => void; days?: WxDay[] }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { farm, ready } = useFarm();
  const { herd, ready: herdReady } = useHerd();
  // Ticked on this visit: kept in the list, struck through, until the screen is left.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  useFocusEffect(useCallback(() => () => setKept(new Set()), []));
  const due = upcomingTasks(farm, 7, undefined, kept);
  const shown = due.slice(0, SHOWN_TASKS);
  const hasCrops = farm.plantings.length > 0;
  const hasAnimals = herd.animals.length > 0;
  const herdDue = hasAnimals ? openReminders(herd.animals, herd.done, todayKey(), 7).length : 0;
  const storeDue = dueChecks(farm.store, todayKey(), 1).length;
  const hatchDue = dueHatchSteps(herd.hatches, herd.done, todayKey(), 1).length;
  const hasStore = farm.store.length > 0 || herd.hatches.length > 0;

  return (
    <Card>
      <Eyebrow domain="farm" text={tt("tasks.eyebrow")} />
      {!ready || !herdReady ? (
        <Skeleton height={48} color={t.raised} radius={12} />
      ) : !hasCrops && !hasAnimals && !hasStore ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: t.dim, ...T.body }}>{tt("tasks.emptyAll")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Btn kind="secondary" label={tt("tasks.addCrop")} onPress={onAddCrop} icon={(c) => <PlusGlyph size={14} color={c} />} style={{ flexGrow: 1 }} testID="today-add-crop" />
            <Btn kind="secondary" label={tt("herd.add")} onPress={onAddAnimal} icon={(c) => <PlusGlyph size={14} color={c} />} style={{ flexGrow: 1 }} testID="today-add-animal" />
          </View>
        </View>
      ) : (
        <>
          {shown.length > 0 && <TaskRows tasks={shown} showCrop days={days} onToggled={(k) => setKept((s) => new Set(s).add(k))} />}
          <Guard name="herd-rows"><HerdRows max={3} /></Guard>
          <Guard name="store-rows"><StoreRows /></Guard>
          <Guard name="hatch-rows"><HatchRows /></Guard>
          {shown.length === 0 && herdDue === 0 && storeDue === 0 && hatchDue === 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
              <CheckCoin size={24} bg={t.ok} fg={t.field} />
              <Text style={{ flex: 1, color: t.ink, ...T.body }}>{tt("tasks.allDone")}</Text>
            </View>
          )}
        </>
      )}
      {due.length > SHOWN_TASKS || (hasCrops && shown.length === 0) || herdDue > 3 ? (
        <Btn
          kind="ghost"
          small
          label={due.length > SHOWN_TASKS ? tt("tasks.more", { n: due.length - SHOWN_TASKS }) : tt("nav.farm")}
          onPress={() => router.navigate("/shamba")}
          icon={(c) => <ArrowGlyph size={14} color={c} />}
          style={{ marginTop: 4, flexDirection: "row-reverse", alignSelf: "flex-start" }}
        />
      ) : null}
    </Card>
  );
}

/* ── Best market for the planned harvest (Route A) ── */
function MarketCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { status, arb, meta, engine } = useSentinel();
  const c = arb?.cargo_optimized_route;

  if (status !== "ready" && !arb)
    return (
      <Card>
        <Eyebrow domain="market" text={tt("nav.markets").toUpperCase()} />
        <Skeleton height={14} width={180} color={t.raised} />
        <Skeleton height={36} width={220} color={t.raised} style={{ marginTop: 12 }} />
        <Skeleton height={26} width={160} color={t.raised} radius={999} style={{ marginTop: 12 }} />
      </Card>
    );
  if (!c) return null;

  const flag = c.logistics_risk_flag;
  const tone = flag === "CLEAR" ? "ok" : flag === "WEATHER_DELAY" ? "warn" : "bad";
  const demo = isDemoBoard({ engine: meta?.engine ?? (engine === "OFFLINE" ? undefined : engine) });

  return (
    <Card>
      <Eyebrow domain="market" text={tt("market.eyebrow", { crop: cropName(lang, c.crop_type).toUpperCase() })} right={demo ? <DemoTag /> : null} />
      <Text style={{ color: t.ink, ...T.title }} {...webLang("en")}>{c.optimal_market_destination}</Text>
      {c.live_market_wholesale_price_per_kg != null && (
        <Text style={{ color: t.dim, ...T.meta, fontFamily: "monospace" }}>KES {c.live_market_wholesale_price_per_kg}/kg</Text>
      )}
      {c.net_profit_projection_kes != null ? (
        <View style={{ marginTop: 10 }}>
          <CountUp value={c.net_profit_projection_kes} style={{ color: t.accent, ...T.big }} />
          <Text style={{ color: t.dim, ...T.meta }}>{tt("market.net")}</Text>
        </View>
      ) : (
        <Text style={{ color: t.ink, ...T.body, marginTop: 10 }}>{tt("market.suppressed")}</Text>
      )}
      <View style={{ marginTop: 12 }}>
        <Tag label={tt(`risk.${flag}` as Key)} tone={tone} />
      </View>
      <Btn
        kind="ghost"
        small
        label={tt("market.open")}
        onPress={() => router.navigate("/masoko")}
        icon={(col) => <ArrowGlyph size={14} color={col} />}
        style={{ marginTop: 6, flexDirection: "row-reverse", alignSelf: "flex-start" }}
        testID="open-markets"
      />
    </Card>
  );
}

/* ── Climate watch for the season (Apex climate sentinel) ── */
function ClimateCard() {
  const t = useTheme();
  const { t: tt } = useLang();
  const { arb } = useSentinel();
  const s = arb?.climate_risk_sentinel;
  if (!s) return null;
  const risks = [s.frost_risk && tt("climate.frost"), s.drought_risk && tt("climate.drought"), s.flood_risk && tt("climate.flood")].filter(Boolean) as string[];
  const lvl = s.pre_farming_risk_level;
  const tone = lvl === "Low" ? "ok" : lvl === "Medium" ? "warn" : "bad";
  return (
    <Card tone={lvl === "High" || lvl === "Critical" ? "alert" : "plain"}>
      <Eyebrow domain="season" text={tt("climate.eyebrow")} right={<Tag label={tt(`climate.level.${lvl}` as Key)} tone={tone} />} />
      <Text style={{ color: t.ink, ...T.title }}>
        {risks.length ? tt("climate.watch", { list: risks.join(", ") }) : tt("climate.calm")}
      </Text>
      {/* Apex writes these two in English (v1). */}
      <Text {...webLang("en")} style={{ color: t.ink, ...T.body, marginTop: 6 }}>{s.climate_caution_alert}</Text>
      {s.recommended_seed_variety_adjustment ? (
        <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: t.raised, gap: 2 }}>
          <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("climate.seed")}</Text>
          <Text {...webLang("en")} style={{ color: t.ink, ...T.meta }}>{s.recommended_seed_variety_adjustment}</Text>
        </View>
      ) : null}
    </Card>
  );
}

// A screen that throws shows a "try again" card, never a blank app.
export { ScreenErrorBoundary as ErrorBoundary } from "../../components/ScreenError";
