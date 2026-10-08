/**
 * Pure helpers for the SACCO finder (no storage), unit-tested in
 * e2e/logic.spec.ts: the farm's focus, this season's input bill, and the
 * sanitizer for the farmer's saved join requests.
 */
import { budgetFor } from "./budget";
import type { CropKey } from "./agronomy";
import type { SaccoFocus, SaccoService } from "./api";

const GRAIN: CropKey[] = ["maize", "beans"];

/** The farm's main line of work, for sorting SACCOs: dairy if there are cows, else what most acres grow. */
export function farmFocus(plantings: { crop: CropKey; acres: number }[], cows: number): SaccoFocus | null {
  if (cows > 0) return "dairy";
  if (!plantings.length) return null;
  const grain = plantings.filter((p) => GRAIN.includes(p.crop)).reduce((s, p) => s + p.acres, 0);
  const rest = plantings.reduce((s, p) => s + p.acres, 0) - grain;
  return grain >= rest ? "grain" : "horticulture";
}

/** Seed, DAP and CAN for every crop planted, at the farmer's prices: what an input loan must cover. */
export function seasonInputs(plantings: { crop: CropKey; acres: number }[], prices?: Record<string, number>): { total: number; lines: { crop: CropKey; cost: number }[] } {
  const lines = plantings.map((p) => {
    const b = budgetFor(p.crop, p.acres, { prices, pricePerKg: 0 });
    return { crop: p.crop, cost: b.lines.filter((l) => l.key === "seed" || l.key === "dap" || l.key === "can").reduce((s, l) => s + l.cost, 0) };
  });
  return { total: lines.reduce((s, l) => s + l.cost, 0), lines };
}

/** The services a farmer most likely wants, ticked by default in the join sheet. */
export const DEFAULT_INTERESTS: SaccoService[] = ["input_credit", "inputs_shop", "asset_finance"];

/* ── the farmer's join requests ── */
export type MySacco = { id: string; token: string; reference: string; sacco_id: string; name: string; town: string; county: string; created: string };
export type SaccoStore = { v: 1; applications: MySacco[] };
export const SACCOS_KEY = "ko-saccos";
export const EMPTY_SACCOS: SaccoStore = { v: 1, applications: [] };
const MAX = 20;

export function sanitizeSaccos(raw: any): SaccoStore {
  if (!raw || typeof raw !== "object") return EMPTY_SACCOS;
  const s = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
  const applications = (Array.isArray(raw.applications) ? raw.applications : [])
    .map((a: any): MySacco | null => {
      if (!a || !s(a.id, 64) || !s(a.token, 64) || !s(a.reference, 16) || !s(a.sacco_id, 60) || !s(a.name, 120)) return null;
      return { id: a.id, token: a.token, reference: a.reference, sacco_id: a.sacco_id, name: a.name, town: s(a.town, 40) ?? "", county: s(a.county, 40) ?? "", created: s(a.created, 40) ?? "" };
    })
    .filter((a: MySacco | null): a is MySacco => !!a)
    .slice(-MAX);
  return { v: 1, applications };
}

