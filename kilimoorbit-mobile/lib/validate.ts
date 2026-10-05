/**
 * Trust nothing that crosses the wire or comes back out of storage: every
 * server answer (and every cached copy of one) passes through here before the
 * UI reads it. Anything malformed is dropped or defaulted, so a bad deploy, a
 * proxy error page or a half-written cache shows "no data", never a crash.
 * Each cleaner returns null when there's nothing usable.
 */
import type {
  ArbitrageResult, CommodityFeed, Forecast, Meta, PriceHistory, Sky, SokoListing, SokoStatus, Verdict, WxDay,
} from "./api";

const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string";
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function cleanFeed(f: unknown): CommodityFeed | undefined {
  if (!obj(f)) return undefined;
  const commodities = arr(f.commodities)
    .filter((c) => obj(c) && str(c.crop) && c.crop.length <= 40)
    .map((c) => ({
      crop: c.crop.toLowerCase(),
      emoji: str(c.emoji) ? c.emoji : "",
      quotes: arr(c.quotes)
        .filter((q) => obj(q) && str(q.market) && num(q.price) && q.price > 0)
        .map((q) => ({ market: q.market.slice(0, 60), price: Math.round(q.price), delta: num(q.delta) ? Math.round(q.delta) : 0 })),
    }))
    .filter((c) => c.quotes.length > 0);
  if (!commodities.length) return undefined;
  return { feed_name: str(f.feed_name) ? f.feed_name : "", data_age_minutes: num(f.data_age_minutes) ? Math.max(0, f.data_age_minutes) : 0, commodities };
}

export function cleanMeta(m: unknown): Meta | null {
  if (!obj(m)) return null;
  return {
    engine: m.engine === "LIVE" ? "LIVE" : "MOCK",
    model: str(m.model) ? m.model : "",
    payloads: obj(m.payloads) ? m.payloads : {},
    commodity_feed: cleanFeed(m.commodity_feed),
  };
}

const FLAGS = ["CLEAR", "WEATHER_DELAY", "BATTERY_RISK", "ROAD_IMPASSABLE"] as const;
const LEVELS = ["Low", "Medium", "High", "Critical"] as const;
const n = (v: unknown) => (num(v) ? v : null);

/** The parts of a Route A answer the screens read; null if the route itself is missing. */
export function cleanArb(r: unknown): ArbitrageResult | null {
  if (!obj(r) || r.execution_mode !== "arbitrage_compile" || !obj(r.cargo_optimized_route)) return null;
  const c = r.cargo_optimized_route;
  if (!str(c.optimal_market_destination) || !str(c.crop_type)) return null;
  const s = obj(r.climate_risk_sentinel) ? r.climate_risk_sentinel : null;
  const w = obj(r.widget_insights) ? r.widget_insights : {};
  return {
    execution_mode: "arbitrage_compile",
    data_confidence: r.data_confidence === "HIGH" || r.data_confidence === "LOW" ? r.data_confidence : "MEDIUM",
    price_status: r.price_status === "STALE_DATA" ? "STALE_DATA" : "LIVE",
    cargo_optimized_route: {
      crop_type: c.crop_type.toLowerCase(),
      optimal_market_destination: c.optimal_market_destination,
      distance_km: n(c.distance_km),
      live_market_wholesale_price_per_kg: n(c.live_market_wholesale_price_per_kg),
      estimated_yield_kg: n(c.estimated_yield_kg),
      gross_revenue_kes: n(c.gross_revenue_kes),
      transit_cost_kes: n(c.transit_cost_kes),
      net_profit_projection_kes: n(c.net_profit_projection_kes),
      logistics_risk_flag: (FLAGS as readonly string[]).includes(c.logistics_risk_flag) ? c.logistics_risk_flag : "CLEAR",
    },
    // Climate fields are optional as a block: without the essentials, the card is simply not shown.
    climate_risk_sentinel: (s && str(s.climate_caution_alert) && (LEVELS as readonly string[]).includes(s.pre_farming_risk_level)
      ? {
          current_kenyan_season: str(s.current_kenyan_season) ? s.current_kenyan_season : "",
          farm_altitude_zone: str(s.farm_altitude_zone) ? s.farm_altitude_zone : "",
          pre_farming_risk_level: s.pre_farming_risk_level,
          frost_risk: s.frost_risk === true, drought_risk: s.drought_risk === true, flood_risk: s.flood_risk === true,
          recommended_seed_variety_adjustment: str(s.recommended_seed_variety_adjustment) ? s.recommended_seed_variety_adjustment : null,
          climate_caution_alert: s.climate_caution_alert,
        }
      : undefined),
    widget_insights: {
      market_price_summary: str(w.market_price_summary) ? w.market_price_summary : "",
      routing_profit_summary: str(w.routing_profit_summary) ? w.routing_profit_summary : "",
      data_quality_notice: str(w.data_quality_notice) ? w.data_quality_notice : null,
    },
  };
}

