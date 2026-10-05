/**
 * Pure helpers for farm shows (no React, no storage): how dates read, the
 * Google Calendar link (mirrors the server's, so it works offline), and the
 * farmer's bookings record cleaned on load. Unit-tested in e2e/logic.spec.ts.
 */
import type { Show } from "./api";
import { addDays, dayMonth, daysBetween } from "./dates";
import type { Lang } from "./i18n";

/** "7–10 Oct" / "28 Sep – 4 Oct". */
export function whenText(lang: Lang, start: string, end: string): string {
  if (start === end) return dayMonth(lang, start);
  const a = dayMonth(lang, start);
  const b = dayMonth(lang, end);
  const sameMonth = a.split(" ")[1] === b.split(" ")[1];
  return sameMonth ? `${a.split(" ")[0]}–${b}` : `${a} – ${b}`;
}

export const onNow = (s: Pick<Show, "start" | "end">, today: string) => s.start <= today && s.end >= today;

export function googleCalendarUrl(s: Pick<Show, "name" | "start" | "end" | "venue" | "town" | "organiser" | "url" | "estimated">): string {
  const compact = (k: string) => k.replace(/-/g, "");
  const where = [s.venue, s.town, "Kenya"].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: s.name,
    dates: `${compact(s.start)}/${compact(addDays(s.end, 1))}`, // all-day: the end is exclusive
    details: [s.organiser, s.url, s.estimated ? "Dates estimated from last year's calendar; confirm with the organiser." : ""].filter(Boolean).join("\n"),
    location: where,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* ── the farmer's bookings ── */
export type MyBooking = {
  id: string; token: string; event_id: string; name: string; start: string; end: string; town: string;
  calendar_url: string; remind_on: string; email: "SENT" | "SIMULATED" | "NONE" | "FAILED"; created: string;
};
export type BookingsStore = { v: 1; bookings: MyBooking[] };
export const EMPTY_BOOKINGS: BookingsStore = { v: 1, bookings: [] };
export const MAX_BOOKINGS = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Drops anything malformed rather than crashing on a hand-edited or old store. */
export function sanitizeBookings(raw: any): BookingsStore {
  if (!raw || typeof raw !== "object") return EMPTY_BOOKINGS;
  const str = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
  const bookings = (Array.isArray(raw.bookings) ? raw.bookings : [])
    .map((b: any): MyBooking | null => {
      if (!b || !str(b.id, 64) || !str(b.token, 64) || !str(b.event_id, 60) || !str(b.name, 120) || !DAY.test(String(b.start)) || !DAY.test(String(b.end))) return null;
      if (!str(b.calendar_url, 1500)?.startsWith("https://")) return null;
      return {
        id: b.id, token: b.token, event_id: b.event_id, name: b.name, start: b.start, end: b.end, town: str(b.town, 40) ?? "",
        calendar_url: b.calendar_url, remind_on: DAY.test(String(b.remind_on)) ? b.remind_on : b.start,
        email: ["SENT", "SIMULATED", "NONE", "FAILED"].includes(b.email) ? b.email : "NONE",
        created: str(b.created, 40) ?? "",
      };
    })
    .filter((b: MyBooking | null): b is MyBooking => !!b)
    .slice(-MAX_BOOKINGS);
  return { v: 1, bookings };
}

/** Bookings for shows that have not ended, soonest first. */
export const upcomingBookings = (list: MyBooking[], today: string) =>
  list.filter((b) => b.end >= today).sort((a, b) => a.start.localeCompare(b.start));

export const daysUntil = (today: string, start: string) => daysBetween(today, start);
