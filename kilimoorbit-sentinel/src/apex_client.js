/**
 * KilimoOrbit Sentinel — APEX client (Apex v2.0 contract)
 * --------------------------------------------------------
 * LIVE  — Gemini (@google/genai), temperature 0, system instruction loaded
 *         verbatim from src/apex_system_prompt.md (Apex v2.0). Every LIVE
 *         response passes through `harden()`, which re-enforces the parts of
 *         the contract that are deterministic (§1.3 price sourcing, stale
 *         suppression, §4.2 word limits, UUIDs) so a model slip can never
 *         reach a farmer's phone.
 * MOCK  — deterministic offline engine implementing the SAME v2.0 contract:
 *         Section 1 integrity bounds, Section 2 Kenyan climate matrix,
 *         Section 3 route schemas, Section 3.5 error schemas.
 *         Active when GEMINI_API_KEY is absent or APEX_MOCK=1.
 *
 * Exported: callApex(payload), engineMode(), APEX_SYSTEM, MODEL, VALID_ROUTES,
 *           validatePayload(payload), harden(result, payload)  (the last two
 *           are exported for the test-suite only).
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";

const here = dirname(fileURLToPath(import.meta.url));
export const MODEL = process.env.APEX_MODEL || "gemini-2.5-flash";

/** Apex v2.0 system prompt — loaded verbatim. Swap the .md file to update. */
export const APEX_SYSTEM = readFileSync(
  join(here, "apex_system_prompt.md"),
  "utf8"
);

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 1 — DATA INTEGRITY (deterministic code for BOTH engines)
 * ════════════════════════════════════════════════════════════════════════ */
export const VALID_ROUTES = [
  "arbitrage_compile",
  "user_chat",
  "alert_broadcast",
  "onboarding_intake",
  "logistics_replan",
];

const ALERT_TYPES = ["WEATHER_ANOMALY", "PRICE_SPIKE", "PRICE_CRASH", "PEST_PRESSURE", "VEHICLE_FAULT", "SOIL_CRITICAL"];
const SEVERITIES = ["INFO", "WARNING", "CRITICAL"];
const DISRUPTIONS = ["ROAD_CLOSURE", "WEATHER_BLOCK", "VEHICLE_FAULT", "MARKET_CLOSED"];

/* §1.2 telemetry sanity bounds */
const BOUNDS = [
  { path: "vehicle_telemetry.battery_level", label: "battery_level", min: 0, max: 100 },
  { path: "iot_telemetry.soil_moisture", label: "soil_moisture", min: 0, max: 100 },
  { path: "iot_telemetry.temperature_celsius", label: "temperature_celsius", min: -10, max: 55 },
  { path: "iot_telemetry.rainfall_mm_last_24h", label: "rainfall_mm", min: 0, max: 300 },
  { path: "vehicle_telemetry.charge_kwh", label: "vehicle_charge_kwh", min: 0, max: 150 },
  { path: "field_area_acres", label: "field_area_acres", min: 0.1, max: 5000 },
];

