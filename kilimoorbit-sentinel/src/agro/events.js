/**
 * Agricultural shows near the farmer, and the booking agent that puts one in
 * their calendar and reminds them.
 *
 * The calendar is the Agricultural Society of Kenya's published 2026 show
 * calendar (ask.co.ke/calendar-of-events1) plus the three big Nairobi expos.
 * A show whose dates have passed is projected to the same dates next year and
 * marked `estimated`, so the list stays useful all year; the app tells the
 * farmer to confirm with the organiser. Distances are from the farmer's
 * county centre (src/agro/weather.js COUNTIES) to the show's county centre.
 *
 * The list puts shows starting within SOON_DAYS first (soonest first), then
 * the rest nearest first: a show next week matters more than next year's.
 *
 * Booking is a small deterministic agent chain (scout → planner → messenger
 * → reminder): it builds the calendar entry (.ics and a Google Calendar
 * link), emails a confirmation when SMTP is configured (SIMULATED otherwise,
 * like sign-in), and stores the reminder so the scheduler in server.js can
 * send it on the day. Bookings are kept in a JSON file (like the Soko store)
 * so reminders survive a restart.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { COUNTIES, addDays, eatDateKey, findCounty } from "./weather.js";

export const ASK_URL = "https://ask.co.ke/calendar-of-events1/";
export const SOON_DAYS = 60;

const ask = (id, name, town, county, start, end, extra = {}) =>
  ({ id, name, organiser: "Agricultural Society of Kenya", town, county, venue: `${town} Showground`, start, end, kind: "show", url: ASK_URL, ...extra });

export const EVENTS = [
  { id: "aae-2026", name: "Africa Agri Expo", organiser: "Africa Agri Expo", town: "Nairobi", county: "Nairobi", venue: "KICC", start: "2026-02-11", end: "2026-02-12", kind: "expo", url: "https://www.africa-agriexpo.com" },
  ask("ask-eldoret-2026", "Eldoret National Show", "Eldoret", "Uasin Gishu", "2026-03-04", "2026-03-08"),
  ask("ask-embu-2026", "Eastern Kenya Branch Show", "Embu", "Embu", "2026-03-12", "2026-03-14"),
  ask("ask-nanyuki-2026", "Mt. Kenya Branch Show", "Nanyuki", "Laikipia", "2026-05-20", "2026-05-23"),
  ask("ask-machakos-2026", "South Eastern Kenya National Show", "Machakos", "Machakos", "2026-06-03", "2026-06-07"),
  ask("ask-kakamega-2026", "Western Kenya Branch Show", "Kakamega", "Kakamega", "2026-06-10", "2026-06-13"),
  ask("ask-meru-2026", "Meru National Show", "Meru", "Meru", "2026-06-17", "2026-06-20"),
  { id: "agritec-2026", name: "Agritec Africa · Dairy, Livestock & Poultry Expo", organiser: "Agritec Africa", town: "Nairobi", county: "Nairobi", venue: "KICC", start: "2026-06-17", end: "2026-06-19", kind: "expo", url: "https://www.agritecafrica.com" },
  ask("ask-nakuru-2026", "Nakuru National Agricultural Show", "Nakuru", "Nakuru", "2026-07-01", "2026-07-05"),
  ask("ask-kisii-2026", "Southern Kenya Branch Show", "Kisii", "Kisii", "2026-07-09", "2026-07-12"),
  { id: "farmtech-2026", name: "Africa FarmTech Expo", organiser: "Africa FarmTech Expo", town: "Nairobi", county: "Nairobi", venue: "Nairobi", start: "2026-07-15", end: "2026-07-17", kind: "expo", url: "https://www.africafarmtechexpo.com" },
  ask("ask-kisumu-2026", "Kisumu National Show", "Kisumu", "Kisumu", "2026-07-22", "2026-07-26"),
  ask("ask-mombasa-2026", "Mombasa International Show", "Mombasa", "Mombasa", "2026-09-02", "2026-09-06"),
  ask("ask-nyeri-2026", "Central Kenya National Show", "Nyeri", "Nyeri", "2026-09-09", "2026-09-12"),
  ask("ask-kabarnet-2026", "Baringo Branch Show", "Kabarnet", "Baringo", "2026-09-17", "2026-09-19"),
  ask("ask-migori-2026", "South Western Kenya Branch Show", "Migori", "Migori", "2026-09-24", "2026-09-27"),
  ask("ask-nairobi-2026", "Nairobi International Trade Fair", "Nairobi", "Nairobi", "2026-09-28", "2026-10-04", { venue: "Jamhuri Park" }),
  ask("ask-kitale-2026", "Kitale National Show", "Kitale", "Trans Nzoia", "2026-10-07", "2026-10-10"),
  ask("ask-ploughing-2026", "National Ploughing Contest", "Eldoret", "Uasin Gishu", "2026-11-20", "2026-11-21", { kind: "contest", venue: "Eldoret" }),
];
export const THEME_2026 = "Promoting Climate Smart Agriculture and Trade Initiatives for Sustainable Economic Growth";

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));
export const findEvent = (id) => BY_ID.get(String(id ?? "")) ?? null;

/* ── dates and distance ── */
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400_000);
const plusYears = (key, n) => `${Number(key.slice(0, 4)) + n}${key.slice(4)}`;

