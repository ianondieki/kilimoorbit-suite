/**
 * Farm weather verification suite (src/agro/weather.js).
 * Pure functions only: no server, no network (Open-Meteo is a stubbed fetch),
 * so it is fast and deterministic.
 */
import {
  COUNTIES, findCounty, sampleForecast, withWindows, forecastFor, mapOpenMeteo, seasonOfMonth, eatDateKey, _clearCache,
  SPRAY_MAX_WIND_KMH, PLANT_MIN_RAIN_MM,
} from "../agro/weather.js";
import { levelFor, priceOn, boardFor, historyFor } from "../agro/prices.js";
import { readFileSync } from "node:fs";

const FEED_PATH = new URL("../../payloads/commodity_feed.json", import.meta.url);
const freshFeed = () => JSON.parse(readFileSync(FEED_PATH, "utf8"));

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
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

const day = (o) => ({ date: "2026-10-05", tmax: 25, tmin: 13, rain_mm: 0, rain_chance: 10, wind_kmh: 8, sky: "sunny", ...o });
const meru = findCounty("Meru");
const OCT = new Date("2026-10-05T06:00:00Z");

console.log(C.bold("\n" + "═".repeat(57)));
console.log(C.bold("  FARM WEATHER + MARKET PRICES"));
console.log("═".repeat(57));

await check("47 counties, unique names, coordinates inside Kenya", () => {
  const names = new Set(COUNTIES.map((c) => c.name));
  const inKenya = COUNTIES.every((c) => c.lat > -5 && c.lat < 5.1 && c.lon > 33.9 && c.lon < 42 && c.alt >= 0 && c.alt < 3000);
  return { ok: COUNTIES.length === 47 && names.size === 47 && inKenya, detail: `${COUNTIES.length} counties` };
});

await check("findCounty ignores case, spaces, hyphens, apostrophes", () =>
  findCounty("muranga")?.name === "Murang'a" && findCounty("  UASIN gishu ")?.name === "Uasin Gishu" &&
  findCounty("taita taveta")?.name === "Taita-Taveta" && findCounty("Atlantis") === null);

await check("sample forecast: 7 days from today (EAT), deterministic", () => {
  const a = sampleForecast(meru, { now: OCT });
  const b = sampleForecast(meru, { now: OCT });
  return { ok: a.length === 7 && a[0].date === "2026-10-05" && a[6].date === "2026-10-11" && JSON.stringify(a) === JSON.stringify(b), detail: a.map((d) => d.sky).join(",") };
});

await check("EAT date key: 22:30 UTC is already tomorrow in Nairobi", () =>
  eatDateKey(new Date("2026-10-05T22:30:00Z")) === "2026-10-06");

await check("a given date keeps its weather when the window slides", () => {
  const a = sampleForecast(meru, { now: OCT });
  const b = sampleForecast(meru, { now: new Date("2026-10-06T06:00:00Z") });
  return JSON.stringify(a[1]) === JSON.stringify(b[0]);
});

await check("sample values stay plausible in every county and season", () => {
  const bad = [];
  for (const c of COUNTIES)
    for (const m of [0, 3, 6, 10]) {
      for (const d of sampleForecast(c, { now: new Date(Date.UTC(2026, m, 10, 6)) })) {
        if (!(d.tmax > d.tmin && d.tmax <= 40 && d.tmin >= 0 && d.rain_mm >= 0 && d.rain_mm < 80 && d.rain_chance >= 0 && d.rain_chance <= 100 && d.wind_kmh >= 0 && d.wind_kmh < 60))
          bad.push(`${c.name} ${d.date}`);
      }
    }
  return { ok: bad.length === 0, detail: bad.slice(0, 3).join("; ") };
});

await check("rainy seasons are wetter than dry ones (Nakuru, 4 weeks)", () => {
  const n = findCounty("Nakuru");
  const sum = (m) => [1, 8, 15, 22].reduce((s, dd) => s + sampleForecast(n, { now: new Date(Date.UTC(2026, m, dd, 6)) }).reduce((x, d) => x + d.rain_mm, 0), 0);
  const april = sum(3), feb = sum(1);
  return { ok: april > feb, detail: `Apr ${april.toFixed(0)} mm vs Feb ${feb.toFixed(0)} mm` };
});

await check("highlands are cooler than the coast", () => {
  const avg = (c) => sampleForecast(findCounty(c), { now: OCT }).reduce((s, d) => s + d.tmax, 0) / 7;
  return { ok: avg("Nyandarua") + 5 < avg("Mombasa"), detail: `Nyandarua ${avg("Nyandarua").toFixed(1)}° vs Mombasa ${avg("Mombasa").toFixed(1)}°` };
});

await check("spray window: calm dry day ok; rain or wind blocks it", () => {
  const [calm, rain, wind] = withWindows([day({}), day({ rain_chance: 70, rain_mm: 6 }), day({ wind_kmh: SPRAY_MAX_WIND_KMH + 1 })]);
  return calm.spray.ok && !rain.spray.ok && rain.spray.reason === "rain" && !wind.spray.ok && wind.spray.reason === "wind";
});

await check(`plant window: needs ≥ ${PLANT_MIN_RAIN_MM} mm over 3 days`, () => {
  const d = withWindows([day({ rain_mm: 5 }), day({ rain_mm: 8 }), day({ rain_mm: 9 }), day({ rain_mm: 0 })]);
  return { ok: d[0].plant.ok && d[0].plant.rain_3d_mm === 22 && !d[1].plant.ok && !d[3].plant.ok, detail: d.map((x) => x.plant.rain_3d_mm).join("/") };
});