const REQUIRED = {
  arbitrage_compile: ["crop_type", "farm_location", "market_data", "current_month", "vehicle_telemetry"],
  user_chat: ["user_message", "current_screen"],
  alert_broadcast: ["alert_trigger", "alert_trigger.type", "alert_trigger.severity", "affected_farmer_ids"],
  onboarding_intake: ["onboarding_step", "partial_profile"],
  logistics_replan: ["active_delivery", "disruption_event", "available_alternative_routes"],
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.hasOwn(o, String(k));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const dig = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const missing = (v) => v === undefined || v === null || v === "unknown" || v === "";

/**
 * Full §1 validation for a payload. Returns { failed, oob } — both empty means
 * the route may proceed. Structural checks go beyond "key present": a market
 * without a numeric price, a non-array farmer list, or an onboarding step of
 * 9 are all DATA_ERRORs rather than crashes or silent NaNs.
 */
export function validatePayload(payload, mode) {
  const failed = [];
  const oob = [];
  const fail = (f) => { if (!failed.includes(f)) failed.push(f); };
  const bound = (f) => { if (!oob.includes(f)) oob.push(f); };

  if (!has(REQUIRED, mode)) return { failed: ["execution_mode"], oob: [] };
  for (const f of REQUIRED[mode]) if (missing(dig(payload, f))) fail(f);

  switch (mode) {
    case "arbitrage_compile": {
      if (!failed.includes("current_month") && monthIndex(payload.current_month) < 0) fail("current_month");
      if (!failed.includes("farm_location") && !isObj(payload.farm_location)) fail("farm_location");
      // §1.1: the yield behind the headline number must come from the payload —
      // either directly (estimated_yield_kg) or derivably (field_area_acres).
      if (payload.estimated_yield_kg != null && !(isNum(payload.estimated_yield_kg) && payload.estimated_yield_kg > 0)) fail("estimated_yield_kg");
      if (payload.estimated_yield_kg == null && payload.field_area_acres == null) fail("field_area_acres");
      if (!failed.includes("vehicle_telemetry") && !isObj(payload.vehicle_telemetry)) fail("vehicle_telemetry");
      if (payload.iot_telemetry != null && !isObj(payload.iot_telemetry)) fail("iot_telemetry");
      if (!failed.includes("market_data")) {
        const mkts = dig(payload, "market_data.available_markets");
        // §1.3: arbitrage is meaningless without at least one market to rank.
        if (!Array.isArray(mkts) || mkts.length === 0) fail("market_data.available_markets");
        else
          mkts.forEach((m, i) => {
            if (!isObj(m)) return fail(`market_data.available_markets[${i}]`);
            if (missing(m.market_name)) fail(`market_data.available_markets[${i}].market_name`);
            if (!isNum(m.wholesale_price_per_kg)) fail(`market_data.available_markets[${i}].wholesale_price_per_kg`);
            else if (m.wholesale_price_per_kg < 0.5 || m.wholesale_price_per_kg > 500) {
              bound("crop_price_per_kg");
              bound(`market_data.available_markets[${i}].wholesale_price_per_kg`);
            }
            if (!isNum(m.transit_cost_kes)) fail(`market_data.available_markets[${i}].transit_cost_kes`);
          });
        const age = dig(payload, "market_data.data_age_minutes");
        if (age != null && !isNum(age)) fail("market_data.data_age_minutes");
      }
      if (payload.field_area_acres != null && !isNum(payload.field_area_acres)) fail("field_area_acres");
      break;
    }
    case "user_chat":
      if (typeof payload.user_message !== "string" || !payload.user_message.trim()) fail("user_message");
      if (typeof payload.current_screen !== "string") fail("current_screen");
      if (payload.chat_history != null && !Array.isArray(payload.chat_history)) fail("chat_history");
      break;
    case "alert_broadcast": {
      const t = payload.alert_trigger;
      if (!failed.includes("alert_trigger") && !isObj(t)) fail("alert_trigger");
      if (isObj(t) && !missing(t.severity) && !SEVERITIES.includes(t.severity)) fail("alert_trigger.severity");
      if (isObj(t) && !missing(t.type) && !(typeof t.type === "string" && ALERT_TYPES.includes(t.type.toUpperCase()))) fail("alert_trigger.type");
      const ids = payload.affected_farmer_ids;
      if (!failed.includes("affected_farmer_ids") && (!Array.isArray(ids) || ids.length === 0)) fail("affected_farmer_ids");
      break;
    }
    case "onboarding_intake": {
      const s = payload.onboarding_step;
      if (!failed.includes("onboarding_step") && !(Number.isInteger(s) && s >= 1 && s <= 5)) fail("onboarding_step");
      if (!failed.includes("partial_profile") && !isObj(payload.partial_profile)) fail("partial_profile");
      break;
    }
    case "logistics_replan": {
      const d = payload.active_delivery;
      if (!failed.includes("active_delivery") && !isObj(d)) fail("active_delivery");
      if (isObj(d)) {
        if (missing(d.delivery_id)) fail("active_delivery.delivery_id");
        if (!isNum(d.original_net_profit_kes)) fail("active_delivery.original_net_profit_kes");
      }
      const e = payload.disruption_event;
      if (!failed.includes("disruption_event") && !isObj(e)) fail("disruption_event");
      if (isObj(e) && !(typeof e.type === "string" && DISRUPTIONS.includes(e.type.toUpperCase()))) fail("disruption_event.type");
      const routes = payload.available_alternative_routes;
      if (!failed.includes("available_alternative_routes") && !Array.isArray(routes)) fail("available_alternative_routes");
      if (Array.isArray(routes))
        routes.forEach((r, i) => {
          if (!isObj(r)) return fail(`available_alternative_routes[${i}]`);
          if (missing(r.route_id)) fail(`available_alternative_routes[${i}].route_id`);
          if (!isNum(r.time_penalty_minutes)) fail(`available_alternative_routes[${i}].time_penalty_minutes`);
          if (!isNum(r.cost_penalty_kes)) fail(`available_alternative_routes[${i}].cost_penalty_kes`);
        });
      break;
    }
  }

  for (const b of BOUNDS) {
    const v = dig(payload, b.path);
    if (typeof v === "number" && (!Number.isFinite(v) || v < b.min || v > b.max)) bound(b.label);
  }
  return { failed, oob };
}

const unknownRoute = (received) => ({
  execution_mode: "error",
  error_type: "UNKNOWN_ROUTE",
  received_value: received == null ? null : String(received).slice(0, 80),
  valid_routes: VALID_ROUTES,
  error_message: "The execution_mode key is missing or does not match any defined Apex route.",
});

const dataError = (failed, oob) => ({
  execution_mode: "error",
  error_type: "DATA_ERROR",
  failed_fields: failed,
  out_of_bounds_fields: oob,
  error_message: "One or more required fields are missing or outside physical telemetry bounds.",
  recovery_suggestion: "Resync the IoT sensor and vehicle telemetry feed, then retransmit the payload.",
});

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 2 — KENYAN CLIMATE RISK ENGINE (deterministic implementation)
 * ════════════════════════════════════════════════════════════════════════ */
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SW = ["januari","februari","machi","aprili","mei","juni","julai","agosti","septemba","oktoba","novemba","desemba"];
const MONTHS_SW_ALT = { juli: 6, mac: 2, mach: 2, ago: 7, sep: 8, okt: 9, nov: 10, des: 11 };
const ASAL_COUNTIES = ["Turkana","Marsabit","Isiolo","Garissa","Wajir","Mandera","Samburu","Tana River"];
const FROST_COUNTIES = ["Meru","Nyandarua","Limuru","Kericho","Kiambu","Nyeri"];
const COAST_NYANZA = ["Kisumu","Homa Bay","Siaya","Mombasa","Kilifi","Kwale","Busia","Migori","Lamu","Tana River"];

const norm = (s) => String(s ?? "").trim().toLowerCase();
/** English or Kiswahili month name (full or 3-letter) → 0–11, or -1 when unrecognised. */
export const monthIndex = (month) => {
  if (typeof month !== "string") return -1;
  const m = norm(month);
  if (m.length < 3) return -1;
  const en = MONTHS.findIndex((x) => x.toLowerCase() === m || (m.length === 3 && x.toLowerCase().startsWith(m)));
  if (en >= 0) return en;
  const sw = MONTHS_SW.findIndex((x) => x === m || x.startsWith(m));
  if (sw >= 0) return sw;
  return Object.hasOwn(MONTHS_SW_ALT, m) ? MONTHS_SW_ALT[m] : -1;
};

export function season(month) {
  const i = monthIndex(month);
  if (i < 0) return { name: "Season unknown (current_month unrecognised)", key: null };
  if (i >= 2 && i <= 4) return { name: "Long Rains (Machi–Mei)", key: "LONG_RAINS" };
  if (i >= 9 && i <= 11) return { name: "Short Rains (Oktoba–Desemba)", key: "SHORT_RAINS" };
  if (i >= 5 && i <= 8) return { name: "Cold/Dry Season (Juni–Septemba)", key: "COLD_DRY" };
  return { name: "Hot/Dry Season (Januari–Februari)", key: "HOT_DRY" };
}

const inList = (list, county) => list.some((c) => norm(c) === norm(county));

function altitudeZone(altitude_m, county) {
  if (inList(ASAL_COUNTIES, county)) return "ASAL";
  if (!isNum(altitude_m)) return "MIDLAND";
  if (altitude_m >= 2000) return "HIGHLAND";
  if (altitude_m >= 1000) return "MIDLAND";
  return "LOWLAND";
}

/** Full §2 assessment for a farm × month. */
function climateSentinel(loc, month, crop) {
  const county = isObj(loc) ? loc.county : undefined;
  const altitude_m = isObj(loc) ? loc.altitude_m : undefined;
  const s = season(month);
  const zone = altitudeZone(altitude_m, county);
  const alt = isNum(altitude_m) ? altitude_m : 1500;
  const place = county ?? "your shamba";

  const frost_risk = s.key === "COLD_DRY" && (alt > 1800 || inList(FROST_COUNTIES, county));
  const drought_risk = s.key === "HOT_DRY" || zone === "ASAL";
  const flood_risk =
    s.key === "LONG_RAINS" || (s.key === "SHORT_RAINS" && inList(COAST_NYANZA, county));
  const landslide = s.key === "LONG_RAINS" && alt > 2000;
  // §2.2 <1,000m: heat + pest pressure escalates Jan–Mar.
  const heatStress = zone === "LOWLAND" && (s.key === "HOT_DRY" || monthIndex(month) === 2);

  // Risk level only ever escalates — a Critical rating must never be downgraded.
  const RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };
  let level = "Low";
  const escalate = (l) => { if (RANK[l] > RANK[level]) level = l; };
  if (flood_risk || drought_risk) escalate("Medium");
  if (frost_risk || landslide || heatStress || s.key === "SHORT_RAINS") escalate("High");
  if ((frost_risk && alt > 2500) || (drought_risk && zone === "ASAL")) escalate("Critical");

  let variety = null;
  if (s.key === "SHORT_RAINS")
    variety = "Plant early-maturing lines such as H614D maize under 90 days or Serenut groundnut to beat erratic cessation.";
  else if (s.key === "HOT_DRY" || heatStress)
    variety = "Switch to drought-tolerant lines such as KATL maize or WEMA varieties; irrigation is a prerequisite.";
  else if (frost_risk)
    variety = "Use frost-tolerant lines or move tomato, potato and beans under greenhouse or fleece cover.";
  else if (s.key === "LONG_RAINS" && level !== "Low")
    variety = `Favour fungal-resistant ${crop ?? "crop"} lines and raised beds to counter leaching and disease pressure.`;

  const cautionByKey = {
    LONG_RAINS: `Long Rains over ${place}: flash flooding, nutrient leaching and murram road closures likely${landslide ? "; landslide watch above 2000m" : ""}.`,
    SHORT_RAINS: `Short Rains over ${place}: onset is erratic and mid-season failure probability is high; stagger planting dates.`,
    COLD_DRY: frost_risk
      ? `Cold season frost watch for ${place} above 1800m: protect seedlings overnight and delay frost-sensitive transplanting.`
      : `Cold dry season over ${place}: expect slow crop maturation and plan longer cycles.`,
    HOT_DRY: `Hot dry season over ${place}: high evapotranspiration and intense Fall Armyworm pressure; scout fields twice weekly.`,
    null: `Season could not be determined for ${place}: confirm the calendar month before planting or dispatch decisions.`,
  };

  return {
    current_kenyan_season: s.name,
    season_key: s.key,
    farm_altitude_zone: zone,
    pre_farming_risk_level: level,
    frost_risk,
    drought_risk,
    flood_risk,
    recommended_seed_variety_adjustment: variety,
    climate_caution_alert: cautionByKey[s.key],
  };
}

