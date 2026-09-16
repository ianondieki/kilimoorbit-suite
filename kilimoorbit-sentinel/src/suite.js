/**
 * KilimoOrbit Sentinel — APEX verification catalogue.
 *
 * ONE list of contract checks, consumed by both the CLI runner
 * (src/tests/run_all_tests.js) and the Mission Control dashboard
 * (POST /api/suite). Each case builds its own payload from the fixture
 * library, so cases never share mutable state.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureCache = new Map();
export const loadPayload = (f) => {
  if (!fixtureCache.has(f))
    fixtureCache.set(f, JSON.parse(readFileSync(join(here, "..", "payloads", f), "utf8")));
  return structuredClone(fixtureCache.get(f));
};

const kes = (n) => "KES " + Number(n ?? 0).toLocaleString("en-KE");
const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
const under25 = (s) => words(s) > 0 && words(s) < 25;

const CASES = [
  {
    id: 1, group: "integrity", name: "Cold start → UNKNOWN_ROUTE",
    payload: () => ({}),
    assert: (r) => r?.error_type === "UNKNOWN_ROUTE" && Array.isArray(r?.valid_routes),
    detail: (r) => `error_type = ${r?.error_type}`,
  },
  {
    id: 2, group: "integrity", name: "Integrity: battery 150 → DATA_ERROR",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.vehicle_telemetry.battery_level = 150; return p; },
    assert: (r) => r?.error_type === "DATA_ERROR" && (r?.out_of_bounds_fields ?? []).some((f) => String(f).includes("battery_level")),
    detail: (r) => `fields = ${JSON.stringify(r?.out_of_bounds_fields)}`,
  },
  {
    id: 3, group: "route", name: "Route A · arbitrage_compile",
    payload: () => loadPayload("arbitrage_payload.json"),
    assert: (r) => r?.execution_mode === "arbitrage_compile" && ["HIGH", "MEDIUM", "LOW"].includes(r?.data_confidence)
      && typeof r?.cargo_optimized_route?.optimal_market_destination === "string" && under25(r?.climate_risk_sentinel?.climate_caution_alert),
    detail: (r) => `net ${kes(r?.cargo_optimized_route?.net_profit_projection_kes)} → ${r?.cargo_optimized_route?.optimal_market_destination} · ${r?.cargo_optimized_route?.logistics_risk_flag}`,
  },
  {
    id: 4, group: "route", name: "Route B · user_chat (<25 words)",
    payload: () => loadPayload("user_chat_payload.json"),
    assert: (r) => r?.execution_mode === "user_chat" && under25(r?.chat_response),
    detail: (r) => `"${r?.chat_response}"`,
  },
  {
    id: 5, group: "route", name: "Route C · alert_broadcast CRITICAL",
    payload: () => loadPayload("alert_payload.json"),
    assert: (r) => r?.execution_mode === "alert_broadcast" && r?.severity === "CRITICAL" && r?.requires_immediate_action === true
      && under25(r?.farmer_push_message) && /^[0-9a-f-]{36}$/i.test(String(r?.alert_id)),
    detail: (r) => `"${r?.farmer_push_message}"`,
  },
  {
    id: 6, group: "route", name: "Route D · onboarding_intake",
    payload: () => loadPayload("onboarding_payload.json"),
    assert: (r) => r?.execution_mode === "onboarding_intake" && under25(r?.next_prompt) && Array.isArray(r?.fields_still_needed),
    detail: (r) => `"${r?.next_prompt}"`,
  },
  {
    id: 7, group: "route", name: "Route E · logistics_replan",
    payload: () => loadPayload("replan_payload.json"),
    assert: (r) => r?.execution_mode === "logistics_replan" && ["REROUTED", "DELAYED", "NO_VIABLE_ROUTE"].includes(r?.replan_status),
    detail: (r) => `${r?.replan_status} → ${r?.recommended_alternative_route?.new_destination}`,
  },
  {
    id: 8, group: "integrity", name: "Integrity: stale feed → STALE_DATA + suppression",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.market_data.data_age_minutes = 300; return p; },
    assert: (r) => r?.price_status === "STALE_DATA" && r?.data_confidence === "LOW" && r?.cargo_optimized_route?.net_profit_projection_kes == null,
    detail: (r) => `price_status = ${r?.price_status} · confidence = ${r?.data_confidence} · net = ${r?.cargo_optimized_route?.net_profit_projection_kes ?? "null"}`,
  },
  {
    id: 9, group: "integrity", name: "Integrity: empty market list → DATA_ERROR",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.market_data.available_markets = []; return p; },
    assert: (r) => r?.error_type === "DATA_ERROR",
    detail: (r) => `error_type = ${r?.error_type} · fields = ${JSON.stringify(r?.failed_fields)}`,
  },
  {
    id: 10, group: "climate", name: "Climate: ASAL hot/dry season → Critical risk",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.current_month = "January";
      p.farm_location = { county: "Turkana", sub_county: "Loima", altitude_m: 600, road_type: "murram" };
      return p;
    },
    assert: (r) => r?.climate_risk_sentinel?.pre_farming_risk_level === "Critical" && r?.climate_risk_sentinel?.farm_altitude_zone === "ASAL",
    detail: (r) => `risk = ${r?.climate_risk_sentinel?.pre_farming_risk_level} · zone = ${r?.climate_risk_sentinel?.farm_altitude_zone}`,
  },
  {
    id: 11, group: "memory", name: "Memory: follow-up inherits topic from chat_history",
    payload: () => {
      const p = loadPayload("user_chat_payload.json");
      p.chat_history = [
        { role: "user", text: "Je, bei ya nyanya iko juu wiki hii?" },
        { role: "apex", text: "Bei ya nyanya Meru Main Market iko KES 42 kwa kilo. 🍅" },
      ];
      p.user_message = "Na kesho je, niuze huko?";
      return p;
    },
    assert: (r) => r?.intent_detected === "price_query" && under25(r?.chat_response),
    detail: (r) => `intent = ${r?.intent_detected} · "${r?.chat_response}"`,
  },
  {
    id: 12, group: "climate", name: "Climate: Nyandarua 2600m in July → frost Critical",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.current_month = "July";
      p.farm_location = { county: "Nyandarua", sub_county: "Ol Kalou", altitude_m: 2600, road_type: "tarmac" };
      return p;
    },
    assert: (r) => r?.climate_risk_sentinel?.frost_risk === true && r?.climate_risk_sentinel?.pre_farming_risk_level === "Critical"
      && /frost/i.test(String(r?.climate_risk_sentinel?.recommended_seed_variety_adjustment)),
    detail: (r) => `frost = ${r?.climate_risk_sentinel?.frost_risk} · risk = ${r?.climate_risk_sentinel?.pre_farming_risk_level}`,
  },
  {
    id: 13, group: "climate", name: "Gate §2.4: e-boda at 41°C in February → BATTERY_RISK",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.current_month = "February";
      p.farm_location.road_type = "tarmac";
      p.iot_telemetry.temperature_celsius = 41;
      p.iot_telemetry.rainfall_mm_last_24h = 0;
      return p;
    },
    assert: (r) => r?.cargo_optimized_route?.logistics_risk_flag === "BATTERY_RISK",
    detail: (r) => `flag = ${r?.cargo_optimized_route?.logistics_risk_flag}`,
  },
  {
    id: 14, group: "climate", name: "Gate: 120 mm on murram → ROAD_IMPASSABLE",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.iot_telemetry.rainfall_mm_last_24h = 120; return p; },
    assert: (r) => r?.cargo_optimized_route?.logistics_risk_flag === "ROAD_IMPASSABLE",
    detail: (r) => `flag = ${r?.cargo_optimized_route?.logistics_risk_flag}`,
  },
  {
    id: 15, group: "route", name: "Route B: weather question follows current_month (July)",
    payload: () => {
      const p = loadPayload("user_chat_payload.json");
      p.current_month = "July";
      p.user_message = "What is the weather looking like for my shamba?";
      return p;
    },
    assert: (r) => r?.intent_detected === "weather_query" && under25(r?.chat_response) && !/long rains/i.test(String(r?.chat_response)),
    detail: (r) => `"${r?.chat_response}"`,
  },
  {
    id: 16, group: "route", name: "Route B: number not in payload → never fabricated",
    payload: () => {
      const p = loadPayload("user_chat_payload.json");
      delete p.market_data;
      p.user_message = "What is the maize price in Eldoret today?";
      return p;
    },
    assert: (r) => r?.intent_detected === "price_query" && !/\bKES\s*\d/i.test(String(r?.chat_response)) && under25(r?.chat_response),
    detail: (r) => `"${r?.chat_response}"`,
  },
  {
    id: 17, group: "route", name: "Route B: settings question → layout-safe redirect",
    payload: () => { const p = loadPayload("user_chat_payload.json"); p.user_message = "How do I sign out of my account?"; return p; },
    assert: (r) => r?.intent_detected === "settings_query" && /☰/.test(String(r?.chat_response)),
    detail: (r) => `"${r?.chat_response}"`,
  },
  {
    id: 18, group: "route", name: "Route C: INFO alert → no recommended_action, no escalation",
    payload: () => {
      const p = loadPayload("alert_payload.json");
      p.alert_trigger = { type: "PRICE_SPIKE", severity: "INFO", detail: "Tomato +18% at Wakulima" };
      return p;
    },
    assert: (r) => r?.execution_mode === "alert_broadcast" && r?.requires_immediate_action === false && r?.recommended_action == null
      && r?.auto_escalate_to_cooperative === false && under25(r?.farmer_push_message),
    detail: (r) => `"${r?.farmer_push_message}"`,
  },
  {
    id: 19, group: "integrity", name: "Route C: unknown severity → DATA_ERROR",
    payload: () => { const p = loadPayload("alert_payload.json"); p.alert_trigger.severity = "HUGE"; return p; },
    assert: (r) => r?.error_type === "DATA_ERROR" && (r?.failed_fields ?? []).includes("alert_trigger.severity"),
    detail: (r) => `fields = ${JSON.stringify(r?.failed_fields)}`,
  },
  {
    id: 20, group: "route", name: "Route D: step 5 → farm_risk_preview populated",
    payload: () => {
      const p = loadPayload("onboarding_payload.json");
      p.onboarding_step = 5;
      p.partial_profile = { ...p.partial_profile, intended_crop: "potato", field_area_acres: 1.5, vehicle_access: "e-boda", road_type: "murram" };
      return p;
    },
    assert: (r) => r?.onboarding_step === 5 && typeof r?.farm_risk_preview?.pre_farming_risk_level === "string"
      && Array.isArray(r?.fields_still_needed) && r.fields_still_needed.length === 0,
    detail: (r) => `preview risk = ${r?.farm_risk_preview?.pre_farming_risk_level} · ${r?.farm_risk_preview?.current_kenyan_season}`,
  },
  {
    id: 21, group: "integrity", name: "Route D: onboarding_step 9 → DATA_ERROR",
    payload: () => { const p = loadPayload("onboarding_payload.json"); p.onboarding_step = 9; return p; },
    assert: (r) => r?.error_type === "DATA_ERROR" && (r?.failed_fields ?? []).includes("onboarding_step"),
    detail: (r) => `fields = ${JSON.stringify(r?.failed_fields)}`,
  },
  {
    id: 22, group: "route", name: "Route E: no alternatives → NO_VIABLE_ROUTE + escalation",
    payload: () => { const p = loadPayload("replan_payload.json"); p.available_alternative_routes = []; return p; },
    assert: (r) => r?.replan_status === "NO_VIABLE_ROUTE" && r?.escalate_to_cooperative === true && r?.recommended_alternative_route?.route_id == null,
    detail: (r) => `${r?.replan_status} · escalate = ${r?.escalate_to_cooperative}`,
  },
  {
    id: 23, group: "route", name: "Route E: reroute cost exceeds margin → DELAYED",
    payload: () => {
      const p = loadPayload("replan_payload.json");
      p.available_alternative_routes = [{ route_id: "ALT-009", new_destination: "Nyahururu", time_penalty_minutes: 30, cost_penalty_kes: 20000, cargo_risk_level: "Low" }];
      return p;
    },
    assert: (r) => r?.replan_status === "DELAYED" && r?.recommended_alternative_route?.revised_net_profit_kes < 0,
    detail: (r) => `${r?.replan_status} · revised = ${r?.recommended_alternative_route?.revised_net_profit_kes}`,
  },
  {
    id: 24, group: "integrity", name: "Route E: malformed routes (string) → DATA_ERROR, not crash",
    payload: () => { const p = loadPayload("replan_payload.json"); p.available_alternative_routes = "B5 via Gilgil"; return p; },
    assert: (r) => r?.error_type === "DATA_ERROR" && (r?.failed_fields ?? []).includes("available_alternative_routes"),
    detail: (r) => `error_type = ${r?.error_type}`,
  },
  {
    id: 26, group: "integrity", name: "Integrity: Kiswahili month 'Machi' → Long Rains; 'Bananas' → DATA_ERROR",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.current_month = "Machi"; return p; },
    assert: (r) => /Long Rains/.test(String(r?.climate_risk_sentinel?.current_kenyan_season)),
    detail: (r) => `season = ${r?.climate_risk_sentinel?.current_kenyan_season}`,
  },
  {
    id: 27, group: "integrity", name: "Integrity: unknown month → DATA_ERROR (never a silent Hot/Dry)",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.current_month = "Bananas"; return p; },
    assert: (r) => r?.error_type === "DATA_ERROR" && (r?.failed_fields ?? []).includes("current_month"),
    detail: (r) => `fields = ${JSON.stringify(r?.failed_fields)}`,
  },
  {
    id: 28, group: "integrity", name: "Integrity: crop_type 'constructor' never yields NaN",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.crop_type = "constructor"; return p; },
    assert: (r) => r?.execution_mode === "arbitrage_compile" && Number.isFinite(r?.cargo_optimized_route?.net_profit_projection_kes) && !/NaN/.test(JSON.stringify(r)),
    detail: (r) => `net = ${r?.cargo_optimized_route?.net_profit_projection_kes} · yield_basis = ${r?.cargo_optimized_route?.yield_basis}`,
  },
  {
    id: 29, group: "integrity", name: "Route A: payload estimated_yield_kg is used verbatim (§1.1)",
    payload: () => { const p = loadPayload("arbitrage_payload.json"); p.estimated_yield_kg = 1234; return p; },
    assert: (r) => r?.cargo_optimized_route?.estimated_yield_kg === 1234 && r?.cargo_optimized_route?.yield_basis === "payload",
    detail: (r) => `yield = ${r?.cargo_optimized_route?.estimated_yield_kg} (${r?.cargo_optimized_route?.yield_basis})`,
  },
  {
    id: 30, group: "integrity", name: "Route E: unknown cargo_risk_level ranks Medium, never leaks",
    payload: () => { const p = loadPayload("replan_payload.json"); p.available_alternative_routes[0].cargo_risk_level = "constructor"; return p; },
    assert: (r) => r?.recommended_alternative_route?.cargo_spoilage_risk === "Medium" && !/constructor/.test(String(r?.widget_insights?.replan_summary)),
    detail: (r) => `spoilage = ${r?.recommended_alternative_route?.cargo_spoilage_risk}`,
  },
  {
    id: 25, group: "integrity", name: "Integrity: market price 900 KES/kg → out-of-bounds, indexed",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.market_data.available_markets.forEach((m) => (m.wholesale_price_per_kg = 900));
      return p;
    },
    assert: (r) => r?.error_type === "DATA_ERROR" && (r?.out_of_bounds_fields ?? []).filter((f) => f === "crop_price_per_kg").length === 1
      && (r?.out_of_bounds_fields ?? []).includes("market_data.available_markets[1].wholesale_price_per_kg"),
    detail: (r) => `oob = ${JSON.stringify(r?.out_of_bounds_fields)}`,
  },
];

export const SUITE = CASES.sort((a, b) => a.id - b.id);

/** Run every case through `callApex`; returns dashboard-ready rows. */
export async function runSuite(callApex, { onResult } = {}) {
  const results = [];
  for (const t of SUITE) {
    const t0 = Date.now();
    let r;
    try { r = await callApex(t.payload()); }
    catch (err) { r = { execution_mode: "error", error_type: "SUITE_THROW", error_message: String(err?.message ?? err) }; }
    let pass = false;
    try { pass = Boolean(t.assert(r)); } catch { pass = false; }
    let detail = "";
    try { detail = String(t.detail(r)); } catch { detail = JSON.stringify(r).slice(0, 160); }
    const row = { id: t.id, group: t.group, name: t.name, pass, detail, latency_ms: Date.now() - t0, raw: r };
    results.push(row);
    onResult?.(row);
  }
  return results;
}
