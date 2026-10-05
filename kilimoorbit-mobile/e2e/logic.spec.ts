/**
 * Unit tests for the app's pure logic (no browser): livestock calendar,
 * price alerts, weather-aware task advice, the crop doctor, the input
 * calculator and the response validators. Run as the "logic" project.
 */
import { test, expect } from "@playwright/test";
import { addDays } from "../lib/dates";
import {
  currentService, groupReminders, milkWeek, openReminders, remindersOf, statusOf,
  type Animal, type AnimalEvent, type MilkEntry,
} from "../lib/livestock";
import { alertHits, suggestTarget } from "../lib/pricewatch";
import { taskHint } from "../lib/advice";
import { CROPS, bagsFor, inputsFor } from "../lib/agronomy";
import { diagnose } from "../lib/pests";
import { cleanArb, cleanFeed, cleanForecast, cleanListing } from "../lib/validate";
import type { WxDay } from "../lib/api";

const TODAY = "2026-10-05";
const ev = (kind: AnimalEvent["kind"], date: string, i = 0): AnimalEvent => ({ id: `${kind}${i}${date}`, kind, date });
const cow = (events: AnimalEvent[], extra: Partial<Animal> = {}): Animal => ({ id: "c1", species: "cow", name: "Neema", female: true, events, ...extra });
const ids = (a: Animal) => remindersOf(a, TODAY).map((r) => r.id.split("@")[0]);

