/**
 * Farm weather — a 7-day forecast per Kenyan county plus the three farming
 * windows smallholders actually act on:
 *
 *   spray  rain chance < 40 %, rain < 2 mm and wind ≤ 15 km/h — a spray that
 *          gets washed off or drifts is wasted money and a safety risk.
 *   plant  ≥ 20 mm of rain over the day and the two after it — the usual
 *          extension rule of thumb for "the rains have established".
 *   dry    rain chance < 30 % and rain < 1 mm — safe to harvest and sun-dry
 *          grain (wet grain is how aflatoxin starts).
 *
 * Providers:
 *   SAMPLE      (default) deterministic, plausible weather from the county's
 *               altitude, rainfall region and the Kenyan season. Same county +
 *               same date → same numbers, so a refresh never "changes the
 *               forecast". Always labelled sample data in the apps.
 *   OPEN_METEO  WEATHER_PROVIDER=open-meteo — real forecasts from
 *               api.open-meteo.com (free, no key). Any failure falls back to
 *               SAMPLE and says so (`fallback`).
 *
 * The county list is kept in step with kilimoorbit-mobile/lib/counties.ts.
 */

/** region: rainfall regime — arid, semi (semi-arid), humid, wet (western highlands / lake basin) */
export const COUNTIES = [
  ["Mombasa", -4.04, 39.67, 50, "humid", true],
  ["Kwale", -4.17, 39.45, 390, "humid", true],
  ["Kilifi", -3.63, 39.85, 20, "semi", true],
  ["Tana River", -1.5, 40.03, 50, "arid", true],
  ["Lamu", -2.27, 40.9, 10, "semi", true],
  ["Taita-Taveta", -3.4, 38.36, 1100, "semi", false],
  ["Garissa", -0.45, 39.65, 150, "arid", false],
  ["Wajir", 1.75, 40.06, 250, "arid", false],
  ["Mandera", 3.94, 41.86, 230, "arid", false],
  ["Marsabit", 2.33, 37.99, 1350, "arid", false],
  ["Isiolo", 0.35, 37.58, 1100, "arid", false],
  ["Meru", 0.05, 37.65, 1550, "humid", false],
  ["Tharaka-Nithi", -0.33, 37.65, 1400, "humid", false],
  ["Embu", -0.54, 37.46, 1350, "humid", false],
  ["Kitui", -1.37, 38.01, 1150, "semi", false],
  ["Machakos", -1.52, 37.26, 1600, "semi", false],
  ["Makueni", -1.78, 37.63, 1100, "semi", false],
  ["Nyandarua", -0.27, 36.38, 2350, "humid", false],
  ["Nyeri", -0.42, 36.95, 1750, "humid", false],
  ["Kirinyaga", -0.5, 37.28, 1550, "humid", false],
  ["Murang'a", -0.72, 37.15, 1300, "humid", false],
  ["Kiambu", -1.17, 36.83, 1700, "humid", false],
  ["Turkana", 3.12, 35.6, 500, "arid", false],
  ["West Pokot", 1.24, 35.11, 2100, "semi", false],
  ["Samburu", 1.1, 36.7, 1950, "arid", false],
  ["Trans Nzoia", 1.02, 35.0, 1900, "wet", false],
  ["Uasin Gishu", 0.51, 35.27, 2100, "wet", false],
  ["Elgeyo-Marakwet", 0.67, 35.51, 2350, "humid", false],
  ["Nandi", 0.2, 35.1, 2000, "wet", false],
  ["Baringo", 0.49, 35.74, 2000, "semi", false],
  ["Laikipia", 0.02, 37.07, 1950, "semi", false],
  ["Nakuru", -0.3, 36.07, 1850, "humid", false],
  ["Narok", -1.08, 35.87, 1850, "humid", false],
  ["Kajiado", -1.85, 36.79, 1700, "semi", false],
  ["Kericho", -0.37, 35.28, 2000, "wet", false],
  ["Bomet", -0.78, 35.34, 1950, "wet", false],
  ["Kakamega", 0.28, 34.75, 1550, "wet", false],
  ["Vihiga", 0.08, 34.72, 1500, "wet", false],
  ["Bungoma", 0.56, 34.56, 1400, "wet", false],
  ["Busia", 0.46, 34.11, 1200, "wet", false],
  ["Siaya", 0.06, 34.29, 1250, "humid", false],
  ["Kisumu", -0.09, 34.77, 1150, "humid", false],
  ["Homa Bay", -0.53, 34.46, 1150, "humid", false],
  ["Migori", -1.06, 34.47, 1400, "humid", false],
  ["Kisii", -0.68, 34.77, 1700, "wet", false],
  ["Nyamira", -0.56, 34.94, 1850, "wet", false],
  ["Nairobi", -1.29, 36.82, 1700, "humid", false],
].map(([name, lat, lon, alt, region, coastal]) => ({ name, lat, lon, alt, region, coastal }));

