/**
 * Farm news for the farmer's county, with the last good copy cached on the
 * phone ("ko-news-cache") so the Today screen still has headlines on a rural
 * connection. Same shape as lib/weather.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNews, type News } from "./api";
import { cleanNews } from "./validate";

export const NEWS_CACHE_KEY = "ko-news-cache";

export type NewsState = {
  status: "loading" | "live" | "cached" | "none";
  data?: News;
  cachedAgeMin?: number;
};

export function useNews(county: string | null): NewsState & { reload: () => void } {
  const [state, setState] = useState<NewsState>({ status: "loading" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => (s.data && s.data.county === county ? s : { status: "loading" }));
    try {
      const data = await getNews(county);
      if (my !== seq.current) return;
      setState({ status: "live", data });
      AsyncStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ county, ts: Date.now(), data })).catch(() => {});
    } catch {
      let cached: NewsState = { status: "none" };
      try {
        const raw = await AsyncStorage.getItem(NEWS_CACHE_KEY);
        const c = raw ? JSON.parse(raw) : null;
        // Another county's cache is still news: shown, but the eyebrow names the county it is for.
        const clean = cleanNews(c?.data);
        const ts = typeof c?.ts === "number" && Number.isFinite(c.ts) ? c.ts : Date.now();
        if (clean) cached = { status: "cached", data: clean, cachedAgeMin: Math.max(1, Math.round((Date.now() - ts) / 60000)) };
      } catch {}
      if (my === seq.current) setState((prev) => (cached.status === "none" && prev.data ? prev : cached));
    }
  }, [county]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Opens a story in the browser (a new tab on the web). False when the phone refused. */
export async function openLink(url: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** "3 h ago" / "2 d ago" style age, in minutes, for the card's meta line. */
export function minutesSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : null;
}
