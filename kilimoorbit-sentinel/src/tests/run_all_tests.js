/**
 * KilimoOrbit Sentinel — full verification suite
 * Cold start + data integrity + all 5 execution routes, in sequence.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode } from "../apex_client.js";

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

let passed = 0;
const results = [];

async function runTest(num, name, payload, assertFn) {
  process.stdout.write(C.bold(`\n[${num}/7] ${name}\n`));
  const t0 = Date.now();
  const res = await callApex(payload);
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

// ─ SUMMARY
console.log("\n" + C.bold("═".repeat(64)));
const verdict = passed === 7 ? C.green(`${passed}/7 TESTS PASSED ✔`) : C.red(`${passed}/7 tests passed`);
console.log(C.bold(`  SUMMARY: ${verdict}`));
console.log(C.bold("═".repeat(64)) + "\n");
process.exit(passed === 7 ? 0 : 1);
