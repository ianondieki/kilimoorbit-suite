/**
 * Kenyan agricultural seasons derived from the calendar date alone (no data):
 *   Kiangazi (hot, dry)   Jan–Feb
 *   Masika   (long rains) Mar–May
 *   Kipupwe  (cool, dry)  Jun–Sep
 *   Vuli     (short rains) Oct–Dec
 * No countdowns and no risk claims — this is orientation, not a forecast.
 */
import { MONTHS, type Lang } from "./i18n";

export type SeasonKey = "kiangazi" | "masika" | "kipupwe" | "vuli";

export const SEASON_ORDER: SeasonKey[] = ["kiangazi", "masika", "kipupwe", "vuli"];
export const SEASON_START: Record<SeasonKey, number> = { kiangazi: 0, masika: 2, kipupwe: 5, vuli: 9 };

export function seasonOfMonth(m: number): SeasonKey {
  if (m <= 1) return "kiangazi";
  if (m <= 4) return "masika";
  if (m <= 8) return "kipupwe";
  return "vuli";
}

export const isRainy = (k: SeasonKey) => k === "masika" || k === "vuli";

export type Season = {
  key: SeasonKey;
  index: number;
  next: SeasonKey;
  nextStartMonth: number;
  monthIndex: number;
  /** Fraction of the current month elapsed, 0..1 */
  dayFrac: number;
  day: number;
  year: number;
};

export function seasonFor(date: Date = new Date()): Season {
  const monthIndex = date.getMonth();
  const key = seasonOfMonth(monthIndex);
  const index = SEASON_ORDER.indexOf(key);
  const next = SEASON_ORDER[(index + 1) % 4];
  const daysInMonth = new Date(date.getFullYear(), monthIndex + 1, 0).getDate();
  return {
    key,
    index,
    next,
    nextStartMonth: SEASON_START[next],
    monthIndex,
    dayFrac: (date.getDate() - 1) / daysInMonth,
    day: date.getDate(),
    year: date.getFullYear(),
  };
}

/** Month names from our own dictionary (not Intl, which is patchy on Android). */
export const monthName = (lang: Lang, i: number) => MONTHS[lang][((i % 12) + 12) % 12];