/* §2.4 logistics weather gate (+ ROAD_IMPASSABLE for extreme rainfall on unpaved roads) */
const UNPAVED = ["murram", "murram_road", "footpath"];
function weatherGate(payload, seasonKey) {
  const road = norm(payload.farm_location?.road_type);
  const rain = payload.iot_telemetry?.rainfall_mm_last_24h ?? 0;
  const temp = payload.iot_telemetry?.temperature_celsius ?? 25;
  const vt = norm(payload.vehicle_telemetry?.vehicle_type);
  const unpaved = UNPAVED.includes(road);
  if (unpaved && rain > 80) return "ROAD_IMPASSABLE";
  if (seasonKey === "LONG_RAINS" && unpaved && rain > 25) return "WEATHER_DELAY";
  if (seasonKey === "HOT_DRY" && vt === "e-boda" && temp > 38) return "BATTERY_RISK";
  return "CLEAR";
}

/* ── Route B helpers ──────────────────────────────────────────────────── */
const INTENT_RES = {
  price: /\b(bei|price|prices|nyanya|tomato|soko|masoko|market|kg|sell|uza|niuze|mahindi|maize|maharagwe|beans|vitunguu|onions?|viazi|potato(es)?|kabichi|cabbage|karoti|carrots?|ndizi|bananas?|parachichi|avocados?|machungwa|oranges?)\b/i,
  weather: /\b(mvua|rain|rains|weather|hali ya hewa|frost|baridi|joto|msimu|season|drought|ukame|mafuriko|flood)\b/i,
  logistics: /\b(route|routes|deliver|delivery|usafiri|boda|e-boda|gari|charge|battery|betri|safari)\b/i,
};
const FOLLOW_UP_RE = /\b(je|na|what about|how about|why|kwa nini|there|huko|hapo|pia|tena|again|tomorrow|kesho)\b/i;
const SWAHILI_RE = /\b(je|bei|nyanya|niambie|habari|shamba|soko|mvua|iko|kwa|leo|kesho|mahindi|maharagwe|sasa|nini|vipi|aje)\b/i;

/* crop lexicon: English + Kiswahili → canonical key + Swahili name */
const CROPS = [
  { key: "tomato", sw: "nyanya", re: /\b(tomato(es)?|nyanya)\b/i },
  { key: "maize", sw: "mahindi", re: /\b(maize|corn|mahindi)\b/i },
  { key: "beans", sw: "maharagwe", re: /\b(beans?|maharagwe)\b/i },
  { key: "onions", sw: "vitunguu", re: /\b(onions?|vitunguu)\b/i },
  { key: "potatoes", sw: "viazi", re: /\b(potato(es)?|viazi)\b/i },
  { key: "cabbage", sw: "kabichi", re: /\b(cabbages?|kabichi)\b/i },
  { key: "carrots", sw: "karoti", re: /\b(carrots?|karoti)\b/i },
  { key: "bananas", sw: "ndizi", re: /\b(bananas?|ndizi)\b/i },
  { key: "avocado", sw: "parachichi", re: /\b(avocados?|parachichi)\b/i },
  { key: "oranges", sw: "machungwa", re: /\b(oranges?|machungwa)\b/i },
  { key: "kale", sw: "sukuma wiki", re: /\b(kale|sukuma( wiki)?)\b/i },
  { key: "mango", sw: "maembe", re: /\b(mango(es)?|maembe|embe)\b/i },
];
const cropOf = (text) => CROPS.find((c) => c.re.test(String(text ?? "")));

