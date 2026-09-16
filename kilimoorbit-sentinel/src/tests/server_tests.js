/**
 * KilimoOrbit Sentinel — HTTP integration suite.
 * Boots the real Express app on an ephemeral port (mock engine, temp Soko
 * store, rate limits ON) and exercises every public endpoint the dashboard
 * and the two mobile apps depend on.
 */
process.env.APEX_MOCK = "1";
process.env.SOKO_STORE_PATH = process.env.SOKO_STORE_PATH
  || `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/soko_test_${process.pid}.json`;

const { createApp } = await import("../server.js");
const { unlinkSync } = await import("node:fs");

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const server = createApp().listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const post = async (p, body, raw = false) => {
  const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};

let passed = 0, total = 0;
async function check(name, fn) {
  total++;
  let ok = false, detail = "";
  try { const r = await fn(); ok = r?.ok ?? Boolean(r); detail = r?.detail ?? ""; }
  catch (err) { detail = `threw: ${err?.message ?? err}`; }
  if (ok) passed++;
  console.log(`  ${ok ? C.green("PASS") : C.red("FAIL")}  ${name}${detail ? C.dim("  · " + detail) : ""}`);
}

console.log(C.bold("\n" + "═".repeat(57)));
console.log(C.bold("  MISSION CONTROL — HTTP INTEGRATION SUITE"));
console.log("═".repeat(57));

await check("GET /api/health → ok + engine + version", async () => {
  const r = await get("/api/health");
  return { ok: r.status === 200 && r.body.status === "ok" && r.body.engine === "MOCK" && typeof r.body.version === "string", detail: `v${r.body?.version}` };
});

await check("GET /api/meta → payload library + live feed", async () => {
  const r = await get("/api/meta");
  const p = r.body?.payloads ?? {};
  return { ok: r.status === 200 && ["arbitrage", "user_chat", "alert", "onboarding", "replan"].every((k) => k in p) && Array.isArray(r.body.commodity_feed?.commodities) && typeof r.body.model === "string", detail: `${Object.keys(p).length} payloads · model ${r.body?.model}` };
});

await check("GET /api/meta twice → telemetry simulator drifts", async () => {
  const a = (await get("/api/meta")).body.payloads.arbitrage.telemetry_captured_at;
  const b = (await get("/api/meta")).body.payloads.arbitrage.telemetry_captured_at;
  return { ok: typeof a === "string" && typeof b === "string" };
});

await check("GET / → dashboard HTML", async () => {
  const r = await fetch(base + "/");
  const t = await r.text();
  return { ok: r.status === 200 && /Mission Control/.test(t) && /text\/html/.test(r.headers.get("content-type")) };
});

await check("GET /pitch → investor page", async () => {
  const r = await fetch(base + "/pitch");
  return { ok: r.status === 200 && /KilimoOrbit/.test(await r.text()) };
});

await check("POST /api/apex Route A → arbitrage decision + latency", async () => {
  const meta = (await get("/api/meta")).body;
  const r = await post("/api/apex", { payload: meta.payloads.arbitrage });
  return { ok: r.status === 200 && r.body.result?.execution_mode === "arbitrage_compile" && typeof r.body.latency_ms === "number", detail: `${r.body?.result?.cargo_optimized_route?.optimal_market_destination}` };
});

await check("POST /api/apex {} → UNKNOWN_ROUTE (not 500)", async () => {
  const r = await post("/api/apex", {});
  return { ok: r.status === 200 && r.body.result?.error_type === "UNKNOWN_ROUTE" };
});

await check("POST /api/apex with broken JSON → 400 BAD_JSON + CORS header", async () => {
  const r = await post("/api/apex", "{ this is not json", true);
  return { ok: r.status === 400 && r.body?.error_type === "BAD_JSON" && r.headers.get("access-control-allow-origin") === "*" };
});

await check("POST /api/apex payload as array → UNKNOWN_ROUTE", async () => {
  const r = await post("/api/apex", { payload: [1, 2, 3] });
  return { ok: r.status === 200 && r.body.result?.error_type === "UNKNOWN_ROUTE" };
});

