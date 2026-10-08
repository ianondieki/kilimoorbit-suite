/**
 * The farmer's shamba, kept on this phone ("ko-farm"): county and size, the
 * crops in the ground, which calendar tasks are done, a simple money ledger
 * (daftari), produce in store (ghala) and the farmer's own input prices for
 * the budget. Works fully offline; nothing is sent to the server.
 *
 * A tiny module store (like lib/voice.ts): every screen reads the same value
 * through useFarm(), and writes are persisted at once.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CROPS, type CropKey, type CropTask } from "./agronomy";
import { addDays, daysBetween, todayKey } from "./dates";
import { isStoreCrop, type Lot } from "./postharvest";
import { isPriceKey } from "./budget";
import type { Scout } from "./scouting";

export const FARM_KEY = "ko-farm";

export type Planting = { id: string; crop: CropKey; acres: number; plantedOn: string };

export type ExpenseCat = "seed" | "fertilizer" | "chemicals" | "labour" | "transport" | "feed" | "vet" | "other";
export type IncomeCat = "sale" | "milk" | "eggs" | "animals" | "fish" | "other";
export const EXPENSE_CATS: ExpenseCat[] = ["seed", "fertilizer", "chemicals", "labour", "transport", "feed", "vet", "other"];
export const INCOME_CATS: IncomeCat[] = ["sale", "milk", "eggs", "animals", "fish", "other"];
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
  /** Produce in store (ghala). */
  store: Lot[];
  /** The farmer's own prices for the budget (lib/budget.ts keys). */
  prices: Record<string, number>;
  /** Fall armyworm scouting walks (lib/scouting.ts). */
  scouts: Scout[];
  /** Soil pH from a soil test, when the farmer has one. */
  soilPh: number | null;
  /** Share scouting results anonymously with the county pest watch. */
  sharePest: boolean;
};

const EMPTY: Farm = { v: 1, county: null, acres: null, plantings: [], done: {}, entries: [], store: [], prices: {}, scouts: [], soilPh: null, sharePest: false };
const MAX_LOTS = 50;
const MAX_SCOUTS = 300;

let state: Farm = EMPTY;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Own keys only: "toString" or "constructor" from a corrupted store must not pass as a crop.
const isCrop = (k: unknown): k is CropKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(CROPS, k);

