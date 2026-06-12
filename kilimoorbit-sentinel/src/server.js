/**
 * KilimoOrbit Sentinel — Mission Control server
 * Serves the dashboard (public/) and a thin JSON API over the APEX engine.
 *
 *   GET  /api/meta    → engine mode + payload library (live-simulated telemetry)
 *   POST /api/apex    → { payload } → APEX decision object (+ latency)
 *   POST /api/ussd    → Africa's Talking USSD callback (form-encoded → text)
 *   POST /api/signin  → { name, email } → welcome email (SMTP or SIMULATED)
 *   POST /api/suite   → runs the verification suite, returns results
 */
import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode } from "./apex_client.js";
import { loadPayload, payloadFiles, liveArbitragePayload, liveCommodityFeed } from "./data.js";
import { handleUssd } from "./ussd.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false })); // USSD gateways post form-encoded
app.use(express.static(join(root, "public")));

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", engine: engineMode(), uptime_s: Math.round(process.uptime()) })
);

app.get("/api/meta", (_req, res) => {
  const payloads = {};
  for (const f of payloadFiles) payloads[f.replace("_payload.json", "")] = loadPayload(f);
  payloads.arbitrage = liveArbitragePayload();
  res.json({
    engine: engineMode(),
    model: "gemini-2.5-flash",
    payloads,
    commodity_feed: liveCommodityFeed(),
  });
});

/* ── USSD SERVICE ─────────────────────────────────────────────────────────
 * Africa's Talking callback. Point your AT dashboard (or sandbox simulator)
 * at https://<your-host>/api/ussd — see src/ussd.js for the menu tree.
 */
app.post("/api/ussd", async (req, res) => {
  res.set("Content-Type", "text/plain");
  try {
    const reply = await handleUssd({
      text: String(req.body?.text ?? ""),
      phoneNumber: String(req.body?.phoneNumber ?? ""),
    });
    res.send(reply);
  } catch (err) {
    console.error("[ussd]", err);
    res.send("END Samahani, huduma haipatikani kwa sasa. Jaribu tena baadaye.");
  }
});

