/**
 * Sample market prices that behave like a market: each crop × market has a
 * daily price level (a slow multi-week swing plus a few days of wobble) that
 * depends only on the date, so
 *   - the live board, the 14-day history and Soko's fair price all agree,
 *   - a board's ▲/▼ is the real change since yesterday, not random noise,
 *   - a refresh never rewrites the past.
 * Levels stay within about ±15 % of the payloads/commodity_feed.json base.
 * Like the weather, this is SAMPLE data until a real feed (e.g. KAMIS) is
 * wired in, and the apps label it DEMO / MAJARIBIO.
 */
import { addDays, eatDateKey, hash } from "./weather.js";

const TAU = Math.PI * 2;
const dayNumber = (key) => Math.floor(Date.parse(key + "T00:00:00Z") / 86400_000);

/** Price multiplier for a crop at a market on a date (≈ 0.85 – 1.15). */
export function levelFor(crop, market, key) {
  const id = `${crop}|${market}`;
  const period = 18 + Math.floor(hash(id) * 24); // a 18–41 day swing
  const phase = hash(`${id}|phase`) * TAU;
  const d = dayNumber(key);
  const swing = 0.09 * Math.sin((TAU * d) / period + phase);
  const n = (k) => hash(`${id}|${k}`) - 0.5;
  const wobble = 0.05 * ((n(d - 1) + 2 * n(d) + n(d + 1)) / 2);
  return 1 + swing + wobble;
}

export const priceOn = (base, crop, market, key) => Math.max(1, Math.round(base * levelFor(crop, market, key)));

/**
 * The board for a day: each quote re-priced from its base, `delta` = change
 * since the day before. `jitter` (0..1) adds intraday movement to the live board.
 */
export function boardFor(feed, { now = new Date(), jitter = 0, rand = Math.random } = {}) {
  const today = eatDateKey(now);
  const yesterday = addDays(today, -1);
  for (const c of feed.commodities ?? [])
    for (const q of c.quotes ?? []) {
      const base = q.price;
      const t = priceOn(base, c.crop, q.market, today);
      const live = jitter ? Math.max(1, Math.round(t * (1 + (rand() * 2 - 1) * jitter))) : t;
      q.delta = live - priceOn(base, c.crop, q.market, yesterday);
      q.price = live;
    }
  return feed;
}

/**
 * 14 daily closes per market for one crop, oldest first, ending today, plus
 * the change over the last 7 days. `null` for a crop that isn't on the board.
 */
export function historyFor(feed, crop, { now = new Date(), days = 14 } = {}) {
  const c = (feed.commodities ?? []).find((x) => x.crop === String(crop ?? "").toLowerCase());
  if (!c) return null;
  const today = eatDateKey(now);
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  return {
    crop: c.crop,
    dates,
    markets: c.quotes.map((q) => {
      const prices = dates.map((k) => priceOn(q.price, c.crop, q.market, k));
      const last = prices[prices.length - 1];
      const weekAgo = prices[Math.max(0, prices.length - 8)];
      return { market: q.market, prices, change_7d_pct: Math.round(((last - weekAgo) / weekAgo) * 1000) / 10 };
    }),
  };
}
