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

/** Fetch with a hard timeout — an unreachable LAN IP otherwise hangs the UI indefinitely. */
async function request<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`Sentinel server ${res.status}`);
    return res.json();
  } catch (e: any) {
    throw e?.name === "AbortError" ? new Error(`Sentinel server timed out after ${timeoutMs / 1000}s`) : e;
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

export const getMeta = () => request<Meta>("/api/meta");
export const callApex = <T = any>(payload: unknown) =>
  post<{ result: T; latency_ms: number; engine: string }>("/api/apex", { payload });
export const runAutopilot = () =>
  // LIVE mode chains several Gemini calls, so give Autopilot a longer window.
  post<{ engine: string; steps: AutopilotStep[]; brief?: any }>("/api/autopilot", {}, 60000);

export type SignInResult = { status: "SENT" | "SIMULATED"; email: string; message: string };
export const signIn = (name: string, email: string) =>
  post<SignInResult>("/api/signin", { name, email });

export const fmtKES = (n: number | null | undefined) =>
  n == null ? "— suppressed" : `KES ${Number(n).toLocaleString("en-KE")}`;
