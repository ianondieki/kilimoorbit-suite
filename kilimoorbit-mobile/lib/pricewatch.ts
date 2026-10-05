/**
 * Price alerts, pure logic: a farmer sets a target price per crop; an alert
 * "hits" when the best market on today's board reaches it. No storage and no
 * React Native here, so it is unit-tested directly (e2e/logic.spec.ts).
 */
import type { CommodityFeed } from "./api";

export type PriceAlert = { id: string; crop: string; target: number; created: string };
export type AlertHit = { alert: PriceAlert; market: string; price: number };

/** Best quote per crop on the board; alerts for crops not on the board never hit. */
export function alertHits(alerts: PriceAlert[], feed: CommodityFeed | undefined | null): AlertHit[] {
  const out: AlertHit[] = [];
  for (const a of alerts) {
    const c = feed?.commodities?.find((x) => x.crop === a.crop);
    if (!c?.quotes?.length) continue;
    const best = c.quotes.reduce((m, q) => (q.price > m.price ? q : m));
    if (best.price >= a.target) out.push({ alert: a, market: best.market, price: best.price });
  }
  return out;
}

/** A sensible starting target: about 5 % above today's best price, rounded. */
export const suggestTarget = (best: number) => Math.max(1, Math.round(best * 1.05));
