/**
 * "Will it pay?": a season budget for one crop on the farmer's land. Inputs
 * come from the crop plan (seed, DAP and CAN per acre, lib/agronomy.ts), at
 * the farmer's own prices. The defaults below are only rough starting points
 * from Kenyan agro-dealer and labour prices, and the screen asks the farmer
 * to change them. Pure functions, unit-tested in e2e/logic.spec.ts.
 */
import { CROPS, CROP_KEYS, bagsFor, type CropKey } from "./agronomy";

/**
 * Remembered prices (KES), by key:
 * dap / can: a 50 kg bag; seed:<crop>: a kilo of seed, or 1,000 seedlings
 * for transplanted crops; labour:<crop> and chem:<crop>: per acre.
 */
export const DEFAULT_PRICES: Record<string, number> = {
  dap: 3500,
  can: 3000,
  "seed:maize": 350, "seed:beans": 250, "seed:potatoes": 80,
  "seed:tomato": 5000, "seed:cabbage": 1500, "seed:kale": 1000,
  "labour:maize": 12000, "labour:beans": 10000, "labour:potatoes": 18000,
  "labour:tomato": 30000, "labour:cabbage": 15000, "labour:kale": 15000,
  "chem:maize": 2500, "chem:beans": 2500, "chem:potatoes": 8000,
  "chem:tomato": 25000, "chem:cabbage": 6000, "chem:kale": 4000,
};

export const isPriceKey = (k: string) => Object.prototype.hasOwnProperty.call(DEFAULT_PRICES, k);

/** A fallback selling price (KES/kg) for crops that aren't on the price board. */
export const TYPICAL_PRICE: Record<CropKey, number> = {
  maize: 45, beans: 120, tomato: 50, potatoes: 40, cabbage: 25, kale: 25,
};

export type LineKey = "seed" | "dap" | "can" | "labour" | "chem" | "interest";
export type BudgetLine = {
  key: LineKey;
  /** The price key the farmer edits for this line (none for interest). */
  priceKey?: string;
  /** How much is bought: kilos of seed, seedlings, or bags of fertilizer. */
  qty?: number;
  unit?: "kg" | "seedlings" | "bags" | "acres";
  cost: number;
};

export type Budget = {
  lines: BudgetLine[];
  cost: number;
  kg: number;
  revenue: number;
  profit: number;
  /** The selling price (KES/kg) that just covers the costs. */
  breakEvenPrice: number | null;
  /** The harvest (kg) that just covers the costs at the chosen price. */
  breakEvenKg: number | null;
};

/** level 0 = typical smallholder yield, 1 = good practice. */
export function budgetFor(
  crop: CropKey, acres: number,
  opts: { prices?: Record<string, number>; level?: 0 | 1; pricePerKg: number; interestPct?: number },
): Budget {
  const plan = CROPS[crop];
  const a = Number.isFinite(acres) && acres > 0 ? acres : 0;
  const price = (k: string) => {
    const v = opts.prices?.[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_PRICES[k] ?? 0;
  };
  const lines: BudgetLine[] = [];

  const seedQty = plan.seed.perAcre * a;
  const seedlings = plan.seed.unit === "seedlings";
  lines.push({
    key: "seed", priceKey: `seed:${crop}`, qty: seedlings ? Math.round(seedQty / 100) * 100 : Math.round(seedQty * 10) / 10,
    unit: seedlings ? "seedlings" : "kg",
    cost: Math.round(seedlings ? (seedQty / 1000) * price(`seed:${crop}`) : seedQty * price(`seed:${crop}`)),
  });
  for (const inp of [plan.basal, plan.topdress]) {
    if (!inp || !a) continue;
    const key = inp.product === "DAP" ? "dap" : "can";
    const bags = bagsFor(inp.kgPerAcre * a);
    lines.push({ key, priceKey: key, qty: bags, unit: "bags", cost: Math.round(bags * price(key)) });
  }
  lines.push({ key: "labour", priceKey: `labour:${crop}`, qty: a, unit: "acres", cost: Math.round(a * price(`labour:${crop}`)) });
  lines.push({ key: "chem", priceKey: `chem:${crop}`, qty: a, unit: "acres", cost: Math.round(a * price(`chem:${crop}`)) });

  const direct = lines.reduce((s, l) => s + l.cost, 0);
  const pct = Math.max(0, Math.min(100, opts.interestPct ?? 0));
  if (pct > 0) lines.push({ key: "interest", cost: Math.round((direct * pct) / 100) });

  const cost = lines.reduce((s, l) => s + l.cost, 0);
  const kg = Math.round(plan.yieldPerAcre[opts.level ?? 0] * a);
  const p = Number.isFinite(opts.pricePerKg) && opts.pricePerKg > 0 ? opts.pricePerKg : 0;
  const revenue = Math.round(kg * p);
  return {
    lines, cost, kg, revenue, profit: revenue - cost,
    breakEvenPrice: kg > 0 ? Math.ceil(cost / kg) : null,
    breakEvenKg: p > 0 ? Math.ceil(cost / p) : null,
  };
}

export type CropCompare = { crop: CropKey; profit: number; cost: number; revenue: number };

/** Every crop on the same land, most profitable first (each at its own selling price). */
export function compareCrops(
  acres: number, opts: { prices?: Record<string, number>; level?: 0 | 1; priceOf: (c: CropKey) => number; interestPct?: number },
): CropCompare[] {
  return CROP_KEYS
    .map((crop) => {
      const b = budgetFor(crop, acres, { prices: opts.prices, level: opts.level, pricePerKg: opts.priceOf(crop), interestPct: opts.interestPct });
      return { crop, profit: b.profit, cost: b.cost, revenue: b.revenue };
    })
    .sort((x, y) => y.profit - x.profit);
}