const slug = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
const BY_SLUG = new Map(COUNTIES.map((c) => [slug(c.name), c]));

/** Case-, space-, hyphen- and apostrophe-insensitive ("muranga" finds Murang'a). */
export const findCounty = (name) => BY_SLUG.get(slug(name)) ?? null;

/* ── seasons (same calendar as the mobile app's lib/season.ts) ── */
export function seasonOfMonth(m) {
  if (m <= 1) return "kiangazi"; // Jan–Feb hot, dry
  if (m <= 4) return "masika"; //   Mar–May long rains
  if (m <= 8) return "kipupwe"; //  Jun–Sep cool, dry
  return "vuli"; //                 Oct–Dec short rains
}
const RAINY = new Set(["masika", "vuli"]);

/* ── dates in East Africa Time (UTC+3, no DST) ── */
const EAT_MS = 3 * 3600_000;
export const eatDateKey = (d) => new Date(d.getTime() + EAT_MS).toISOString().slice(0, 10);
const addDays = (key, n) => new Date(Date.parse(key + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/* ── deterministic noise: hash(county|date|channel) → [0,1) ── */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  // final avalanche (murmur3 fmix32)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const noise = (county, key, ch) => hash(`${county.name}|${key}|${ch}`);

const BASE_CHANCE = { kiangazi: 0.15, masika: 0.6, kipupwe: 0.2, vuli: 0.5 };
const REGION_CHANCE = { arid: 0.35, semi: 0.65, humid: 1, wet: 1.2 };
const REGION_AMOUNT = { arid: 0.6, semi: 0.8, humid: 1, wet: 1.2 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

/** sunny · partly · cloudy · showers (<5 mm) · rain (5–15 mm) · heavy (≥15 mm) · storm (thunder, live data only) */
export function skyFor(rainMm, chancePct) {
  if (rainMm >= 15) return "heavy";
  if (rainMm >= 5) return "rain";
  if (rainMm > 0) return "showers";
  if (chancePct > 45) return "cloudy";
  if (chancePct > 25) return "partly";
  return "sunny";
}

/** One deterministic sample day for a county. */
function sampleDay(county, key) {
  const month = Number(key.slice(5, 7)) - 1;
  const season = seasonOfMonth(month);
  const altKm = county.alt / 1000;

  // The western highlands and lake basin stay wet through the "dry" Jun–Sep spell.
  const base = county.region === "wet" && season === "kipupwe" ? 0.45 : BASE_CHANCE[season];
  // Smooth over neighbouring days so wet and dry spells last a few days.
  const spell = (noise(county, addDays(key, -1), "c") + noise(county, key, "c") * 2 + noise(county, addDays(key, 1), "c")) / 4;
  const chance = clamp(base * REGION_CHANCE[county.region] * (0.45 + 1.1 * spell), 0.03, 0.95);
  const rains = noise(county, key, "r") < chance;
  const mean = 9 * REGION_AMOUNT[county.region] * (RAINY.has(season) ? 1.25 : 0.7);
  const rain_mm = rains ? round1(mean * (0.25 + 1.75 * noise(county, key, "a"))) : 0;
  // A forecast that shows rain must also show it as likely (and a dry one as
  // less likely than not), or "12 mm · 29 %" reads as a contradiction.
  const rain_chance = Math.round(rains ? 50 + chance * 45 : chance * 50);

  const seasonT = { kiangazi: 1.5, masika: -0.5, kipupwe: -2, vuli: 0 }[season];
  const tmax = Math.round(32 - 4 * altKm + seasonT - (rains ? 2 : 0) + (noise(county, key, "x") - 0.5) * 3);
  const tmin = Math.round(24 - 6 * altKm + (season === "kipupwe" ? -1.5 : 0) + (noise(county, key, "n") - 0.5) * 2);
  const wind_kmh = Math.round(6 + 14 * noise(county, key, "w") + (RAINY.has(season) ? 0 : 4) + (county.coastal ? 4 : 0));

  return { date: key, tmax, tmin: Math.min(tmin, tmax - 4), rain_mm, rain_chance, wind_kmh, sky: skyFor(rain_mm, rain_chance) };
}

export function sampleForecast(county, { now = new Date(), days = 7 } = {}) {
  const start = eatDateKey(now);
  return Array.from({ length: days }, (_, i) => sampleDay(county, addDays(start, i)));
}

/* ── farming windows ── */
export const SPRAY_MAX_CHANCE = 40;
export const SPRAY_MAX_RAIN_MM = 2;
export const SPRAY_MAX_WIND_KMH = 15;
export const PLANT_MIN_RAIN_MM = 20;
export const DRY_MAX_CHANCE = 30;
export const DRY_MAX_RAIN_MM = 1;

/** Adds { spray, plant, dry } verdicts ({ ok, reason }) to every day. */
export function withWindows(days) {
  return days.map((d, i) => {
    const wet = d.rain_chance >= SPRAY_MAX_CHANCE || d.rain_mm >= SPRAY_MAX_RAIN_MM;
    const windy = d.wind_kmh > SPRAY_MAX_WIND_KMH;
    const next3 = days.slice(i, i + 3).reduce((s, x) => s + x.rain_mm, 0);
    const dryOk = d.rain_chance < DRY_MAX_CHANCE && d.rain_mm < DRY_MAX_RAIN_MM;
    return {
      ...d,
      spray: { ok: !wet && !windy, reason: wet ? "rain" : windy ? "wind" : "ok" },
      plant: { ok: next3 >= PLANT_MIN_RAIN_MM, reason: next3 >= PLANT_MIN_RAIN_MM ? "rains" : "dry", rain_3d_mm: round1(next3) },
      dry: { ok: dryOk, reason: dryOk ? "ok" : "rain" },
    };
  });
}

/* ── Open-Meteo provider ── */
function skyFromWmo(code, rainMm, chance) {
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return rainMm >= 15 ? "heavy" : rainMm >= 5 ? "rain" : "showers";
  if (code === 3 || code === 45 || code === 48) return "cloudy";
  if (code === 1 || code === 2) return "partly";
  if (code === 0) return "sunny";
  return skyFor(rainMm, chance);
}

/** Maps an Open-Meteo `daily` block to our day shape. Exported for tests. */
export function mapOpenMeteo(json) {
  const d = json?.daily;
  if (!d || !Array.isArray(d.time) || !d.time.length) throw new Error("Open-Meteo: no daily data");
  return d.time.map((date, i) => {
    const rain_mm = round1(Number(d.precipitation_sum?.[i] ?? 0));
    const rain_chance = Math.round(Number(d.precipitation_probability_max?.[i] ?? (rain_mm > 0 ? 60 : 10)));
    return {
      date,
      tmax: Math.round(Number(d.temperature_2m_max?.[i])),
      tmin: Math.round(Number(d.temperature_2m_min?.[i])),
      rain_mm,
      rain_chance,
      wind_kmh: Math.round(Number(d.wind_speed_10m_max?.[i] ?? 0)),
      sky: skyFromWmo(Number(d.weather_code?.[i]), rain_mm, rain_chance),
    };
  });
}

const omCache = new Map(); // county name → { at, days }
const OM_TTL_MS = 30 * 60_000;

export async function openMeteoForecast(county, { fetchImpl = fetch, timeoutMs = 6000, now = Date.now() } = {}) {
  const hit = omCache.get(county.name);
  if (hit && now - hit.at < OM_TTL_MS) return hit.days;
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${county.lat}&longitude=${county.lon}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code" +
    "&timezone=Africa%2FNairobi&forecast_days=7";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const days = mapOpenMeteo(await res.json());
    omCache.set(county.name, { at: now, days });
    return days;
  } catch (err) {
    throw new Error(err?.name === "AbortError" ? "Open-Meteo timed out" : err?.message ?? String(err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The forecast the API serves. Never throws for a known county: a failing
 * live provider falls back to SAMPLE with `fallback` saying why.
 */
export async function forecastFor(county, {
  provider = process.env.WEATHER_PROVIDER, now = new Date(), fetchImpl,
} = {}) {
  const season = seasonOfMonth(new Date(now.getTime() + EAT_MS).getUTCMonth());
  const base = { county: county.name, altitude_m: county.alt, timezone: "Africa/Nairobi", season, generated_at: now.toISOString() };
  if (String(provider ?? "").toLowerCase() === "open-meteo") {
    try {
      const days = await openMeteoForecast(county, { fetchImpl, now: now.getTime() });
      return { ...base, source: "OPEN_METEO", days: withWindows(days) };
    } catch (err) {
      return { ...base, source: "SAMPLE", fallback: { from: "OPEN_METEO", reason: err.message }, days: withWindows(sampleForecast(county, { now })) };
    }
  }
  return { ...base, source: "SAMPLE", days: withWindows(sampleForecast(county, { now })) };
}

export const _clearCache = () => omCache.clear();
