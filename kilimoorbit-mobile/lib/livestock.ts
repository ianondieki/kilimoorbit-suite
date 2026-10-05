/**
 * Livestock (mifugo) logic, iCow-style: breeding calendars from the last
 * service, health reminders (deworming, tick control, chick vaccinations) and
 * milk totals. Pure functions only (no storage, no React Native), so they are
 * unit-tested directly (e2e/logic.spec.ts).
 *
 * Intervals are typical East African extension figures (cow gestation ~283
 * days, goat ~150, sheep ~147, pig 114; heat every 21 days, 17 for sheep;
 * deworm every 3 months; weekly tick control where East Coast Fever is a
 * risk; a common Newcastle / Gumboro / fowl pox schedule). Breeds, vets and
 * vaccine labels differ, and the app says so where these appear.
 *
 * NOTE: Kiswahili must be reviewed by a native Kenyan speaker, and the
 * schedules by a veterinary officer, before release.
 */
import { addDays, daysBetween } from "./dates";
import type { L } from "./agronomy";

export type Species = "cow" | "goat" | "sheep" | "pig" | "chicken";
export const SPECIES: Species[] = ["cow", "goat", "sheep", "pig", "chicken"];

export type EventKind = "served" | "notPregnant" | "birth" | "dewormed" | "ticks" | "vaccinated";
export const EVENT_KINDS: EventKind[] = ["served", "notPregnant", "birth", "dewormed", "ticks", "vaccinated"];
export type AnimalEvent = { id: string; kind: EventKind; date: string; note?: string };

export type Animal = {
  id: string;
  species: Species;
  name: string;
  female: boolean;
  /** Birth date; for a chicken flock, the hatch date (drives the vaccine schedule). */
  born?: string;
  /** Flocks only. */
  count?: number;
  events: AnimalEvent[];
};

export type MilkEntry = { id: string; animalId: string; date: string; litres: number };

type Spec = { emoji: string; cycle?: number; gestation?: number; milk?: boolean; ticks?: boolean };
export const SPEC: Record<Species, Spec> = {
  cow: { emoji: "🐄", cycle: 21, gestation: 283, milk: true, ticks: true },
  goat: { emoji: "🐐", cycle: 21, gestation: 150, milk: true, ticks: true },
  sheep: { emoji: "🐑", cycle: 17, gestation: 147, ticks: true },
  pig: { emoji: "🐖", cycle: 21, gestation: 114 },
  chicken: { emoji: "🐔" },
};

export const DEWORM_DAYS = 90;
export const TICK_DAYS = 7;
/** A cow or goat counts as "in milk" for a standard 305-day lactation. */
export const LACTATION_DAYS = 305;

/** Which events a species can record (the card's "Record" chips). */
export function eventsFor(a: Pick<Animal, "species" | "female">): EventKind[] {
  if (a.species === "chicken") return ["vaccinated", "dewormed"];
  const health: EventKind[] = SPEC[a.species].ticks ? ["dewormed", "ticks"] : ["dewormed"];
  return a.female ? ["served", "notPregnant", "birth", ...health] : health;
}

/** Latest date of an event kind ("" when none). Dates are YYYY-MM-DD, so string order is date order. */
export const lastOf = (a: Animal, kind: EventKind) =>
  a.events.reduce((m, e) => (e.kind === kind && e.date > m ? e.date : m), "");

/* ── status ── */
export type Status =
  | { kind: "pregnant"; served: string; due: string; day: number; of: number }
  | { kind: "milking"; since: string }
  | { kind: "open"; lastBirth?: string }
  | { kind: "male" }
  | { kind: "flock"; ageDays: number | null; count: number };

/**
 * The service that counts: the latest one with no birth or "not pregnant"
 * recorded after it. Same-day events keep the order they were recorded in
 * (on heat → "not pregnant" → served again, all on one day, is common).
 */
