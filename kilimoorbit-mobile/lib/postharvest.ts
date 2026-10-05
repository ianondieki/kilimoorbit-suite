/**
 * After the harvest (ghala): which crops keep, how much weight they lose in
 * store, when to check them, and whether holding to sell later pays in a
 * typical year. Pure functions only (no storage, no React Native), so they
 * are unit-tested directly (e2e/logic.spec.ts).
 *
 * The seasonal indices are the usual shape of Kenyan wholesale prices:
 * lowest just after the main harvests, highest in the lean months before the
 * next one. They describe a typical year, not a forecast. Prices can move
 * the other way, and the app says so wherever these numbers appear. Losses
 * are typical figures for hermetic bags (PICS, AgroZ, ZeroFly) against
 * ordinary woven bags.
 *
 * NOTE: the figures should be reviewed by an extension officer before release.
 */
import { addDays, daysBetween } from "./dates";

export type StoreCrop = "maize" | "beans" | "potatoes";
export const STORE_CROPS: StoreCrop[] = ["maize", "beans", "potatoes"];
export const isStoreCrop = (k: unknown): k is StoreCrop => typeof k === "string" && (STORE_CROPS as string[]).includes(k);

type StoreSpec = {
  /** The usual bag in Kenyan markets: 90 kg for grain, 50 kg for potatoes. */
  bagKg: number;
  /** The longest hold worth planning for, in months. */
  maxMonths: number;
  /** Share of the weight lost per month. */
  loss: { hermetic: number; open: number };
  /** Days between store checks. */
  checkEvery: { hermetic: number; open: number };
  /** Whether hermetic bags apply (grain: yes; potatoes need air). */
  hermeticOk: boolean;
  /** Typical-year price index by month, January first; the mean is about 1. */
  season: number[];
};

export const STORE: Record<StoreCrop, StoreSpec> = {
  maize: {
    bagKg: 90, maxMonths: 6, hermeticOk: true,
    loss: { hermetic: 0.005, open: 0.025 },
    checkEvery: { hermetic: 30, open: 14 },
    season: [0.93, 0.95, 1.0, 1.05, 1.1, 1.12, 1.08, 1.02, 0.97, 0.93, 0.92, 0.92],
  },
  beans: {
    bagKg: 90, maxMonths: 6, hermeticOk: true,
    loss: { hermetic: 0.005, open: 0.03 },
    checkEvery: { hermetic: 30, open: 14 },
    season: [0.96, 0.95, 1.0, 1.06, 1.08, 1.02, 0.95, 0.94, 0.98, 1.03, 1.05, 0.98],
  },
  potatoes: {
    bagKg: 50, maxMonths: 3, hermeticOk: false,
    loss: { hermetic: 0.04, open: 0.04 },
    checkEvery: { hermetic: 7, open: 7 },
    season: [0.92, 0.95, 1.02, 1.08, 1.1, 1.05, 0.95, 0.92, 0.98, 1.03, 1.03, 0.97],
  },
};

/** A batch of produce in store, kept with the farm (lib/farm.ts). */
export type Lot = {
  id: string;
  crop: StoreCrop;
  /** Kilos still in store. */
  kg: number;
  /** The day it went in. */
  since: string;
  hermetic: boolean;
  /** The last store check. */
  checked?: string;
};

const lossRate = (crop: StoreCrop, hermetic: boolean) =>
  hermetic && STORE[crop].hermeticOk ? STORE[crop].loss.hermetic : STORE[crop].loss.open;

/** Bags for a weight, to the nearest half bag. */
export const bagsOf = (crop: StoreCrop, kg: number) => Math.round((kg / STORE[crop].bagKg) * 2) / 2;

/** "12" / "11½" / "½" */
export const bagsLabel = (n: number) => `${Math.floor(n) || ""}${n % 1 ? "½" : ""}` || "0";

/* ── sell now or hold ── */
export type HoldMonth = {
  /** Months from now (0 = sell now). */
  k: number;
  /** Calendar month, 0 = January. */
  month: number;
  /** Typical-year price per kg that month. */
  price: number;
  /** Kilos left after storage losses. */
  kg: number;
  value: number;
  /** Value minus selling now. */
  gain: number;
};

export type HoldPlan = {
  months: HoldMonth[];
  best: HoldMonth;
  /** Whether holding clearly pays in a typical year: at least 5 % and KES 500 more. */
  worthIt: boolean;
  /** Weight lost by the best month, in percent. */
  lossPct: number;
};

/**
 * What `kg` of a crop would fetch if sold now at `price` a kilo, or held for
 * up to the crop's maximum months, in a typical year. `month` is the current
 * calendar month (0 = January).
 */
export function holdPlan(crop: StoreCrop, kg: number, price: number, month: number, hermetic: boolean): HoldPlan | null {
  if (!isStoreCrop(crop) || !(kg > 0) || !(price > 0) || !Number.isFinite(kg) || !Number.isFinite(price)) return null;
  const m0 = ((Math.floor(month) % 12) + 12) % 12;
  const s = STORE[crop];
  const loss = lossRate(crop, hermetic);
  const months: HoldMonth[] = Array.from({ length: s.maxMonths + 1 }, (_, k) => {
    const m = (m0 + k) % 12;
    const p = Math.max(1, Math.round((price * s.season[m]) / s.season[m0]));
    const left = kg * Math.pow(1 - loss, k);
    return { k, month: m, price: k === 0 ? Math.round(price) : p, kg: Math.round(left), value: Math.round(left * (k === 0 ? price : p)), gain: 0 };
  });
  for (const h of months) h.gain = h.value - months[0].value;
  const best = months.reduce((b, h) => (h.gain > b.gain ? h : b), months[0]);
  const worthIt = best.k > 0 && best.gain >= Math.max(500, months[0].value * 0.05);
  return { months, best, worthIt, lossPct: Math.round((1 - Math.pow(1 - loss, best.k)) * 1000) / 10 };
}

/* ── store checks ── */
export function nextCheck(l: Lot): string {
  const s = STORE[l.crop];
  const every = l.hermetic && s.hermeticOk ? s.checkEvery.hermetic : s.checkEvery.open;
  return addDays(l.checked && l.checked > l.since ? l.checked : l.since, every);
}

export type DueCheck = { lot: Lot; due: string; inDays: number };

/** Store checks due within `ahead` days or late, soonest first. */
export function dueChecks(lots: Lot[], today: string, ahead = 2): DueCheck[] {
  return lots
    .map((lot) => { const due = nextCheck(lot); return { lot, due, inDays: daysBetween(today, due) }; })
    .filter((c) => c.inDays <= ahead)
    .sort((a, b) => a.inDays - b.inDays);
}

/** Which check text applies: sealed grain bags, open grain bags, or potatoes. */
export const checkKind = (l: Lot): "hermetic" | "open" | "potatoes" =>
  l.crop === "potatoes" ? "potatoes" : l.hermetic ? "hermetic" : "open";
