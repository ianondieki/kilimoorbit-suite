/**
 * Staple prices for the login Shamba panel. Reads /api/meta once; offline it
 * falls back to the dashboard's cached snapshot (ko-dash-cache). No invented
 * numbers: when there is neither network nor cache, nothing is shown.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMeta, type CommodityFeed, type CommodityQuote } from "./api";
import { tr, trMaybe, type Lang } from "./i18n";

export const SAFE_EMOJI: Record<string, string> = {
  maize: "🌽", onions: "🧅", carrots: "🥕", oranges: "🍊", tomato: "🍅",
  potatoes: "🥔", cabbage: "🥬", bananas: "🍌", avocado: "🥑",
};

const STAPLES = ["maize", "beans", "tomato", "potatoes"];

/**
 * The commodity feed is sample data (payloads/commodity_feed.json with a random
 * drift) whichever engine the server runs — LIVE only changes who answers APEX
 * questions. Keep this true until a real market feed (e.g. KAMIS) is wired in,
 * so farmers are never shown sample prices without the DEMO / MAJARIBIO label.
 */
export const SAMPLE_PRICE_FEED = true;

/** Whether a price board must carry the DEMO / MAJARIBIO label. */
export const isDemoBoard = (board: { engine?: "LIVE" | "MOCK" }) =>
  SAMPLE_PRICE_FEED || board.engine === "MOCK";

export type StapleRow = { key: string; best: CommodityQuote };

export type PriceBoard = {
  status: "loading" | "live" | "cached" | "none";
  rows: StapleRow[];
  engine?: "LIVE" | "MOCK";
  ageMin?: number;
  cachedAgeMin?: number;
  /** true when the network (or the server) could not be reached */
  offline: boolean;
};

/** Best quote = the highest price (the same rule as the dashboard). */
export function pickStaples(feed: CommodityFeed | undefined, n = 4): StapleRow[] {
  const list = feed?.commodities ?? [];
  const byKey = new Map(list.map((c) => [c.crop, c]));
  const keys = STAPLES.filter((k) => byKey.has(k));
  for (const c of list) if (keys.length < n && !keys.includes(c.crop)) keys.push(c.crop);
  return keys.slice(0, n).flatMap((k) => {
    const quotes = byKey.get(k)?.quotes ?? [];
    if (!quotes.length) return [];
    const best = [...quotes].sort((a, b) => b.price - a.price)[0];
    return [{ key: k, best }];
  });
}

export const cropName = (lang: Lang, key: string) =>
  trMaybe(lang, `crop.${key}`) ?? key.charAt(0).toUpperCase() + key.slice(1);

/** Two uppercase letters from the Kiswahili name, for crops without a safe emoji. */
export const cropLetters = (key: string) =>
  (trMaybe("sw", `crop.${key}`) ?? key).slice(0, 2).toUpperCase();

export function ageText(lang: Lang, minutes: number) {
  return minutes >= 60
    ? tr(lang, "age.hr", { n: Math.round(minutes / 60) })
    : tr(lang, "age.min", { n: Math.max(1, minutes) });
}

export function freshnessText(lang: Lang, board: PriceBoard) {
  if (board.status === "live" && board.ageMin != null) return tr(lang, "prices.fresh", { n: board.ageMin });
  if (board.status === "cached" && board.cachedAgeMin != null)
    return tr(lang, "prices.cached", { age: ageText(lang, board.cachedAgeMin) });
  return "";
}

export function rowA11y(lang: Lang, row: StapleRow) {
  const d = row.best.delta;
  return tr(lang, "prices.rowA11y", {
    crop: cropName(lang, row.key),
    market: row.best.market,
    p: row.best.price,
    dir: tr(lang, d > 0 ? "prices.up" : d < 0 ? "prices.down" : "prices.flat"),
    d: d === 0 ? "" : Math.abs(d),
  }).trim();
}

export function usePriceBoard(): PriceBoard {
  const [board, setBoard] = useState<PriceBoard>({ status: "loading", rows: [], offline: false });
  useEffect(() => {
    let alive = true;
    const fromCache = async (offline = true) => {
      try {
        const raw = await AsyncStorage.getItem("ko-dash-cache");
        const c = raw ? JSON.parse(raw) : null;
        const feed = c?.meta?.commodity_feed as CommodityFeed | undefined;
        if (alive && feed?.commodities?.length) {
          setBoard({
            status: "cached", rows: pickStaples(feed), engine: c.meta.engine, offline,
            cachedAgeMin: typeof c.ts === "number" ? Math.round((Date.now() - c.ts) / 60000) : undefined,
          });
          return;
        }
      } catch {}
      if (alive) setBoard({ status: "none", rows: [], offline });
    };
    const browserOffline =
      Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).onLine === false;
    if (browserOffline) {
      fromCache();
    } else {
      getMeta(6000)
        .then((m) => {
          if (!alive) return;
          const feed = m.commodity_feed;
          if (!feed?.commodities?.length) return fromCache(false);
          setBoard({ status: "live", rows: pickStaples(feed), engine: m.engine, ageMin: feed.data_age_minutes, offline: false });
        })
        .catch(() => { fromCache(); });
    }
    return () => { alive = false; };
  }, []);
  return board;
}