test.describe("livestock calendar", () => {
  test("a cow served 100 days ago is pregnant, due 283 days after service", () => {
    const served = addDays(TODAY, -100);
    const s = statusOf(cow([ev("served", served)]), TODAY);
    expect(s).toEqual({ kind: "pregnant", served, due: addDays(served, 283), day: 100, of: 283 });
  });

  test("a pregnant cow's calendar: heat watch, vet check, dry-off, pen, calving", () => {
    const served = addDays(TODAY, -100);
    const rs = remindersOf(cow([ev("served", served)]), TODAY);
    const due = (p: string) => rs.find((r) => r.id === `${p}@${served}`)?.due;
    expect(due("heat")).toBe(addDays(served, 21));
    expect(due("pd")).toBe(addDays(served, 60));
    expect(due("dry")).toBe(addDays(served, 223));
    expect(due("pen")).toBe(addDays(served, 276));
    expect(due("birth")).toBe(addDays(served, 283));
    expect(rs.find((r) => r.id.startsWith("birth@"))?.records).toBe("birth");
  });

  test("on heat → 'not pregnant' → served again, all on one day: the new service counts", () => {
    const d = addDays(TODAY, -2);
    const a = cow([ev("served", addDays(TODAY, -23), 1), ev("notPregnant", d, 2), ev("served", d, 3)]);
    expect(currentService(a)).toBe(d);
    expect(statusOf(a, TODAY).kind).toBe("pregnant");
  });

  test("'not pregnant' after the service ends the pregnancy", () => {
    const a = cow([ev("served", addDays(TODAY, -30)), ev("notPregnant", addDays(TODAY, -5))]);
    expect(statusOf(a, TODAY).kind).toBe("open");
  });

  test("after calving: in milk, colostrum today, serve again at 60 days", () => {
    const a = cow([ev("served", addDays(TODAY, -290)), ev("birth", TODAY)]);
    expect(statusOf(a, TODAY)).toEqual({ kind: "milking", since: TODAY });
    expect(ids(a)).toEqual(expect.arrayContaining(["colostrum", "serve", "deworm", "ticks"]));
    expect(ids(a)).not.toContain("heat");
  });

  test("three weeks past the due date with no birth recorded: no longer claimed pregnant", () => {
    expect(statusOf(cow([ev("served", addDays(TODAY, -(283 + 22)))]), TODAY).kind).toBe("open");
  });

  test("males only get health reminders; pigs have no tick reminder", () => {
    expect(ids({ id: "g", species: "goat", name: "Dume", female: false, events: [] })).toEqual(["deworm", "ticks"]);
    expect(ids({ id: "p", species: "pig", name: "Sow", female: true, events: [ev("served", addDays(TODAY, -10))] }))
      .toEqual(["heat", "pen", "birth", "deworm"]);
  });

  test("health reminders run from the last record: deworm +90 days, ticks +7", () => {
    const a = cow([ev("dewormed", "2026-08-01"), ev("ticks", "2026-10-01")]);
    const rs = remindersOf(a, TODAY);
    expect(rs.find((r) => r.records === "dewormed")?.due).toBe("2026-10-30");
    expect(rs.find((r) => r.records === "ticks")?.due).toBe("2026-10-08");
  });

  test("a 10-day-old flock: Newcastle late, Gumboro soon, no 3-monthly booster yet", () => {
    const hatched = addDays(TODAY, -10);
    const flock: Animal = { id: "f", species: "chicken", name: "Kuku", female: true, born: hatched, count: 100, events: [] };
    const open = openReminders([flock], {}, TODAY);
    expect(open.map((r) => [r.id.split("@")[0], r.inDays])).toEqual([["ncd1", -3], ["gum1", 4]]);
    expect(ids(flock)).not.toContain("ncd");
    expect(statusOf(flock, TODAY)).toEqual({ kind: "flock", ageDays: 10, count: 100 });
  });

  test("a laying flock gets a Newcastle booster every 3 months", () => {
    const hatched = addDays(TODAY, -130);
    const flock: Animal = { id: "f", species: "chicken", name: "Kuku", female: true, born: hatched, count: 50, events: [] };
    expect(remindersOf(flock, TODAY).find((r) => r.records === "vaccinated")?.due).toBe(addDays(hatched, 126 + 90));
  });

  test("done reminders and ones outside the window are left out", () => {
    const served = addDays(TODAY, -21);
    const a = cow([ev("served", served), ev("dewormed", TODAY), ev("ticks", TODAY)]);
    // Ticks were sprayed today, so the next spray (in 7 days) is outside a 3-day window.
    expect(openReminders([a], {}, TODAY, 3).map((r) => r.id)).toEqual([`heat@${served}`]);
    expect(openReminders([a], { [`c1:heat@${served}`]: true }, TODAY, 3)).toEqual([]);
    expect(openReminders([a], {}, TODAY, 7).map((r) => r.id)).toEqual([`heat@${served}`, `ticks@${addDays(TODAY, 7)}`]);
  });

  test("Today groups the herd's due deworming into one row; breeding stays per animal", () => {
    const a = cow([ev("served", addDays(TODAY, -21))]);
    const b = cow([], { id: "c2", name: "Bella" });
    const groups = groupReminders(openReminders([a, b], {}, TODAY), () => "cow");
    const deworm = groups.find((g) => g.records === "dewormed");
    expect(deworm?.items.map((r) => r.animalId)).toEqual(["c1", "c2"]);
    expect(groups.filter((g) => g.items[0].id.startsWith("heat@")).length).toBe(1);
  });

  test("milk: this week vs last week", () => {
    const milk: MilkEntry[] = [
      { id: "1", animalId: "c1", date: TODAY, litres: 10 },
      { id: "2", animalId: "c1", date: addDays(TODAY, -1), litres: 10 },
      { id: "3", animalId: "c1", date: addDays(TODAY, -8), litres: 16 },
    ];
    expect(milkWeek(milk, TODAY)).toEqual({ thisWeek: 20, lastWeek: 16, changePct: 25 });
    expect(milkWeek([], TODAY).changePct).toBeNull();
  });
});

test.describe("price alerts", () => {
  const feed = { feed_name: "", data_age_minutes: 5, commodities: [{ crop: "maize", emoji: "", quotes: [{ market: "A", price: 50, delta: 0 }, { market: "B", price: 56, delta: 1 }] }] };
  test("hit when the best market reaches the target", () => {
    const hits = alertHits([{ id: "x", crop: "maize", target: 55, created: "" }], feed);
    expect(hits).toEqual([{ alert: { id: "x", crop: "maize", target: 55, created: "" }, market: "B", price: 56 }]);
  });
  test("no hit below the target, or for a crop not on the board", () => {
    expect(alertHits([{ id: "x", crop: "maize", target: 57, created: "" }, { id: "y", crop: "kale", target: 1, created: "" }], feed)).toEqual([]);
    expect(alertHits([{ id: "x", crop: "maize", target: 1, created: "" }], undefined)).toEqual([]);
  });
  test("suggested target is ~5 % above today's best", () => expect(suggestTarget(56)).toBe(59));
});

