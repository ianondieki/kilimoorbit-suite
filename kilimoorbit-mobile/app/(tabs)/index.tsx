import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Header from "../../components/Header";
import Ticker from "../../components/Ticker";
import Sidebar from "../../components/Sidebar";
import FAB from "../../components/FAB";
import Pill from "../../components/Pill";
import { Enter, PressScale, CountUp, Skeleton, LevelBar } from "../../components/Motion";
import { useTheme } from "../../lib/theme-context";
import {
  getMeta, callApex, fmtKES, type Meta, type ArbitrageResult, type ApexError,
} from "../../lib/api";

type Engine = "LIVE" | "MOCK" | "OFFLINE";

const CACHE_KEY = "ko-dash-cache";

export default function Dashboard() {
  const t = useTheme();
  const [engine, setEngine] = useState<Engine>("OFFLINE");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [arb, setArb] = useState<ArbitrageResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const m = await getMeta();
      setMeta(m);
      setEngine(m.engine);
      const res = await callApex<ArbitrageResult | ApexError>(m.payloads.arbitrage);
      if ((res.result as ApexError).execution_mode === "error") {
        setErr((res.result as ApexError).error_message ?? "Apex returned an error");
      } else {
        setArb(res.result as ArbitrageResult);
        AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ meta: m, arb: res.result, ts: Date.now() })
        ).catch(() => {});
      }
    } catch (e: any) {
      setEngine("OFFLINE");
      // Rural connectivity drops are normal — fall back to the last good snapshot.
      let restored = false;
      const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
      if (cached) {
        try {
          const { meta: cm, arb: ca, ts } = JSON.parse(cached);
          setMeta(cm);
          setArb(ca);
          const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
          setErr(`Offline — showing data cached ${mins} min ago. (${e.message})`);
          restored = true;
        } catch {}
      }
      if (!restored)
        setErr(`Cannot reach the Sentinel server — check API_BASE in lib/config.ts. (${e.message})`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ticker = useMemo(() => {
    const p = meta?.payloads?.arbitrage;
    if (!p) return ["CONNECTING TO SENTINEL…"];
    const items: string[] = [];
    for (const cF of meta?.commodity_feed?.commodities ?? []) {
      const best = [...cF.quotes].sort((a, b) => b.price - a.price)[0];
      items.push(`${cF.emoji} ${cF.crop.toUpperCase()} ${best.market} KES ${best.price}/kg ${best.delta >= 0 ? "▲" : "▼"}${Math.abs(best.delta)}`);
    }
    if (arb?.cargo_optimized_route.logistics_risk_flag !== "CLEAR" && arb)
      items.push(`⚠ ${arb.cargo_optimized_route.logistics_risk_flag} ON OPTIMAL CORRIDOR`);
    items.push(`E-BODA ${p.vehicle_telemetry?.vehicle_id} BATTERY ${p.vehicle_telemetry?.battery_level}%`);
    items.push(`SOIL ${p.iot_telemetry?.soil_moisture}% · RAIN 24H ${p.iot_telemetry?.rainfall_mm_last_24h}mm`);
    return items;
  }, [meta, arb]);

  const c = arb?.cargo_optimized_route;
  const s9 = arb?.climate_risk_sentinel;
  const riskTone = (lvl?: string) =>
    lvl === "Low" ? "ok" : lvl === "Medium" ? "warn" : "bad";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header engine={engine} onMenu={() => setMenu(true)} />
      <Ticker items={ticker} />
      <ScrollView
        contentContainerStyle={st.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={t.accent} />}
      >
        {loading && (
          <View style={[st.card, { backgroundColor: t.panel, borderColor: t.line }]}>
            <Skeleton height={10} width={120} color={t.raised} />
            <Skeleton height={36} width={210} color={t.raised} style={{ marginTop: 14 }} />
            <View style={[st.statRow, { marginTop: 16 }]}>
              <Skeleton height={52} width={"31%"} color={t.raised} radius={10} />
              <Skeleton height={52} width={"31%"} color={t.raised} radius={10} />
              <Skeleton height={52} width={"31%"} color={t.raised} radius={10} />
            </View>
            <Skeleton height={12} width={"85%"} color={t.raised} style={{ marginTop: 16 }} />
          </View>
        )}

        {err && (
          <View style={[st.card, { backgroundColor: t.panel, borderColor: t.alert }]}>
            <Text style={[st.cardHead, { color: t.alert }]}>CONNECTION</Text>
            <Text style={{ color: t.ink }}>{err}</Text>
            <PressScale onPress={load} style={[st.btn, { backgroundColor: t.accent, marginTop: 12 }]}>
              <Text style={{ color: t.bg, fontWeight: "700" }}>Retry</Text>
            </PressScale>
          </View>
        )}

        {/* ── Route Optimizer (hero) ── */}
        {c && (
          <Enter index={0}>
          <View style={[st.card, { backgroundColor: t.panel, borderColor: t.line }]}>
            <View style={st.rowBetween}>
              <Text style={[st.cardHead, { color: t.dim }]}>ROUTE OPTIMIZER</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pill label={arb!.price_status} tone={arb!.price_status === "LIVE" ? "ok" : "bad"} />
                <Pill label={arb!.data_confidence} tone={arb!.data_confidence === "HIGH" ? "ok" : arb!.data_confidence === "MEDIUM" ? "warn" : "bad"} />
              </View>
            </View>
            <Text style={[st.kesLabel, { color: t.dim }]}>
              PROJECTED NET · {c.optimal_market_destination}
            </Text>
            <CountUp value={c.net_profit_projection_kes} style={[st.kesBig, { color: t.accent }]} />
            <View style={st.statRow}>
              <Stat label="EST. YIELD" value={`${c.estimated_yield_kg?.toLocaleString("en-KE") ?? "—"} kg`} />
              <Stat label="LIVE PRICE" value={c.live_market_wholesale_price_per_kg != null ? `KES ${c.live_market_wholesale_price_per_kg}/kg` : "—"} />
              <Stat label={`TRANSIT · ${c.distance_km ?? "—"} KM`} value={fmtKES(c.transit_cost_kes)} />
            </View>
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <Pill
                label={c.logistics_risk_flag}
                tone={c.logistics_risk_flag === "CLEAR" ? "ok" : c.logistics_risk_flag === "WEATHER_DELAY" ? "warn" : "bad"}
              />
            </View>
            <Text style={[st.insight, { color: t.dim }]}>🛣 {arb!.widget_insights.routing_profit_summary}</Text>
          </View>
          </Enter>
        )}

        {/* ── Climate Sentinel ── */}
        {s9 && (
          <Enter index={1}>
          <View style={[st.card, { backgroundColor: t.panel, borderColor: t.line }]}>
            <Text style={[st.cardHead, { color: t.dim }]}>CLIMATE SENTINEL</Text>
            <Text style={{ color: t.ink, fontWeight: "700", marginBottom: 8 }}>
              {s9.current_kenyan_season} · {s9.farm_altitude_zone}
            </Text>
            <View style={st.pillRow}>
              <Pill label={`FROST ${s9.frost_risk ? "RISK" : "OK"}`} tone={s9.frost_risk ? "bad" : "ok"} />
              <Pill label={`DROUGHT ${s9.drought_risk ? "RISK" : "OK"}`} tone={s9.drought_risk ? "bad" : "ok"} />
              <Pill label={`FLOOD ${s9.flood_risk ? "RISK" : "OK"}`} tone={s9.flood_risk ? "bad" : "ok"} />
              <Pill label={`${s9.pre_farming_risk_level.toUpperCase()} RISK`} tone={riskTone(s9.pre_farming_risk_level)} />
            </View>
            <View style={[st.caution, { borderLeftColor: t.alert, backgroundColor: t.raised }]}>
              <Text style={{ color: t.ink, fontSize: 13 }}>⚠ {s9.climate_caution_alert}</Text>
            </View>
            <View style={{ marginTop: 10 }}>
              <LevelBar
                pct={{ Low: 25, Medium: 50, High: 75, Critical: 100 }[s9.pre_farming_risk_level] ?? 50}
                color={s9.pre_farming_risk_level === "Low" ? t.ok : s9.pre_farming_risk_level === "Medium" ? t.accent : t.alert}
                track={t.raised}
              />
            </View>
            {s9.recommended_seed_variety_adjustment && (
              <Text style={[st.insight, { color: t.dim }]}>🌱 {s9.recommended_seed_variety_adjustment}</Text>
            )}
          </View>
          </Enter>
        )}

        {/* ── Market Pricing Matrix ── */}
        {meta && (
          <Enter index={2}>
          <View style={[st.card, { backgroundColor: t.panel, borderColor: t.line }]}>
            <Text style={[st.cardHead, { color: t.dim }]}>MARKET PRICING MATRIX</Text>
            {(meta.payloads.arbitrage?.market_data?.available_markets ?? []).map((m: any) => {
              const winner = m.market_name === c?.optimal_market_destination;
              return (
                <View key={m.market_name} style={[st.marketRow, { borderBottomColor: t.line }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: winner ? t.accent : t.ink, fontWeight: winner ? "800" : "500" }}>
                      {winner ? "★ " : ""}{m.market_name}
                    </Text>
                    <Text style={{ color: t.dim, fontSize: 11, fontFamily: "monospace" }}>
                      {m.distance_km} km · transit {fmtKES(m.transit_cost_kes)}
                    </Text>
                  </View>
                  <Text style={{ color: winner ? t.accent : t.ok, fontFamily: "monospace", fontWeight: "700" }}>
                    KES {m.wholesale_price_per_kg}/kg
                  </Text>
                </View>
              );
            })}
            {arb && <Text style={[st.insight, { color: t.dim }]}>📈 {arb.widget_insights.market_price_summary}</Text>}

            {meta.commodity_feed && (
              <>
                <Text style={[st.cardHead, { color: t.dim, marginTop: 18 }]}>
                  COMMODITY BOARD · {meta.commodity_feed.data_age_minutes} MIN OLD
                </Text>
                {meta.commodity_feed.commodities.map((cm) => {
                  const best = [...cm.quotes].sort((a, b) => b.price - a.price)[0];
                  const up = best.delta >= 0;
                  return (
                    <View key={cm.crop} style={[st.marketRow, { borderBottomColor: t.line }]}>
                      <Text style={{ fontSize: 17, marginRight: 8 }}>{cm.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.ink, fontWeight: "600", textTransform: "capitalize" }}>{cm.crop}</Text>
                        <Text style={{ color: t.dim, fontSize: 11, fontFamily: "monospace" }}>
                          best: {best.market}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: t.ok, fontFamily: "monospace", fontWeight: "700" }}>
                          KES {best.price}/kg
                        </Text>
                        <Text style={{ color: up ? t.ok : t.alert, fontFamily: "monospace", fontSize: 11 }}>
                          {up ? "▲" : "▼"} {Math.abs(best.delta)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
          </Enter>
        )}

        {/* ── Active Deliveries ── */}
        {meta && (
          <Enter index={3}>
          <View style={[st.card, { backgroundColor: t.panel, borderColor: t.line, marginBottom: 110 }]}>
            <Text style={[st.cardHead, { color: t.dim }]}>ACTIVE DELIVERIES</Text>
            <View style={st.rowBetween}>
              <View>
                <Text style={{ color: t.ink, fontWeight: "700" }}>
                  {meta.payloads.replan?.active_delivery?.delivery_id} · {meta.payloads.replan?.active_delivery?.crop_type}
                </Text>
                <Text style={{ color: t.dim, fontSize: 12 }}>
                  {meta.payloads.replan?.active_delivery?.origin} → {meta.payloads.replan?.active_delivery?.original_destination}
                </Text>
              </View>
              <Pill label="IN TRANSIT" tone="warn" />
            </View>
            <PressScale onPress={() => router.push("/autopilot")} style={[st.btn, { borderColor: t.accent, borderWidth: 1, marginTop: 12 }]}>
              <Text style={{ color: t.accent, fontWeight: "700" }}>Open Autopilot for disruption replanning</Text>
            </PressScale>
          </View>
          </Enter>
        )}
      </ScrollView>

      <FAB
        actions={[
          { label: "💬  Ask Apex (chat)", onPress: () => router.push("/chat") },
          { label: "🧭  Engage Autopilot", onPress: () => router.push("/autopilot") },
          { label: "🔄  Refresh telemetry", onPress: load },
        ]}
      />
      <Sidebar open={menu} onClose={() => setMenu(false)} />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={[st.stat, { backgroundColor: t.raised, borderColor: t.line }]}>
      <Text style={{ color: t.accent, fontFamily: "monospace", fontWeight: "700", fontSize: 13 }}>{value}</Text>
      <Text style={{ color: t.dim, fontFamily: "monospace", fontSize: 8.5, letterSpacing: 0.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  body: { padding: 14, gap: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardHead: { fontFamily: "monospace", fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  kesLabel: { fontFamily: "monospace", fontSize: 10, letterSpacing: 1, marginTop: 6 },
  kesBig: { fontSize: 34, fontWeight: "800", marginVertical: 2 },
  statRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 9, alignItems: "center" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  caution: { borderLeftWidth: 3, borderRadius: 8, padding: 10 },
  insight: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  marketRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
});