export function currentService(a: Animal): string {
  const key = (e: AnimalEvent, i: number) => `${e.date}#${String(i).padStart(6, "0")}`;
  let served: AnimalEvent | null = null;
  let servedKey = "";
  a.events.forEach((e, i) => {
    if (e.kind === "served" && key(e, i) > servedKey) { served = e; servedKey = key(e, i); }
  });
  if (!served) return "";
  const ended = a.events.some((e, i) => (e.kind === "birth" || e.kind === "notPregnant") && key(e, i) > servedKey);
  return ended ? "" : (served as AnimalEvent).date;
}

export function statusOf(a: Animal, today: string): Status {
  if (a.species === "chicken")
    return { kind: "flock", ageDays: a.born ? Math.max(0, daysBetween(a.born, today)) : null, count: a.count ?? 0 };
  if (!a.female) return { kind: "male" };
  const g = SPEC[a.species].gestation!;
  const served = currentService(a);
  if (served) {
    const day = daysBetween(served, today);
    // Three weeks past the due date with no birth recorded: stop claiming a pregnancy.
    if (day >= 0 && day <= g + 21) return { kind: "pregnant", served, due: addDays(served, g), day, of: g };
  }
  const birth = lastOf(a, "birth");
  if (birth && SPEC[a.species].milk && daysBetween(birth, today) <= LACTATION_DAYS) return { kind: "milking", since: birth };
  return { kind: "open", ...(birth ? { lastBirth: birth } : null) };
}

/* ── reminders ── */
export type Reminder = {
  /** Unique within the animal; anchored to the event it follows, so a new cycle gets new ids. */
  id: string;
  animalId: string;
  due: string;
  kind: "breeding" | "health";
  title: L;
  /** Health reminders shared across animals have a short title for Today's grouped row. */
  short?: L;
  /** Ticking it records this event (so the next one is scheduled from it); else it is just marked done. */
  records?: EventKind;
};

const T = {
  heat: { en: "Watch {name} for heat: if on heat, she isn't pregnant (serve again)", sw: "Mwangalie {name} kama ana joto: akiwa na joto hana mimba (mpandishe tena)" },
  pd: { en: "Ask the vet to confirm {name} is in calf", sw: "Mwite daktari wa mifugo athibitishe {name} ana mimba" },
  dry: { en: "Dry off {name} and start steaming up: 2 months to calving", sw: "Acha kumkamua {name} na anza chakula cha ziada: miezi 2 kabla ya kuzaa" },
  steam: { en: "Start steaming up {name}: extra feed before birth", sw: "Anza kumpa {name} chakula cha ziada kabla ya kuzaa" },
  penCow: { en: "Prepare a clean, dry calving pen for {name}", sw: "Andaa banda safi na kavu la kuzalia kwa {name}" },
  penPig: { en: "Move {name} to a clean farrowing pen", sw: "Mhamishe {name} kwenye banda safi la kuzalia" },
  birth: {
    cow: { en: "{name} due to calve", sw: "{name} anatarajiwa kuzaa" },
    goat: { en: "{name} due to kid", sw: "{name} anatarajiwa kuzaa" },
    sheep: { en: "{name} due to lamb", sw: "{name} anatarajiwa kuzaa" },
    pig: { en: "{name} due to farrow", sw: "{name} anatarajiwa kuzaa" },
  } as Record<Exclude<Species, "chicken">, L>,
  colostrum: { en: "Give {name}'s calf colostrum within 6 hours of birth", sw: "Mpe ndama wa {name} maziwa ya kwanza (dang'a) ndani ya saa 6" },
  serveCow: { en: "Watch {name} for heat: serve again 60–90 days after calving", sw: "Mwangalie {name} kama ana joto: mpandishe tena siku 60–90 baada ya kuzaa" },
  wean: { en: "Wean {name}'s young at 3–4 months", sw: "Achisha watoto wa {name} kunyonya wakiwa na miezi 3–4" },
  weanPig: { en: "Wean {name}'s piglets (6–8 weeks)", sw: "Achisha watoto wa {name} kunyonya (wiki 6–8)" },
  servePig: { en: "{name} comes on heat 3–7 days after weaning: serve her", sw: "{name} hupata joto siku 3–7 baada ya kuachisha: mpandishe" },
  deworm: { en: "Deworm {name}", sw: "Mpe {name} dawa ya minyoo" },
  dewormShort: { en: "Deworm", sw: "Dawa ya minyoo" },
  ticks: { en: "Spray or dip {name} against ticks", sw: "Nyunyizia au ogesha {name} dhidi ya kupe" },
  ticksShort: { en: "Tick spray or dip", sw: "Kunyunyizia dhidi ya kupe" },
  flockDeworm: { en: "Deworm the flock ({name})", sw: "Wape kuku dawa ya minyoo ({name})" },
  ncdRepeat: { en: "Newcastle booster, every 3 months ({name})", sw: "Nyongeza ya Newcastle, kila miezi 3 ({name})" },
} satisfies Record<string, L | Record<string, L>>;

