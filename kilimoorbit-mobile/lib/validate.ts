/**
 * Trust nothing that crosses the wire or comes back out of storage: every
 * server answer (and every cached copy of one) passes through here before the
 * UI reads it. Anything malformed is dropped or defaulted, so a bad deploy, a
 * proxy error page or a half-written cache shows "no data", never a crash.
 * Each cleaner returns null when there's nothing usable.
 */
import type { ArbitrageResult, Booking, CommodityFeed, Forecast, Meta, News, NewsItem, PestWatch, PriceHistory, Show, Shows, Sky, SokoListing, SokoStatus, Verdict, WxDay, Nursery, NurseryPlan, Sacco, SaccoApplication, SaccoFocus, SaccoList, SaccoService } from "./api";

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

const PEST_LEVELS = ["none", "low", "high"] as const;
const pct = (v: unknown) => (num(v) && v >= 0 && v <= 100 ? Math.round(v) : 0);
const count = (v: unknown) => (num(v) && v >= 0 && v < 1e6 ? Math.round(v) : 0);

export function cleanPestWatch(w: unknown): PestWatch | null {
  if (!obj(w) || !str(w.county) || !w.county.trim()) return null;
  const reports = count(w.reports);
  return {
    county: w.county.slice(0, 40),
    pest: "faw",
    window_days: num(w.window_days) && w.window_days > 0 && w.window_days <= 60 ? Math.round(w.window_days) : 14,
    source: w.source === "FARMERS" ? "FARMERS" : "SAMPLE",
    reports,
    over_threshold: Math.min(reports, count(w.over_threshold)),
    avg_pct: pct(w.avg_pct),
    max_pct: pct(w.max_pct),
    last_report: str(w.last_report) && DAY.test(w.last_report) ? w.last_report : null,
    level: reports === 0 ? "none" : PEST_LEVELS.includes(w.level as any) ? (w.level as PestWatch["level"]) : "low",
  };
}

/* ── farm news ── */
const NEWS_SCOPES = ["county", "national", "tip"] as const;
const NEWS_SOURCES = ["LIVE", "CACHED", "SAMPLE"] as const;
const httpUrl = (v: unknown): v is string => str(v) && /^https?:\/\/\S+$/.test(v);

function cleanNewsItem(i: unknown): NewsItem | null {
  if (!obj(i) || !str(i.title) || !i.title.trim()) return null;
  const link = httpUrl(i.link) ? i.link.slice(0, 500) : null;
  const route = str(i.route) && i.route.startsWith("/") ? i.route.slice(0, 80) : undefined;
  if (!link && !route) return null;
  const published = str(i.published) && Number.isFinite(Date.parse(i.published)) ? i.published : null;
  return {
    id: str(i.id) && i.id ? i.id.slice(0, 40) : i.title.slice(0, 40),
    title: i.title.trim().slice(0, 160),
    ...(str(i.title_sw) && i.title_sw.trim() ? { title_sw: i.title_sw.trim().slice(0, 160) } : null),
    source: str(i.source) && i.source.trim() ? i.source.trim().slice(0, 60) : "",
    link, ...(route ? { route } : null), published,
    summary: str(i.summary) ? i.summary.trim().slice(0, 240) : "",
    image: httpUrl(i.image) ? i.image.slice(0, 500) : null,
    scope: NEWS_SCOPES.includes(i.scope as any) ? (i.scope as NewsItem["scope"]) : "national",
    county: str(i.county) && i.county.trim() ? i.county.slice(0, 40) : null,
  };
}

export function cleanNews(n: unknown): News | null {
  if (!obj(n)) return null;
  const items = arr(n.items).map(cleanNewsItem).filter((i): i is NewsItem => !!i).slice(0, 12);
  if (!items.length) return null;
  return {
    county: str(n.county) && n.county.trim() ? n.county.slice(0, 40) : null,
    fetched_at: str(n.fetched_at) && Number.isFinite(Date.parse(n.fetched_at)) ? n.fetched_at : new Date().toISOString(),
    source: NEWS_SOURCES.includes(n.source as any) ? (n.source as News["source"]) : "SAMPLE",
    items,
  };
}

/* ── farm shows ── */
const SHOW_KINDS = ["show", "expo", "contest"] as const;

function cleanShowBase(e: unknown): Omit<Show, "days_until" | "distance_km"> | null {
  if (!obj(e) || !str(e.id) || !str(e.name) || !str(e.town) || !str(e.county) || !str(e.start) || !str(e.end)) return null;
  if (!DAY.test(e.start) || !DAY.test(e.end) || e.end < e.start) return null;
  return {
    id: e.id.slice(0, 60), name: e.name.slice(0, 120), organiser: str(e.organiser) ? e.organiser.slice(0, 80) : "",
    town: e.town.slice(0, 40), county: e.county.slice(0, 40), venue: str(e.venue) && e.venue ? e.venue.slice(0, 80) : e.town.slice(0, 40),
    start: e.start, end: e.end,
    kind: SHOW_KINDS.includes(e.kind as any) ? (e.kind as Show["kind"]) : "show",
    url: httpUrl(e.url) ? e.url.slice(0, 300) : null,
    estimated: e.estimated === true,
  };
}

