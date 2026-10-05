/**
 * The farm forecast for a county, with the last good answer cached on the
 * phone ("ko-weather-cache") so the Today screen still shows something on a
 * rural connection. Past days are dropped from a cached forecast.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWeather, type Forecast } from "./api";
import { todayKey } from "./dates";
import { cleanForecast } from "./validate";

export const WEATHER_CACHE_KEY = "ko-weather-cache";

export type WeatherState = {
  status: "loading" | "live" | "cached" | "none";
  data?: Forecast;
  /** Minutes since the cached copy was fetched. */
  cachedAgeMin?: number;
};

function fromToday(f: Forecast): Forecast | null {
  const today = todayKey();
  const days = f.days.filter((d) => d.date >= today);
  return days.length ? { ...f, days } : null;
}

export function useForecast(county: string): WeatherState & { reload: () => void } {
  const [state, setState] = useState<WeatherState>({ status: "loading" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => (s.data?.county === county ? s : { status: "loading" }));
    try {
      const data = await getWeather(county);
      if (my !== seq.current) return;
      setState({ status: "live", data });
      AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ county, ts: Date.now(), data })).catch(() => {});
    } catch {
      let cached: WeatherState = { status: "none" };
      try {
        const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
        const c = raw ? JSON.parse(raw) : null;
        const clean = c?.county === county ? cleanForecast(c?.data) : null;
        const f = clean ? fromToday(clean) : null;
        const ts = typeof c?.ts === "number" && Number.isFinite(c.ts) ? c.ts : Date.now();
        if (f) cached = { status: "cached", data: f, cachedAgeMin: Math.max(1, Math.round((Date.now() - ts) / 60000)) };
      } catch {}
      // A failed refresh never blanks a forecast that is already on screen.
      if (my === seq.current) setState((prev) => (cached.status === "none" && prev.data?.county === county ? prev : cached));
    }
  }, [county]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
