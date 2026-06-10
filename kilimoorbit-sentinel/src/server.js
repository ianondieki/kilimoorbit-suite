/**
 * KilimoOrbit Sentinel — Mission Control server
 * Serves the dashboard (public/) and a thin JSON API over the APEX engine.
 *
 *   GET  /api/meta    → engine mode + payload library
 *   POST /api/apex    → { payload } → APEX decision object (+ latency)
 *   POST /api/suite   → runs the 7-test verification suite, returns results
 */
import "dotenv/config";
import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode } from "./apex_client.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(root, "public")));

const loadPayload = (f) =>
  JSON.parse(readFileSync(join(root, "payloads", f), "utf8"));

app.get("/api/meta", (_req, res) => {
  const payloads = {};
  for (const f of readdirSync(join(root, "payloads")).filter((f) => f.endsWith("_payload.json")))
    payloads[f.replace("_payload.json", "")] = loadPayload(f);
  const commodity_feed = JSON.parse(readFileSync(join(root, "payloads", "commodity_feed.json"), "utf8"));
  res.json({ engine: engineMode(), model: "gemini-2.5-flash", payloads, commodity_feed });
});

app.post("/api/apex", async (req, res) => {
  const t0 = Date.now();
  const result = await callApex(req.body?.payload ?? {});
  res.json({ result, latency_ms: Date.now() - t0, engine: engineMode() });
});

// ── 7-test verification suite (same assertions as src/tests/run_all_tests.js)
const SUITE = [
  {
    id: 1, name: "Cold start → UNKNOWN_ROUTE",
    payload: () => ({}),
    assert: (r) => r?.error_type === "UNKNOWN_ROUTE",
    detail: (r) => `error_type = ${r?.error_type}`,
  },
  {
    id: 2, name: "Integrity: battery 150 → DATA_ERROR",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.vehicle_telemetry.battery_level = 150;
      return p;
    },
    assert: (r) =>
      r?.error_type === "DATA_ERROR" &&
      (r?.out_of_bounds_fields ?? []).some((f) => String(f).includes("battery_level")),
    detail: (r) => `fields = ${JSON.stringify(r?.out_of_bounds_fields)}`,
  },
  {
    id: 3, name: "Route A · arbitrage_compile",
    payload: () => loadPayload("arbitrage_payload.json"),
    assert: (r) => r?.execution_mode === "arbitrage_compile" && "data_confidence" in (r ?? {}),
    detail: (r) => `net KES ${Number(r?.cargo_optimized_route?.net_profit_projection_kes ?? 0).toLocaleString("en-KE")} → ${r?.cargo_optimized_route?.optimal_market_destination} · ${r?.cargo_optimized_route?.logistics_risk_flag}`,
  },
  {
    id: 4, name: "Route B · user_chat (<25 words)",
    payload: () => loadPayload("user_chat_payload.json"),
    assert: (r) => {
      const w = String(r?.chat_response ?? "").trim().split(/\s+/).filter(Boolean).length;
      return r?.execution_mode === "user_chat" && w > 0 && w < 25;
    },
    detail: (r) => `"${r?.chat_response}"`,
  },
  {
    id: 5, name: "Route C · alert_broadcast CRITICAL",
    payload: () => loadPayload("alert_payload.json"),
    assert: (r) => r?.execution_mode === "alert_broadcast" && r?.severity === "CRITICAL",
    detail: (r) => `"${r?.farmer_push_message}"`,
  },
  {
    id: 6, name: "Route D · onboarding_intake",
    payload: () => loadPayload("onboarding_payload.json"),
    assert: (r) => r?.execution_mode === "onboarding_intake" && Boolean(r?.next_prompt),
    detail: (r) => `"${r?.next_prompt}"`,
  },
  {
    id: 7, name: "Route E · logistics_replan",
    payload: () => loadPayload("replan_payload.json"),
    assert: (r) => r?.execution_mode === "logistics_replan" && Boolean(r?.replan_status),
    detail: (r) => `${r?.replan_status} → ${r?.recommended_alternative_route?.new_destination}`,
  },
];

