/**
 * Calendar-day helpers. Farm dates are local "YYYY-MM-DD" keys (no time, no
 * zone), so a task due "today" stays today however the phone's clock drifts.
 * Day and month names come from our own tables, not Intl (patchy on Android).
 */
import type { Lang } from "./i18n";

const pad = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dateKey(new Date());

/** Local midnight for a key. */
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

/** Whole days from a to b (b later → positive). DST-safe via rounding. */
export const daysBetween = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);

const DAYS: Record<Lang, string[]> = {
  sw: ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const DAYS_SHORT: Record<Lang, string[]> = {
  sw: ["Jpl", "Jtt", "Jnn", "Jtn", "Alh", "Ijm", "Jms"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const MONTHS_SHORT: Record<Lang, string[]> = {
  sw: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

export const weekday = (lang: Lang, k: string) => DAYS[lang][fromKey(k).getDay()];
export const weekdayShort = (lang: Lang, k: string) => DAYS_SHORT[lang][fromKey(k).getDay()];

/** "5 Oct" / "5 Okt" */
export const dayMonth = (lang: Lang, k: string) => {
  const d = fromKey(k);
  return `${d.getDate()} ${MONTHS_SHORT[lang][d.getMonth()]}`;
};

/** "Monday 5 Oct" */
export const longDay = (lang: Lang, k: string) => `${weekday(lang, k)} ${dayMonth(lang, k)}`;