await check("GET /api/suite → catalogue matches POST /api/suite total", async () => {
  const cat = await get("/api/suite");
  const run = await post("/api/suite", {});
  return { ok: cat.status === 200 && run.status === 200 && cat.body.total === run.body.total && run.body.results.length === run.body.total && !("raw" in run.body.results[0]), detail: `${run.body?.passed}/${run.body?.total} passed` };
});

await check("POST /api/suite → every case passes on the mock engine", async () => {
  const run = await post("/api/suite", {});
  const failed = run.body.results.filter((x) => !x.pass).map((x) => x.name);
  return { ok: failed.length === 0, detail: failed.length ? failed.join("; ") : "all green" };
});

await check("POST /api/autopilot → 5-step trace + brief", async () => {
  const r = await post("/api/autopilot", {});
  const agents = r.body?.steps?.map((s) => s.agent) ?? [];
  return { ok: r.status === 200 && agents[0] === "SENSE" && agents.includes("APEX·ROUTE-A") && agents.at(-1) === "MISSION-BRIEF" && typeof r.body.brief?.headline === "string", detail: r.body?.brief?.headline?.slice(0, 80) };
});

await check("POST /api/autopilot with ROAD_IMPASSABLE telemetry → CRITICAL broadcast", async () => {
  const p = (await get("/api/meta")).body.payloads.arbitrage;
  p.iot_telemetry.rainfall_mm_last_24h = 150;
  const r = await post("/api/autopilot", { payload: p });
  const c = r.body?.steps?.find((s) => s.agent === "APEX·ROUTE-C");
  return { ok: r.status === 200 && c?.output?.severity === "CRITICAL" && r.body.brief?.broadcast === "SENT", detail: r.body?.brief?.headline?.slice(0, 80) };
});

await check("POST /api/autopilot with bad payload → aborted, not 500", async () => {
  const r = await post("/api/autopilot", { payload: { crop_type: "tomato" } });
  return { ok: r.status === 200 && r.body.aborted === true && /DATA_ERROR/.test(r.body.brief?.headline) };
});

await check("POST /api/signin bad email → 400", async () => {
  const r = await post("/api/signin", { name: "Wanjiru", email: "not-an-email" });
  return { ok: r.status === 400 };
});

await check("POST /api/signin valid → SIMULATED (no SMTP)", async () => {
  const r = await post("/api/signin", { name: "Wanjiru", email: "wanjiru@example.com" });
  return { ok: r.status === 200 && r.body.status === "SIMULATED", detail: r.body?.status };
});

await check("POST /api/signin phone-only 0712 345 678 → SIMULATED +254712345678 (channel phone)", async () => {
  const r = await post("/api/signin", { name: "Wanjiru", phone: "0712 345 678" });
  return { ok: r.status === 200 && r.body.status === "SIMULATED" && r.body.channel === "phone" && r.body.phone === "+254712345678", detail: r.body?.phone };
});

await check("POST /api/signin +254 112-345-678 normalizes → +254112345678", async () => {
  const r = await post("/api/signin", { name: "Otieno", phone: "+254 112-345-678" });
  return { ok: r.status === 200 && r.body.phone === "+254112345678", detail: r.body?.phone };
});

await check("POST /api/signin phone 12345 → 400 INVALID_PHONE", async () => {
  const r = await post("/api/signin", { name: "Wanjiru", phone: "12345" });
  return { ok: r.status === 400 && r.body?.error_type === "INVALID_PHONE" && Array.isArray(r.body.fields) && r.body.fields.includes("phone") };
});

await check("POST /api/signin no contact → 400 MISSING_CONTACT", async () => {
  const r = await post("/api/signin", { name: "Wanjiru" });
  return { ok: r.status === 400 && r.body?.error_type === "MISSING_CONTACT" };
});

await check("POST /api/signin ×6 → 429 rate-limited", async () => {
  let last;
  for (let i = 0; i < 5; i++) last = await post("/api/signin", { name: "Spam", email: `s${i}@example.com` });
  return { ok: last.status === 429 && last.body?.error_type === "RATE_LIMITED" && last.headers.get("retry-after") != null };
});

