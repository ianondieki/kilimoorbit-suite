/**
 * Masoko / Markets: compare today's wholesale price for a crop across markets
 * and what the farmer's harvest is worth at each; then the planned harvest
 * run (Apex Route A) and any delivery on the road, with Autopilot one tap away.
 */
import React, { useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TextInput, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Header from "../../components/Header";
import Ticker from "../../components/Ticker";
import Field from "../../components/Field";
import { Bounded } from "../../components/Bounded";
import { Btn, Card, Chip, ChipRow, Eyebrow, T, Tag } from "../../components/Kit";
import { Enter, CountUp, Skeleton } from "../../components/Motion";
import { CropCoin, DemoTag } from "../../components/ShambaPanel";
import { RouteGlyph, SignalOffGlyph } from "../../components/Glyphs";
import { useTheme } from "../../lib/theme-context";
import { useLang } from "../../lib/session";
import { isWeb, webLang } from "../../lib/ui";
import { SAFE_EMOJI, cropName, freshnessText, isDemoBoard } from "../../lib/prices";
import { useSentinel } from "../../lib/sentinel";
import { useFarm } from "../../lib/farm";
import { fmtKES, type Commodity } from "../../lib/api";
import type { Key } from "../../lib/i18n";

export default function Masoko() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const s = useSentinel();
  const { farm } = useFarm();
  const feed = s.meta?.commodity_feed;
  const [picked, setPicked] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Until the farmer picks one: their own first crop on the board, else the
  // planned run's crop, else the first on the board.
  const keys = feed?.commodities.map((c) => c.crop) ?? [];
  const runCrop = s.arb?.cargo_optimized_route.crop_type;
  const mine = farm.plantings.map((p) => p.crop as string).find((k) => keys.includes(k));
  const crop = picked ?? mine ?? (runCrop && keys.includes(runCrop) ? runCrop : keys[0] ?? null);

  const ticker = useMemo(() => {
    const p = s.meta?.payloads?.arbitrage;
    if (!feed) return [tt("engine.OFFLINE").toUpperCase()];
    const items = feed.commodities.map((c) => {
      const best = [...c.quotes].sort((a, b) => b.price - a.price)[0];
      return `${SAFE_EMOJI[c.crop] ? SAFE_EMOJI[c.crop] + " " : ""}${cropName(lang, c.crop).toUpperCase()} ${best.market} KES ${best.price}/kg ${best.delta >= 0 ? "▲" : "▼"}${Math.abs(best.delta)}`;
    });
    const flag = s.arb?.cargo_optimized_route.logistics_risk_flag;
    if (flag && flag !== "CLEAR") items.push(`⚠ ${tt(`risk.${flag}` as Key).toUpperCase()}`);
    if (p?.vehicle_telemetry) items.push(`E-BODA ${p.vehicle_telemetry.vehicle_id} · ${p.vehicle_telemetry.battery_level}%`);
    return items;
  }, [feed, s.arb, lang]);

  const commodity = feed?.commodities.find((c) => c.crop === crop);
  // Phones scroll the crop chips sideways; wider screens wrap them (a mouse
  // can't easily scroll sideways, and there is room).
  const { width } = useWindowDimensions();
  const wrapChips = width >= 700;
  const chips = feed?.commodities.map((c) => (
    <Chip
      key={c.crop}
      role="radio"
      selected={c.crop === crop}
      onPress={() => setPicked(c.crop)}
      label={cropName(lang, c.crop)}
      leading={<CropCoin cropKey={c.crop} size={26} />}
      testID={`mk-crop-${c.crop}`}
    />
  ));
  const demo = isDemoBoard({ engine: s.meta?.engine });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang(lang)}>
      <Header title={tt("mk.title")} engine={s.engine} />
      <Ticker items={ticker} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await s.reload(); setRefreshing(false); }} tintColor={t.accent} />}
      >
        <Bounded style={{ padding: 16, gap: 14 }}>
          {s.status !== "ready" && !feed ? (
            <Card>
              <Skeleton height={44} color={t.raised} radius={999} />
              <Skeleton height={16} width={"60%"} color={t.raised} style={{ marginTop: 16 }} />
              <Skeleton height={120} color={t.raised} radius={12} style={{ marginTop: 12 }} />
            </Card>
          ) : !feed ? (
            <Card>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <SignalOffGlyph size={20} color={t.dim} />
                <Text style={{ flex: 1, color: t.dim, ...T.body }}>{tt("mk.none")}</Text>
              </View>
              <Btn kind="secondary" label={tt("result.retry")} onPress={s.reload} style={{ marginTop: 12 }} />
            </Card>
          ) : (
            <>
              {/* Crop picker */}
              {wrapChips ? (
                <ChipRow role="radiogroup" label={tt("mk.crops")}>{chips}</ChipRow>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={tt("mk.crops")}
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  style={{ marginHorizontal: -16, paddingHorizontal: 16, flexGrow: 0 }}
                >
                  {chips}
                  <View style={{ width: 16 }} />
                </ScrollView>
              )}

              {commodity && (
                <Enter index={0}>
                  <PricesCard c={commodity} demo={demo} fresh={freshnessText(lang, { status: "live", rows: [], ageMin: feed.data_age_minutes, offline: false })} />
                </Enter>
              )}
              <Enter index={1}><RunCard /></Enter>
              <Enter index={2}><DeliveryCard /></Enter>
            </>
          )}
        </Bounded>
      </ScrollView>
    </SafeAreaView>
  );
}