/* ── SIGN-IN + WELCOME EMAIL ──────────────────────────────────────────────
 * POST /api/signin { name, email } → sends a karibu email via SMTP when the
 * SMTP_* env vars are configured; otherwise logs it and reports SIMULATED so
 * the app can tell the user delivery isn't wired up yet.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mailTransport() {
  if (process.env.SMTP_URL) return nodemailer.createTransport(process.env.SMTP_URL);
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  return null;
}

app.post("/api/signin", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    if (!name || !EMAIL_RE.test(email))
      return res.status(400).json({ error: "A name and a valid email address are required." });

    const text = [
      `Habari ${name},`,
      "",
      "Karibu KilimoOrbit Sentinel — your account is now active on this device.",
      "From the app you can track live masoko prices, climate risk for your shamba,",
      "e-boda routing, and chat with Apex in English or Kiswahili.",
      "",
      `Engine mode at sign-in: ${engineMode()}`,
      "",
      "Asante,",
      "The KilimoOrbit team",
    ].join("\n");

    const transport = mailTransport();
    if (!transport) {
      console.log(`[signin] SMTP not configured — welcome email for ${email} simulated:\n${text}\n`);
      return res.json({
        status: "SIMULATED",
        email,
        message: "Signed in. SMTP is not configured on the server (set SMTP_* in .env), so the welcome email was simulated.",
      });
    }
    await transport.sendMail({
      from: process.env.SMTP_FROM || `KilimoOrbit Sentinel <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Karibu KilimoOrbit Sentinel 🌿",
      text,
    });
    res.json({ status: "SENT", email, message: `Welcome email sent to ${email}.` });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
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
  {
    id: 8, name: "Integrity: stale feed → STALE_DATA + suppression",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.market_data.data_age_minutes = 300;
      return p;
    },
    assert: (r) =>
      r?.price_status === "STALE_DATA" &&
      r?.cargo_optimized_route?.net_profit_projection_kes == null,
    detail: (r) => `price_status = ${r?.price_status} · net = ${r?.cargo_optimized_route?.net_profit_projection_kes ?? "null"}`,
  },
  {
    id: 9, name: "Integrity: empty market list → DATA_ERROR",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.market_data.available_markets = [];
      return p;
    },
    assert: (r) => r?.error_type === "DATA_ERROR",
    detail: (r) => `error_type = ${r?.error_type} · fields = ${JSON.stringify(r?.failed_fields)}`,
  },
  {
    id: 10, name: "Climate: ASAL hot/dry season → Critical risk",
    payload: () => {
      const p = loadPayload("arbitrage_payload.json");
      p.current_month = "January";
      p.farm_location = { county: "Turkana", sub_county: "Loima", altitude_m: 600, road_type: "murram" };
      return p;
    },
    assert: (r) => r?.climate_risk_sentinel?.pre_farming_risk_level === "Critical",
    detail: (r) => `risk = ${r?.climate_risk_sentinel?.pre_farming_risk_level} · zone = ${r?.climate_risk_sentinel?.farm_altitude_zone}`,
  },
  {
    id: 11, name: "Memory: follow-up inherits topic from chat_history",
    payload: () => {
      const p = loadPayload("user_chat_payload.json");
      p.chat_history = [
        { role: "user", text: "Je, bei ya nyanya iko juu wiki hii?" },
        { role: "apex", text: "Bei ya nyanya Meru Main Market iko KES 42 kwa kilo. 🍅" },
      ];
      p.user_message = "Na kesho je, niuze huko?";
      return p;
    },
    assert: (r) => r?.intent_detected === "price_query",
    detail: (r) => `intent = ${r?.intent_detected} · "${r?.chat_response}"`,
  },
  {
    id: 12, name: "USSD: root → CON main menu",
    run: () => handleUssd({ text: "" }),
    assert: (r) => typeof r === "string" && r.startsWith("CON") && r.includes("Bei za soko"),
    detail: (r) => `"${String(r).split("\n")[0]}…"`,
  },
  {
    id: 13, name: "USSD: 1*1 → END crop quotes in KES",
    run: () => handleUssd({ text: "1*1" }),
    assert: (r) => typeof r === "string" && r.startsWith("END") && r.includes("KES") && r.length <= 164,
    detail: (r) => `"${String(r).replaceAll("\n", " / ")}"`,
  },
  {
    id: 14, name: "USSD: 3*<swali> → END GSM-safe Apex reply",
    run: () => handleUssd({ text: "3*Je bei ya nyanya iko juu?", phoneNumber: "+254700000001" }),
    assert: (r) =>
      typeof r === "string" && r.startsWith("END") && r.includes("KES") &&
      r.length <= 164 && !/[\u{1F000}-\u{1FAFF}]/u.test(r),
    detail: (r) => `"${String(r).replaceAll("\n", " / ")}"`,
  },
];

app.post("/api/suite", async (_req, res) => {
  try {
    const out = [];
    for (const t of SUITE) {
      const t0 = Date.now();
      const r = await (t.run ? t.run() : callApex(t.payload()));
      out.push({
        id: t.id,
        name: t.name,
        pass: Boolean(t.assert(r)),
        detail: t.detail(r),
        latency_ms: Date.now() - t0,
      });
    }
    res.json({ engine: engineMode(), results: out, passed: out.filter((x) => x.pass).length, total: out.length });
  } catch (err) {
    // Express 4 doesn't catch async throws — without this, a bad payload file kills the process.
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});


/* ── AGENTIC AUTOPILOT ────────────────────────────────────────────────────
 * Multi-step agent chain: SENSE → ARBITRAGE → WEATHER GATE → BROADCAST → BRIEF.
 * Each step's reasoning and output is traced for the dashboard timeline.
 */
app.post("/api/autopilot", async (req, res) => {
  try {
    const steps = [];
    const trace = async (agent, action, fn) => {
      const t0 = Date.now();
      const output = await fn();
      steps.push({ agent, action, output, latency_ms: Date.now() - t0 });
      return output;
    };

    const farmPayload = req.body?.payload ?? liveArbitragePayload();

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

    // Without an arbitrage result there is nothing to gate or dispatch — abort the chain.
    if (arb?.execution_mode === "error") {
      const brief = await trace("MISSION-BRIEF", "Abort — arbitrage compile failed", async () => ({
        headline: `Autopilot aborted: ${arb.error_type} — ${arb.error_message ?? "arbitrage compile failed."}`,
        next_review: arb.recovery_suggestion ?? "Fix the payload or resync telemetry, then re-engage Autopilot.",
        confidence: "LOW",
      }));
      return res.json({ engine: engineMode(), steps, brief, aborted: true });
    }

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
  } catch (err) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

const PORT = process.env.PORT || 4517;
app.listen(PORT, () =>
  console.log(
    `KilimoOrbit Sentinel · Mission Control on http://localhost:${PORT}  (engine: ${engineMode()})`
  )
);