app.post("/api/suite", async (_req, res) => {
  const out = [];
  for (const t of SUITE) {
    const t0 = Date.now();
    const r = await callApex(t.payload());
    out.push({
      id: t.id,
      name: t.name,
      pass: Boolean(t.assert(r)),
      detail: t.detail(r),
      latency_ms: Date.now() - t0,
    });
  }
  res.json({ engine: engineMode(), results: out, passed: out.filter((x) => x.pass).length, total: out.length });
});


/* ── AGENTIC AUTOPILOT ────────────────────────────────────────────────────
 * Multi-step agent chain: SENSE → ARBITRAGE → WEATHER GATE → BROADCAST → BRIEF.
 * Each step's reasoning and output is traced for the dashboard timeline.
 */
app.post("/api/autopilot", async (req, res) => {
  const steps = [];
  const trace = async (agent, action, fn) => {
    const t0 = Date.now();
    const output = await fn();
    steps.push({ agent, action, output, latency_ms: Date.now() - t0 });
    return output;
  };

  const farmPayload = req.body?.payload ?? loadPayload("arbitrage_payload.json");

  await trace("SENSE", "Ingest farm telemetry, market feed and vehicle state", async () => ({
    farm: `${farmPayload.farm_location?.county} / ${farmPayload.farm_location?.sub_county} @ ${farmPayload.farm_location?.altitude_m}m`,
    crop: farmPayload.crop_type,
    vehicle: `${farmPayload.vehicle_telemetry?.vehicle_id} (${farmPayload.vehicle_telemetry?.vehicle_type}, ${farmPayload.vehicle_telemetry?.battery_level}% battery)`,
    rainfall_24h_mm: farmPayload.iot_telemetry?.rainfall_mm_last_24h,
    markets_tracked: farmPayload.market_data?.available_markets?.length ?? 0,
  }));

  const arb = await trace("APEX·ROUTE-A", "Compile crop arbitrage + climate risk matrix", () =>
    callApex(farmPayload)
  );

  const flag = arb?.cargo_optimized_route?.logistics_risk_flag ?? "CLEAR";
  const gate = await trace("WEATHER-GATE", "Evaluate §2.4 logistics weather gate on optimal route", async () => ({
    logistics_risk_flag: flag,
    decision: flag === "CLEAR" ? "DISPATCH_APPROVED" : "HOLD_AND_NOTIFY",
    season: arb?.climate_risk_sentinel?.current_kenyan_season,
    caution: arb?.climate_risk_sentinel?.climate_caution_alert,
  }));

  let alert = null;
  if (gate.decision === "HOLD_AND_NOTIFY") {
    alert = await trace("APEX·ROUTE-C", "Auto-broadcast weather hold to affected farmers", () =>
      callApex({
        execution_mode: "alert_broadcast",
        current_month: farmPayload.current_month,
        alert_trigger: {
          type: "WEATHER_ANOMALY",
          severity: "WARNING",
          detail: arb?.climate_risk_sentinel?.climate_caution_alert,
        },
        affected_farmer_ids: ["FARMER-001", "FARMER-002", "FARMER-003"],
      })
    );
  }

  const brief = await trace("MISSION-BRIEF", "Compose operator mission brief", async () => ({
    headline: flag === "CLEAR"
      ? `Dispatch ${farmPayload.crop_type} to ${arb?.cargo_optimized_route?.optimal_market_destination} — projected net KES ${Number(arb?.cargo_optimized_route?.net_profit_projection_kes ?? 0).toLocaleString("en-KE")}.`
      : `Hold ${farmPayload.crop_type} dispatch: ${flag} on the ${arb?.cargo_optimized_route?.optimal_market_destination} corridor. Farmers notified${alert ? " (alert " + alert.alert_id?.slice(0, 8) + ")" : ""}.`,
    next_review: "Re-run Autopilot after the next telemetry refresh.",
    confidence: arb?.data_confidence,
  }));

  res.json({ engine: engineMode(), steps, brief });
});

const PORT = process.env.PORT || 4517;
app.listen(PORT, () =>
  console.log(
    `KilimoOrbit Sentinel · Mission Control on http://localhost:${PORT}  (engine: ${engineMode()})`
  )
);