/** Drops anything malformed rather than crashing on a hand-edited or old store. */
function sanitize(raw: any): Farm {
  if (!raw || typeof raw !== "object") return EMPTY;
  const num = (n: unknown) => (typeof n === "number" && isFinite(n) && n > 0 ? n : null);
  const day = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  return {
    v: 1,
    county: typeof raw.county === "string" ? raw.county.slice(0, 40) : null,
    acres: num(raw.acres),
    plantings: (Array.isArray(raw.plantings) ? raw.plantings : [])
      .filter((p: any) => p && typeof p.id === "string" && isCrop(p.crop) && num(p.acres) && day(p.plantedOn))
      .map((p: any): Planting => ({ id: p.id, crop: p.crop, acres: Math.min(p.acres, 10000), plantedOn: p.plantedOn }))
      .slice(0, 100),
    done: raw.done && typeof raw.done === "object" && !Array.isArray(raw.done) ? raw.done : {},
    entries: (Array.isArray(raw.entries) ? raw.entries : [])
      .filter((e: any) => e && typeof e.id === "string" && (e.kind === "income" || e.kind === "expense") && num(e.amount) && day(e.date))
      .map((e: any): Entry => ({
        id: e.id, kind: e.kind, amount: e.amount, date: e.date,
        category: (e.kind === "income" ? INCOME_CATS : EXPENSE_CATS).includes(e.category) ? e.category : "other",
        crop: isCrop(e.crop) ? e.crop : undefined,
        kg: num(e.kg) ?? undefined,
        note: typeof e.note === "string" ? e.note.slice(0, 80) : undefined,
      }))
      .slice(0, 2000),
    store: (Array.isArray(raw.store) ? raw.store : [])
      .filter((l: any) => l && typeof l.id === "string" && isStoreCrop(l.crop) && num(l.kg) && l.kg <= 1e6 && day(l.since))
      .map((l: any): Lot => ({
        id: l.id, crop: l.crop, kg: Math.round(l.kg), since: l.since, hermetic: l.hermetic === true,
        ...(day(l.checked) ? { checked: l.checked } : null),
      }))
      .slice(0, MAX_LOTS),
    prices: Object.fromEntries(
      Object.entries(raw.prices && typeof raw.prices === "object" && !Array.isArray(raw.prices) ? raw.prices : {})
        .filter(([k, v]) => isPriceKey(k) && typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7),
    ) as Record<string, number>,
    scouts: (Array.isArray(raw.scouts) ? raw.scouts : [])
      .filter((x: any) => x && typeof x.id === "string" && day(x.date) && Number.isInteger(x.plants) && x.plants >= 1 && x.plants <= 200
        && Number.isInteger(x.hit) && x.hit >= 0 && x.hit <= x.plants)
      .map((x: any): Scout => ({
        id: x.id, date: x.date, plants: x.plants, hit: x.hit,
        ageDays: Number.isInteger(x.ageDays) && x.ageDays >= 0 && x.ageDays <= 400 ? x.ageDays : null,
        ...(typeof x.plantingId === "string" ? { plantingId: x.plantingId } : null),
      }))
      .slice(-MAX_SCOUTS),
    soilPh: typeof raw.soilPh === "number" && Number.isFinite(raw.soilPh) && raw.soilPh >= 3 && raw.soilPh <= 9 ? Math.round(raw.soilPh * 10) / 10 : null,
    sharePest: raw.sharePest === true,
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
      scouts: s.scouts.filter((x) => x.plantingId !== id),
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

  /* ── ghala ── */
  addLot(l: Omit<Lot, "id" | "checked">) {
    if (!isStoreCrop(l.crop) || !(l.kg > 0) || l.kg > 1e6) return;
    const lot: Lot = { id: uid("l"), crop: l.crop, kg: Math.round(l.kg), since: l.since, hermetic: !!l.hermetic };
    mutate((s) => (s.store.length >= MAX_LOTS ? s : { ...s, store: [...s.store, lot] }));
  },
  removeLot(id: string) {
    mutate((s) => ({ ...s, store: s.store.filter((l) => l.id !== id) }));
  },
  /** Marks a store check done (or restores the previous one, for undo). */
  setChecked(id: string, date: string | undefined) {
    mutate((s) => ({
      ...s,
      store: s.store.map((l) => {
        if (l.id !== id) return l;
        const { checked: _, ...rest } = l;
        return date ? { ...rest, checked: date } : rest;
      }),
    }));
  },
  /**
   * Sells from a lot: the lot shrinks (and goes when empty) and the sale is
   * written to the daftari with its kilos, in one change.
   */
  sellFromStore(id: string, kg: number, amount: number, date: string, note?: string) {
    if (!(kg > 0) || !(amount > 0) || !Number.isFinite(amount)) return;
    const entryId = uid("e");
    mutate((s) => {
      const lot = s.store.find((l) => l.id === id);
      if (!lot) return s;
      const sold = Math.min(Math.round(kg), lot.kg);
      const left = lot.kg - sold;
      return {
        ...s,
        store: left > 0 ? s.store.map((l) => (l.id === id ? { ...l, kg: left } : l)) : s.store.filter((l) => l.id !== id),
        entries: [{ id: entryId, kind: "income", category: "sale", amount: Math.round(amount), crop: lot.crop, kg: sold, date, ...(note ? { note: note.slice(0, 80) } : null) }, ...s.entries],
      };
    });
  },

  /** Takes kilos out of a lot without a sale (eaten at home, given away, spoiled). */
  takeFromLot(id: string, kg: number) {
    if (!(kg > 0)) return;
    mutate((s) => {
      const lot = s.store.find((l) => l.id === id);
      if (!lot) return s;
      const left = lot.kg - Math.round(kg);
      return { ...s, store: left > 0 ? s.store.map((l) => (l.id === id ? { ...l, kg: left } : l)) : s.store.filter((l) => l.id !== id) };
    });
  },

  /* ── scouting and soil ── */
  /** Saves a walk; the planting's scouting tasks due by now (or within 3 days) are ticked off with it. */
  addScout(x: Omit<Scout, "id">) {
    if (!(x.plants >= 1 && x.plants <= 200 && x.hit >= 0 && x.hit <= x.plants)) return;
    const scout: Scout = { ...x, id: uid("s") };
    mutate((s) => {
      const done = { ...s.done };
      const p = x.plantingId ? s.plantings.find((q) => q.id === x.plantingId) : undefined;
      if (p) for (const t of CROPS[p.crop].tasks)
        if (t.id.startsWith("faw") && addDays(p.plantedOn, t.day) <= addDays(x.date, 3)) done[`${p.id}:${t.id}`] = true;
      return { ...s, done, scouts: [...s.scouts, scout].slice(-MAX_SCOUTS) };
    });
  },
  removeScout(id: string) {
    mutate((s) => ({ ...s, scouts: s.scouts.filter((x) => x.id !== id) }));
  },
  setSoilPh(ph: number | null) {
    mutate((s) => ({ ...s, soilPh: ph != null && Number.isFinite(ph) && ph >= 3 && ph <= 9 ? Math.round(ph * 10) / 10 : null }));
  },
  setSharePest(on: boolean) {
    mutate((s) => ({ ...s, sharePest: on }));
  },

  /* ── budget prices ── */
  setPrice(key: string, value: number | null) {
    if (!isPriceKey(key)) return;
    mutate((s) => {
      const prices = { ...s.prices };
      if (value == null || !Number.isFinite(value) || value < 0 || value >= 1e7) delete prices[key];
      else prices[key] = value;
      return { ...s, prices };
    });
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
