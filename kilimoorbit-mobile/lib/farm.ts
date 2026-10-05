/**
 * The farmer's shamba, kept on this phone ("ko-farm"): county and size, the
 * crops in the ground, which calendar tasks are done, and a simple money
 * ledger (daftari). Works fully offline; nothing is sent to the server.
 *
 * A tiny module store (like lib/voice.ts): every screen reads the same value
 * through useFarm(), and writes are persisted at once.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CROPS, type CropKey, type CropTask } from "./agronomy";
import { addDays, daysBetween, todayKey } from "./dates";

export const FARM_KEY = "ko-farm";

export type Planting = { id: string; crop: CropKey; acres: number; plantedOn: string };

export type ExpenseCat = "seed" | "fertilizer" | "chemicals" | "labour" | "transport" | "other";
export type IncomeCat = "sale" | "other";
export type Entry = {
  id: string;
  kind: "income" | "expense";
  category: ExpenseCat | IncomeCat;
  amount: number;
  crop?: CropKey;
  /** Sales only: kilos sold, so the ledger knows the price actually received. */
  kg?: number;
  note?: string;
  date: string;
};

export type Farm = {
  v: 1;
  county: string | null;
  acres: number | null;
  plantings: Planting[];
  done: Record<string, true>;
  entries: Entry[];
};

const EMPTY: Farm = { v: 1, county: null, acres: null, plantings: [], done: {}, entries: [] };

let state: Farm = EMPTY;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const isCrop = (k: unknown): k is CropKey => typeof k === "string" && k in CROPS;

/** Drops anything malformed rather than crashing on a hand-edited or old store. */
function sanitize(raw: any): Farm {
  if (!raw || typeof raw !== "object") return EMPTY;
  const num = (n: unknown) => (typeof n === "number" && isFinite(n) && n > 0 ? n : null);
  const day = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  return {
    v: 1,
    county: typeof raw.county === "string" ? raw.county : null,
    acres: num(raw.acres),
    plantings: (Array.isArray(raw.plantings) ? raw.plantings : [])
      .filter((p: any) => p && typeof p.id === "string" && isCrop(p.crop) && num(p.acres) && day(p.plantedOn)),
    done: raw.done && typeof raw.done === "object" ? raw.done : {},
    entries: (Array.isArray(raw.entries) ? raw.entries : [])
      .filter((e: any) => e && typeof e.id === "string" && (e.kind === "income" || e.kind === "expense") && num(e.amount) && day(e.date))
      .map((e: any) => ({ ...e, crop: isCrop(e.crop) ? e.crop : undefined, kg: num(e.kg) ?? undefined })),
  };
}

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(FARM_KEY)
    .then((raw) => {
      // A write made before storage answered wins over the stored copy.
      if (raw && !hydrated) state = sanitize(JSON.parse(raw));
    })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}

function write(next: Farm) {
  state = next;
  hydrated = true;
  emit();
  AsyncStorage.setItem(FARM_KEY, JSON.stringify(next)).catch(() => {});
}

/**
 * Applies a change on top of the stored farm. Before storage has answered, the
 * change waits for it, so an early tap can never overwrite saved records.
 */
function mutate(fn: (s: Farm) => Farm) {
  if (hydrated) write(fn(state));
  else hydrate().then(() => write(fn(state)));
}

