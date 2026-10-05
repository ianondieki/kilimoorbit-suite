/**
 * Farm shows near the farmer: the list (cached on the phone, "ko-shows-cache")
 * and the shows they booked ("ko-bookings"), so a booked show shows "You're
 * going" and its Google Calendar link still works offline. The booking
 * itself (email + reminder) is the server's agent, lib/api.ts bookShow.
 * Pure helpers (dates, the calendar link, the record cleaner): lib/shows.ts.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getShows, type Shows } from "./api";
import { cleanShows } from "./validate";
import { EMPTY_BOOKINGS, MAX_BOOKINGS, sanitizeBookings, type BookingsStore, type MyBooking } from "./shows";

export { googleCalendarUrl, onNow, upcomingBookings, whenText, daysUntil, sanitizeBookings, type MyBooking } from "./shows";

export const SHOWS_CACHE_KEY = "ko-shows-cache";
export const BOOKINGS_KEY = "ko-bookings";

/* ── the list ── */
export type ShowsState = { status: "loading" | "live" | "cached" | "none"; data?: Shows; cachedAgeMin?: number };

export function useShows(county: string): ShowsState & { reload: () => void } {
  const [state, setState] = useState<ShowsState>({ status: "loading" });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => (s.data?.county === county ? s : { status: "loading" }));
    try {
      const data = await getShows(county);
      if (my !== seq.current) return;
      setState({ status: "live", data });
      AsyncStorage.setItem(SHOWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })).catch(() => {});
    } catch {
      let cached: ShowsState = { status: "none" };
      try {
        const raw = await AsyncStorage.getItem(SHOWS_CACHE_KEY);
        const c = raw ? JSON.parse(raw) : null;
        const clean = c?.data?.county === county ? cleanShows(c.data) : null;
        const ts = typeof c?.ts === "number" && Number.isFinite(c.ts) ? c.ts : Date.now();
        if (clean) cached = { status: "cached", data: clean, cachedAgeMin: Math.max(1, Math.round((Date.now() - ts) / 60000)) };
      } catch {}
      // A failed refresh never blanks a list that is already on screen.
      if (my === seq.current) setState((prev) => (cached.status === "none" && prev.data?.county === county ? prev : cached));
    }
  }, [county]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/* ── the farmer's bookings store ── */
let state: BookingsStore = EMPTY_BOOKINGS;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(BOOKINGS_KEY)
    .then((raw) => { if (raw && !hydrated) state = sanitizeBookings(JSON.parse(raw)); })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}
function write(next: BookingsStore) {
  state = next;
  hydrated = true;
  emit();
  AsyncStorage.setItem(BOOKINGS_KEY, JSON.stringify(next)).catch(() => {});
}
function mutate(fn: (s: BookingsStore) => BookingsStore) {
  if (hydrated) write(fn(state));
  else hydrate().then(() => write(fn(state)));
}
export function clearBookingsMemory() { state = EMPTY_BOOKINGS; hydrated = true; emit(); }

export const bookingActions = {
  /** One booking per show: booking again replaces the earlier record. */
  add(b: MyBooking) {
    mutate((s) => ({ ...s, bookings: [...s.bookings.filter((x) => x.event_id !== b.event_id), b].slice(-MAX_BOOKINGS) }));
  },
  remove(id: string) {
    mutate((s) => ({ ...s, bookings: s.bookings.filter((x) => x.id !== id) }));
  },
};

export function useBookings(): MyBooking[] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { hydrate(); }, []);
  return s.bookings;
}
