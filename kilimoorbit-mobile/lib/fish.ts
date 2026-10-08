/**
 * The farmer's fish ponds, weighings and losses, kept on this phone
 * ("ko-fish"). Same pattern as lib/herd.ts: one module store, validated on
 * load, bounded sizes, cleared with sign-out "forget".
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMPTY_FISH, cleanPond, sanitizeFish, type FishStore, type Pond } from "./aquaculture";

export const FISH_KEY = "ko-fish";
const MAX_PONDS = 20;
const MAX_SAMPLES = 500;
const MAX_LOSSES = 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (d: unknown): d is string => typeof d === "string" && DAY.test(d);
const num = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
const price = (p: unknown) => (num(p, 1, 100000) ? Math.round(p) : null);

export type Fish = FishStore;
const EMPTY: Fish = EMPTY_FISH;
export { sanitizeFish };

let state: Fish = EMPTY;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(FISH_KEY)
    .then((raw) => { if (raw && !hydrated) state = sanitizeFish(JSON.parse(raw)); })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}
function write(next: Fish) {
  state = next;
  hydrated = true;
  emit();
  AsyncStorage.setItem(FISH_KEY, JSON.stringify(next)).catch(() => {});
}
function mutate(fn: (s: Fish) => Fish) {
  if (hydrated) write(fn(state));
  else hydrate().then(() => write(fn(state)));
}
export function clearFishMemory() { state = EMPTY; hydrated = true; emit(); }

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const fishActions = {
  addPond(p: Omit<Pond, "id">) {
    const pond = cleanPond({ ...p, id: uid("p") });
    if (!pond) return;
    mutate((s) => (s.ponds.length >= MAX_PONDS ? s : { ...s, ponds: [...s.ponds, pond] }));
  },
  /** A harvested or abandoned pond goes, with its log. */
  removePond(id: string) {
    mutate((s) => ({
      ...s,
      ponds: s.ponds.filter((p) => p.id !== id),
      samples: s.samples.filter((x) => x.pondId !== id),
      losses: s.losses.filter((x) => x.pondId !== id),
      done: Object.fromEntries(Object.entries(s.done).filter(([k]) => !k.startsWith(`${id}:`))) as Fish["done"],
    }));
  },
  /** One weighing per pond per day (a second replaces the first). */
  addSample(pondId: string, date: string, avgG: number) {
    if (!day(date) || !num(avgG, 0.5, 5000)) return;
    mutate((s) => ({ ...s, samples: [...s.samples.filter((x) => !(x.pondId === pondId && x.date === date)), { id: uid("s"), pondId, date, avgG: Math.round(avgG * 10) / 10 }].slice(-MAX_SAMPLES) }));
  },
  addLoss(pondId: string, date: string, count: number) {
    if (!day(date) || !Number.isInteger(count) || count < 1 || count > 1000000) return;
    mutate((s) => ({ ...s, losses: [...s.losses, { id: uid("l"), pondId, date, count }].slice(-MAX_LOSSES) }));
  },
  toggleDone(pondId: string, taskId: string) {
    const k = `${pondId}:${taskId}`;
    mutate((s) => {
      const done = { ...s.done };
      if (done[k]) delete done[k]; else done[k] = true;
      return { ...s, done };
    });
  },
  setPrice(species: "tilapia" | "catfish", p: number | null) {
    mutate((s) => ({ ...s, prices: { ...s.prices, [species]: price(p) } }));
  },
};

export function useFish(): { fish: Fish; ready: boolean } {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const fish = useSyncExternalStore(subscribe, () => state, () => state);
  const ready = useSyncExternalStore(subscribe, () => hydrated, () => hydrated);
  useEffect(() => { hydrate(); }, []);
  return { fish, ready };
}
