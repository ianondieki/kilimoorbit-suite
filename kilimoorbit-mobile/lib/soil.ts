/**
 * Soil acidity and lime. Much of western and central Kenya (and the wider
 * East African highlands) has soil below pH 5.5, where aluminium becomes
 * toxic to roots and fertiliser is wasted; most crops do best near 6–6.5.
 *
 * Rates follow Kenyan trial results: about 1 t/ha of agricultural lime where
 * pH is 5.0–5.5 and about 2 t/ha below 5.0, broadcast and dug in before
 * planting (2 t/ha kept pH at or above 5.5 for about two years in western
 * Kenya trials), or "microdosing" about 0.25 t/ha in the planting holes when
 * cash is short (One Acre Fund trials). Potatoes tolerate acid soil and
 * liming raises the risk of common scab, so they are limed only below 5.0.
 * A soil test is the real answer; the app says so. Pure functions only.
 *
 * NOTE: rates should be reviewed by an extension officer / soil lab.
 */
import type { CropKey } from "./agronomy";

export const KG_PER_ACRE_PER_T_HA = 1000 / 2.471;
export const LIME_BAG_KG = 50;

export type LimeAdvice =
  | { kind: "unknown" }
  | { kind: "none"; ph: number }
  | { kind: "lime"; ph: number; kgPerAcre: number; kg: number; bags: number; microKg: number };

const roundTo = (n: number, to: number) => Math.round(n / to) * to;

export function limeAdvice(ph: number | null | undefined, crop: CropKey, acres: number): LimeAdvice {
  if (ph == null || !Number.isFinite(ph) || ph < 3 || ph > 9) return { kind: "unknown" };
  const limit = crop === "potatoes" ? 5.0 : 5.5;
  if (ph >= limit) return { kind: "none", ph };
  const tHa = ph < 5.0 ? 2 : 1;
  const kgPerAcre = roundTo(tHa * KG_PER_ACRE_PER_T_HA, 50);
  const a = Number.isFinite(acres) && acres > 0 ? acres : 1;
  const kg = roundTo(kgPerAcre * a, 25);
  return {
    kind: "lime", ph, kgPerAcre, kg,
    bags: Math.max(0.5, Math.round((kg / LIME_BAG_KG) * 2) / 2),
    microKg: roundTo(0.25 * KG_PER_ACRE_PER_T_HA * a, 5),
  };
}

/** pH words for the farm profile. */
export const phBand = (ph: number): "veryAcid" | "acid" | "good" | "alkaline" =>
  ph < 5.0 ? "veryAcid" : ph < 5.5 ? "acid" : ph <= 7.5 ? "good" : "alkaline";