/** Forget the in-memory copy (sign-out "forget", or a different farmer). Storage is cleared by the caller. */
export function clearFarmMemory() {
  state = EMPTY;
  hydrated = true;
  emit();
}

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const farmActions = {
  setProfile(county: string | null, acres: number | null) {
    mutate((s) => ({ ...s, county, acres }));
  },
  /** A crop already in the ground has had its land prep and planting done: tick those off. */
  addPlanting(p: Omit<Planting, "id">) {
    const id = uid("p");
    mutate((s) => {
      const done = { ...s.done };
      if (p.plantedOn <= todayKey()) for (const t of CROPS[p.crop].tasks) if (t.day <= 0) done[`${id}:${t.id}`] = true;
      return { ...s, plantings: [...s.plantings, { ...p, id }], done };
    });
  },
  removePlanting(id: string) {
    mutate((s) => ({
      ...s,
      plantings: s.plantings.filter((p) => p.id !== id),
      done: Object.fromEntries(Object.entries(s.done).filter(([k]) => !k.startsWith(`${id}:`))) as Farm["done"],
    }));
  },
  toggleTask(plantingId: string, taskId: string) {
    const k = `${plantingId}:${taskId}`;
    mutate((s) => {
      const done = { ...s.done };
      if (done[k]) delete done[k];
      else done[k] = true;
      return { ...s, done };
    });
  },
  addEntry(e: Omit<Entry, "id">) {
    const id = uid("e");
    mutate((s) => ({ ...s, entries: [{ ...e, id }, ...s.entries] }));
  },
  removeEntry(id: string) {
    mutate((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
  },
};

export function useFarm(): { farm: Farm; ready: boolean } {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const farm = useSyncExternalStore(subscribe, () => state, () => state);
  const ready = useSyncExternalStore(subscribe, () => hydrated, () => hydrated);
  useEffect(() => { hydrate(); }, []);
  return { farm, ready };
}

/* ── calendar ── */
export type DatedTask = CropTask & { planting: Planting; due: string; inDays: number; done: boolean };

export function tasksOf(p: Planting, done: Farm["done"], today = todayKey()): DatedTask[] {
  return CROPS[p.crop].tasks.map((t) => {
    const due = addDays(p.plantedOn, t.day);
    return { ...t, planting: p, due, inDays: daysBetween(today, due), done: !!done[`${p.id}:${t.id}`] };
  });
}

export const taskKey = (t: DatedTask) => `${t.planting.id}:${t.id}`;

/**
 * What needs doing now: open tasks overdue by up to two weeks or due within
 * `ahead` days, soonest first. Older misses drop off rather than nag forever.
 * `keep`: tasks ticked off on this visit stay listed (struck through), so a
 * tick gives feedback instead of making the row vanish.
 */
export function upcomingTasks(farm: Farm, ahead = 7, today = todayKey(), keep?: ReadonlySet<string>): DatedTask[] {
  return farm.plantings
    .flatMap((p) => tasksOf(p, farm.done, today))
    .filter((t) => (!t.done || keep?.has(taskKey(t))) && t.inDays <= ahead && t.inDays >= -14)
    .sort((a, b) => a.inDays - b.inDays);
}

/* ── ledger ── */
export type Totals = { income: number; expense: number; profit: number };

export function totals(entries: Entry[]): Totals {
  let income = 0, expense = 0;
  for (const e of entries) e.kind === "income" ? (income += e.amount) : (expense += e.amount);
  return { income, expense, profit: income - expense };
}

export type CropTotals = { crop: CropKey; t: Totals; soldKg: number; avgPerKg: number | null };

export function byCrop(entries: Entry[]): CropTotals[] {
  const m = new Map<CropKey, Entry[]>();
  for (const e of entries) if (e.crop) m.set(e.crop, [...(m.get(e.crop) ?? []), e]);
  return [...m.entries()]
    .map(([crop, es]) => {
      // Average price received: only sales that recorded their kilos.
      const sales = es.filter((e) => e.kind === "income" && e.kg);
      const soldKg = sales.reduce((s, e) => s + (e.kg ?? 0), 0);
      const avgPerKg = soldKg ? Math.round(sales.reduce((s, e) => s + e.amount, 0) / soldKg) : null;
      return { crop, t: totals(es), soldKg, avgPerKg };
    })
    .sort((a, b) => b.t.income + b.t.expense - (a.t.income + a.t.expense));
}

export const fmtMoney = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

const fmtAcres = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
/** "1 acre" / "2.5 acres" / "ekari 2.5" */
export const acresText = (tt: (k: "unit.acre" | "unit.acres", v: { n: string }) => string, n: number) =>
  tt(n === 1 ? "unit.acre" : "unit.acres", { n: fmtAcres(n) });
