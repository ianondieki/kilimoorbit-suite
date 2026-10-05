/**
 * Fall armyworm scouting, the way FAO's FAMEWS app and CIMMYT's field guide
 * teach it to African smallholders: walk the field in a W, stop five times,
 * check 10 plants at each stop, and count the plants with fresh damage
 * (ragged "window-pane" leaves, fresh frass in the whorl, or a caterpillar).
 *
 * Action thresholds (CIMMYT FAW guide, Prasanna et al. 2018): about 20 % of
 * plants with fresh damage in the first 2½ weeks, about 40 % from 3 weeks to
 * tasselling. After tasselling, spraying rarely pays; the cobs are what to
 * watch. Pure functions only, unit-tested in e2e/logic.spec.ts.
 *
 * The push-pull planner follows icipe's Climate-Smart Push-Pull primer:
 * maize plots of at most 50 × 50 m (not under 15 × 15 m), three rows of
 * Napier (or Brachiaria Mulato II) all round, 75 cm apart with plants 50 cm
 * apart, desmodium drilled between the maize rows at about 1 kg of seed an
 * acre, and the first maize row 1 m in from the border.
 */
import { SQ_M_PER_ACRE } from "./agronomy";
import { daysBetween } from "./dates";

export const STOPS = 5;
export const PER_STOP = 10;
/** Maize tassels at about day 60 in the crop calendar (lib/agronomy.ts). */
export const TASSEL_DAY = 60;

export type ScoutStage = "early" | "whorl" | "late";
export const stageOf = (ageDays: number | null): ScoutStage =>
  ageDays == null ? "whorl" : ageDays <= 17 ? "early" : ageDays <= TASSEL_DAY ? "whorl" : "late";

/** % of plants with fresh damage at which to act, for a crop this many days old. */
export const thresholdFor = (ageDays: number | null) => (ageDays != null && ageDays <= 17 ? 20 : 40);

export type Scout = { id: string; plantingId?: string; date: string; plants: number; hit: number; ageDays: number | null };

export type Verdict = {
  pct: number;
  threshold: number;
  stage: ScoutStage;
  /** Above the threshold in the whorl stages: act now. */
  act: boolean;
  /** Close to it (within 10 points): scout again sooner. */
  near: boolean;
};

export function verdict(plants: number, hit: number, ageDays: number | null): Verdict | null {
  if (!(plants > 0) || !(hit >= 0) || hit > plants || !Number.isFinite(plants + hit)) return null;
  const pct = Math.round((hit / plants) * 100);
  const threshold = thresholdFor(ageDays);
  const stage = stageOf(ageDays);
  const act = stage !== "late" && pct >= threshold;
  return { pct, threshold, stage, act, near: !act && stage !== "late" && pct >= threshold - 10 };
}

/** The crop's age on a day, from its planting date (null before planting). */
export const ageOn = (plantedOn: string, day: string) => {
  const n = daysBetween(plantedOn, day);
  return n >= 0 ? n : null;
};

/** A planting's scouting history, newest first. */
export const scoutsFor = (scouts: Scout[], plantingId: string) =>
  scouts.filter((s) => s.plantingId === plantingId).sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

/* ── push-pull planner ── */
export const PP_MAX_SIDE_M = 50;
export const PP_MIN_SIDE_M = 15;
export const DESMODIUM_KG_PER_ACRE = 1;

export type PushPullPlan = {
  /** Plots of at most 50 × 50 m the land is split into. */
  plots: number;
  /** Side of each (square) plot, metres. */
  side: number;
  /** Napier splits or canes for three border rows, 50 cm apart. */
  napier: number;
  /** Brachiaria planting holes instead (30 cm apart), 5–6 seeds each. */
  brachiaria: number;
  desmodiumKg: number;
};

/** null when the land is smaller than one 15 × 15 m plot. */
export function pushPullPlan(acres: number): PushPullPlan | null {
  if (!(acres > 0) || !Number.isFinite(acres)) return null;
  const area = acres * SQ_M_PER_ACRE;
  if (area < PP_MIN_SIDE_M * PP_MIN_SIDE_M) return null;
  const plots = Math.ceil(area / (PP_MAX_SIDE_M * PP_MAX_SIDE_M));
  const side = Math.sqrt(area / plots);
  // Three border rows, 75 cm apart, around each plot.
  const rowMetres = [0, 1, 2].reduce((s, i) => s + 4 * (side + 2 * 0.75 * (i + 1)), 0);
  return {
    plots,
    side: Math.round(side),
    napier: Math.round((plots * rowMetres) / 0.5 / 10) * 10,
    brachiaria: Math.round((plots * rowMetres) / 0.3 / 10) * 10,
    desmodiumKg: Math.max(0.25, Math.round(acres * DESMODIUM_KG_PER_ACRE * 4) / 4),
  };
}
