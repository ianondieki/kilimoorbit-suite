/**
 * KilimoOrbit Sentinel — full verification suite
 * Cold start + data integrity + all 5 execution routes, in sequence.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode } from "../apex_client.js";
import { handleUssd } from "../ussd.js";

const here = dirname(fileURLToPath(import.meta.url));
const loadPayload = (f) =>
  JSON.parse(readFileSync(join(here, "../../payloads", f), "utf8"));

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
};

const TOTAL = 14;
let passed = 0;
const results = [];

async function runTest(num, name, payload, assertFn, runner = callApex) {
  process.stdout.write(C.bold(`\n[${num}/${TOTAL}] ${name}\n`));
  const t0 = Date.now();
  const res = await runner(payload);
  const ms = Date.now() - t0;
  const { ok, detail } = assertFn(res);
  if (ok) {
    passed++;
    console.log(`  ${C.green("PASS")} ${C.dim(`(${ms} ms)`)}`);
  } else {
    console.log(`  ${C.red("FAIL")} ${C.dim(`(${ms} ms)`)}`);
    console.log(C.dim("  response: " + JSON.stringify(res).slice(0, 400)));
  }
  if (detail) console.log(`  ${detail}`);
  results.push({ num, name, ok, ms });
}

console.log(C.bold("═".repeat(64)));
console.log(C.bold("  KILIMOORBIT SENTINEL — APEX VERIFICATION SUITE"));
console.log(`  engine: ${C.gold(engineMode())}   model: gemini-2.5-flash   temp: 0`);
console.log(C.bold("═".repeat(64)));

// 1 ─ COLD START
await runTest(1, "COLD START — empty payload {} → UNKNOWN_ROUTE", {}, (r) => ({
  ok: r?.error_type === "UNKNOWN_ROUTE",
  detail: `error_type = ${r?.error_type}`,
}));

// 2 ─ DATA INTEGRITY
const corrupt = loadPayload("arbitrage_payload.json");
corrupt.vehicle_telemetry.battery_level = 150;
await runTest(
  2,
  "DATA INTEGRITY — battery_level 150 → DATA_ERROR",
  corrupt,
  (r) => ({
    ok:
      r?.error_type === "DATA_ERROR" &&
      Array.isArray(r?.out_of_bounds_fields) &&
      r.out_of_bounds_fields.some((f) => String(f).includes("battery_level")),
    detail: `out_of_bounds_fields = ${JSON.stringify(r?.out_of_bounds_fields)}`,
  })
);

// 3 ─ ROUTE A
await runTest(
  3,
  "ROUTE A — arbitrage_compile",
  loadPayload("arbitrage_payload.json"),
  (r) => ({
    ok: r?.execution_mode === "arbitrage_compile" && "data_confidence" in (r ?? {}),
    detail: `net_profit_projection_kes = ${C.gold(
      "KES " + Number(r?.cargo_optimized_route?.net_profit_projection_kes ?? 0).toLocaleString("en-KE")
    )}  ·  market: ${r?.cargo_optimized_route?.optimal_market_destination}  ·  confidence: ${r?.data_confidence}  ·  season: ${r?.climate_risk_sentinel?.current_kenyan_season}  ·  logistics: ${r?.cargo_optimized_route?.logistics_risk_flag}`,
  })
);

// 4 ─ ROUTE B
await runTest(
  4,
  "ROUTE B — user_chat (Swahili, <25 words)",
  loadPayload("user_chat_payload.json"),
  (r) => {
    const words = String(r?.chat_response ?? "").trim().split(/\s+/).filter(Boolean).length;
    return {
      ok: r?.execution_mode === "user_chat" && words > 0 && words < 25,
      detail: `chat_response (${words} words): "${r?.chat_response}"`,
    };
  }
);

// 5 ─ ROUTE C
await runTest(
  5,
  "ROUTE C — alert_broadcast (CRITICAL)",
  loadPayload("alert_payload.json"),
  (r) => ({
    ok: r?.execution_mode === "alert_broadcast" && r?.severity === "CRITICAL",
    detail: `farmer_push_message: "${r?.farmer_push_message}"`,
  })
);

// 6 ─ ROUTE D
await runTest(
  6,
  "ROUTE D — onboarding_intake",
  loadPayload("onboarding_payload.json"),
  (r) => ({
    ok:
      r?.execution_mode === "onboarding_intake" &&
      typeof r?.next_prompt === "string" &&
      r.next_prompt.length > 0,
    detail: `next_prompt: "${r?.next_prompt}"`,
  })
);

// 7 ─ ROUTE E
await runTest(
  7,
  "ROUTE E — logistics_replan",
  loadPayload("replan_payload.json"),
  (r) => ({
    ok:
      r?.execution_mode === "logistics_replan" &&
      typeof r?.replan_status === "string" &&
      r.replan_status.length > 0,
    detail: `replan_status: ${r?.replan_status}  ·  new_destination: ${C.gold(
      r?.recommended_alternative_route?.new_destination ?? "—"
    )}`,
  })
);

// 8 ─ STALE FEED REGRESSION
const stale = loadPayload("arbitrage_payload.json");
stale.market_data.data_age_minutes = 300;
await runTest(
  8,
  "INTEGRITY — stale feed (300 min) → STALE_DATA + suppression",
  stale,
  (r) => ({
    ok:
      r?.price_status === "STALE_DATA" &&
      r?.cargo_optimized_route?.net_profit_projection_kes == null,
    detail: `price_status = ${r?.price_status}  ·  net = ${r?.cargo_optimized_route?.net_profit_projection_kes ?? "null"}  ·  confidence = ${r?.data_confidence}`,
  })
);

// 9 ─ EMPTY MARKET LIST REGRESSION
const noMarkets = loadPayload("arbitrage_payload.json");
noMarkets.market_data.available_markets = [];
await runTest(
  9,
  "INTEGRITY — empty available_markets → DATA_ERROR",
  noMarkets,
  (r) => ({
    ok: r?.error_type === "DATA_ERROR",
    detail: `error_type = ${r?.error_type}  ·  failed_fields = ${JSON.stringify(r?.failed_fields)}`,
  })
);

// 10 ─ ASAL DROUGHT CRITICAL REGRESSION
const asal = loadPayload("arbitrage_payload.json");
asal.current_month = "January";
asal.farm_location = { county: "Turkana", sub_county: "Loima", altitude_m: 600, road_type: "murram" };
await runTest(
  10,
  "CLIMATE — Turkana in January (ASAL hot/dry) → Critical risk",
  asal,
  (r) => ({
    ok: r?.climate_risk_sentinel?.pre_farming_risk_level === "Critical",
    detail: `risk = ${r?.climate_risk_sentinel?.pre_farming_risk_level}  ·  zone = ${r?.climate_risk_sentinel?.farm_altitude_zone}`,
  })
);

// 11 ─ CONVERSATION MEMORY
const followUp = loadPayload("user_chat_payload.json");
followUp.chat_history = [
  { role: "user", text: "Je, bei ya nyanya iko juu wiki hii?" },
  { role: "apex", text: "Bei ya nyanya Meru Main Market iko KES 42 kwa kilo. 🍅" },
];
followUp.user_message = "Na kesho je, niuze huko?";
await runTest(
  11,
  "MEMORY — elliptical follow-up inherits price topic from chat_history",
  followUp,
  (r) => {
    const words = String(r?.chat_response ?? "").trim().split(/\s+/).filter(Boolean).length;
    return {
      ok: r?.intent_detected === "price_query" && words > 0 && words < 25,
      detail: `intent = ${r?.intent_detected}  ·  "${r?.chat_response}"`,
    };
  }
);

// 12 ─ USSD MAIN MENU
await runTest(
  12,
  "USSD — root request renders CON main menu",
  { text: "" },
  (r) => ({
    ok: typeof r === "string" && r.startsWith("CON") && r.includes("Bei za soko"),
    detail: `"${String(r).replaceAll("\n", " / ")}"`,
  }),
  handleUssd
);

// 13 ─ USSD PRICE FLOW
await runTest(
  13,
  "USSD — 1*1 returns END crop quotes in KES within one screen",
  { text: "1*1" },
  (r) => ({
    ok: typeof r === "string" && r.startsWith("END") && r.includes("KES") && r.length <= 164,
    detail: `"${String(r).replaceAll("\n", " / ")}"`,
  }),
  handleUssd
);

// 14 ─ USSD APEX CHAT (GSM-7 safe)
await runTest(
  14,
  "USSD — 3*<swali> returns GSM-safe END Apex reply with live price",
  { text: "3*Je bei ya nyanya iko juu?", phoneNumber: "+254700000001" },
  (r) => ({
    ok:
      typeof r === "string" && r.startsWith("END") && r.includes("KES") &&
      r.length <= 164 && !/[\u{1F000}-\u{1FAFF}]/u.test(r),
    detail: `"${String(r).replaceAll("\n", " / ")}"`,
  }),
  handleUssd
);

// ─ SUMMARY
console.log("\n" + C.bold("═".repeat(64)));
const verdict = passed === TOTAL ? C.green(`${passed}/${TOTAL} TESTS PASSED ✔`) : C.red(`${passed}/${TOTAL} tests passed`);
console.log(C.bold(`  SUMMARY: ${verdict}`));
console.log(C.bold("═".repeat(64)) + "\n");
process.exit(passed === TOTAL ? 0 : 1);