function PricesCard({ c, demo, fresh }: { c: Commodity; demo: boolean; fresh: string }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [qty, setQty] = useState("500");
  const qtyRef = useRef<TextInput>(null);
  const kg = Math.max(0, Number(qty.replace(/[^\d]/g, "")) || 0);
  const rows = [...c.quotes].sort((a, b) => b.price - a.price);
  const max = rows[0]?.price || 1;
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const gap = best && worst && best !== worst ? (best.price - worst.price) * kg : 0;

  return (
    <Card>
      <Eyebrow text={tt("mk.prices", { crop: cropName(lang, c.crop).toUpperCase() })} right={demo ? <DemoTag /> : null} />
      {fresh ? <Text style={{ color: t.dim, ...T.meta, marginTop: -6, marginBottom: 10 }}>{fresh}</Text> : null}

      <Field
        label={tt("mk.qty")}
        glyph={null}
        value={qty}
        onChangeText={(v) => setQty(v.replace(/[^\d]/g, "").slice(0, 7))}
        inputRef={qtyRef}
        height={52}
        inputStyle={{ fontSize: 18, fontWeight: "700" }}
        status={null}
        statusMinHeight={4}
        inputProps={{ keyboardType: "numeric", inputMode: "numeric", testID: "mk-qty" } as any}
      />

      <View style={{ gap: 4 }}>
        {rows.map((q) => {
          const isBest = q === best;
          const dir = tt(q.delta > 0 ? "prices.up" : q.delta < 0 ? "prices.down" : "prices.flat");
          return (
            <View
              key={q.market}
              accessible
              accessibilityLabel={tt("mk.rowA11y", { market: q.market, p: q.price, dir, d: q.delta === 0 ? "" : Math.abs(q.delta), v: (q.price * kg).toLocaleString("en-KE") })}
              {...(isWeb ? ({ role: "img" } as any) : null)}
              style={{ paddingVertical: 10, gap: 6 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text {...webLang("en")} style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: isBest ? "800" : "600" }} numberOfLines={2}>{q.market}</Text>
                {isBest && <Tag label={tt("mk.best")} tone="ok" />}
                <Text style={{ color: isBest ? t.accent : t.ink, fontFamily: "monospace", fontWeight: "700", fontSize: 15 }}>KES {q.price}/kg</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.raised, overflow: "hidden" }}>
                  <View style={{ width: `${(q.price / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: isBest ? t.accent : t.dim }} />
                </View>
                <Text style={{ minWidth: 112, textAlign: "right", color: t.dim, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>
                  {q.delta === 0 ? "" : `${q.delta > 0 ? "▲" : "▼"}${Math.abs(q.delta)} · `}KES {(q.price * kg).toLocaleString("en-KE")}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {gap > 0 && (
        <View style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: t.raised }}>
          <Text style={{ color: t.ink, ...T.meta, fontWeight: "600" }}>
            {tt("mk.gap", { best: best.market, worst: worst.market, n: gap.toLocaleString("en-KE"), kg: kg.toLocaleString("en-KE") })}
          </Text>
          <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{tt("mk.worth")}</Text>
        </View>
      )}
    </Card>
  );
}

function RunCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { arb, meta, problem } = useSentinel();
  const c = arb?.cargo_optimized_route;
  if (!c) {
    if (problem?.kind === "apex")
      return <Card><Eyebrow text={tt("mk.run")} /><Text style={{ color: t.dim, ...T.body }}>{tt("sentinel.apex")}</Text></Card>;
    return null;
  }
  const flag = c.logistics_risk_flag;
  const tone = flag === "CLEAR" ? "ok" : flag === "WEATHER_DELAY" ? "warn" : "bad";
  const markets: any[] = meta?.payloads?.arbitrage?.market_data?.available_markets ?? [];

  return (
    <Card>
      <Eyebrow text={tt("mk.run")} right={isDemoBoard({ engine: meta?.engine }) ? <DemoTag /> : null} />
      <Text style={{ color: t.ink, ...T.title }}>
        {tt("mk.runTo", { crop: cropName(lang, c.crop_type), market: c.optimal_market_destination })}
      </Text>
      <CountUp value={c.net_profit_projection_kes} suppressedLabel={tt("market.suppressed")} style={{ color: c.net_profit_projection_kes != null ? t.accent : t.ink, ...(c.net_profit_projection_kes != null ? T.big : T.body), marginTop: 8 }} />
      {c.net_profit_projection_kes != null && <Text style={{ color: t.dim, ...T.meta }}>{tt("market.net")}</Text>}

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <Stat label={tt("mk.yield")} value={`${c.estimated_yield_kg?.toLocaleString("en-KE") ?? "—"} kg`} />
        <Stat label={tt("mk.price")} value={c.live_market_wholesale_price_per_kg != null ? `KES ${c.live_market_wholesale_price_per_kg}/kg` : "—"} />
        <Stat label={tt("mk.transit", { km: c.distance_km ?? "—" })} value={fmtKES(c.transit_cost_kes)} />
      </View>

      <View style={{ marginTop: 12 }}><Tag label={tt(`risk.${flag}` as Key)} tone={tone} /></View>
      <Text {...webLang("en")} style={{ color: t.dim, ...T.meta, marginTop: 10 }}>{arb!.widget_insights.routing_profit_summary}</Text>

      {markets.length > 1 && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: t.dim, ...T.meta, fontWeight: "700", marginBottom: 4 }}>{tt("mk.compare")}</Text>
          {markets.map((m) => {
            const win = m.market_name === c.optimal_market_destination;
            return (
              <View key={m.market_name} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderTopWidth: 1, borderTopColor: t.line }}>
                <View style={{ flex: 1 }}>
                  <Text {...webLang("en")} style={{ color: win ? t.accent : t.ink, fontSize: 15, lineHeight: 20, fontWeight: win ? "800" : "600" }}>{win ? "★ " : ""}{m.market_name}</Text>
                  <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("mk.distance", { km: m.distance_km, c: fmtKES(m.transit_cost_kes) })}</Text>
                </View>
                <Text style={{ color: t.ink, fontFamily: "monospace", fontWeight: "700", fontSize: 14 }}>KES {m.wholesale_price_per_kg}/kg</Text>
              </View>
            );
          })}
        </View>
      )}

      <Btn
        kind="secondary"
        label={tt("mk.autopilot")}
        onPress={() => router.navigate("/autopilot")}
        icon={(col) => <RouteGlyph size={22} color={col} />}
        style={{ marginTop: 14 }}
        testID="open-autopilot"
      />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: t.raised, padding: 10, gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: t.ink, fontFamily: "monospace", fontWeight: "700", fontSize: 13.5 }}>{value}</Text>
      <Text numberOfLines={2} style={{ color: t.dim, fontSize: 11.5, lineHeight: 15, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function DeliveryCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { meta } = useSentinel();
  const d = meta?.payloads?.replan?.active_delivery;
  if (!d) return null;
  return (
    <Card>
      <Eyebrow text={tt("mk.delivery")} right={<Tag label={tt("mk.inTransit")} tone="warn" />} />
      <Text style={{ color: t.ink, ...T.title }}>
        {cropName(lang, String(d.crop_type ?? "").toLowerCase())} · <Text style={{ fontFamily: "monospace", fontSize: 14 }}>{d.delivery_id}</Text>
      </Text>
      <Text {...webLang("en")} style={{ color: t.dim, ...T.meta, marginTop: 2 }}>{d.origin} → {d.original_destination}</Text>
    </Card>
  );
}
