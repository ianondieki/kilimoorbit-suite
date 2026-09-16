/**
 * LIVE → MOCK fallback suite. Forces the LIVE path to fail deterministically
 * (APEX_SIMULATE_LIVE_ERROR) and checks a farmer still gets a contract-true
 * answer, tagged with engine_fallback — never a CLIENT_FAILURE for a quota blip.
 */
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key-never-used";
delete process.env.APEX_MOCK;

const { callApex, engineMode } = await import("../apex_client.js");
const { loadPayload } = await import("../suite.js");

const C = { green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };
let passed = 0, total = 0;
async function check(name, fn) {
  total++;
  let ok = false, detail = "";
  try { const r = await fn(); ok = r?.ok ?? Boolean(r); detail = r?.detail ?? ""; } catch (err) { detail = `threw: ${err?.message ?? err}`; }
  if (ok) passed++;
  console.log(`  ${ok ? C.green("PASS") : C.red("FAIL")}  ${name}${detail ? C.dim("  · " + detail) : ""}`);
}

console.log(C.bold("\n" + "═".repeat(57)));
console.log(C.bold("  LIVE → MOCK FALLBACK SUITE"));
console.log("═".repeat(57));

await check("engine reports LIVE when a key is present", async () => ({ ok: engineMode() === "LIVE", detail: engineMode() }));

for (const code of ["429", "503", "timeout"]) {
  await check(`Gemini ${code} → deterministic answer tagged engine_fallback`, async () => {
    process.env.APEX_SIMULATE_LIVE_ERROR = code;
    const r = await callApex(loadPayload("arbitrage_payload.json"));
    return { ok: r.execution_mode === "arbitrage_compile" && r.engine_fallback?.to === "MOCK" && typeof r.cargo_optimized_route?.optimal_market_destination === "string", detail: r.engine_fallback?.reason };
  });
}

await check("Gemini 401 (bad key) is NOT masked — surfaces CLIENT_FAILURE", async () => {
  process.env.APEX_SIMULATE_LIVE_ERROR = "401";
  const r = await callApex(loadPayload("user_chat_payload.json"));
  return { ok: r.error_type === "CLIENT_FAILURE" && !r.engine_fallback, detail: r.error_message };
});

await check("APEX_FALLBACK=0 disables the safety net", async () => {
  process.env.APEX_SIMULATE_LIVE_ERROR = "503";
  process.env.APEX_FALLBACK = "0";
  const r = await callApex(loadPayload("alert_payload.json"));
  delete process.env.APEX_FALLBACK;
  return { ok: r.error_type === "CLIENT_FAILURE" };
});

await check("invalid payload never reaches LIVE at all (no fallback tag, DATA_ERROR)", async () => {
  process.env.APEX_SIMULATE_LIVE_ERROR = "503";
  const p = loadPayload("arbitrage_payload.json"); p.vehicle_telemetry.battery_level = 150;
  const r = await callApex(p);
  return { ok: r.error_type === "DATA_ERROR" && !r.engine_fallback };
});

console.log("─".repeat(57));
console.log(passed === total ? C.green(C.bold(`  ✓ ${passed}/${total} fallback tests passed`)) : C.red(C.bold(`  ✗ ${passed}/${total} fallback tests passed`)));
console.log("");
process.exit(passed === total ? 0 : 1);