/** Bound conversation memory regardless of client behavior (token + abuse guard). */
function trimHistory(p) {
  if (!Array.isArray(p.chat_history)) return p;
  return {
    ...p,
    chat_history: p.chat_history.slice(-8).map((h) => ({
      role: h?.role === "user" ? "user" : "apex",
      text: String(h?.text ?? "").slice(0, 280),
    })),
  };
}

/* Conservative Kenyan smallholder yields (kg per acre) for §3A step 3. */
const YIELD_KG_PER_ACRE = {
  tomato: 4000, tomatoes: 4000, cabbage: 6000, potato: 4500, potatoes: 4500,
  onion: 3500, onions: 3500, carrot: 5000, carrots: 5000,
  maize: 800, beans: 350, kale: 3000, sukuma: 3000,
  orange: 4500, oranges: 4500, banana: 6000, bananas: 6000,
  mango: 3500, mangoes: 3500, avocado: 3000, avocados: 3000,
  default: 1000,
};

/* ════════════════════════════════════════════════════════════════════════
 * MOCK ENGINE — Apex v2.0 route implementations
 * ════════════════════════════════════════════════════════════════════════ */
function mockEngine(payload) {
  const mode = payload?.execution_mode;
  if (!mode || !VALID_ROUTES.includes(mode)) return unknownRoute(mode);

  const { failed, oob } = validatePayload(payload, mode);
  if (failed.length || oob.length) return dataError(failed, oob);

  switch (mode) {
    /* ── ROUTE A ─────────────────────────────────────────────────────── */
    case "arbitrage_compile": {
      const markets = payload.market_data.available_markets; // non-empty — validatePayload() guarantees it
      const age = payload.market_data.data_age_minutes ?? 9999;
      const stale = age > 120;
      // §3A.5: projections are suppressed only at LOW — stale data must therefore tag LOW.
      const confidence = stale ? "LOW" : age < 60 ? "HIGH" : "MEDIUM";
      const sentinel = climateSentinel(payload.farm_location, payload.current_month, payload.crop_type);
      const { season_key, ...climate_risk_sentinel } = sentinel;

      const cropKey = norm(payload.crop_type);
      const yieldFromPayload = isNum(payload.estimated_yield_kg) && payload.estimated_yield_kg > 0;
      const yieldKg = yieldFromPayload
        ? Math.round(payload.estimated_yield_kg)
        : Math.round(payload.field_area_acres * (has(YIELD_KG_PER_ACRE, cropKey) ? YIELD_KG_PER_ACRE[cropKey] : YIELD_KG_PER_ACRE.default));
      const yieldNote = yieldFromPayload
        ? null
        : `Yield of ${yieldKg.toLocaleString("en-KE")} kg is assumed from ${payload.field_area_acres} acres at a conservative regional rate.`;
      const ranked = markets
        .map((m) => ({ ...m, gross: Math.round(m.wholesale_price_per_kg * yieldKg) }))
        .map((m) => ({ ...m, net: m.gross - m.transit_cost_kes }))
        .sort((a, b) => b.net - a.net);
      const best = ranked[0];
      const flag = weatherGate(payload, season_key);
      const suppress = stale;
      const crop = String(payload.crop_type);
      const rangeNote = flag === "BATTERY_RISK" ? " E-boda range cut 15% for heat (§2.4)." : "";

      return {
        execution_mode: "arbitrage_compile",
        data_confidence: confidence,
        price_status: stale ? "STALE_DATA" : "LIVE",
        cargo_optimized_route: {
          crop_type: crop,
          optimal_market_destination: String(best.market_name),
          distance_km: isNum(best.distance_km) ? best.distance_km : null,
          live_market_wholesale_price_per_kg: suppress ? null : best.wholesale_price_per_kg,
          estimated_yield_kg: yieldKg,
          gross_revenue_kes: suppress ? null : best.gross,
          transit_cost_kes: best.transit_cost_kes,
          net_profit_projection_kes: suppress ? null : best.net,
          logistics_risk_flag: flag,
          yield_basis: yieldFromPayload ? "payload" : "assumed_from_field_area",
        },
        climate_risk_sentinel,
        widget_insights: {
          market_price_summary: suppress
            ? "Market feed is older than two hours so live pricing is withheld until resync."
            : `${crop} wholesale peaks at KES ${best.wholesale_price_per_kg} per kg in ${best.market_name}, leading ${ranked.length} tracked masoko.`,
          routing_profit_summary: suppress
            ? "Profit projection suppressed while price feed is stale."
            : flag === "CLEAR"
              ? `Projected net KES ${best.net.toLocaleString("en-KE")} after KES ${best.transit_cost_kes.toLocaleString("en-KE")} transit on the ${best.distance_km ?? "—"} km run.`
              : `Net KES ${best.net.toLocaleString("en-KE")} projected but dispatch is gated ${flag.replace("_", " ").toLowerCase()}; re-check after refresh.${rangeNote}`,
          data_quality_notice:
            confidence !== "HIGH"
              ? "Market data is aging — refresh the price feed for full-confidence projections."
              : yieldNote,
        },
        ...(stale && {
          stale_data_warning: {
            price_status: "STALE_DATA",
            market_data_age_minutes: age,
            last_valid_price_per_kg: best.wholesale_price_per_kg,
            profit_projection_suppressed: true,
            stale_data_message: "Price feed exceeds 120 minutes old; profit projections are suppressed until refresh.",
          },
        }),
      };
    }

    /* ── ROUTE B ─────────────────────────────────────────────────────── */
    case "user_chat": {
      const msg = String(payload.user_message ?? "").slice(0, 500);
      const m = payload.market_data?.available_markets?.find?.((x) => isObj(x) && isNum(x.wholesale_price_per_kg));
      const settingsQ = /\b(settings?|notification|sign ?out|log ?out|account|battery plan|mipangilio)\b/i.test(msg);
      const historyQ = /\b(history|export|spreadsheet|timeline|gps|historia|csv)\b/i.test(msg);
      let priceQ = INTENT_RES.price.test(msg);
      let weatherQ = INTENT_RES.weather.test(msg);
      let logisticsQ = INTENT_RES.logistics.test(msg);
      const sw = SWAHILI_RE.test(msg);
      const hist = Array.isArray(payload.chat_history) ? payload.chat_history : [];

      // Conversation memory: an elliptical follow-up ("Na kesho je?", "what about
      // tomorrow?") inherits the most recent topic found in chat_history.
      if (!settingsQ && !historyQ && !priceQ && !weatherQ && !logisticsQ) {
        const words = msg.trim().split(/\s+/).filter(Boolean).length;
        if (hist.length && (FOLLOW_UP_RE.test(msg) || words <= 4)) {
          for (let i = hist.length - 1; i >= 0; i--) {
            const txt = String(hist[i]?.text ?? "");
            if (INTENT_RES.price.test(txt)) { priceQ = true; break; }
            if (INTENT_RES.weather.test(txt)) { weatherQ = true; break; }
            if (INTENT_RES.logistics.test(txt)) { logisticsQ = true; break; }
          }
        }
      }

      // Which crop is the farmer asking about? Message first, then history, then
      // the payload's crop_type. The payload's market_data is assumed to quote
      // that crop — a different crop has no live reading (§1.1: never fabricate).
      const payloadCrop = cropOf(payload.crop_type) ?? (payload.crop_type ? { key: norm(payload.crop_type), sw: norm(payload.crop_type) } : null);
      const askedCrop =
        cropOf(msg) ??
        [...hist].reverse().map((h) => cropOf(h?.text)).find(Boolean) ??
        payloadCrop ??
        CROPS[0];
      const cropMatchesFeed = !payloadCrop || askedCrop.key === payloadCrop.key;

      const s = season(payload.current_month);
      const WEATHER = {
        LONG_RAINS: {
          en: "Long Rains are active — expect heavy showers and soft murram roads; plan shamba work for dry morning windows! 🌧️",
          sw: "Mvua za masika zinaendelea — tarajia mvua kubwa na barabara za murram kuwa laini; fanya kazi ya shamba asubuhi kavu! 🌧️",
        },
        SHORT_RAINS: {
          en: "Short Rains are in play — onset is erratic, so stagger planting and keep early-maturing seed ready! 🌦️",
          sw: "Mvua za vuli zimeanza — mwanzo hauaminiki, panda kwa awamu na weka mbegu za kukomaa haraka tayari! 🌦️",
        },
        COLD_DRY: {
          en: "Cold dry season — watch overnight frost above 1800m and expect slower crop maturation this cycle! 🥶",
          sw: "Kipindi cha baridi kavu — chunga barafu usiku juu ya mita 1800 na tarajia mazao kukomaa polepole! 🥶",
        },
        HOT_DRY: {
          en: "Hot dry season — high evaporation and Fall Armyworm pressure; irrigate early and scout maize twice weekly! ☀️",
          sw: "Kiangazi kikali — maji yanakauka haraka na viwavi jeshi wapo; mwagilia mapema na kagua mahindi mara mbili kwa wiki! ☀️",
        },
        null: {
          en: "I can't place this month on the Kenyan calendar yet — check the Climate Sentinel card for your live seasonal window! 🌦️",
          sw: "Siwezi kutambua mwezi huu kwenye kalenda bado — angalia kadi ya Climate Sentinel kwa msimu wako wa sasa! 🌦️",
        },
      }[s.key];

      let intent = "general_advisory", reply;
      if (settingsQ) {
        intent = "settings_query";
        reply = "Tap ☰ (top left) to access Settings, Notification Profiles, and Sign Out.";
      } else if (historyQ) {
        intent = "unknown";
        reply = "That detail isn't in this chat view — check the 'Market Pricing Matrix' card on your dashboard for live trends! 📊";
      } else if (priceQ && m && cropMatchesFeed) {
        intent = "price_query";
        reply = sw
          ? `Bei ya ${askedCrop.sw} ${m.market_name} iko KES ${m.wholesale_price_per_kg} kwa kilo — soko liko juu kidogo wiki hii, mavuno yataleta faida! 🍅`
          : `${cap(askedCrop.key)} is trading at KES ${m.wholesale_price_per_kg} per kg in ${m.market_name} — the soko is running slightly hot this week! 🍅`;
      } else if (priceQ) {
        intent = "price_query";
        reply = sw
          ? "Sina usomaji wa moja kwa moja wa bei hiyo sasa — hakikisha sensa yako ya IoT imesawazishwa kisha ujaribu tena! 🔄"
          : "I don't have that live reading right now — make sure your IoT sensor is synced and retry! 🔄";
      } else if (weatherQ) {
        intent = "weather_query";
        reply = sw ? WEATHER.sw : WEATHER.en;
      } else if (logisticsQ) {
        intent = "logistics_query";
        reply = sw
          ? "Hali ya e-boda yako iko kwenye kadi ya Route Optimizer — ifungue kuona chaji na njia bora sasa! 🛵"
          : "Your e-boda fleet status lives on the Route Optimizer card — open it for live charge and routing intel! 🛵";
      } else {
        reply = sw
          ? "Karibu! Niulize kuhusu bei za masoko, hali ya hewa, au usafiri wa mazao nikupe jibu kali zaidi. 🌿"
          : "Karibu! Ask me about masoko prices, weather windows, or delivery routing and I'll give you the sharpest read available. 🌿";
      }
      return {
        execution_mode: "user_chat",
        current_screen: String(payload.current_screen),
        intent_detected: intent,
        chat_response: reply,
      };
    }

    /* ── ROUTE C ─────────────────────────────────────────────────────── */
    case "alert_broadcast": {
      const t = payload.alert_trigger;
      const type = String(t.type).toUpperCase();
      const critical = t.severity === "CRITICAL";
      const warningPlus = critical || t.severity === "WARNING";
      const ids = payload.affected_farmer_ids.map((x) => String(x));
      const msgs = {
        PEST_PRESSURE: {
          farmer: "⚠️ Fall Armyworm detected near your shamba. Kagua mahindi leo — check young leaves for fresh holes and report sightings now.",
          operator: "Satellite NDVI anomaly correlates with confirmed pest pressure across the affected farm cluster. Coordinate synchronized scouting and county-approved biopesticide response within 48 hours; log all sightings for cooperative-level containment mapping.",
          action: "Scout whorl-stage maize within 24 hours and apply approved biopesticide if larvae are confirmed.",
        },
        WEATHER_ANOMALY: {
          farmer: "🌧️ Severe weather inbound on your area. Secure harvested produce and delay murram road deliveries until conditions clear.",
          operator: "Meteorological anomaly flagged by the Sentinel feed. Suspend non-critical e-boda dispatches on unpaved corridors; re-evaluate route gates after the next telemetry refresh.",
          action: "Hold deliveries on murram routes and re-check the Route Optimizer after the storm window.",
        },
        PRICE_SPIKE: {
          farmer: "📈 Masoko prices are spiking for your crop right now. Check the Market card and consider selling ready stock today.",
          operator: "Wholesale quote breached the upper price band on the tracked feed. Confirm the spike across at least two markets before advising cooperative-scale sales; watch for feed anomalies.",
          action: "Verify the spike on a second market quote, then prioritise dispatch of harvest-ready cargo.",
        },
        PRICE_CRASH: {
          farmer: "📉 Prices for your crop dropped sharply today. Hold stock if you can store it safely and watch for recovery.",
          operator: "Wholesale quote breached the lower price band. Advise farmers with cold storage to hold; coordinate aggregated sales to reduce transit cost per kilo for those who must sell.",
          action: "Pause non-urgent dispatches and coordinate aggregated cooperative sales to protect margins.",
        },
        VEHICLE_FAULT: {
          farmer: "🛵 Your delivery e-boda reported a fault. Cargo is being reassigned — keep produce shaded and cool until pickup.",
          operator: "Vehicle telemetry reported a fault mid-route. Reassign cargo to the nearest available rider, log the fault code, and schedule a depot inspection before the vehicle returns to service.",
          action: "Reassign cargo to the nearest available rider and schedule a depot inspection.",
        },
        SOIL_CRITICAL: {
          farmer: "🌱 Soil moisture on your shamba is at a critical level. Irrigate today if you can and check sensor placement.",
          operator: "IoT soil probe reports moisture outside the crop-safe band. Confirm the reading is not a sensor fault, then advise irrigation scheduling and mulching for the affected plots.",
          action: "Confirm the probe reading, then schedule irrigation and mulching for the affected plots.",
        },
      };
      const m = msgs[type]; // validatePayload() guarantees a known type
      return {
        execution_mode: "alert_broadcast",
        alert_id: randomUUID(),
        alert_type: type,
        severity: t.severity,
        requires_immediate_action: critical,
        affected_farmer_ids: ids,
        farmer_push_message: m.farmer,
        operator_technical_message: m.operator,
        recommended_action: warningPlus ? m.action : null,
        auto_escalate_to_cooperative: critical && ids.length > 1,
      };
    }

    /* ── ROUTE D ─────────────────────────────────────────────────────── */
    case "onboarding_intake": {
      const p = payload.partial_profile;
      const collected = Object.keys(p).filter((k) => !missing(p[k]));
      const stepFields = {
        1: ["farmer_name"],
        2: ["county", "sub_county", "altitude_m"],
        3: ["intended_crop", "field_area_acres"],
        4: ["vehicle_access", "road_type"],
        5: [],
      };
      const all = Object.values(stepFields).flat();
      const stillNeeded = all.filter((f) => !collected.includes(f));
      const step = payload.onboarding_step;
      const first = String(p.farmer_name ?? "").trim().split(/\s+/)[0] || "rafiki";
      const prompts = {
        1: "Karibu KilimoOrbit! What name should we register your farmer profile under?",
        2: `Asante ${first}! Which county and sub-county is your shamba in, and roughly what altitude?`,
        3: `Karibu ${first}! Which crop are you planting this season, and how many acres is your shamba?`,
        4: `Almost there ${first}! Do you have access to an e-boda or pickup, and is your road tarmac or murram?`,
        5: stillNeeded.length
          ? `Hongera ${first}! A few details are still missing — fill them in and I will run your climate risk preview.`
          : `Hongera ${first}! Confirm your profile and I will run your first climate risk preview now.`,
      };
      const preview =
        step === 5 && p.county
          ? (() => {
              const { season_key, ...rest } = climateSentinel(
                { county: p.county, altitude_m: p.altitude_m, road_type: p.road_type },
                payload.current_month,
                p.intended_crop
              );
              return rest;
            })()
          : null;
      return {
        execution_mode: "onboarding_intake",
        onboarding_step: step,
        next_prompt: prompts[step],
        fields_collected_so_far: collected,
        fields_still_needed: stillNeeded,
        farm_risk_preview: preview,
      };
    }

    /* ── ROUTE E ─────────────────────────────────────────────────────── */
    case "logistics_replan": {
      const d = payload.active_delivery;
      const riskRank = { Low: 0, Medium: 1, High: 2 };
      const riskOf = (r) => (r && has(riskRank, r.cargo_risk_level) ? r.cargo_risk_level : null);
      const rank = (r) => (riskOf(r) != null ? riskRank[riskOf(r)] : 1); // unknown levels rank as Medium
      const ranked = [...payload.available_alternative_routes].sort(
        (a, b) =>
          a.time_penalty_minutes - b.time_penalty_minutes ||
          a.cost_penalty_kes - b.cost_penalty_kes ||
          rank(a) - rank(b)
      );
      const best = ranked[0];
      const revised = best ? Math.round(d.original_net_profit_kes - best.cost_penalty_kes) : null;
      const viable = best && revised > 0;
      const dtype = String(payload.disruption_event.type).toUpperCase();
      const crop = d.crop_type ?? "the";
      return {
        execution_mode: "logistics_replan",
        original_route_id: String(d.delivery_id),
        disruption_type: dtype, // validated against DISRUPTIONS
        replan_status: !best ? "NO_VIABLE_ROUTE" : viable ? "REROUTED" : "DELAYED",
        recommended_alternative_route: {
          route_id: best?.route_id != null ? String(best.route_id) : null,
          new_destination: best?.new_destination != null ? String(best.new_destination) : null,
          added_time_minutes: best?.time_penalty_minutes ?? null,
          added_cost_kes: best?.cost_penalty_kes ?? null,
          revised_net_profit_kes: revised,
          cargo_spoilage_risk: best ? (riskOf(best) ?? "Medium") : null,
        },
        operator_action_required: true,
        escalate_to_cooperative: !best,
        widget_insights: {
          replan_summary: best
            ? viable
              ? `Divert ${crop} cargo to ${best.new_destination ?? best.route_id} adding ${best.time_penalty_minutes} minutes with ${(riskOf(best) ?? "medium").toLowerCase()} spoilage risk.`
              : `Best alternative ${best.new_destination ?? best.route_id} erases the margin; hold cargo and await a cheaper corridor.`
            : "No viable alternative route exists; cargo holds at origin pending cooperative dispatch.",
          margin_impact_note: best
            ? `Margin trims from KES ${d.original_net_profit_kes.toLocaleString("en-KE")} to KES ${revised.toLocaleString("en-KE")} after reroute costs.`
            : "Original margin is unrecoverable on current route options.",
        },
      };
    }
  }
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/* ════════════════════════════════════════════════════════════════════════
 * OUTPUT GUARDRAILS — deterministic re-enforcement of the contract on the
 * model's answer. The mock engine is contract-true by construction; this
 * layer exists for the LIVE path where a model can drift.
 * ════════════════════════════════════════════════════════════════════════ */
const WORD_LIMIT = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** §4.2 — every farmer-facing string strictly under 25 words, single line, no double quotes. */
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u;
function clampWords(s, limit = WORD_LIMIT) {
  if (typeof s !== "string") return s;
  const clean = s.replace(/\s*\n+\s*/g, " ").replace(/"/g, "'").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < limit) return clean;
  // Keep a trailing emoji (§3B: exactly one) and cut at the last sentence boundary if one exists.
  const emoji = (clean.match(EMOJI_RE) ?? [""])[0];
  const budget = emoji ? limit - 2 : limit - 1;
  let cut = words.slice(0, budget).join(" ");
  const m = cut.match(/^[\s\S]*[.!?](?=\s)/);
  if (m && m[0].split(/\s+/).length >= Math.floor(budget / 2)) cut = m[0];
  cut = cut.replace(/[,;:—-]+$/, "").trim();
  return emoji ? `${cut} ${emoji}` : cut;
}

const FARMER_STRINGS = {
  arbitrage_compile: ["climate_risk_sentinel.climate_caution_alert", "widget_insights.market_price_summary", "widget_insights.routing_profit_summary", "widget_insights.data_quality_notice"],
  user_chat: ["chat_response"],
  alert_broadcast: ["farmer_push_message", "recommended_action"],
  onboarding_intake: ["next_prompt"],
  logistics_replan: ["widget_insights.replan_summary", "widget_insights.margin_impact_note"],
  error: ["error_message", "recovery_suggestion"],
};

const setPath = (o, p, v) => {
  const ks = p.split(".");
  let cur = o;
  for (const k of ks.slice(0, -1)) { if (!isObj(cur[k])) return; cur = cur[k]; }
  cur[ks.at(-1)] = v;
};

/**
 * Re-enforce the deterministic parts of the contract on a model response.
 * Returns the hardened object; sets `guardrail_notes` when it had to intervene.
 */
export function harden(result, payload) {
  if (!isObj(result)) return result;
  const out = structuredClone(result);
  const notes = [];
  const mode = out.execution_mode;

  for (const p of has(FARMER_STRINGS, mode) ? FARMER_STRINGS[mode] : []) {
    const v = dig(out, p);
    const c = clampWords(v);
    if (c !== v) { setPath(out, p, c); notes.push(`${p} clamped to §4.2 word limit`); }
  }

  if (mode === "arbitrage_compile" && isObj(payload)) {
    const markets = payload.market_data?.available_markets ?? [];
    const age = payload.market_data?.data_age_minutes ?? 9999;
    const r = isObj(out.cargo_optimized_route) ? out.cargo_optimized_route : (out.cargo_optimized_route = {});
    const byName = (n) => markets.find((m) => norm(m?.market_name) === norm(n));
    const dest = byName(r.optimal_market_destination);
    if (!dest && markets.length) {
      notes.push("optimal_market_destination not in payload — recomputed deterministically");
      const fixed = mockEngine(payload);
      if (fixed?.execution_mode === "arbitrage_compile") {
        fixed.guardrail_notes = notes;
        return fixed;
      }
    }
    if (dest && r.live_market_wholesale_price_per_kg != null && r.live_market_wholesale_price_per_kg !== dest.wholesale_price_per_kg) {
      r.live_market_wholesale_price_per_kg = dest.wholesale_price_per_kg; // §1.3: price must be sourced, never inferred
      notes.push("live price re-sourced from payload market_data");
    }
    if (age > 120) {
      if (out.price_status !== "STALE_DATA" || r.net_profit_projection_kes != null || r.gross_revenue_kes != null) {
        notes.push("stale market data — projections suppressed (§1.3)");
      }
      out.price_status = "STALE_DATA";
      out.data_confidence = "LOW";
      r.net_profit_projection_kes = null;
      r.gross_revenue_kes = null;
      r.live_market_wholesale_price_per_kg = null;
      out.stale_data_warning ??= {
        price_status: "STALE_DATA",
        market_data_age_minutes: age,
        last_valid_price_per_kg: dest?.wholesale_price_per_kg ?? null,
        profit_projection_suppressed: true,
        stale_data_message: "Price feed exceeds 120 minutes old; profit projections are suppressed until refresh.",
      };
    } else if (out.data_confidence === "LOW" && (r.net_profit_projection_kes != null || r.gross_revenue_kes != null)) {
      r.net_profit_projection_kes = null; // §3A.5
      r.gross_revenue_kes = null;
      notes.push("LOW confidence — projections suppressed (§3A.5)");
    }
    if (!["HIGH", "MEDIUM", "LOW"].includes(out.data_confidence)) {
      out.data_confidence = age < 60 ? "HIGH" : "MEDIUM";
      notes.push("data_confidence normalised");
    }
  }

  if (mode === "alert_broadcast") {
    if (!UUID_RE.test(String(out.alert_id ?? ""))) { out.alert_id = randomUUID(); notes.push("alert_id replaced with a real UUID"); }
    if (isObj(payload) && Array.isArray(payload.affected_farmer_ids)) out.affected_farmer_ids = payload.affected_farmer_ids.map(String);
    if (out.severity === "CRITICAL" && out.requires_immediate_action !== true) { out.requires_immediate_action = true; notes.push("CRITICAL ⇒ requires_immediate_action"); }
    if (out.severity === "INFO" && out.recommended_action != null) { out.recommended_action = null; notes.push("INFO ⇒ recommended_action null"); }
  }

  if (mode === "user_chat" && isObj(payload)) {
    out.current_screen = String(payload.current_screen ?? out.current_screen ?? "");
    // §3B memory rule 5: a follow-up to a price/weather/logistics thread keeps that intent.
    if (out.intent_detected === "general_advisory" && Array.isArray(payload.chat_history) && payload.chat_history.length) {
      const msg = String(payload.user_message ?? "");
      const words = msg.trim().split(/\s+/).filter(Boolean).length;
      if (FOLLOW_UP_RE.test(msg) || words <= 4) {
        const last = [...payload.chat_history].reverse().map((h) => String(h?.text ?? "")).find((t) => INTENT_RES.price.test(t) || INTENT_RES.weather.test(t) || INTENT_RES.logistics.test(t));
        const inherited = last && (INTENT_RES.price.test(last) ? "price_query" : INTENT_RES.weather.test(last) ? "weather_query" : "logistics_query");
        if (inherited) { out.intent_detected = inherited; notes.push(`intent aligned to conversation thread (${inherited})`); }
      }
    }
  }

  if (mode === "logistics_replan" && isObj(payload)) {
    const routes = payload.available_alternative_routes;
    if (Array.isArray(routes) && routes.length === 0 && out.replan_status !== "NO_VIABLE_ROUTE") {
      out.replan_status = "NO_VIABLE_ROUTE";
      out.escalate_to_cooperative = true;
      notes.push("no alternatives supplied ⇒ NO_VIABLE_ROUTE");
    }
  }

  if (notes.length) out.guardrail_notes = notes;
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
 * LIVE ENGINE — Gemini
 * ════════════════════════════════════════════════════════════════════════ */
let _ai = null;
const getClient = () =>
  (_ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const stripFences = (t) =>
  t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

export function engineMode() {
  if (process.env.APEX_MOCK === "1") return "MOCK";
  return process.env.GEMINI_API_KEY ? "LIVE" : "MOCK";
}

const _t = Number(process.env.APEX_TIMEOUT_MS);
const LIVE_TIMEOUT_MS = Number.isFinite(_t) && _t > 0 ? _t : 45_000;
const LIVE_RETRIES = 1;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const t = setTimeout(
        () => reject(new Error(`Gemini call timed out after ${ms / 1000}s`)),
        ms
      );
      t.unref?.();
    }),
  ]);