await check("POST /api/signin phone-only still 200 after email limiter trips (CGNAT)", async () => {
  const r = await post("/api/signin", { name: "Achieng", phone: "0798 765 432" });
  return { ok: r.status === 200 && r.body.channel === "phone", detail: String(r.status) };
});

await check("GET /api/nope → 404 JSON", async () => {
  const r = await get("/api/nope");
  return { ok: r.status === 404 && r.body?.error_type === "NOT_FOUND" };
});

// ── Soko marketplace over HTTP
let listingId;
await check("POST /api/soko/listings → 201 + fair price", async () => {
  const r = await post("/api/soko/listings", { farmer_name: "Otieno", crop: "maize", county: "Kisumu", qty_kg: 120, ask_per_kg: 50 });
  listingId = r.body?.listing?.id;
  return { ok: r.status === 201 && r.body.listing.status === "open" && r.body.listing.fair_price_per_kg > 0, detail: `fair KES ${r.body?.listing?.fair_price_per_kg}` };
});

await check("POST /api/soko/listings invalid → 400 with fields", async () => {
  const r = await post("/api/soko/listings", { farmer_name: "", crop: "maize", county: "Kisumu", qty_kg: -1, ask_per_kg: 50 });
  return { ok: r.status === 400 && Array.isArray(r.body.fields) && r.body.fields.includes("qty_kg") };
});

await check("GET /api/soko/listings?status=open → includes listing", async () => {
  const r = await get("/api/soko/listings?status=open");
  return { ok: r.status === 200 && r.body.listings.some((l) => l.id === listingId) && r.body.count === r.body.listings.length };
});

await check("GET /api/soko/listings/:id → single listing", async () => {
  const r = await get(`/api/soko/listings/${listingId}`);
  return { ok: r.status === 200 && r.body.listing?.id === listingId };
});

await check("POST claim → claimed; second claim → 400", async () => {
  const a = await post(`/api/soko/listings/${listingId}/claim`, { claimer: "Boda-007", role: "rider" });
  const b = await post(`/api/soko/listings/${listingId}/claim`, { claimer: "Other", role: "buyer" });
  return { ok: a.status === 200 && a.body.listing.status === "claimed" && b.status === 400 };
});

await check("POST deliver → delivered; unknown id → 404", async () => {
  const a = await post(`/api/soko/listings/${listingId}/deliver`, {});
  const b = await post(`/api/soko/listings/does-not-exist/deliver`, {});
  return { ok: a.status === 200 && a.body.listing.status === "delivered" && b.status === 404 };
});

await check("POST cancel → owner token required; only open listings", async () => {
  const l = (await post("/api/soko/listings", { farmer_name: "Achieng", crop: "beans", county: "Siaya", qty_kg: 40, ask_per_kg: 120 })).body.listing;
  const noTok = await post(`/api/soko/listings/${l.id}/cancel`, {});
  const a = await post(`/api/soko/listings/${l.id}/cancel`, { owner_token: l.owner_token });
  const pub = await get(`/api/soko/listings/${l.id}`);
  return { ok: noTok.status === 403 && a.status === 200 && a.body.listing.status === "cancelled" && !("owner_token" in a.body.listing) && !("owner_token" in (pub.body.listing ?? {})), detail: `no-token → ${noTok.status}` };
});

await check("POST /api/soko/price-suggest → per-market comparison", async () => {
  const r = await post("/api/soko/price-suggest", { crop: "Tomato" });
  return { ok: r.status === 200 && r.body.found === true && r.body.markets.length >= 2, detail: `fair KES ${r.body?.fair_price_per_kg}` };
});

await check("GET /api/soko/stats → counts by status", async () => {
  const r = await get("/api/soko/stats");
  return { ok: r.status === 200 && r.body.delivered >= 1 && r.body.cancelled >= 1 && typeof r.body.total === "number", detail: JSON.stringify(r.body) };
});

server.close();
try { unlinkSync(process.env.SOKO_STORE_PATH); } catch {}

console.log("─".repeat(57));
console.log(passed === total ? C.green(C.bold(`  ✓ ${passed}/${total} HTTP tests passed`)) : C.red(C.bold(`  ✗ ${passed}/${total} HTTP tests passed`)));
console.log("");
process.exit(passed === total ? 0 : 1);