const SKIES: Sky[] = ["sunny", "partly", "cloudy", "showers", "rain", "heavy", "storm"];
const verdict = (v: unknown, fallback: string): Verdict =>
  obj(v) && typeof v.ok === "boolean"
    ? { ok: v.ok, reason: str(v.reason) ? v.reason : fallback, ...(num(v.rain_3d_mm) ? { rain_3d_mm: v.rain_3d_mm } : null) }
    : { ok: false, reason: fallback };

export function cleanForecast(f: unknown): Forecast | null {
  if (!obj(f) || !str(f.county)) return null;
  const days: WxDay[] = arr(f.days)
    .filter((d) => obj(d) && str(d.date) && DAY.test(d.date) && num(d.tmax) && num(d.tmin))
    .map((d) => ({
      date: d.date,
      tmax: Math.round(d.tmax), tmin: Math.round(d.tmin),
      rain_mm: num(d.rain_mm) ? Math.max(0, d.rain_mm) : 0,
      rain_chance: num(d.rain_chance) ? Math.min(100, Math.max(0, Math.round(d.rain_chance))) : 0,
      wind_kmh: num(d.wind_kmh) ? Math.max(0, Math.round(d.wind_kmh)) : 0,
      sky: SKIES.includes(d.sky) ? d.sky : "cloudy",
      spray: verdict(d.spray, "rain"), plant: verdict(d.plant, "dry"), dry: verdict(d.dry, "rain"),
    }));
  if (!days.length) return null;
  return {
    county: f.county, altitude_m: num(f.altitude_m) ? f.altitude_m : 0, season: str(f.season) ? f.season : "",
    generated_at: str(f.generated_at) ? f.generated_at : "", source: f.source === "OPEN_METEO" ? "OPEN_METEO" : "SAMPLE",
    ...(obj(f.fallback) && str(f.fallback.reason) ? { fallback: { from: String(f.fallback.from ?? ""), reason: f.fallback.reason } } : null),
    days,
  };
}

export function cleanHistory(h: unknown): PriceHistory | null {
  if (!obj(h) || !str(h.crop)) return null;
  const dates = arr(h.dates).filter((d) => str(d) && DAY.test(d));
  if (dates.length < 2) return null;
  const markets = arr(h.markets)
    .filter((m) => obj(m) && str(m.market) && Array.isArray(m.prices) && m.prices.length === dates.length && m.prices.every((p: unknown) => num(p) && p > 0))
    .map((m) => ({ market: m.market, prices: m.prices as number[], change_7d_pct: num(m.change_7d_pct) ? m.change_7d_pct : 0 }));
  return markets.length ? { crop: h.crop, dates, markets, source: "SAMPLE" } : null;
}

const STATUSES: SokoStatus[] = ["open", "claimed", "delivered", "cancelled"];

export function cleanListing(l: unknown): SokoListing | null {
  if (!obj(l) || !str(l.id) || !l.id) return null;
  return {
    id: l.id,
    farmer_name: str(l.farmer_name) ? l.farmer_name : "",
    crop: str(l.crop) ? l.crop.toLowerCase() : "",
    county: str(l.county) ? l.county : "",
    qty_kg: num(l.qty_kg) && l.qty_kg > 0 ? l.qty_kg : 0,
    ask_per_kg: num(l.ask_per_kg) && l.ask_per_kg > 0 ? l.ask_per_kg : 0,
    fair_price_per_kg: n(l.fair_price_per_kg),
    best_market: str(l.best_market) ? l.best_market : null,
    status: STATUSES.includes(l.status) ? l.status : "open",
    created_at: str(l.created_at) && !Number.isNaN(Date.parse(l.created_at)) ? l.created_at : new Date().toISOString(),
    ...(str(l.owner_token) ? { owner_token: l.owner_token } : null),
  };
}