/** Retry only what can plausibly succeed on a second try: timeouts, 429, 5xx. */
const retryable = (err) => {
  const status = Number(err?.status ?? err?.code ?? 0);
  if (status === 429 || status >= 500) return true;
  if (status >= 400) return false;
  return /timed out|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(String(err?.message ?? ""));
};

/** Test hook: APEX_SIMULATE_LIVE_ERROR=429|503|timeout makes the LIVE path fail deterministically. */
function simulatedLiveError() {
  const v = process.env.APEX_SIMULATE_LIVE_ERROR;
  if (!v) return null;
  const err = new Error(v === "timeout" ? "Gemini call timed out after 0s (simulated)" : `simulated Gemini error ${v}`);
  if (v !== "timeout") err.status = Number(v);
  return err;
}

async function generateLive(payload) {
  let lastErr;
  for (let attempt = 0; attempt <= LIVE_RETRIES; attempt++) {
    try {
      const sim = simulatedLiveError();
      if (sim) throw sim;
      const response = await withTimeout(
        getClient().models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
          config: {
            systemInstruction: APEX_SYSTEM,
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
        LIVE_TIMEOUT_MS
      );
      const raw = response.text;
      if (!raw) throw new Error("Empty response from Gemini");
      const parsed = JSON.parse(stripFences(raw));
      if (!isObj(parsed) || typeof parsed.execution_mode !== "string")
        throw new Error("Gemini response violates the Apex contract (missing execution_mode)");
      if (parsed.execution_mode !== "error" && parsed.execution_mode !== payload.execution_mode)
        throw new Error(`Gemini answered route ${parsed.execution_mode} for a ${payload.execution_mode} payload`);
      return harden(parsed, payload);
    } catch (err) {
      lastErr = err;
      if (attempt < LIVE_RETRIES && retryable(err))
        await new Promise((r) => setTimeout(r, (Number(err?.status) === 429 ? 4000 : 800) * (attempt + 1)));
      else break;
    }
  }
  throw lastErr;
}

/**
 * Free text for the small agents (the nursery advisor): LIVE answers come from
 * the model; MOCK, no key, or any failure returns null so the caller writes
 * its own deterministic text. Never throws.
 */
export async function generateText({ system, prompt, maxOutputTokens = 420, temperature = 0.3 }) {
  if (engineMode() !== "LIVE") return null;
  try {
    const response = await withTimeout(
      getClient().models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: system, temperature, maxOutputTokens },
      }),
      LIVE_TIMEOUT_MS
    );
    const text = String(response.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function callApex(payload) {
  try {
    const p = isObj(payload) ? payload : {};
    // §1 integrity is deterministic code, not model behavior: enforce it for BOTH
    // engines so invalid payloads never reach (or get billed by) Gemini.
    const mode = p.execution_mode;
    if (typeof mode !== "string" || !VALID_ROUTES.includes(mode)) return unknownRoute(mode);
    const { failed, oob } = validatePayload(p, mode);
    if (failed.length || oob.length) return dataError(failed, oob);

    const safe = trimHistory(p);
    if (engineMode() === "MOCK") return mockEngine(safe);
    try {
      return await generateLive(safe);
    } catch (err) {
      // Resilience: when Gemini is unavailable (quota, overload, timeout, network)
      // the farmer still gets a contract-true answer from the deterministic
      // engine, tagged so operators can see it. APEX_FALLBACK=0 disables.
      if (process.env.APEX_FALLBACK !== "0" && retryable(err)) {
        const out = mockEngine(safe);
        out.engine_fallback = {
          from: "LIVE",
          to: "MOCK",
          reason: clampWords(String(err?.message ?? err).replace(/[{}'"]/g, " "), 18),
          status: Number(err?.status) || null,
        };
        return out;
      }
      throw err;
    }
  } catch (err) {
    return {
      execution_mode: "error",
      error_type: "CLIENT_FAILURE",
      error_message: clampWords(String(err?.message ?? err)),
      engine: engineMode(),
      recovery_suggestion:
        engineMode() === "LIVE"
          ? "Verify GEMINI_API_KEY, model availability, and network access, then retry."
          : "Mock engine threw — check the payload shape against Section 6.",
    };
  }
}