/** The event's next occurrence on or after `today`: as published, or the same dates in a later year (`estimated`). */
export function upcoming(ev, today) {
  for (let n = 0; n < 4; n++) {
    const start = plusYears(ev.start, n);
    const end = plusYears(ev.end, n);
    if (end >= today) return { ...ev, start, end, estimated: n > 0, days_until: daysBetween(today, start) };
  }
  return null;
}

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Upcoming shows within `maxDays`: those within SOON_DAYS first (soonest
 * first), then the rest nearest first. `null` for an unknown county.
 * `days_until` is negative while a show is on.
 */
export function eventsNear(countyName, { now = new Date(), limit = 8, maxDays = 365 } = {}) {
  const county = findCounty(countyName);
  if (!county) return null;
  const today = eatDateKey(now);
  const list = EVENTS
    .map((ev) => upcoming(ev, today))
    .filter((ev) => ev && ev.days_until <= maxDays)
    .map((ev) => {
      const at = findCounty(ev.county) ?? COUNTIES.find((c) => c.name === "Nairobi");
      return { ...ev, distance_km: Math.round(distanceKm(county, at)) };
    })
    .sort((a, b) => {
      const sa = a.days_until <= SOON_DAYS, sb = b.days_until <= SOON_DAYS;
      if (sa !== sb) return sa ? -1 : 1;
      return sa ? a.start.localeCompare(b.start) || a.distance_km - b.distance_km : a.distance_km - b.distance_km || a.start.localeCompare(b.start);
    })
    .slice(0, limit);
  return { county: county.name, today, theme: THEME_2026, source: "ASK 2026 calendar", events: list };
}

/* ── calendar entries ── */
const compact = (key) => key.replace(/-/g, "");
const where = (ev) => [ev.venue, ev.town, "Kenya"].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");

/** A Google Calendar "add event" link: opens the Calendar app with the show filled in; the farmer taps Save. */
export function googleCalendarUrl(ev) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.name,
    dates: `${compact(ev.start)}/${compact(addDays(ev.end, 1))}`, // all-day: the end is exclusive
    details: [ev.organiser, ev.url, ev.estimated ? "Dates estimated from last year's calendar; confirm with the organiser." : ""].filter(Boolean).join("\n"),
    location: where(ev),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