/** Chick vaccinations by age (days from hatch). */
export const FLOCK_VACCINES: { id: string; day: number; title: L }[] = [
  { id: "ncd1", day: 7, title: { en: "Newcastle + IB vaccine, eye drop or drinking water ({name})", sw: "Chanjo ya Newcastle + IB, tone la jicho au maji ya kunywa ({name})" } },
  { id: "gum1", day: 14, title: { en: "Gumboro vaccine in drinking water ({name})", sw: "Chanjo ya Gumboro kwenye maji ya kunywa ({name})" } },
  { id: "ncd2", day: 21, title: { en: "Newcastle + IB booster ({name})", sw: "Nyongeza ya chanjo ya Newcastle + IB ({name})" } },
  { id: "gum2", day: 28, title: { en: "Gumboro booster ({name})", sw: "Nyongeza ya chanjo ya Gumboro ({name})" } },
  { id: "pox", day: 42, title: { en: "Fowl pox vaccine in the wing web ({name})", sw: "Chanjo ya ndui ya kuku kwenye bawa ({name})" } },
  { id: "ncd3", day: 126, title: { en: "Newcastle booster before laying ({name})", sw: "Nyongeza ya Newcastle kabla ya kutaga ({name})" } },
];

const later = (a: string, b: string) => (a > b ? a : b);

/**
 * Every reminder that belongs to the animal's current cycle, past and future.
 * Callers filter by date and done-state (see `openReminders`).
 */
export function remindersOf(a: Animal, today: string): Reminder[] {
  const out: Reminder[] = [];
  const add = (id: string, due: string, kind: Reminder["kind"], title: L, extra?: Partial<Reminder>) =>
    out.push({ id, animalId: a.id, due, kind, title, ...extra });

  if (a.species === "chicken") {
    if (a.born) {
      for (const v of FLOCK_VACCINES) add(`${v.id}@${a.born}`, addDays(a.born, v.day), "health", v.title);
      const layStart = addDays(a.born, 126);
      if (today >= addDays(layStart, -7)) {
        const due = addDays(later(lastOf(a, "vaccinated"), layStart), 90);
        add(`ncd@${due}`, due, "health", T.ncdRepeat, { records: "vaccinated" });
      }
    }
    const d = lastOf(a, "dewormed");
    const due = d ? addDays(d, DEWORM_DAYS) : a.born ? addDays(a.born, 56) : today;
    add(`deworm@${due}`, due, "health", T.flockDeworm, { records: "dewormed", short: T.dewormShort });
    return out;
  }

  const spec = SPEC[a.species];
  if (a.female) {
    const s = currentService(a);
    const status = statusOf(a, today);
    if (s && status.kind === "pregnant") {
      add(`heat@${s}`, addDays(s, spec.cycle!), "breeding", T.heat);
      if (a.species === "cow") {
        add(`pd@${s}`, addDays(s, 60), "breeding", T.pd);
        add(`dry@${s}`, addDays(s, 223), "breeding", T.dry);
        add(`pen@${s}`, addDays(s, 276), "breeding", T.penCow);
      } else if (a.species === "pig") {
        add(`pen@${s}`, addDays(s, 107), "breeding", T.penPig);
      } else {
        add(`steam@${s}`, addDays(s, spec.gestation! - 42), "breeding", T.steam);
      }
      add(`birth@${s}`, addDays(s, spec.gestation!), "breeding", T.birth[a.species], { records: "birth" });
    } else {
      // After a birth, until she is served again.
      const b = lastOf(a, "birth");
      if (b && daysBetween(b, today) <= 150) {
        if (a.species === "cow") {
          add(`colostrum@${b}`, b, "breeding", T.colostrum);
          add(`serve@${b}`, addDays(b, 60), "breeding", T.serveCow);
        } else if (a.species === "pig") {
          add(`wean@${b}`, addDays(b, 49), "breeding", T.weanPig);
          add(`serve@${b}`, addDays(b, 54), "breeding", T.servePig);
        } else {
          add(`wean@${b}`, addDays(b, 105), "breeding", T.wean);
        }
      }
    }
  }

  // Health: from the last time it was done, or now when there is no record yet.
  const d = lastOf(a, "dewormed");
  const dDue = d ? addDays(d, DEWORM_DAYS) : today;
  add(`deworm@${dDue}`, dDue, "health", T.deworm, { records: "dewormed", short: T.dewormShort });
  if (spec.ticks) {
    const t = lastOf(a, "ticks");
    const tDue = t ? addDays(t, TICK_DAYS) : today;
    add(`ticks@${tDue}`, tDue, "health", T.ticks, { records: "ticks", short: T.ticksShort });
  }
  return out;
}