test.describe("weather-aware task advice", () => {
  const tt = (k: string, v?: Record<string, unknown>) => (v ? `${k}|${JSON.stringify(v)}` : k);
  const day = (date: string, o: Partial<WxDay> = {}): WxDay => ({
    date, tmax: 25, tmin: 14, rain_mm: 0, rain_chance: 10, wind_kmh: 8, sky: "sunny",
    spray: { ok: true, reason: "ok" }, plant: { ok: false, reason: "dry" }, dry: { ok: true, reason: "ok" }, ...o,
  });
  const task = (crop: "maize" | "tomato", id: string, inDays = 0) => ({
    ...CROPS[crop].tasks.find((t) => t.id === id)!,
    planting: { id: "p", crop, acres: 1, plantedOn: "2026-08-01" }, due: TODAY, inDays, done: false,
  });

  test("spraying: rain today → spray tomorrow (lower case, mid-sentence)", () => {
    const days = [day(TODAY, { spray: { ok: false, reason: "rain" } }), day(addDays(TODAY, 1))];
    expect(taskHint(task("tomato", "blight"), days, "en", tt as any)?.text)
      .toBe('hint.sprayLater|{"why":"win.why.rain","day":"common.tomorrowLc"}');
  });
  test("top-dressing waits out heavy rain", () => {
    expect(taskHint(task("maize", "can"), [day(TODAY, { rain_mm: 20 })], "en", tt as any)).toEqual({ tone: "warn", text: "hint.feedHeavy" });
  });
  test("no advice for tasks more than 3 days away, or without a weather tag", () => {
    expect(taskHint(task("maize", "can", 5), [day(TODAY)], "en", tt as any)).toBeNull();
    expect(taskHint(task("maize", "weed1"), [day(TODAY)], "en", tt as any)).toBeNull();
  });
});

test.describe("crop doctor and input calculator", () => {
  test("leaf mines on tomato → Tuta absoluta, strong match first", () => {
    const m = diagnose("tomato", ["mines"]);
    expect(m[0].problem.id).toBe("tuta");
    expect(m[0].strength).toBe("strong");
  });
  test("bags round to the nearest half, never below half a bag", () => {
    expect([bagsFor(10), bagsFor(50), bagsFor(70), bagsFor(100)]).toEqual([0.5, 1, 1.5, 2]);
  });
  test("maize on 2 acres: 20 kg seed, 100 kg (2 bags) of DAP", () => {
    const n = inputsFor("maize", 2, "en");
    expect(n[0].amount).toBe("20 kg");
    expect(n.find((x) => x.label === "DAP")?.amount).toBe("100 kg · 2 bags");
  });
});

test.describe("response validation", () => {
  test("a forecast with no usable day is rejected; unknown skies default", () => {
    expect(cleanForecast({ county: "Meru", days: [] })).toBeNull();
    expect(cleanForecast("<html>")).toBeNull();
    const f = cleanForecast({ county: "Meru", days: [{ date: TODAY, tmax: 24, tmin: 13, sky: "volcano", spray: "?" }] });
    expect(f?.days[0]).toMatchObject({ sky: "cloudy", rain_mm: 0, spray: { ok: false } });
  });
  test("board quotes without a price are dropped; empty crops disappear", () => {
    const f = cleanFeed({ commodities: [{ crop: "Maize", quotes: [{ market: "A", price: "50" }, { market: "B", price: 52 }] }, { crop: "x", quotes: [] }, null] });
    expect(f?.commodities).toEqual([{ crop: "maize", emoji: "", quotes: [{ market: "B", price: 52, delta: 0 }] }]);
  });
  test("a market run without its route is unusable; missing climate block is optional", () => {
    expect(cleanArb({ execution_mode: "arbitrage_compile" })).toBeNull();
    const a = cleanArb({ execution_mode: "arbitrage_compile", cargo_optimized_route: { crop_type: "Tomato", optimal_market_destination: "X", logistics_risk_flag: "ALIENS" } });
    expect(a?.cargo_optimized_route).toMatchObject({ crop_type: "tomato", logistics_risk_flag: "CLEAR", net_profit_projection_kes: null });
    expect(a?.climate_risk_sentinel).toBeUndefined();
  });
  test("listings get safe defaults", () => {
    expect(cleanListing({ id: "1", qty_kg: "lots", status: "weird" })).toMatchObject({ qty_kg: 0, status: "open", crop: "" });
    expect(cleanListing({ qty_kg: 1 })).toBeNull();
  });
});
