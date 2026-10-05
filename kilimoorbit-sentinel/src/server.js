/**
 * KilimoOrbit Sentinel — Mission Control server
 * Serves the dashboard (public/) and a thin JSON API over the APEX engine.
 *
 *   GET  /api/health     → status, engine mode, model, version, uptime
 *   GET  /api/meta       → engine mode + payload library + live commodity feed
 *   POST /api/apex       → { payload } → APEX decision object (+ latency)
 *   GET  /api/suite      → the verification catalogue (ids, names, groups)
 *   POST /api/suite      → runs the catalogue, returns results
 *   POST /api/autopilot  → agentic chain SENSE → A → gate → C → brief
 *   POST /api/signin     → { name, email } | { name, phone } → welcome email (SMTP or SIMULATED) | phone profile (SIMULATED, no SMS)
 *   GET  /api/weather    → ?county= → 7-day farm forecast + spray / plant / dry windows (see src/agro/weather.js)
 *   GET  /api/prices/history → ?crop= → 14 daily prices per market + 7-day change (see src/agro/prices.js)
 *   /api/soko/*          → produce marketplace (see src/soko/routes.js)
 *
 * `createApp()` is exported so the HTTP test-suite can boot the server on an
 * ephemeral port; `node src/server.js` listens on PORT (default 4517).
 */
import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode, MODEL } from "./apex_client.js";
import { createSokoRouter } from "./soko/routes.js";
import { findCounty, forecastFor } from "./agro/weather.js";
import { boardFor, historyFor } from "./agro/prices.js";
import { createPestWatch, validateReport } from "./agro/pests.js";
import { SUITE, runSuite, loadPayload } from "./suite.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

/* ── tiny in-memory rate limiter (per IP, fixed window) ─────────────────
 * This is a public demo server with open CORS and an endpoint that sends
 * email — without a cap it is a free spam relay. Dependency-free by design.
 */