await check("dry window: blocked by rain chance ≥ 30 %", () => {
  const [a, b] = withWindows([day({ rain_chance: 20 }), day({ rain_chance: 35 })]);
  return a.dry.ok && !b.dry.ok;
});

await check("Open-Meteo daily block maps to our day shape", () => {
  const days = mapOpenMeteo({
    daily: {
      time: ["2026-10-05", "2026-10-06"], temperature_2m_max: [24.6, 21.2], temperature_2m_min: [12.1, 13.4],
      precipitation_sum: [0, 12.34], precipitation_probability_max: [5, 80], wind_speed_10m_max: [9.4, 18.6], weather_code: [0, 63],
    },
  });
  return { ok: days.length === 2 && days[0].sky === "sunny" && days[0].tmax === 25 && days[1].sky === "rain" && days[1].rain_mm === 12.3 && days[1].wind_kmh === 19, detail: JSON.stringify(days[1]) };
});

await check("WEATHER_PROVIDER=open-meteo uses the live answer", async () => {
  _clearCache();
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ daily: { time: ["2026-10-05"], temperature_2m_max: [23], temperature_2m_min: [11], precipitation_sum: [1.2], precipitation_probability_max: [55], wind_speed_10m_max: [7], weather_code: [61] } }),
  });
  const r = await forecastFor(meru, { provider: "open-meteo", now: OCT, fetchImpl });
  return { ok: r.source === "OPEN_METEO" && r.days.length === 1 && r.days[0].sky === "showers" && r.days[0].spray.ok === false, detail: r.source };
});

await check("Open-Meteo failure → SAMPLE with a fallback reason (never throws)", async () => {
  _clearCache();
  const r = await forecastFor(meru, { provider: "open-meteo", now: OCT, fetchImpl: async () => ({ ok: false, status: 503 }) });
  return { ok: r.source === "SAMPLE" && r.fallback?.from === "OPEN_METEO" && /503/.test(r.fallback.reason) && r.days.length === 7, detail: r.fallback?.reason };
});

await check("forecast carries county, season and windows on every day", async () => {
  const r = await forecastFor(meru, { provider: "", now: OCT });
  return { ok: r.county === "Meru" && r.season === seasonOfMonth(9) && r.season === "vuli" && r.days.every((d) => d.spray && d.plant && d.dry), detail: `${r.source} · ${r.season}` };
});

console.log(C.bold("  — market prices —"));

await check("price levels stay within ±15 % of base for a whole year", () => {
  const feed = freshFeed();
  let lo = 9, hi = 0;
  for (const c of feed.commodities)
    for (const q of c.quotes)
      for (let i = 0; i < 365; i += 3) {
        const l = levelFor(c.crop, q.market, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
        lo = Math.min(lo, l); hi = Math.max(hi, l);
      }
  return { ok: lo > 0.84 && hi < 1.16, detail: `${lo.toFixed(3)}–${hi.toFixed(3)}` };
});

await check("history: 14 days ending today, deterministic, 7-day change matches", () => {
  const a = historyFor(freshFeed(), "maize", { now: OCT });
  const b = historyFor(freshFeed(), "MAIZE", { now: OCT });
  const m = a.markets[0];
  const want = Math.round(((m.prices[13] - m.prices[6]) / m.prices[6]) * 1000) / 10;
  return { ok: a.dates.length === 14 && a.dates[13] === "2026-10-05" && JSON.stringify(a) === JSON.stringify(b) && m.change_7d_pct === want && a.markets.length === 3, detail: `${m.market} ${m.prices.join(",")} (${m.change_7d_pct}%)` };
});

await check("history: unknown crop → null", () => historyFor(freshFeed(), "unobtainium") === null);

await check("board without jitter = today's history close; delta = change since yesterday", () => {
  const board = boardFor(freshFeed(), { now: OCT });
  const h = historyFor(freshFeed(), "tomato", { now: OCT });
  const q = board.commodities.find((c) => c.crop === "tomato").quotes[0];
  const m = h.markets.find((x) => x.market === q.market);
  return { ok: q.price === m.prices[13] && q.delta === m.prices[13] - m.prices[12], detail: `${q.market} ${q.price} (${q.delta >= 0 ? "+" : ""}${q.delta})` };
});

await check("live jitter stays within ±1 % of the day's price", () => {
  const ref = boardFor(freshFeed(), { now: OCT });
  const live = boardFor(freshFeed(), { now: OCT, jitter: 0.01, rand: () => 0.999 });
  const bad = [];
  ref.commodities.forEach((c, i) => c.quotes.forEach((q, j) => {
    const p = live.commodities[i].quotes[j].price;
    if (Math.abs(p - q.price) > Math.max(1, q.price * 0.011)) bad.push(`${c.crop}@${q.market}`);
  }));
  return { ok: bad.length === 0, detail: bad.join(", ") };
});

await check("priceOn never drops below 1 shilling", () => priceOn(1, "x", "y", "2026-10-05") >= 1);

console.log("─".repeat(57));
const ok = passed === total;
console.log((ok ? C.green : C.red)(C.bold(`  ${ok ? "✓" : "✗"} ${passed}/${total} farm weather + price tests passed`)));
process.exit(ok ? 0 : 1);
