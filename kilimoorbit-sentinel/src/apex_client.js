/**
 * KilimoOrbit Sentinel — APEX client (Apex v2.0 contract)
 * --------------------------------------------------------
 * LIVE  — gemini-2.5-flash (@google/genai), temperature 0, system instruction
 *         loaded verbatim from src/apex_system_prompt.md (Apex v2.0).
 * MOCK  — deterministic offline engine implementing the SAME v2.0 contract:
 *         Section 1 integrity bounds, Section 2 Kenyan climate matrix,
 *         Section 3 route schemas, Section 3.5 error schemas.
 *         Active when GEMINI_API_KEY is absent or APEX_MOCK=1.
 *
 * Exported: callApex(payload), engineMode(), APEX_SYSTEM
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.APEX_MODEL || "gemini-2.5-flash";

/** Apex v2.0 system prompt — loaded verbatim. Swap the .md file to update. */
export const APEX_SYSTEM = readFileSync(
  join(here, "apex_system_prompt.md"),
  "utf8"
);

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 1 — DATA INTEGRITY (shared by MOCK; LIVE relies on the prompt)
 * ════════════════════════════════════════════════════════════════════════ */
const VALID_ROUTES = [
  "arbitrage_compile",
  "user_chat",
  "alert_broadcast",
  "onboarding_intake",
  "logistics_replan",
];

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

const dig = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);

function validate(payload, mode) {
  const failed = REQUIRED[mode].filter((f) => {
    const v = dig(payload, f);
    return v === undefined || v === null || v === "unknown";
  });
  // §1.3: arbitrage is meaningless without at least one market to rank.
  if (mode === "arbitrage_compile" && !failed.includes("market_data")) {
    const mkts = dig(payload, "market_data.available_markets");
    if (!Array.isArray(mkts) || mkts.length === 0)
      failed.push("market_data.available_markets");
  }

  const oob = [];
  for (const b of BOUNDS) {
    const v = dig(payload, b.path);
    if (typeof v === "number" && (v < b.min || v > b.max)) oob.push(b.label);
  }
  for (const m of dig(payload, "market_data.available_markets") ?? []) {
    const p = m?.wholesale_price_per_kg;
    if (typeof p === "number" && (p < 0.5 || p > 500)) oob.push("crop_price_per_kg");
  }
  return { failed, oob };
}