function rateLimit({ windowMs, max, name }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "1") return next();
    const key = req.ip || req.socket?.remoteAddress || "anon";
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count++;
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - e.count));
    if (e.count > max) {
      res.setHeader("Retry-After", Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({
        error: `Too many ${name} requests — try again in ${Math.ceil((e.reset - now) / 1000)}s.`,
        error_type: "RATE_LIMITED",
      });
    }
    next();
  };
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY === "1"); // set when behind Render/Fly/nginx

  // Allow the Expo web/mobile clients (served from a different origin/port) to
  // call this API from the browser. Permissive by design — this is a demo API
  // with no credentials; abuse is bounded by the rate limiters below.
  // Mounted BEFORE the body parser so even a 400/413 error response carries
  // CORS headers (otherwise the browser reports an opaque "Failed to fetch").
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  app.use(express.static(join(root, "public"), { extensions: ["html"] }));

  const payloadFiles = readdirSync(join(root, "payloads")).filter((f) => f.endsWith("_payload.json"));

  /* ── LIVE TELEMETRY SIMULATOR ────────────────────────────────────────
   * The repo ships static fixtures; without sensors connected every refresh
   * showed identical numbers. This layer applies a bounded random walk (state
   * persists across requests) so each refresh / Autopilot run sees fresh,
   * plausible telemetry and prices. The verification suite bypasses it and
   * keeps using the raw fixtures, so tests stay deterministic.
   */
  const drift = (v, step, min, max) =>
    Math.min(max, Math.max(min, v + (Math.random() * 2 - 1) * step));

  const sim = (() => {
    const base = loadPayload("arbitrage_payload.json");
    return {
      battery: base.vehicle_telemetry.battery_level,
      soil: base.iot_telemetry.soil_moisture,
      temp: base.iot_telemetry.temperature_celsius,
      rain: base.iot_telemetry.rainfall_mm_last_24h,
      prices: base.market_data.available_markets.map((m) => m.wholesale_price_per_kg),
    };
  })();

  function liveArbitragePayload() {
    const p = loadPayload("arbitrage_payload.json");
    // e-boda drains in service and swaps to a fresh battery at the depot below 20%
    sim.battery = sim.battery <= 20 ? 96 : Math.max(5, sim.battery - Math.random() * 1.5);
    sim.soil = drift(sim.soil, 3, 20, 90);
    sim.temp = drift(sim.temp, 0.8, 12, 33);
    sim.rain = drift(sim.rain, 5, 0, 80);
    sim.prices = sim.prices.map((v) => drift(v, v * 0.02, 1, 490));
    p.vehicle_telemetry.battery_level = Math.round(sim.battery);
    p.vehicle_telemetry.charge_kwh = Number(((sim.battery / 100) * 2.7).toFixed(2));
    p.iot_telemetry.soil_moisture = Math.round(sim.soil);
    p.iot_telemetry.temperature_celsius = Number(sim.temp.toFixed(1));
    p.iot_telemetry.rainfall_mm_last_24h = Math.round(sim.rain);
    p.market_data.available_markets.forEach((m, i) => {
      m.wholesale_price_per_kg = Math.round(sim.prices[i]);
    });
    p.market_data.data_age_minutes = 5 + Math.floor(Math.random() * 50);
    p.telemetry_captured_at = new Date().toISOString();
    return p;
  }

  // Board prices follow the deterministic daily levels in src/agro/prices.js
  // (so the board, its 14-day history and Soko's fair price agree, and ▲/▼ is
  // the change since yesterday), with ±1 % intraday movement on top.
  function liveCommodityFeed() {
    const feed = loadPayload("commodity_feed.json");
    feed.data_age_minutes = 3 + Math.floor(Math.random() * 40);
    return boardFor(feed, { jitter: 0.01 });
  }

  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", engine: engineMode(), model: MODEL, version: VERSION, uptime_s: Math.round(process.uptime()) })
  );

  // Soko marketplace — listings + claims, priced off the live commodity feed.
  app.use("/api/soko", rateLimit({ windowMs: 60_000, max: 120, name: "marketplace" }),
    createSokoRouter({ liveFeed: liveCommodityFeed }));

  // Farm weather: 7-day forecast for a county plus the spray / plant / dry
  // windows. SAMPLE by default (deterministic); WEATHER_PROVIDER=open-meteo for real data.
  app.get("/api/weather", rateLimit({ windowMs: 60_000, max: 120, name: "weather" }), async (req, res) => {
    // Only a plain string: ?county[]=… or repeated keys arrive as arrays/objects.
    const name = typeof req.query.county === "string" ? req.query.county.trim().slice(0, 40) : "";
    if (!name)
      return res.status(400).json({ error: "A county is required, e.g. ?county=Meru.", error_type: "MISSING_COUNTY", fields: ["county"] });
    const county = findCounty(name);
    if (!county)
      return res.status(400).json({ error: `Unknown county: ${name}.`, error_type: "UNKNOWN_COUNTY", fields: ["county"] });
    try {
      res.json(await forecastFor(county));
    } catch (err) {
      res.status(500).json({ error: "Forecast unavailable.", error_type: "SERVER_ERROR" });
    }
  });

  // Price history for one crop: 14 daily closes per market (sample data, same
  // levels as the live board) and the change over the last week.
  app.get("/api/prices/history", rateLimit({ windowMs: 60_000, max: 120, name: "price history" }), (req, res) => {
    const crop = typeof req.query.crop === "string" ? req.query.crop.trim().slice(0, 40) : "";
    if (!crop)
      return res.status(400).json({ error: "A crop is required, e.g. ?crop=maize.", error_type: "MISSING_CROP", fields: ["crop"] });
    const h = historyFor(loadPayload("commodity_feed.json"), crop);
    if (!h)
      return res.status(400).json({ error: `No prices for crop: ${crop}.`, error_type: "UNKNOWN_CROP", fields: ["crop"] });
    res.json({ ...h, source: "SAMPLE", currency: "KES", unit: "kg" });
  });

  // Pest watch: anonymous fall armyworm scouting results pooled by county
  // (FAMEWS-style). Only county, crop, plants checked / hit and crop age are
  // accepted; nothing that identifies the farmer.
  const pests = createPestWatch();
  app.post("/api/pests/report", rateLimit({ windowMs: 10 * 60_000, max: 30, name: "pest report" }), (req, res) => {
    const v = validateReport(req.body);
    if (v.error) return res.status(400).json({ error: v.error, error_type: "VALIDATION_ERROR", fields: v.fields });
    pests.add(v.report);
    res.status(201).json({ ok: true, report: v.report, watch: pests.watch(v.report.county) });
  });
  app.get("/api/pests/watch", rateLimit({ windowMs: 60_000, max: 120, name: "pest watch" }), (req, res) => {
    const name = typeof req.query.county === "string" ? req.query.county.trim().slice(0, 40) : "";
    if (!name)
      return res.status(400).json({ error: "A county is required, e.g. ?county=Meru.", error_type: "MISSING_COUNTY", fields: ["county"] });
    const w = pests.watch(name);
    if (!w) return res.status(400).json({ error: `Unknown county: ${name}.`, error_type: "UNKNOWN_COUNTY", fields: ["county"] });
    res.json(w);
  });

  app.get("/api/meta", (_req, res) => {
    const payloads = {};
    for (const f of payloadFiles) payloads[f.replace("_payload.json", "")] = loadPayload(f);
    payloads.arbitrage = liveArbitragePayload();
    res.json({
      engine: engineMode(),
      model: MODEL,
      version: VERSION,
      payloads,
      commodity_feed: liveCommodityFeed(),
    });
  });

  /* ── SIGN-IN + WELCOME EMAIL ─────────────────────────────────────────
   * POST /api/signin accepts two shapes (additive; the email shape is unchanged):
   *   { name, email [, phone] } → sends a karibu email via SMTP when the SMTP_*
   *     env vars are configured; otherwise logs it and reports SIMULATED so the
   *     app can tell the user delivery isn't wired up yet. channel: "email".
   *   { name, phone }           → a Kenyan mobile number, normalised to E.164.
   *     No SMS gateway exists, so nothing is sent: SIMULATED, channel: "phone".
   * Nothing is stored server-side; the profile lives on the farmer's device.
   * Email-bearing requests keep the strict 5/hour limiter (spam-relay guard);
   * phone-only requests use their own looser bucket so farmers sharing one
   * CGNAT IP are not locked out by each other.
   */
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
  const PHONE_ERROR = "A Kenyan mobile number is required, e.g. 0712 345 678.";

  // Keep identical to kilimoorbit-mobile/lib/phone.ts (normalizeKePhone).
  function normalizeKePhone(raw) {
    const str = String(raw ?? "");
    if (str.includes("@") || /[a-z]/i.test(str)) return { ok: false, reason: "notPhone" };
    let d = str.replace(/\D/g, "");
    if (!d) return { ok: false, reason: "empty" };
    if (d.startsWith("254")) d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
    if (d.length < 9) return { ok: false, reason: "short" };
    if (d.length > 9) return { ok: false, reason: "long" };
    if (!/^[17]\d{8}$/.test(d)) return { ok: false, reason: "prefix" };
    return { ok: true, e164: "+254" + d, national: d };
  }
  // "+254712345678" → "0712 ••• 678" — never log a full number.
  const maskPhone = (e164) => `0${e164.slice(4, 7)} ••• ${e164.slice(-3)}`;
  // "wanjiru@gmail.com" → "w•••@gmail.com" — never log a full address either.
  const maskEmail = (e) => { const at = e.indexOf("@"); return at < 1 ? "•••" : `${e[0]}•••${e.slice(at)}`; };

  const signinEmailLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, name: "sign-in" });
  const signinPhoneLimiter = rateLimit({ windowMs: 10 * 60_000, max: 30, name: "sign-in" });

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

  app.post("/api/signin",
    (req, res, next) => (String(req.body?.email ?? "").trim() ? signinEmailLimiter : signinPhoneLimiter)(req, res, next),
    async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 80);
      const email = String(req.body?.email ?? "").trim().slice(0, 254);
      const phoneRaw = String(req.body?.phone ?? "").trim().slice(0, 32);

      // C) neither contact
      if (!email && !phoneRaw)
        return res.status(400).json({
          error: "A name and a valid email address or Kenyan mobile number are required.",
          error_type: "MISSING_CONTACT",
          fields: ["phone", "email"],
        });

      // B) phone path: no SMS gateway, so nothing is sent and nothing is stored.
      if (!email) {
        if (!name)
          return res.status(400).json({ error: "A name is required.", error_type: "INVALID_NAME", fields: ["name"] });
        const p = normalizeKePhone(phoneRaw);
        if (!p.ok)
          return res.status(400).json({ error: PHONE_ERROR, error_type: "INVALID_PHONE", fields: ["phone"] });
        console.log(`[signin] phone ${maskPhone(p.e164)} (${name.length}-char name): no SMS gateway, simulated.`);
        return res.json({
          status: "SIMULATED",
          channel: "phone",
          phone: p.e164,
          message: "Signed in. No SMS gateway is configured on the server, so no welcome SMS was sent.",
        });
      }

      // A) email path: existing behaviour, plus an optional phone.
      if (!name || !EMAIL_RE.test(email))
        return res.status(400).json({
          error: "A name and a valid email address are required.",
          error_type: !name ? "INVALID_NAME" : "INVALID_EMAIL",
          fields: [!name ? "name" : "email"],
        });
      let phone;
      if (phoneRaw) {
        const p = normalizeKePhone(phoneRaw);
        if (!p.ok)
          return res.status(400).json({ error: PHONE_ERROR, error_type: "INVALID_PHONE", fields: ["phone"] });
        phone = p.e164;
      }

      const text = [
        `Habari ${name},`,
        "",
        "Karibu KilimoOrbit Sentinel — your profile is saved on this device.",
        "From the app you can check market (masoko) prices, climate risk for your shamba,",
        "e-boda routing, and chat with Apex in English or Kiswahili.",
        "",
        `Engine mode at sign-in: ${engineMode()}`,
        "",
        "Asante,",
        "The KilimoOrbit team",
      ].join("\n");

      const transport = mailTransport();
      if (!transport) {
        console.log(`[signin] SMTP not configured — welcome email for ${maskEmail(email)} simulated.`);
        return res.json({
          status: "SIMULATED",
          email,
          message: "Signed in. SMTP is not configured on the server (set SMTP_* in .env), so the welcome email was simulated.",
          channel: "email",
          ...(phone ? { phone } : {}),
        });
      }
      await transport.sendMail({
        from: process.env.SMTP_FROM || `KilimoOrbit Sentinel <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Karibu KilimoOrbit Sentinel 🌿",
        text,
      });
      res.json({ status: "SENT", email, message: `Welcome email sent to ${email}.`, channel: "email", ...(phone ? { phone } : {}) });
    } catch (err) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  const apexLimiter = rateLimit({ windowMs: 60_000, max: 60, name: "APEX" });

  app.post("/api/apex", apexLimiter, async (req, res) => {
    const t0 = Date.now();
    try {
      const result = await callApex(req.body?.payload ?? {});
      res.json({ result, latency_ms: Date.now() - t0, engine: engineMode() });
    } catch (err) {
      res.status(500).json({ error: "Apex failed unexpectedly.", error_type: "SERVER_ERROR" });
    }
  });

  // ── verification suite (shared catalogue: src/suite.js)
  app.get("/api/suite", (_req, res) =>
    res.json({ engine: engineMode(), total: SUITE.length, tests: SUITE.map(({ id, group, name }) => ({ id, group, name })) })
  );

  app.post("/api/suite", rateLimit({ windowMs: 60_000, max: 6, name: "suite" }), async (_req, res) => {
    try {
      const results = (await runSuite(callApex)).map(({ raw, ...row }) => row);
      res.json({ engine: engineMode(), results, passed: results.filter((x) => x.pass).length, total: results.length });
    } catch (err) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  /* ── AGENTIC AUTOPILOT ───────────────────────────────────────────────
   * Multi-step agent chain: SENSE → ARBITRAGE → WEATHER GATE → BROADCAST → BRIEF.
   * Each step's reasoning and output is traced for the dashboard timeline.
   */
  app.post("/api/autopilot", rateLimit({ windowMs: 60_000, max: 20, name: "autopilot" }), async (req, res) => {
    try {
      const steps = [];
      const trace = async (agent, action, fn) => {
        const t0 = Date.now();
        const output = await fn();
        steps.push({ agent, action, output, latency_ms: Date.now() - t0 });
        return output;
      };

      const supplied = req.body?.payload;
      const farmPayload = supplied && typeof supplied === "object" && !Array.isArray(supplied)
        ? { ...supplied, execution_mode: "arbitrage_compile" }
        : liveArbitragePayload();

      await trace("SENSE", "Ingest farm telemetry, market feed and vehicle state", async () => ({
        farm: `${farmPayload.farm_location?.county ?? "?"} / ${farmPayload.farm_location?.sub_county ?? "?"} @ ${farmPayload.farm_location?.altitude_m ?? "?"}m`,
        crop: farmPayload.crop_type,
        month: farmPayload.current_month,
        vehicle: `${farmPayload.vehicle_telemetry?.vehicle_id ?? "?"} (${farmPayload.vehicle_telemetry?.vehicle_type ?? "?"}, ${farmPayload.vehicle_telemetry?.battery_level ?? "?"}% battery)`,
        rainfall_24h_mm: farmPayload.iot_telemetry?.rainfall_mm_last_24h,
        markets_tracked: farmPayload.market_data?.available_markets?.length ?? 0,
        market_data_age_min: farmPayload.market_data?.data_age_minutes,
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

      const route = arb?.cargo_optimized_route ?? {};
      const flag = route.logistics_risk_flag ?? "CLEAR";
      const stale = arb?.price_status === "STALE_DATA";
      const gate = await trace("WEATHER-GATE", "Evaluate §2.4 logistics weather gate on optimal route", async () => ({
        logistics_risk_flag: flag,
        price_status: arb?.price_status,
        decision: flag !== "CLEAR" ? "HOLD_AND_NOTIFY" : stale ? "HOLD_FOR_PRICE_REFRESH" : "DISPATCH_APPROVED",
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
              type: flag === "BATTERY_RISK" ? "VEHICLE_FAULT" : "WEATHER_ANOMALY",
              severity: flag === "ROAD_IMPASSABLE" ? "CRITICAL" : "WARNING",
              detail: arb?.climate_risk_sentinel?.climate_caution_alert,
            },
            affected_farmer_ids: ["FARMER-001", "FARMER-002", "FARMER-003"],
          })
        );
      }
      const alertOk = alert && alert.execution_mode === "alert_broadcast";

      const brief = await trace("MISSION-BRIEF", "Compose operator mission brief", async () => ({
        headline:
          gate.decision === "DISPATCH_APPROVED"
            ? `Dispatch ${farmPayload.crop_type} to ${route.optimal_market_destination} — projected net KES ${Number(route.net_profit_projection_kes ?? 0).toLocaleString("en-KE")}.`
            : gate.decision === "HOLD_FOR_PRICE_REFRESH"
              ? `Hold ${farmPayload.crop_type} dispatch: market feed is stale, profit projection suppressed until refresh.`
              : `Hold ${farmPayload.crop_type} dispatch: ${flag} on the ${route.optimal_market_destination} corridor. ${alertOk ? `Farmers notified (alert ${String(alert.alert_id).slice(0, 8)}).` : "Farmer broadcast FAILED — notify manually."}`,
        next_review: "Re-run Autopilot after the next telemetry refresh.",
        confidence: arb?.data_confidence,
        broadcast: alert ? (alertOk ? "SENT" : "FAILED") : "NOT_REQUIRED",
      }));

      res.json({ engine: engineMode(), steps, brief });
    } catch (err) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "No such API route.", error_type: "NOT_FOUND" }));

  // Malformed JSON bodies and other middleware errors → JSON, never Express's HTML page.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err?.type === "entity.parse.failed" ? 400 : err?.status ?? err?.statusCode ?? 500;
    res.status(status).json({
      error: status === 400 ? "Request body is not valid JSON." : status === 413 ? "Request body too large." : "Internal server error.",
      error_type: status === 400 ? "BAD_JSON" : status === 413 ? "PAYLOAD_TOO_LARGE" : "SERVER_ERROR",
    });
  });

  return app;
}

/* ── boot when run directly (`npm start`) ───────────────────────────────── */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const PORT = Number(process.env.PORT) || 4517;
  const server = createApp().listen(PORT, () =>
    console.log(
      `KilimoOrbit Sentinel v${VERSION} · Mission Control on http://localhost:${PORT}  (engine: ${engineMode()} · model: ${MODEL})`
    )
  );
  const shutdown = (sig) => {
    console.log(`\n[${sig}] shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  // Safety net: Node exits on an unhandled promise rejection by default. Every
  // route catches its own errors; anything that still slips through is logged
  // and the server keeps serving farmers rather than going down.
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason instanceof Error ? reason.stack : reason);
  });
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
