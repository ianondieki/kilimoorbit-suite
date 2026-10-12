/**
 * Pure helpers for the daftari (records) by email: the season window, the
 * entries in a period and the one-line summary of an entry. No React and no
 * storage, so e2e/logic.spec.ts can test them in plain Node; the builder,
 * the preference and the sending live in lib/digest-store.ts.
 */
import { dayMonth } from "./dates";
import { SEASON_START, seasonFor } from "./season";
import type { Entry } from "./farm-types";
import { trMaybe, type Key, type Lang, type Vars } from "./i18n";

export type TT = (k: Key, v?: Vars) => string;

/** The first day of the current season (the Records tab's "this season"). */
export function seasonStartKey(now = new Date()): string {
  const s = seasonFor(now);
  const d = new Date(s.year, SEASON_START[s.key], 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Entries in the period, newest first. */
export function periodEntries(entries: Entry[], period: "season" | "all", from = seasonStartKey()): Entry[] {
  return [...entries]
    .filter((e) => period === "all" || e.date >= from)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/** One line for the entry just recorded: "Costs · Fertiliser · Maize · KES 3,500 · 12 Oct". */
export function entryLine(lang: Lang, tt: TT, e: Entry): string {
  return [
    tt(e.kind === "income" ? "rec.income" : "rec.expense"),
    tt(`rec.cat.${e.category}` as Key),
    // The crop's name in the farmer's language (lib/prices.ts cropName, without that module's store).
    e.crop ? trMaybe(lang, `crop.${e.crop}`) ?? e.crop.charAt(0).toUpperCase() + e.crop.slice(1) : null,
    `KES ${Math.round(e.amount).toLocaleString("en-KE")}${e.kg ? ` (${e.kg.toLocaleString("en-KE")} kg)` : ""}`,
    dayMonth(lang, e.date),
  ].filter(Boolean).join(" · ");
}