export type OpenReminder = Reminder & { inDays: number };

/** Open reminders due within `ahead` days (or late by up to two weeks), soonest first. */
export function openReminders(
  animals: Animal[], done: Record<string, true>, today: string, ahead = 7,
): OpenReminder[] {
  return animals
    .flatMap((a) => remindersOf(a, today).map((r) => ({ ...r, inDays: daysBetween(today, r.due) })))
    .filter((r) => !done[`${r.animalId}:${r.id}`] && r.inDays <= ahead && r.inDays >= -14)
    .sort((x, y) => x.inDays - y.inDays || x.animalId.localeCompare(y.animalId));
}

export type ReminderGroup = { key: string; items: OpenReminder[]; records?: EventKind; due: string; inDays: number };

/**
 * Today's view: recurring health jobs due now are grouped across animals of
 * the same kind ("Deworm: Daisy, Neema"), because a farmer treats the herd in
 * one go; everything else stays one row per animal.
 */
export function groupReminders(rs: OpenReminder[], speciesOf: (id: string) => Species | undefined): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>();
  for (const r of rs) {
    const now = r.inDays <= 0;
    const key = r.short && r.records ? `${r.records}:${speciesOf(r.animalId) ?? ""}:${now ? "now" : r.due}` : `${r.animalId}:${r.id}`;
    const g = groups.get(key);
    if (g) {
      g.items.push(r);
      g.inDays = Math.min(g.inDays, r.inDays);
    } else {
      groups.set(key, { key, items: [r], records: r.records, due: r.due, inDays: r.inDays });
    }
  }
  return [...groups.values()].sort((a, b) => a.inDays - b.inDays);
}

/* ── milk ── */
export function milkSeries(milk: MilkEntry[], today: string, days = 14, animalId?: string) {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const by = new Map<string, number>();
  for (const m of milk) if (!animalId || m.animalId === animalId) by.set(m.date, (by.get(m.date) ?? 0) + m.litres);
  return { dates, litres: dates.map((d) => Math.round((by.get(d) ?? 0) * 10) / 10) };
}

/** Litres in the last 7 days vs the 7 before, and the change in percent (null without a base). */
export function milkWeek(milk: MilkEntry[], today: string) {
  const { litres } = milkSeries(milk, today, 14);
  const last = litres.slice(7).reduce((s, x) => s + x, 0);
  const prev = litres.slice(0, 7).reduce((s, x) => s + x, 0);
  return { thisWeek: Math.round(last * 10) / 10, lastWeek: Math.round(prev * 10) / 10, changePct: prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : null };
}

/** "{name}" in a reminder title. */
export const fill = (s: string, name: string) => s.replace(/\{name\}/g, name);
