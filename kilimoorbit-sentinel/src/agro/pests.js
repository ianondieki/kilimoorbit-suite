/**
 * Pest watch: fall armyworm scouting results from farmers' phones, pooled by
 * county (the idea behind FAO's FAMEWS app), so a farmer can see whether
 * neighbours are finding it this fortnight.
 *
 * Privacy by design: a report carries only the county, the crop, how many
 * plants were checked and how many were hit, and the crop's age in days.
 * No name, phone or location finer than the county is accepted or kept, and
 * the app only sends a report when the farmer ticks "share".
 *
 * Reports live in memory (bounded), so a restart clears them; this is a demo
 * server. A county with no farmer reports gets a deterministic SAMPLE watch,
 * labelled like the sample weather and prices, so the screen never shows
 * invented numbers as real ones.
 *
 * Thresholds follow CIMMYT's FAW guide for African smallholders (Prasanna et
 * al. 2018): act when about 20 % of plants show fresh damage in the first
 * 2½ weeks, or 40 % from about 3 weeks to tasselling.
 */
import { addDays, eatDateKey, findCounty, hash } from "./weather.js";

export const WINDOW_DAYS = 14;
export const MAX_REPORTS = 5000;
export const PEST_CROPS = ["maize", "sorghum"];

/** The action threshold (% of plants with fresh damage) for a crop this many days old. */
export const thresholdFor = (ageDays) => (ageDays != null && ageDays <= 17 ? 20 : 40);

const int = (v) => (typeof v === "number" && Number.isInteger(v) ? v : null);

/**
 * Validates a report body. Returns { report } or { error, fields }.
 * Unknown keys are ignored (never stored).
 */
export function validateReport(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { error: "A JSON report is required.", fields: [] };
  const fields = [];
  const county = typeof body.county === "string" ? findCounty(body.county.trim().slice(0, 40)) : null;
  if (!county) fields.push("county");
  const crop = typeof body.crop === "string" ? body.crop.trim().toLowerCase() : "";
  if (!PEST_CROPS.includes(crop)) fields.push("crop");
  if (body.pest !== undefined && body.pest !== "faw") fields.push("pest");
  const plants = int(body.plants);
  if (plants == null || plants < 10 || plants > 200) fields.push("plants");
  const hit = int(body.hit);
  if (hit == null || hit < 0 || (plants != null && hit > plants)) fields.push("hit");
  const age = body.age_days === undefined || body.age_days === null ? null : int(body.age_days);
  if (age === null && body.age_days != null) fields.push("age_days");
  else if (age != null && (age < 0 || age > 200)) fields.push("age_days");
  if (fields.length) return { error: `Invalid report: ${fields.join(", ")}.`, fields };
  const pct = Math.round((hit / plants) * 100);
  return { report: { county: county.name, crop, pest: "faw", plants, hit, pct, age_days: age, over: pct >= thresholdFor(age) } };
}

function summarise(county, list, source) {
  const n = list.length;
  const over = list.filter((r) => r.over).length;
  const avg = n ? Math.round(list.reduce((s, r) => s + r.pct, 0) / n) : 0;
  return {
    county, pest: "faw", window_days: WINDOW_DAYS, source,
    reports: n,
    over_threshold: over,
    avg_pct: avg,
    max_pct: n ? Math.max(...list.map((r) => r.pct)) : 0,
    last_report: n ? list.reduce((m, r) => (r.day > m ? r.day : m), "") : null,
    // "high": a third or more of the farms found it above the action threshold.
    level: n === 0 ? "none" : over * 3 >= n ? "high" : "low",
  };
}

/**
 * A plausible fortnight for a county with no farmer reports: stable through
 * the day, different by county and week. Labelled SAMPLE by the caller.
 */
export function sampleWatch(county, now = new Date()) {
  const today = eatDateKey(now);
  const week = Math.floor(Date.parse(today + "T00:00:00Z") / (7 * 86400_000));
  const r = (k) => hash(`${county}|${week}|${k}`);
  const n = Math.floor(r("n") * 7); // 0–6 farms
  const list = Array.from({ length: n }, (_, i) => {
    const pct = Math.round(4 + r(`p${i}`) * 38);
    const age = 10 + Math.floor(r(`a${i}`) * 40);
    return { pct, over: pct >= thresholdFor(age), day: addDays(today, -Math.floor(r(`d${i}`) * WINDOW_DAYS)) };
  });
  return summarise(county, list, "SAMPLE");
}

export function createPestWatch({ max = MAX_REPORTS } = {}) {
  const reports = [];
  return {
    /** Stores a validated report; the oldest go first once the store is full. */
    add(report, now = new Date()) {
      reports.push({ ...report, day: eatDateKey(now), at: now.getTime() });
      if (reports.length > max) reports.splice(0, reports.length - max);
    },
    watch(countyName, now = new Date()) {
      const county = findCounty(countyName);
      if (!county) return null;
      const from = addDays(eatDateKey(now), -(WINDOW_DAYS - 1));
      const list = reports.filter((r) => r.county === county.name && r.day >= from);
      return list.length ? summarise(county.name, list, "FARMERS") : sampleWatch(county.name, now);
    },
    get size() { return reports.length; },
  };
}
