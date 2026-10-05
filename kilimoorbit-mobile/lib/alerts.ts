/**
 * The farmer's price alerts ("ko-alerts"), one per crop. In-app only: Today
 * shows the ones that have hit (there is no SMS or push channel yet, and the
 * Markets screen says so). Cleared with sign-out "forget".
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PriceAlert } from "./pricewatch";

export const ALERTS_KEY = "ko-alerts";
const MAX = 12;

let state: PriceAlert[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const clean = (v: unknown): PriceAlert[] =>
  (Array.isArray(v) ? v : [])
    .filter((a: any) => a && typeof a.id === "string" && typeof a.crop === "string" && typeof a.target === "number" && Number.isFinite(a.target) && a.target > 0)
    .map((a: any) => ({ id: a.id, crop: a.crop.toLowerCase().slice(0, 40), target: Math.round(a.target), created: typeof a.created === "string" ? a.created : "" }))
    .slice(0, MAX);

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(ALERTS_KEY)
    .then((raw) => { if (raw && !hydrated) state = clean(JSON.parse(raw)); })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}

function write(next: PriceAlert[]) {
  state = next.slice(0, MAX);
  hydrated = true;
  emit();
  AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(state)).catch(() => {});
}

const mutate = (fn: (s: PriceAlert[]) => PriceAlert[]) => (hydrated ? write(fn(state)) : hydrate().then(() => write(fn(state))));

export function clearAlertsMemory() { state = []; hydrated = true; emit(); }

export const alertActions = {
  /** Setting a crop's alert again replaces the old target. */
  set(crop: string, target: number) {
    if (!Number.isFinite(target) || target <= 0) return;
    const a: PriceAlert = { id: `al${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, crop, target: Math.round(target), created: new Date().toISOString() };
    mutate((s) => [a, ...s.filter((x) => x.crop !== crop)]);
  },
  remove(id: string) { mutate((s) => s.filter((x) => x.id !== id)); },
};

export function useAlerts(): PriceAlert[] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const v = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { hydrate(); }, []);
  return v;
}