export function cleanShows(s: unknown): Shows | null {
  if (!obj(s) || !str(s.county)) return null;
  const events = arr(s.events)
    .map((e) => {
      const base = cleanShowBase(e);
      if (!base || !obj(e)) return null;
      return { ...base, days_until: num(e.days_until) ? Math.round(e.days_until) : 0, distance_km: num(e.distance_km) && e.distance_km >= 0 ? Math.round(e.distance_km) : 0 };
    })
    .filter((e): e is Show => !!e)
    .slice(0, 12);
  return {
    county: s.county.slice(0, 40),
    today: str(s.today) && DAY.test(s.today) ? s.today : new Date().toISOString().slice(0, 10),
    theme: str(s.theme) ? s.theme.slice(0, 200) : "",
    source: str(s.source) ? s.source.slice(0, 60) : "",
    events,
  };
}

const EMAIL_STATES = ["SENT", "SIMULATED", "NONE", "FAILED"] as const;
const NURSERY_KINDS = ["research", "forestry", "training", "seed", "supplier", "hatchery"];
/** A nursery plan from the server, or null when it is not one. */
export function cleanNurseryPlan(p: unknown): NurseryPlan | null {
  if (!obj(p) || !str(p.need) || !obj(p.from) || !str(p.from.county) || !num(p.from.lat) || !num(p.from.lon) || !obj(p.advice) || !str(p.advice.text) || !obj(p.per_acre)) return null;
  const nurseries = arr(p.nurseries)
    .filter((n) => obj(n) && str(n.id) && str(n.name) && str(n.town) && str(n.county) && num(n.lat) && num(n.lon) && num(n.distance_km) && obj(n.transport) && num(n.transport.round_trip_kes))
    .slice(0, 8)
    .map((n): Nursery => ({
      id: n.id.slice(0, 40), name: n.name.slice(0, 120), kind: NURSERY_KINDS.includes(n.kind) ? n.kind : "supplier", town: n.town.slice(0, 40), county: n.county.slice(0, 40),
      lat: n.lat, lon: n.lon, carries: arr(n.carries).filter((c) => typeof c === "string").map((c: string) => c.slice(0, 20)).slice(0, 12),
      url: httpUrl(n.url) ? n.url.slice(0, 300) : null, distance_km: Math.max(0, n.distance_km), carries_need: n.carries_need === true,
      transport: { mode: n.transport.mode === "boda" ? "boda" : "matatu", one_way_kes: num(n.transport.one_way_kes) ? n.transport.one_way_kes : 0, round_trip_kes: n.transport.round_trip_kes, minutes: num(n.transport.minutes) ? n.transport.minutes : 0 },
    }));
  const steps = arr(p.steps)
    .filter((x) => obj(x) && str(x.agent) && str(x.action))
    .map((x) => ({ agent: x.agent.slice(0, 20), action: x.action.slice(0, 200), latency_ms: num(x.latency_ms) ? x.latency_ms : 0 }));
  return {
    need: p.need.slice(0, 20),
    need_label: { en: obj(p.need_label) && str(p.need_label.en) ? p.need_label.en.slice(0, 60) : p.need, sw: obj(p.need_label) && str(p.need_label.sw) ? p.need_label.sw.slice(0, 60) : p.need },
    from: { county: p.from.county.slice(0, 40), lat: p.from.lat, lon: p.from.lon, gps: p.from.gps === true },
    acres: num(p.acres) && p.acres > 0 ? p.acres : 1,
    per_acre: { n: num(p.per_acre.n) ? p.per_acre.n : 0, unit: str(p.per_acre.unit) ? p.per_acre.unit.slice(0, 20) : "", spacing: str(p.per_acre.spacing) ? p.per_acre.spacing.slice(0, 30) : "" },
    quantity: obj(p.quantity) && num(p.quantity.n) && p.quantity.n >= 0 && num(p.quantity.amount) && (p.quantity.basis === "acres" || p.quantity.basis === "pond_m2")
      ? { n: p.quantity.n, unit: str(p.quantity.unit) ? p.quantity.unit.slice(0, 20) : "", basis: p.quantity.basis, amount: p.quantity.amount } : null,
    nurseries, advice: { text: p.advice.text.slice(0, 1200), source: p.advice.source === "LIVE" ? "LIVE" : "MOCK", lang: p.advice.lang === "sw" ? "sw" : "en" },
    steps, generated_at: str(p.generated_at) ? p.generated_at.slice(0, 40) : "",
  };
}

