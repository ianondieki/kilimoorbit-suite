/**
 * KilimoOrbit Sentinel — payload fixtures + live telemetry simulator
 * -------------------------------------------------------------------
 * Shared by the Mission Control server (src/server.js) and the USSD
 * service (src/ussd.js) so every surface sees the same live data.
 *
 * Fixture files are static for the lifetime of the process — read each once,
 * hand out deep clones so callers (the suite mutates payloads) can't corrupt
 * the cache. The simulator applies a bounded random walk (state persists
 * across requests) so each refresh sees fresh, plausible telemetry and
 * prices; the verification suite bypasses it and uses the raw fixtures.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const payloadCache = new Map();
export const loadPayload = (f) => {
  if (!payloadCache.has(f))
    payloadCache.set(f, JSON.parse(readFileSync(join(root, "payloads", f), "utf8")));
  return structuredClone(payloadCache.get(f));
};
export const payloadFiles = readdirSync(join(root, "payloads")).filter((f) =>
  f.endsWith("_payload.json")
);

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

export function liveArbitragePayload() {
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

export function liveCommodityFeed() {
  const feed = loadPayload("commodity_feed.json");
  feed.data_age_minutes = 3 + Math.floor(Math.random() * 40);
  for (const c of feed.commodities)
    for (const q of c.quotes) {
      const np = Math.max(1, Math.round(q.price + (Math.random() * 2 - 1) * q.price * 0.03));
      q.delta = np - q.price;
      q.price = np;
    }
  return feed;
}