/** An iCalendar file (any calendar app) with a reminder `remindDays` before, at 7 am. */
export function icsFor(ev, { uid = `${ev.id}-${ev.start}@kilimoorbit`, remindDays = 3, now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KilimoOrbit//Farm shows//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(ev.start)}`, `DTEND;VALUE=DATE:${compact(addDays(ev.end, 1))}`,
    `SUMMARY:${icsText(ev.name)}`, `LOCATION:${icsText(where(ev))}`,
    `DESCRIPTION:${icsText([ev.organiser, ev.url, ev.estimated ? "Dates estimated; confirm with the organiser." : ""].filter(Boolean).join("\n"))}`,
    ...(ev.url ? [`URL:${ev.url}`] : []),
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(ev.name)}`, `TRIGGER:-P${Math.max(0, remindDays)}DT17H`, "END:VALARM", // 7 am local, N days before
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

/* ── the booking agent and its store ── */
export const REMIND_CHOICES = [1, 3, 7];
export const MAX_BOOKINGS = 2000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const maskEmail = (e) => { const at = e.indexOf("@"); return at < 1 ? "•••" : `${e[0]}•••${e.slice(at)}`; };

/** Validates a booking request. Returns { input } or { error, fields }. */
export function validateBooking(body, now = new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A JSON booking is required.", fields: [] };
  const fields = [];
  const base = findEvent(body.event_id);
  const ev = base ? upcoming(base, eatDateKey(now)) : null;
  if (!ev) fields.push("event_id");
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name) fields.push("name");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !EMAIL_RE.test(email)) fields.push("email");
  const remind = body.remind_days === undefined ? 3 : body.remind_days;
  if (!REMIND_CHOICES.includes(remind)) fields.push("remind_days");
  const county = typeof body.county === "string" && findCounty(body.county) ? findCounty(body.county).name : null;
  if (fields.length) return { error: `Invalid booking: ${fields.join(", ")}.`, fields };
  return { input: { event: ev, name, email: email || null, remind_days: remind, county } };
}

export function createBookings({ storePath, now = () => new Date() } = {}) {
  const dataDir = storePath ? dirname(storePath) : null;
  let db = { bookings: [] };
  if (storePath && existsSync(storePath)) {
    try { db = { bookings: JSON.parse(readFileSync(storePath, "utf8")).bookings ?? [] }; }
    catch (err) {
      const quarantine = `${storePath}.corrupt-${Date.now()}`;
      try { renameSync(storePath, quarantine); } catch {}
      console.error(`[events] bookings unreadable (${err?.message}); moved to ${quarantine}`);
    }
  }
  function write() {
    if (!storePath) return;
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const tmp = `${storePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, storePath);
  }

  return {
    /** Runs the agent chain for a validated booking; `mailer(msg)` sends or throws. */
    async book(input, { mailer = null } = {}) {
      const t0 = now();
      const { event, name, email, remind_days, county } = input;
      const steps = [];
      const step = (agent, action, output) => steps.push({ agent, action, output, latency_ms: Math.max(1, now().getTime() - t0.getTime()) });

      step("Scout", `Found ${event.name}`, { start: event.start, end: event.end, town: event.town, estimated: event.estimated });
      const id = randomUUID();
      const ics = icsFor(event, { uid: `${id}@kilimoorbit`, remindDays: remind_days, now: t0 });
      const calendar_url = googleCalendarUrl(event);
      step("Planner", "Prepared the calendar entry (.ics and a Google Calendar link)", { calendar_url });

      const remind_on = addDays(event.start, -remind_days);
      let emailStatus = "NONE";
      if (email) {
        const msg = {
          to: email,
          subject: `${event.name}: ${event.start} to ${event.end}, ${event.town}`,
          text: `Habari ${name},\n\nYou asked KilimoOrbit to put ${event.name} in your calendar.\n\nWhen: ${event.start} to ${event.end}${event.estimated ? " (dates estimated from last year's calendar; confirm with the organiser)" : ""}\nWhere: ${where(event)}\nOrganiser: ${event.organiser}${event.url ? `\nMore: ${event.url}` : ""}\n\nThe attached file adds it to any calendar app, or open: ${calendar_url}\n\nWe will email you a reminder on ${remind_on}.\n\nKilimoOrbit`,
          attachments: [{ filename: "farm-show.ics", content: ics, contentType: "text/calendar; method=PUBLISH" }],
        };
        if (mailer) {
          try { await mailer(msg); emailStatus = "SENT"; }
          catch (err) { emailStatus = "FAILED"; step("Messenger", `Could not send the confirmation to ${maskEmail(email)}`, { error: String(err?.message ?? err).slice(0, 120) }); }
        } else {
          emailStatus = "SIMULATED";
          console.log(`[events] SIMULATED confirmation to ${maskEmail(email)} for ${event.name}`);
        }
        if (emailStatus !== "FAILED") step("Messenger", `${emailStatus === "SENT" ? "Sent" : "Simulated (no SMTP configured)"} the confirmation email to ${maskEmail(email)}`, { email: emailStatus });
      } else {
        step("Messenger", "No email given: the calendar reminder is the reminder", { email: emailStatus });
      }

      const booking = {
        id, token: randomBytes(12).toString("hex"), created_at: t0.toISOString(),
        event_id: event.id, event_name: event.name, start: event.start, end: event.end, town: event.town, estimated: !!event.estimated,
        name, email, county, remind_days, remind_on, reminder: email ? "SCHEDULED" : "CALENDAR",
      };
      db.bookings.push(booking);
      if (db.bookings.length > MAX_BOOKINGS) db.bookings.splice(0, db.bookings.length - MAX_BOOKINGS);
      write();
      step("Reminder", email ? `Reminder email scheduled for ${remind_on} (${remind_days} day${remind_days > 1 ? "s" : ""} before)` : `Calendar alarm set for ${remind_on}`, { remind_on });

      return {
        booking_id: id, token: booking.token, status: "BOOKED", event: { ...event }, calendar_url, ics,
        email: emailStatus, remind_on, steps,
      };
    },

    /** Email reminders due on or before today and not yet sent (at most two days late). */
    due(at = now()) {
      const today = eatDateKey(at);
      const floor = addDays(today, -2);
      return db.bookings.filter((b) => b.reminder === "SCHEDULED" && b.email && b.remind_on <= today && b.remind_on >= floor);
    },
    markReminder(id, state) {
      const b = db.bookings.find((x) => x.id === id);
      if (!b) return;
      b.reminder = state;
      b.reminded_at = now().toISOString();
      write();
    },
    /** Cancels a booking (and its reminder) with the token handed out at booking time. */
    cancel(id, token) {
      const b = db.bookings.find((x) => x.id === id);
      if (!b) return "missing";
      if (b.token !== token) return "forbidden";
      db.bookings = db.bookings.filter((x) => x.id !== id);
      write();
      return "ok";
    },
    get size() { return db.bookings.length; },
  };
}

/** The reminder email for a stored booking. */
export function reminderMessage(b) {
  const ev = findEvent(b.event_id);
  const days = daysBetween(b.remind_on, b.start);
  return {
    to: b.email,
    subject: `${b.event_name} starts ${days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
    text: `Habari ${b.name},\n\nA reminder from KilimoOrbit: ${b.event_name} runs ${b.start} to ${b.end} in ${b.town}${b.estimated ? " (estimated dates; confirm with the organiser)" : ""}.${ev?.url ? `\n\nMore: ${ev.url}` : ""}\n\nKaribu!\nKilimoOrbit`,
  };
}
