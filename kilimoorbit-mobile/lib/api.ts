import { API_BASE } from "./config";

/* ── Apex v2.0 result types (the fields the app renders) ── */
export type ArbitrageResult = {
  execution_mode: "arbitrage_compile";
  data_confidence: "HIGH" | "MEDIUM" | "LOW";
  price_status: "LIVE" | "STALE_DATA";
  cargo_optimized_route: {
    crop_type: string; optimal_market_destination: string;
    distance_km: number | null; live_market_wholesale_price_per_kg: number | null;
    estimated_yield_kg: number | null; gross_revenue_kes: number | null;
    transit_cost_kes: number | null; net_profit_projection_kes: number | null;
    logistics_risk_flag: "CLEAR" | "WEATHER_DELAY" | "BATTERY_RISK" | "ROAD_IMPASSABLE";
  };
  climate_risk_sentinel: {
    current_kenyan_season: string; farm_altitude_zone: string;
    pre_farming_risk_level: "Low" | "Medium" | "High" | "Critical";
    frost_risk: boolean; drought_risk: boolean; flood_risk: boolean;
    recommended_seed_variety_adjustment: string | null;
    climate_caution_alert: string;
  };
  widget_insights: {
    market_price_summary: string; routing_profit_summary: string;
    data_quality_notice: string | null;
  };
};
export type ChatResult = {
  execution_mode: "user_chat"; current_screen: string;
  intent_detected: string; chat_response: string;
};
export type ApexError = {
  execution_mode: "error"; error_type: string; error_message?: string;
  failed_fields?: string[]; out_of_bounds_fields?: string[]; recovery_suggestion?: string;
};
export type AutopilotStep = { agent: string; action: string; output: any; latency_ms: number };
export type CommodityQuote = { market: string; price: number; delta: number };
export type Commodity = { crop: string; emoji: string; quotes: CommodityQuote[] };
export type CommodityFeed = { feed_name: string; data_age_minutes: number; commodities: Commodity[] };
export type Meta = {
  engine: "LIVE" | "MOCK"; model: string;
  payloads: Record<string, any>;
  commodity_feed?: CommodityFeed;
};

/** A non-OK HTTP answer from the server. Network failures and timeouts stay plain Errors. */
export class ApiError extends Error {
  status: number;
  errorType?: string;
  fields?: string[];
  /** The server's own `error` text, when it sent one (e.g. a rate-limit hint). */
  serverMessage?: string;
  constructor(message: string, status: number, errorType?: string, fields?: string[], serverMessage?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorType = errorType;
    this.fields = fields;
    this.serverMessage = serverMessage;
  }
}

/**
 * The request was sent but no answer came back in time. Unlike a request that
 * never left the phone, the server may still have acted on it (e.g. sent the
 * welcome email), so callers must not claim that nothing happened.
 * The message is unchanged from the plain Error thrown before.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Fetch with a hard timeout — an unreachable LAN IP otherwise hangs the UI indefinitely. */
async function request<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) {
      // The message stays exactly as before (existing callers print it); the
      // server's JSON details ride along on the ApiError.
      const b = (await res.json().catch(() => null)) as any;
      throw new ApiError(
        `Sentinel server ${res.status}`,
        res.status,
        typeof b?.error_type === "string" ? b.error_type : undefined,
        Array.isArray(b?.fields) ? b.fields : undefined,
        typeof b?.error === "string" ? b.error : undefined
      );
    }
    return res.json();
  } catch (e: any) {
    throw e?.name === "AbortError" ? new TimeoutError(`Sentinel server timed out after ${timeoutMs / 1000}s`) : e;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T,>(path: string, body: unknown, timeoutMs?: number) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);

export const getMeta = (timeoutMs = 15000) => request<Meta>("/api/meta", undefined, timeoutMs);
// A LIVE Gemini apex call (esp. the structured arbitrage compile) can take
// 20s+, and the server's own cap is 30s — so the client must wait longer than
// that. MOCK returns instantly, so this only matters live.
export const callApex = <T = any>(payload: unknown, timeoutMs = 45000) =>
  post<{ result: T; latency_ms: number; engine: string }>("/api/apex", { payload }, timeoutMs);
export const runAutopilot = () =>
  // LIVE mode chains several Gemini calls, so give Autopilot a longer window.
  post<{ engine: string; steps: AutopilotStep[]; brief?: any }>("/api/autopilot", {}, 60000);

export type SignInResult = {
  status: "SENT" | "SIMULATED";
  channel: "email" | "phone";
  email?: string;
  phone?: string;
  message: string;
};
/**
 * Phone-first device sign-in. The server stores nothing; see server.js POST /api/signin.
 * 8s for phone-only (the server answers at once). With an email the server
 * waits on the SMTP handshake, which on rural data can pass 8s, so that path
 * gets 20s: fewer "may not arrive" answers for an email that was in fact sent.
 */
export const signIn = (input: { name: string; phone?: string; email?: string }) =>
  post<SignInResult>("/api/signin", input, input.email ? 20000 : 8000);

export const fmtKES = (n: number | null | undefined) =>
  n == null ? "— suppressed" : `KES ${Number(n).toLocaleString("en-KE")}`;

/* ── Farm weather (GET /api/weather) ── */
export type Sky = "sunny" | "partly" | "cloudy" | "showers" | "rain" | "heavy" | "storm";
export type Verdict = { ok: boolean; reason: string; rain_3d_mm?: number };
export type WxDay = {
  date: string; tmax: number; tmin: number; rain_mm: number; rain_chance: number; wind_kmh: number; sky: Sky;
  spray: Verdict; plant: Verdict; dry: Verdict;
};
export type Forecast = {
  county: string; altitude_m: number; season: string; generated_at: string;
  source: "SAMPLE" | "OPEN_METEO"; fallback?: { from: string; reason: string };
  days: WxDay[];
};
export const getWeather = (county: string) =>
  request<Forecast>(`/api/weather?county=${encodeURIComponent(county)}`, undefined, 10000);
