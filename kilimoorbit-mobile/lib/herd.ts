/**
 * The farmer's animals, their events and the milk log, kept on this phone
 * ("ko-herd"). Same pattern as lib/farm.ts: one module store, validated on
 * load, writes wait for storage to hydrate, bounded sizes so a years-long
 * milk log can't grow without limit. Cleared with sign-out "forget".
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EVENT_KINDS, SPECIES, type Animal, type AnimalEvent, type EventKind, type MilkEntry, type Species } from "./livestock";

export const HERD_KEY = "ko-herd";
const MAX_ANIMALS = 100;
const MAX_EVENTS = 200;
const MAX_MILK = 3000;

export type Herd = { v: 1; animals: Animal[]; milk: MilkEntry[]; done: Record<string, true>; milkPrice: number | null };
const EMPTY: Herd = { v: 1, animals: [], milk: [], done: {}, milkPrice: null };

let state: Herd = EMPTY;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (d: unknown) => (typeof d === "string" && DAY.test(d) ? d : undefined);
const pos = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined);

function cleanEvent(e: any): AnimalEvent | null {
  if (!e || typeof e.id !== "string" || !EVENT_KINDS.includes(e.kind) || !day(e.date)) return null;
  return { id: e.id, kind: e.kind, date: e.date, ...(typeof e.note === "string" && e.note ? { note: e.note.slice(0, 80) } : null) };
}

function cleanAnimal(a: any): Animal | null {
  if (!a || typeof a.id !== "string" || !SPECIES.includes(a.species)) return null;
  const events = (Array.isArray(a.events) ? a.events : []).map(cleanEvent).filter((e: AnimalEvent | null): e is AnimalEvent => !!e);
  return {
    id: a.id,
    species: a.species,
    name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 40) : "—",
    female: a.species === "chicken" ? true : a.female !== false,
    ...(day(a.born) ? { born: a.born } : null),
    ...(a.species === "chicken" ? { count: Math.min(100000, Math.round(pos(a.count) ?? 1)) } : null),
    events: events.slice(-MAX_EVENTS),
  };
}

export function sanitizeHerd(raw: any): Herd {
  if (!raw || typeof raw !== "object") return EMPTY;
  const animals = (Array.isArray(raw.animals) ? raw.animals : []).map(cleanAnimal).filter((a: Animal | null): a is Animal => !!a).slice(0, MAX_ANIMALS);
  const ids = new Set(animals.map((a: Animal) => a.id));
  const milk = (Array.isArray(raw.milk) ? raw.milk : [])
    .filter((m: any) => m && typeof m.id === "string" && ids.has(m.animalId) && day(m.date) && pos(m.litres) && m.litres <= 200)
    .map((m: any): MilkEntry => ({ id: m.id, animalId: m.animalId, date: m.date, litres: m.litres }))
    .slice(-MAX_MILK);
  return {
    v: 1,
    animals,
    milk,
    done: raw.done && typeof raw.done === "object" && !Array.isArray(raw.done) ? raw.done : {},
    milkPrice: pos(raw.milkPrice) && raw.milkPrice < 10000 ? raw.milkPrice : null,
  };
}

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(HERD_KEY)
    .then((raw) => { if (raw && !hydrated) state = sanitizeHerd(JSON.parse(raw)); })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}

function write(next: Herd) {
  state = next;
  hydrated = true;
  emit();
  AsyncStorage.setItem(HERD_KEY, JSON.stringify(next)).catch(() => {});
}

function mutate(fn: (s: Herd) => Herd) {
  if (hydrated) write(fn(state));
  else hydrate().then(() => write(fn(state)));
}

export function clearHerdMemory() { state = EMPTY; hydrated = true; emit(); }

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const herdActions = {
  addAnimal(a: { species: Species; name: string; female: boolean; born?: string; count?: number; served?: string }) {
    const id = uid("a");
    const events: AnimalEvent[] = a.served ? [{ id: uid("v"), kind: "served", date: a.served }] : [];
    const animal = cleanAnimal({ ...a, id, events });
    if (!animal) return;
    mutate((s) => (s.animals.length >= MAX_ANIMALS ? s : { ...s, animals: [...s.animals, animal] }));
  },
  removeAnimal(id: string) {
    mutate((s) => ({
      ...s,
      animals: s.animals.filter((a) => a.id !== id),
      milk: s.milk.filter((m) => m.animalId !== id),
      done: Object.fromEntries(Object.entries(s.done).filter(([k]) => !k.startsWith(`${id}:`))) as Herd["done"],
    }));
  },
  /**
   * Records one event for one or more animals (Today's grouped "Deworm: Daisy,
   * Neema"). Returns the new event ids so a tick can be undone.
   */
  addEvent(animalIds: string[], kind: EventKind, date: string, note?: string): { animalId: string; eventId: string }[] {
    if (!DAY.test(date)) return [];
    const made = animalIds.map((animalId) => ({ animalId, eventId: uid("v") }));
    const ids = new Map(made.map((m) => [m.animalId, m.eventId]));
    const extra = note?.trim() ? { note: note.trim().slice(0, 80) } : null;
    mutate((s) => ({
      ...s,
      animals: s.animals.map((a) =>
        ids.has(a.id) ? { ...a, events: [...a.events, { id: ids.get(a.id)!, kind, date, ...extra }].slice(-MAX_EVENTS) } : a,
      ),
    }));
    return made;
  },
  removeEvent(animalId: string, eventId: string) {
    mutate((s) => ({ ...s, animals: s.animals.map((a) => (a.id === animalId ? { ...a, events: a.events.filter((e) => e.id !== eventId) } : a)) }));
  },
  toggleDone(animalId: string, reminderId: string) {
    const k = `${animalId}:${reminderId}`;
    mutate((s) => {
      const done = { ...s.done };
      if (done[k]) delete done[k];
      else done[k] = true;
      return { ...s, done };
    });
  },
  /** One total per animal per day: a second entry for the same day replaces the first; 0 removes it. */
  setMilk(animalId: string, date: string, litres: number) {
    if (!DAY.test(date) || !Number.isFinite(litres) || litres < 0 || litres > 200) return;
    mutate((s) => {
      const rest = s.milk.filter((m) => !(m.animalId === animalId && m.date === date));
      return { ...s, milk: litres > 0 ? [...rest, { id: uid("m"), animalId, date, litres: Math.round(litres * 10) / 10 }].slice(-MAX_MILK) : rest };
    });
  },
  setMilkPrice(price: number | null) {
    mutate((s) => ({ ...s, milkPrice: price && Number.isFinite(price) && price > 0 && price < 10000 ? Math.round(price) : null }));
  },
};

export function useHerd(): { herd: Herd; ready: boolean } {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const herd = useSyncExternalStore(subscribe, () => state, () => state);
  const ready = useSyncExternalStore(subscribe, () => hydrated, () => hydrated);
  useEffect(() => { hydrate(); }, []);
  return { herd, ready };
}