/* ── SACCOs ── */
const SACCO_KINDS = ["sacco", "dairy_coop", "union", "office"];
const SACCO_SERVICES: SaccoService[] = ["input_credit", "inputs_shop", "asset_finance", "feeds_vet", "produce_marketing", "savings_credit", "insurance", "register"];
const SACCO_FOCUS: SaccoFocus[] = ["dairy", "tea", "coffee", "horticulture", "grain", "general"];
function cleanSaccoBase(s: any) {
  if (!obj(s) || !str(s.id) || !str(s.name) || !str(s.town) || !str(s.county) || !num(s.lat) || !num(s.lon)) return null;
  return {
    id: s.id.slice(0, 60), name: s.name.slice(0, 120), kind: (SACCO_KINDS.includes(s.kind) ? s.kind : "sacco") as Sacco["kind"],
    town: s.town.slice(0, 40), county: s.county.slice(0, 40), lat: s.lat, lon: s.lon,
    focus: arr(s.focus).filter((f): f is SaccoFocus => SACCO_FOCUS.includes(f as SaccoFocus)).slice(0, 6),
    services: arr(s.services).filter((f): f is SaccoService => SACCO_SERVICES.includes(f as SaccoService)).slice(0, 8),
  };
}
export function cleanSaccoList(r: unknown): SaccoList | null {
  if (!obj(r) || !obj(r.from) || !str(r.from.county) || !num(r.from.lat) || !num(r.from.lon)) return null;
  const saccos = arr(r.saccos).map((s: any): Sacco | null => {
    const b = cleanSaccoBase(s);
    if (!b || !num(s.distance_km) || !obj(s.transport) || !num(s.transport.round_trip_kes)) return null;
    return { ...b, distance_km: Math.max(0, s.distance_km), matches_focus: s.matches_focus === true,
      transport: { mode: s.transport.mode === "boda" ? "boda" : "matatu", one_way_kes: num(s.transport.one_way_kes) ? s.transport.one_way_kes : 0, round_trip_kes: s.transport.round_trip_kes, minutes: num(s.transport.minutes) ? s.transport.minutes : 0 } };
  }).filter((s): s is Sacco => !!s).slice(0, 10);
  return { from: { county: r.from.county.slice(0, 40), lat: r.from.lat, lon: r.from.lon, gps: r.from.gps === true }, focus: SACCO_FOCUS.includes(r.focus as SaccoFocus) ? (r.focus as SaccoFocus) : null, saccos };
}
export function cleanSaccoApplication(a: unknown): SaccoApplication | null {
  if (!obj(a) || !str(a.application_id) || !str(a.token) || !str(a.reference)) return null;
  const sacco = cleanSaccoBase(a.sacco);
  if (!sacco) return null;
  return {
    application_id: a.application_id.slice(0, 64), token: a.token.slice(0, 64), reference: a.reference.slice(0, 16), status: "PENDING", sacco,
    checklist: arr(a.checklist).filter((c: any) => obj(c) && str(c.en) && str(c.sw)).map((c: any) => ({ en: c.en.slice(0, 200), sw: c.sw.slice(0, 200) })).slice(0, 10),
    email: EMAIL_STATES.includes(a.email as any) ? (a.email as SaccoApplication["email"]) : "NONE",
    steps: arr(a.steps).filter((x) => obj(x) && str(x.agent) && str(x.action)).map((x) => ({ agent: x.agent.slice(0, 20), action: x.action.slice(0, 200), latency_ms: num(x.latency_ms) ? x.latency_ms : 0 })),
  };
}

export function cleanBooking(b: unknown): Booking | null {
  if (!obj(b) || !str(b.booking_id) || !str(b.token) || !httpUrl(b.calendar_url) || !str(b.ics) || !str(b.remind_on) || !DAY.test(b.remind_on)) return null;
  const event = cleanShowBase(b.event);
  if (!event) return null;
  const steps = arr(b.steps)
    .filter((x) => obj(x) && str(x.agent) && str(x.action))
    .map((x) => ({ agent: x.agent.slice(0, 20), action: x.action.slice(0, 200), latency_ms: num(x.latency_ms) ? x.latency_ms : 0 }));
  return {
    booking_id: b.booking_id.slice(0, 64), token: b.token.slice(0, 64), status: "BOOKED", event,
    calendar_url: b.calendar_url.slice(0, 1500), ics: b.ics.slice(0, 4000),
    email: EMAIL_STATES.includes(b.email as any) ? (b.email as Booking["email"]) : "NONE",
    remind_on: b.remind_on, steps,
  };
}