const unknownRoute = (received) => ({
  execution_mode: "error",
  error_type: "UNKNOWN_ROUTE",
  received_value: received ?? null,
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
const ASAL_COUNTIES = ["Turkana","Marsabit","Isiolo","Garissa","Wajir","Mandera","Samburu","Tana River"];
const FROST_COUNTIES = ["Meru","Nyandarua","Limuru","Kericho","Kiambu","Nyeri"];

function season(month) {
  const i = MONTHS.findIndex(
    (m) => m.toLowerCase() === String(month ?? "").trim().toLowerCase()
  );
  if (i >= 2 && i <= 4) return { name: "Long Rains (Machi–Mei)", key: "LONG_RAINS" };
  if (i >= 9 && i <= 11) return { name: "Short Rains (Oktoba–Desemba)", key: "SHORT_RAINS" };
  if (i >= 5 && i <= 8) return { name: "Cold/Dry Season (Juni–Septemba)", key: "COLD_DRY" };
  return { name: "Hot/Dry Season (Januari–Februari)", key: "HOT_DRY" };
}

function altitudeZone(altitude_m, county) {
  if (ASAL_COUNTIES.includes(county)) return "ASAL";
  if (altitude_m == null) return "MIDLAND";
  if (altitude_m >= 2000) return "HIGHLAND";
  if (altitude_m >= 1000) return "MIDLAND";
  return "LOWLAND";
}

/** Full §2 assessment for a farm × month. */
function climateSentinel({ county, altitude_m, road_type }, month, crop) {
  const s = season(month);
  const zone = altitudeZone(altitude_m, county);
  const alt = altitude_m ?? 1500;

  const frost_risk =
    s.key === "COLD_DRY" && (alt > 1800 || FROST_COUNTIES.includes(county));
  const drought_risk =
    s.key === "HOT_DRY" || zone === "ASAL";
  const flood_risk =
    s.key === "LONG_RAINS" || (s.key === "SHORT_RAINS" && ["Kisumu","Homa Bay","Siaya","Mombasa","Kilifi","Kwale","Busia"].includes(county));
  const landslide = s.key === "LONG_RAINS" && alt > 2000;

  // Risk level only ever escalates — a Critical rating must never be downgraded.
  const RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };
  let level = "Low";
  const escalate = (l) => { if (RANK[l] > RANK[level]) level = l; };
  if (flood_risk || drought_risk) escalate("Medium");
  if (frost_risk || landslide || s.key === "SHORT_RAINS") escalate("High");
  if ((frost_risk && alt > 2500) || (drought_risk && zone === "ASAL")) escalate("Critical");

  let variety = null;
  if (s.key === "SHORT_RAINS")
    variety = "Plant early-maturing lines such as H614D maize under 90 days or Serenut groundnut to beat erratic cessation.";
  else if (s.key === "HOT_DRY")
    variety = "Switch to drought-tolerant lines such as KATL maize or WEMA varieties; irrigation is a prerequisite.";
  else if (frost_risk)
    variety = "Use frost-tolerant lines or move tomato, potato and beans under greenhouse or fleece cover.";
  else if (s.key === "LONG_RAINS" && level !== "Low")
    variety = `Favour fungal-resistant ${crop ?? "crop"} lines and raised beds to counter leaching and disease pressure.`;

  const cautionByKey = {
    LONG_RAINS: `Long Rains over ${county}: flash flooding, nutrient leaching and murram road closures likely${landslide ? "; landslide watch above 2000m" : ""}.`,
    SHORT_RAINS: `Short Rains over ${county}: onset is erratic and mid-season failure probability is high; stagger planting dates.`,
    COLD_DRY: frost_risk
      ? `Cold season frost watch for ${county} above 1800m: protect seedlings overnight and delay frost-sensitive transplanting.`
      : `Cold dry season over ${county}: expect slow crop maturation and plan longer cycles.`,
    HOT_DRY: `Hot dry season over ${county}: high evapotranspiration and intense Fall Armyworm pressure; scout fields twice weekly.`,
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

/* §2.4 logistics weather gate */
function weatherGate(payload, seasonKey) {
  const road = payload.farm_location?.road_type;
  const rain = payload.iot_telemetry?.rainfall_mm_last_24h ?? 0;
  const temp = payload.iot_telemetry?.temperature_celsius ?? 25;
  const vt = payload.vehicle_telemetry?.vehicle_type;
  if (seasonKey === "LONG_RAINS" && (road === "murram" || road === "murram_road") && rain > 25)
    return "WEATHER_DELAY";
  if (seasonKey === "HOT_DRY" && vt === "e-boda" && temp > 38) return "BATTERY_RISK";
  return "CLEAR";
}

/* Conservative Kenyan smallholder yields (kg per acre) for §3A step 3. */
const YIELD_KG_PER_ACRE = {
  tomato: 4000, cabbage: 6000, potato: 4500, potatoes: 4500,
  onion: 3500, onions: 3500, carrot: 5000, carrots: 5000,
  maize: 800, beans: 350, kale: 3000, sukuma: 3000,
  orange: 4500, oranges: 4500, banana: 6000, bananas: 6000,
  mango: 3500, mangoes: 3500, avocado: 3000,
  default: 1000,
};

/* ════════════════════════════════════════════════════════════════════════
 * MOCK ENGINE — Apex v2.0 route implementations
 * ════════════════════════════════════════════════════════════════════════ */
function mockEngine(payload) {
  const mode = payload?.execution_mode;
  if (!mode || !VALID_ROUTES.includes(mode)) return unknownRoute(mode);

  const { failed, oob } = validate(payload, mode);
  if (failed.length || oob.length) return dataError(failed, oob);

  switch (mode) {
    /* ── ROUTE A ─────────────────────────────────────────────────────── */
    case "arbitrage_compile": {
      const markets = payload.market_data.available_markets; // non-empty — validate() guarantees it
      const age = payload.market_data.data_age_minutes ?? 9999;
      const stale = age > 120;
      // §3A.5: projections are suppressed only at LOW — stale data must therefore tag LOW.
      const confidence = stale ? "LOW" : age < 60 ? "HIGH" : "MEDIUM";
      const sentinel = climateSentinel(payload.farm_location, payload.current_month, payload.crop_type);
      const { season_key, ...climate_risk_sentinel } = sentinel;

      const yieldKg = Math.round(
        (payload.field_area_acres ?? 1) *
          (YIELD_KG_PER_ACRE[payload.crop_type?.toLowerCase()] ?? YIELD_KG_PER_ACRE.default)
      );
      const ranked = markets
        .map((m) => ({ ...m, net: m.wholesale_price_per_kg * yieldKg - m.transit_cost_kes }))
        .sort((a, b) => b.net - a.net);
      const best = ranked[0];
      const flag = weatherGate(payload, season_key);
      const suppress = stale;

      return {
        execution_mode: "arbitrage_compile",
        data_confidence: confidence,
        price_status: stale ? "STALE_DATA" : "LIVE",
        cargo_optimized_route: {
          crop_type: payload.crop_type,
          optimal_market_destination: best.market_name,
          distance_km: best.distance_km,
          live_market_wholesale_price_per_kg: suppress ? null : best.wholesale_price_per_kg,
          estimated_yield_kg: yieldKg,
          gross_revenue_kes: suppress ? null : best.wholesale_price_per_kg * yieldKg,
          transit_cost_kes: best.transit_cost_kes,
          net_profit_projection_kes: suppress ? null : best.net,
          logistics_risk_flag: flag,
        },
        climate_risk_sentinel,
        widget_insights: {
          market_price_summary: suppress
            ? "Market feed is older than two hours so live pricing is withheld until resync."
            : `${payload.crop_type} wholesale peaks at KES ${best.wholesale_price_per_kg} per kg in ${best.market_name}, leading ${ranked.length} tracked masoko.`,
          routing_profit_summary: suppress
            ? "Profit projection suppressed while price feed is stale."
            : `Projected net KES ${best.net.toLocaleString("en-KE")} after KES ${best.transit_cost_kes.toLocaleString("en-KE")} transit on the ${best.distance_km} km run.`,
          data_quality_notice:
            confidence === "HIGH"
              ? null
              : "Market data is aging — refresh the price feed for full-confidence projections.",
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
      const msg = String(payload.user_message ?? "");
      const m = payload.market_data?.available_markets?.[0];
      const settingsQ = /\b(settings?|notification|sign ?out|account|battery plan)\b/i.test(msg);
      const historyQ = /\b(history|export|spreadsheet|timeline|gps)\b/i.test(msg);
      const priceQ = /\b(bei|price|nyanya|tomato|soko|market|kg)\b/i.test(msg);
      const weatherQ = /\b(mvua|rain|weather|hali ya hewa|frost|baridi|joto)\b/i.test(msg);
      const logisticsQ = /\b(route|deliver|usafiri|boda|gari)\b/i.test(msg);
      const sw = /\b(je|bei|nyanya|niambie|habari|shamba|soko|mvua|iko)\b/i.test(msg);

      let intent = "general_advisory", reply;
      if (settingsQ) {
        intent = "settings_query";
        reply = "Tap ☰ (top left) to access Settings, Notification Profiles, and Sign Out.";
      } else if (historyQ) {
        intent = "unknown";
        reply = "That detail isn't in this chat view — check the 'Market Pricing Matrix' card on your dashboard for live trends! 📊";
      } else if (priceQ && m) {
        intent = "price_query";
        reply = sw
          ? `Bei ya nyanya ${m.market_name} iko KES ${m.wholesale_price_per_kg} kwa kilo — soko liko juu kidogo wiki hii, mavuno yataleta faida! 🍅`
          : `Tomato is trading at KES ${m.wholesale_price_per_kg} per kg in ${m.market_name} — the soko is running slightly hot this week! 🍅`;
      } else if (priceQ) {
        intent = "price_query";
        reply = "I don't have that live reading right now — make sure your IoT sensor is synced and retry! 🔄";
      } else if (weatherQ) {
        intent = "weather_query";
        reply = "Long Rains are active — expect heavy showers and soft murram roads; plan shamba work for dry morning windows! 🌧️";
      } else if (logisticsQ) {
        intent = "logistics_query";
        reply = "Your e-boda fleet status lives on the Route Optimizer card — open it for live charge and routing intel! 🛵";
      } else {
        reply = "Karibu! Ask me about masoko prices, weather windows, or delivery routing and I'll give you the sharpest read available. 🌿";
      }
      return {
        execution_mode: "user_chat",
        current_screen: payload.current_screen,
        intent_detected: intent,
        chat_response: reply,
      };
    }

    /* ── ROUTE C ─────────────────────────────────────────────────────── */
    case "alert_broadcast": {
      const t = payload.alert_trigger;
      const critical = t.severity === "CRITICAL";
      const warningPlus = critical || t.severity === "WARNING";
      const msgs = {
        PEST_PRESSURE: {
          farmer: "⚠️ Fall Armyworm detected near your shamba. Kagua mahindi leo — check young leaves for fresh holes and report sightings now.",
          operator: "Satellite NDVI anomaly correlates with confirmed Fall Armyworm pressure across three Meru sub-county farms. Coordinate synchronized scouting and county-approved biopesticide response within 48 hours; log all sightings for cooperative-level containment mapping.",
          action: "Scout whorl-stage maize within 24 hours and apply approved biopesticide if larvae are confirmed.",
        },
        WEATHER_ANOMALY: {
          farmer: "🌧️ Severe weather inbound on your area. Secure harvested produce and delay murram road deliveries until conditions clear.",
          operator: "Meteorological anomaly flagged by Sentinel feed. Suspend non-critical e-boda dispatches on unpaved corridors; re-evaluate route gates after the next telemetry refresh.",
          action: "Hold deliveries on murram routes and re-check the Route Optimizer after the storm window.",
        },
        DEFAULT: {
          farmer: "📢 New Sentinel alert for your shamba. Open the app dashboard now for details and recommended next steps.",
          operator: `Alert trigger ${t.type} at severity ${t.severity}: ${t.detail ?? "no detail supplied"}. Review affected farmer cohort and confirm broadcast delivery.`,
          action: "Review the alert detail card and acknowledge within the operator console.",
        },
      };
      const m = msgs[t.type] ?? msgs.DEFAULT;
      return {
        execution_mode: "alert_broadcast",
        alert_id: randomUUID(),
        alert_type: t.type,
        severity: t.severity,
        requires_immediate_action: critical,
        affected_farmer_ids: payload.affected_farmer_ids,
        farmer_push_message: m.farmer,
        operator_technical_message: m.operator,
        recommended_action: warningPlus ? m.action : null,
        auto_escalate_to_cooperative: critical && (payload.affected_farmer_ids?.length ?? 0) > 1,
      };
    }

    /* ── ROUTE D ─────────────────────────────────────────────────────── */
    case "onboarding_intake": {
      const p = payload.partial_profile ?? {};
      const collected = Object.keys(p);
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
      const first = p.farmer_name?.split(" ")[0] ?? "rafiki";
      const prompts = {
        1: "Karibu KilimoOrbit! What name should we register your farmer profile under?",
        2: `Asante ${first}! Which county and sub-county is your shamba in, and roughly what altitude?`,
        3: `Karibu ${first}! Which crop are you planting this season, and how many acres is your shamba?`,
        4: `Almost there ${first}! Do you have access to an e-boda or pickup, and is your road tarmac or murram?`,
        5: `Hongera ${first}! Confirm your profile and I will run your first climate risk preview now.`,
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
        next_prompt: prompts[step] ?? prompts[3],
        fields_collected_so_far: collected,
        fields_still_needed: stillNeeded,
        farm_risk_preview: preview,
      };
    }

    /* ── ROUTE E ─────────────────────────────────────────────────────── */
    case "logistics_replan": {
      const d = payload.active_delivery;
      const riskRank = { Low: 0, Medium: 1, High: 2 };
      const rank = (r) => riskRank[r?.cargo_risk_level] ?? 1; // unknown levels rank as Medium
      const ranked = [...payload.available_alternative_routes].sort(
        (a, b) =>
          a.time_penalty_minutes - b.time_penalty_minutes ||
          a.cost_penalty_kes - b.cost_penalty_kes ||
          rank(a) - rank(b)
      );
      const best = ranked[0];
      const viable = best && d.original_net_profit_kes - best.cost_penalty_kes > 0;
      const revised = best ? d.original_net_profit_kes - best.cost_penalty_kes : null;
      return {
        execution_mode: "logistics_replan",
        original_route_id: d.delivery_id,
        disruption_type: payload.disruption_event.type,
        replan_status: !best ? "NO_VIABLE_ROUTE" : viable ? "REROUTED" : "DELAYED",
        recommended_alternative_route: {
          route_id: best?.route_id ?? null,
          new_destination: best?.new_destination ?? null,
          added_time_minutes: best?.time_penalty_minutes ?? null,
          added_cost_kes: best?.cost_penalty_kes ?? null,
          revised_net_profit_kes: revised,
          cargo_spoilage_risk: best?.cargo_risk_level ?? null,
        },
        operator_action_required: true,
        escalate_to_cooperative: !best,
        widget_insights: {
          replan_summary: best
            ? `Divert ${d.crop_type} cargo to ${best.new_destination} adding ${best.time_penalty_minutes} minutes with ${(best.cargo_risk_level ?? "unknown").toLowerCase()} spoilage risk.`
            : "No viable alternative route exists; cargo holds at origin pending cooperative dispatch.",
          margin_impact_note: best
            ? `Margin trims from KES ${d.original_net_profit_kes.toLocaleString("en-KE")} to KES ${revised.toLocaleString("en-KE")} after reroute costs.`
            : "Original margin is unrecoverable on current route options.",
        },
      };
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * LIVE ENGINE — Gemini 2.5 Flash
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

const LIVE_TIMEOUT_MS = Number(process.env.APEX_TIMEOUT_MS || 30_000);
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

async function generateLive(payload) {
  let lastErr;
  for (let attempt = 0; attempt <= LIVE_RETRIES; attempt++) {
    try {
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
      if (!parsed || typeof parsed !== "object" || typeof parsed.execution_mode !== "string")
        throw new Error("Gemini response violates the Apex contract (missing execution_mode)");
      return parsed;
    } catch (err) {
      lastErr = err;
      if (attempt < LIVE_RETRIES)
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function callApex(payload) {
  try {
    const p = payload ?? {};
    // §1 integrity is deterministic code, not model behavior: enforce it for BOTH
    // engines so invalid payloads never reach (or get billed by) Gemini.
    const mode = p?.execution_mode;
    if (!mode || !VALID_ROUTES.includes(mode)) return unknownRoute(mode);
    const { failed, oob } = validate(p, mode);
    if (failed.length || oob.length) return dataError(failed, oob);

    return engineMode() === "MOCK" ? mockEngine(p) : await generateLive(p);
  } catch (err) {
    return {
      execution_mode: "error",
      error_type: "CLIENT_FAILURE",
      error_message: err?.message ?? String(err),
      engine: engineMode(),
      recovery_suggestion:
        engineMode() === "LIVE"
          ? "Verify GEMINI_API_KEY, model availability, and network access, then retry."
          : "Mock engine threw — check the payload shape against Section 6.",
    };
  }
}
