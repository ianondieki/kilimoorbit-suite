/**
 * Leo / Today: the farmer's morning glance. Weather and the work windows for
 * their county, this week's farm tasks, where their crop sells best, and the
 * season's climate watch. Detail lives one tap away (Shamba, Masoko).
 */
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Header from "../../components/Header";
import FAB from "../../components/FAB";
import WeatherCard from "../../components/WeatherCard";
import TaskRows from "../../components/TaskRows";
import { useMenu } from "../../components/MenuContext";
import { AddCropSheet, FarmProfileSheet, RecordSheet } from "../../components/FarmSheets";
import { Btn, Card, Eyebrow, T, Tag } from "../../components/Kit";
import { Enter, CountUp, Skeleton } from "../../components/Motion";
import { DemoTag } from "../../components/ShambaPanel";
import { ArrowGlyph, BarsGlyph, ChatGlyph, CheckCoin, LensGlyph, PlusGlyph, SignalOffGlyph, SproutGlyph } from "../../components/Glyphs";
import { useTheme } from "../../lib/theme-context";
import { useLang, useSession } from "../../lib/session";
import { webLang } from "../../lib/ui";
import { cropName, isDemoBoard } from "../../lib/prices";
import { seasonFor } from "../../lib/season";
import { longDay, todayKey } from "../../lib/dates";
import { useFarm, upcomingTasks } from "../../lib/farm";
import { useForecast } from "../../lib/weather";
import { useSentinel } from "../../lib/sentinel";
import { DEMO_COUNTY } from "../../lib/counties";
import type { Key } from "../../lib/i18n";

const SHOWN_TASKS = 4;

export default function Today() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { profile } = useSession();
  const { farm } = useFarm();
  const sentinel = useSentinel();
  const county = farm.county ?? DEMO_COUNTY;
  const wx = useForecast(county);
  const { width } = useWindowDimensions();
  const { isDocked } = useMenu();
  const [sheet, setSheet] = useState<null | "county" | "crop" | "record">(null);
  const [refreshing, setRefreshing] = useState(false);

  // Two columns once the content area (window minus the docked sidebar) is wide enough.
  const contentW = width - (isDocked ? 280 : 0);
  const wide = contentW >= 980;

  const hour = new Date().getHours();
  const hello = tt(hour < 12 ? "today.morning" : hour < 17 ? "today.afternoon" : "today.evening");
  const first = profile?.name.trim().split(/\s+/)[0];
  const season = seasonFor();

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([sentinel.reload(), Promise.resolve(wx.reload())]);
    setRefreshing(false);
  };

  const weather = (
    <WeatherCard wx={wx} county={county} countySet={!!farm.county} onChooseCounty={() => setSheet("county")} />
  );
  const tasks = <TasksCard onAddCrop={() => setSheet("crop")} />;
  const market = <MarketCard />;
  const climate = <ClimateCard />;

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
              <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" }}>
                {first ? `${hello}, ${first}` : hello}
              </Text>
              <Text style={{ color: t.dim, ...T.body, marginTop: 2 }}>
                {longDay(lang, todayKey())} · {tt(`season.${season.key}.name` as Key)}
              </Text>
            </View>
          </Enter>

          <ProblemBanner />

          {wide ? (
            <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 14 }}>
                <Enter index={1}>{weather}</Enter>
                <Enter index={3}>{climate}</Enter>
              </View>
              <View style={{ flex: 1, gap: 14 }}>
                <Enter index={2}>{tasks}</Enter>
                <Enter index={4}>{market}</Enter>
              </View>
            </View>
          ) : (
            <>
              <Enter index={1}>{weather}</Enter>
              <Enter index={2}>{tasks}</Enter>
              <Enter index={3}>{market}</Enter>
              <Enter index={4}>{climate}</Enter>
            </>
          )}
        </View>
      </ScrollView>

      <FAB
        actions={[
          { label: tt("fab.record"), glyph: (c) => <BarsGlyph size={20} color={c} />, onPress: () => setSheet("record"), testID: "fab-record" },
          { label: tt("fab.addCrop"), glyph: (c) => <SproutGlyph size={22} color={c} />, onPress: () => setSheet("crop"), testID: "fab-add-crop" },
          { label: tt("fab.diagnose"), glyph: (c) => <LensGlyph size={20} color={c} />, onPress: () => router.navigate("/daktari") },
          { label: tt("fab.ask"), glyph: (c) => <ChatGlyph size={20} color={c} />, onPress: () => router.navigate("/chat") },
        ]}
      />

      <FarmProfileSheet visible={sheet === "county"} onClose={() => setSheet(null)} />
      <AddCropSheet visible={sheet === "crop"} onClose={() => setSheet(null)} />
      <RecordSheet visible={sheet === "record"} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

/* ── Offline / Apex problem: one quiet line, not a red card ── */
function ProblemBanner() {
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
      <Btn kind="ghost" small label={tt("result.retry")} onPress={reload} disabled={refreshing} />
    </View>
  );
}

/* ── This week's tasks ── */
function TasksCard({ onAddCrop }: { onAddCrop: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { farm, ready } = useFarm();
  // Ticked on this visit: kept in the list, struck through, until the screen is left.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  useFocusEffect(useCallback(() => () => setKept(new Set()), []));
  const due = upcomingTasks(farm, 7, undefined, kept);
  const open = due.filter((x) => !x.done);
  const shown = due.slice(0, SHOWN_TASKS);

  return (
    <Card>
      <Eyebrow text={tt("tasks.eyebrow")} />
      {!ready ? (
        <Skeleton height={48} color={t.raised} radius={12} />
      ) : farm.plantings.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: t.dim, ...T.body }}>{tt("tasks.empty")}</Text>
          <Btn kind="secondary" label={tt("tasks.addCrop")} onPress={onAddCrop} icon={(c) => <PlusGlyph size={14} color={c} />} testID="today-add-crop" />
        </View>
      ) : open.length === 0 && shown.length === 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
          <CheckCoin size={24} bg={t.ok} fg={t.field} />
          <Text style={{ flex: 1, color: t.ink, ...T.body }}>{tt("tasks.allDone")}</Text>
        </View>
      ) : (
        <TaskRows tasks={shown} showCrop onToggled={(k) => setKept((s) => new Set(s).add(k))} />
      )}
      {due.length > SHOWN_TASKS || (farm.plantings.length > 0 && shown.length === 0) ? (
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
        <Eyebrow text={tt("nav.markets").toUpperCase()} />
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
      <Eyebrow text={tt("market.eyebrow", { crop: cropName(lang, c.crop_type).toUpperCase() })} right={demo ? <DemoTag /> : null} />
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
      <Eyebrow text={tt("climate.eyebrow")} right={<Tag label={tt(`climate.level.${lvl}` as Key)} tone={tone} />} />
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
