/**
 * KilimoOrbit Sentinel — APEX verification suite (CLI runner)
 * Runs the shared catalogue in src/suite.js: cold start, data integrity,
 * all 5 execution routes, climate matrix, weather gates, memory, guardrails.
 */
import { callApex, engineMode, MODEL } from "../apex_client.js";
import { SUITE, runSuite } from "../suite.js";

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
};

const TOTAL = SUITE.length;
console.log(C.bold("═".repeat(64)));
console.log(C.bold("  KILIMOORBIT SENTINEL — APEX VERIFICATION SUITE"));
console.log(`  engine: ${C.gold(engineMode())}   model: ${MODEL}   temp: 0   cases: ${TOTAL}`);
console.log(C.bold("═".repeat(64)));

const results = await runSuite(callApex, {
  onResult: (r) => {
    console.log(C.bold(`\n[${r.id}/${TOTAL}] ${r.name}`) + C.dim(`  · ${r.group}`));
    console.log(`  ${r.pass ? C.green("PASS") : C.red("FAIL")} ${C.dim(`(${r.latency_ms} ms)`)}`);
    if (r.detail) console.log(`  ${r.detail}`);
    if (!r.pass) console.log(C.dim("  response: " + JSON.stringify(r.raw).slice(0, 500)));
  },
});

const passed = results.filter((r) => r.pass).length;
console.log("\n" + C.bold("═".repeat(64)));
const verdict = passed === TOTAL ? C.green(`${passed}/${TOTAL} TESTS PASSED ✔`) : C.red(`${passed}/${TOTAL} tests passed`);
console.log(C.bold(`  SUMMARY: ${verdict}`));
console.log(C.bold("═".repeat(64)) + "\n");
process.exit(passed === TOTAL ? 0 : 1);
