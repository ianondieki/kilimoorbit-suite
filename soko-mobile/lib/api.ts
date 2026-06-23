import { API_BASE } from "./config";

/* ── Soko marketplace types (mirror the /api/soko/* server contracts) ── */
export type ListingStatus = "open" | "claimed" | "delivered";

export type Listing = {
  id: string;
  farmer_name: string;
  crop: string;
  county: string;
  qty_kg: number;
  ask_per_kg: number;
  fair_price_per_kg: number | null;
  best_market: string | null;
  status: ListingStatus;
  created_at: string;
};

export type Claim = {
  id: string;
  listing_id: string;
  claimer: string;
  role: "buyer" | "rider";
  claimed_at: string;
};

export type MarketQuote = { market: string; price: number; delta: number };
export type PriceSuggest = {
  crop: string;
  emoji?: string;
  found: boolean;
  fair_price_per_kg: number | null;
  best_market?: string;
  best_price_per_kg?: number;
  markets: MarketQuote[];
};

/** Fetch with a hard timeout, surfacing the server's {error} message on failures. */
async function request<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as any)?.error ?? `Sentinel server ${res.status}`);
    return body as T;
  } catch (e: any) {
    throw e?.name === "AbortError"
      ? new Error(`Sentinel server timed out after ${timeoutMs / 1000}s`)
      : e;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T,>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const getListings = (status?: ListingStatus) =>
  request<{ listings: Listing[]; count: number }>(
    `/api/soko/listings${status ? `?status=${status}` : ""}`
  );

export type NewListing = {
  farmer_name: string; crop: string; county: string; qty_kg: number; ask_per_kg: number;
};
export const createListing = (body: NewListing) =>
  post<{ listing: Listing }>("/api/soko/listings", body);

export const claimListing = (id: string, claimer: string, role: "buyer" | "rider") =>
  post<{ listing: Listing; claim: Claim }>(`/api/soko/listings/${id}/claim`, { claimer, role });

export const suggestPrice = (crop: string) =>
  post<PriceSuggest>("/api/soko/price-suggest", { crop });

export const fmtKES = (n: number | null | undefined) =>
  n == null ? "—" : `KES ${Number(n).toLocaleString("en-KE")}`;

/** How a farmer's ask compares to the live fair price, for the badge. */
export function priceDelta(ask: number, fair: number | null | undefined) {
  if (fair == null || fair <= 0) return { pct: 0, label: "no market data", tone: "dim" as const };
  const pct = Math.round(((ask - fair) / fair) * 100);
  if (pct <= -3) return { pct, label: `${Math.abs(pct)}% below market`, tone: "ok" as const };
  if (pct >= 3) return { pct, label: `${pct}% above market`, tone: "alert" as const };
  return { pct, label: "at market price", tone: "accent" as const };
}
