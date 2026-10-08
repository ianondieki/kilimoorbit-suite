/**
 * Unit tests for the app's pure logic (no browser): livestock calendar and
 * egg log, price alerts, weather-aware task advice, the crop doctor, the
 * input calculator, the store and sell-or-hold plan, the crop budget, field
 * size by pacing and the response validators. Run as the "logic" project.
 */
import { test, expect } from "@playwright/test";
import { addDays } from "../lib/dates";
import {
  brooderTemp, canLay, currentService, dailyLitres, dairyMealFor, dueHatchSteps, eggWeek, groupReminders, hatchSteps, layDropped, layRate,
  milkWeek, monthStatement, openReminders, payslipGap, recordedDays, remindersOf, statusOf, waterFor,
  type Animal, type AnimalEvent, type Delivery, type EggEntry, type Hatch, type MilkEntry,
} from "../lib/livestock";
import { pushPullPlan, stageOf, thresholdFor, verdict } from "../lib/scouting";
import { limeAdvice, phBand } from "../lib/soil";
import { BANK, EMPTY_QUIZ, answer, liveStreak, pickDaily, seededShuffle, todayScore, withDay } from "../lib/trivia";
import { googleCalendarUrl, onNow, sanitizeBookings, upcomingBookings, whenText } from "../lib/shows";
import { cleanBase, hostOf } from "../lib/connection";
import { bagsLabel, bagsOf, dueChecks, holdPlan, nextCheck, type Lot } from "../lib/postharvest";
import { budgetFor, compareCrops } from "../lib/budget";
import { alertHits, suggestTarget } from "../lib/pricewatch";
import { taskHint } from "../lib/advice";
import { CROPS, CROP_KEYS, acresFromSteps, bagsFor, inputsFor } from "../lib/agronomy";
import { diagnose } from "../lib/pests";
import { cleanArb, cleanBooking, cleanFeed, cleanForecast, cleanListing, cleanNews, cleanPestWatch, cleanShows, cleanNurseryPlan } from "../lib/validate";
import { fareText, kmText, mapsUrl, minutesText, needLabel } from "../lib/nurseries";
import { FISH_PROBLEMS, POND_PREP, feedRate, feedStage, feedToday, harvestPlan, pondTasks, sanitizeFish, stockingFor, weightAfter, type Pond } from "../lib/aquaculture";
import { farmFocus, sanitizeSaccos, seasonInputs } from "../lib/saccoplan";
import { cleanSaccoApplication, cleanSaccoList } from "../lib/validate";
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

  test("milk: this week vs last week, by the daily average of recorded days", () => {
    const milk: MilkEntry[] = [
      { id: "1", animalId: "c1", date: TODAY, litres: 10 },
      { id: "2", animalId: "c1", date: addDays(TODAY, -1), litres: 10 },
      { id: "3", animalId: "c1", date: addDays(TODAY, -8), litres: 16 },
    ];
    // 10 L a day this week against 16 L last week: down, though more days were written down.
    expect(milkWeek(milk, TODAY)).toEqual({ thisWeek: 20, lastWeek: 16, changePct: -37.5 });
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

test.describe("store: sell now or hold", () => {
  test("maize in October in hermetic bags: holding to April pays in a typical year", () => {
    const plan = holdPlan("maize", 1000, 50, 9, true)!;
    expect(plan.months.map((m) => m.month)).toEqual([9, 10, 11, 0, 1, 2, 3]);
    expect(plan.best.month).toBe(3);
    expect(plan.best.price).toBe(56); // 50 × 1.05 / 0.93
    expect(plan.best.kg).toBe(970); // 0.5 % a month for 6 months
    expect(plan.best.gain).toBe(plan.best.value - 50000);
    expect(plan.worthIt).toBe(true);
    expect(plan.lossPct).toBe(3);
  });

  test("the same maize in ordinary bags: weevil losses eat the gain", () => {
    const plan = holdPlan("maize", 1000, 50, 9, false)!;
    expect(plan.best.k).toBe(0);
    expect(plan.worthIt).toBe(false);
  });

  test("at the lean-season peak (June) prices only fall: sell", () => {
    const plan = holdPlan("maize", 1000, 60, 5, true)!;
    expect(Math.max(...plan.months.slice(1).map((m) => m.price))).toBeLessThanOrEqual(60);
    expect(plan.worthIt).toBe(false);
  });

  test("potatoes keep 3 months at most; perishables and bad input give no plan", () => {
    expect(holdPlan("potatoes", 500, 40, 0, true)!.months).toHaveLength(4);
    expect(holdPlan("tomato" as any, 500, 40, 0, true)).toBeNull();
    expect(holdPlan("maize", 0, 40, 0, true)).toBeNull();
    expect(holdPlan("maize", 500, NaN, 0, true)).toBeNull();
  });

  test("bags round to the half bag", () => {
    expect(bagsOf("maize", 1350)).toBe(15);
    expect(bagsOf("maize", 100)).toBe(1);
    expect(bagsOf("potatoes", 125)).toBe(2.5);
    expect(bagsLabel(11.5)).toBe("11½");
    expect(bagsLabel(0.5)).toBe("½");
  });

  test("store checks: 14 days in ordinary bags, 30 sealed, weekly for potatoes", () => {
    const lot = (x: Partial<Lot>): Lot => ({ id: "l", crop: "maize", kg: 900, since: addDays(TODAY, -20), hermetic: false, ...x });
    expect(nextCheck(lot({}))).toBe(addDays(TODAY, -6));
    expect(nextCheck(lot({ hermetic: true }))).toBe(addDays(TODAY, 10));
    expect(nextCheck(lot({ crop: "potatoes", hermetic: true }))).toBe(addDays(TODAY, -13));
    expect(nextCheck(lot({ checked: addDays(TODAY, -2) }))).toBe(addDays(TODAY, 12));
    const due = dueChecks([lot({ id: "a" }), lot({ id: "b", hermetic: true })], TODAY);
    expect(due.map((d) => [d.lot.id, d.inDays])).toEqual([["a", -6]]);
  });
});

test.describe("crop budget", () => {
  test("an acre of maize at KES 45: costs, profit and break-even", () => {
    const b = budgetFor("maize", 1, { pricePerKg: 45 });
    expect(b.lines.map((l) => [l.key, l.cost])).toEqual([["seed", 3500], ["dap", 3500], ["can", 3000], ["labour", 12000], ["chem", 2500]]);
    expect(b.cost).toBe(24500);
    expect(b.kg).toBe(900);
    expect(b.revenue).toBe(40500);
    expect(b.profit).toBe(16000);
    expect(b.breakEvenPrice).toBe(28);
    expect(b.breakEvenKg).toBe(545);
  });

  test("the farmer's own prices, good practice and loan interest", () => {
    expect(budgetFor("maize", 1, { pricePerKg: 45, prices: { dap: 2500 } }).cost).toBe(23500);
    expect(budgetFor("maize", 1, { pricePerKg: 45, level: 1 }).kg).toBe(2250);
    const loan = budgetFor("maize", 1, { pricePerKg: 45, interestPct: 10 });
    expect(loan.lines.at(-1)).toEqual({ key: "interest", cost: 2450 });
    expect(loan.cost).toBe(26950);
  });

  test("seedlings are priced per 1,000; every crop compares, best first", () => {
    const tomato = budgetFor("tomato", 0.5, { pricePerKg: 50 });
    expect(tomato.lines[0]).toMatchObject({ key: "seed", unit: "seedlings", qty: 3700, cost: 18500 });
    const cmp = compareCrops(1, { priceOf: () => 40 });
    expect(cmp.map((c) => c.crop).sort()).toEqual([...CROP_KEYS].sort());
    for (let i = 1; i < cmp.length; i++) expect(cmp[i - 1].profit).toBeGreaterThanOrEqual(cmp[i].profit);
  });

  test("no price or no land never divides by zero", () => {
    const b = budgetFor("beans", 0, { pricePerKg: 0 });
    expect(b.breakEvenPrice).toBeNull();
    expect(b.breakEvenKg).toBeNull();
    expect(Number.isFinite(b.profit)).toBe(true);
  });
});

test.describe("eggs and field size", () => {
  const eggs = (perDay: (daysAgo: number) => number, days: number[]): EggEntry[] =>
    days.map((d) => ({ id: `g${d}`, flockId: "f", date: addDays(TODAY, -d), eggs: perDay(d) }));

  test("laying rate per 100 hens, and a drop worth acting on", () => {
    const log = eggs((d) => (d >= 7 ? 85 : 68), [1, 2, 3, 4, 8, 9, 10, 11]);
    const r = layRate(log, "f", 100, TODAY);
    expect(r).toEqual({ now: 68, before: 85 });
    expect(layDropped(r)).toBe(true);
    expect(layRate(log.slice(0, 2), "f", 100, TODAY).now).toBeNull(); // fewer than 3 days recorded
  });

  test("the week compares daily averages, so a day not yet written down isn't a fall", () => {
    const log = eggs(() => 80, [1, 2, 3, 8, 9, 10, 11, 12, 13]);
    const w = eggWeek(log, TODAY);
    expect(w.thisWeek).toBe(240);
    expect(w.lastWeek).toBe(480);
    expect(w.changePct).toBe(0);
    expect(recordedDays(["a", "b", "c"], [0, 5, 0])).toEqual({ dates: ["b"], values: [5] });
  });

  test("the egg log opens from 17 weeks, or when the hatch date is unknown", () => {
    const flock = (born?: string): Animal => ({ id: "f", species: "chicken", name: "F", female: true, count: 50, events: [], ...(born ? { born } : null) });
    expect(canLay(flock(addDays(TODAY, -100)), TODAY)).toBe(false);
    expect(canLay(flock(addDays(TODAY, -130)), TODAY)).toBe(true);
    expect(canLay(flock(), TODAY)).toBe(true);
    expect(canLay(cow([]), TODAY)).toBe(false);
  });

  test("acres from big steps", () => {
    expect(acresFromSteps(64, 64)).toBe(1.01);
    expect(acresFromSteps(60, 45)).toBe(0.67);
    expect(acresFromSteps(0, 50)).toBeNull();
    expect(acresFromSteps(NaN, 50)).toBeNull();
  });
});

test.describe("fall armyworm scouting and push-pull", () => {
  test("thresholds by crop age: 20 % in the first 2½ weeks, 40 % to tasselling", () => {
    expect(thresholdFor(10)).toBe(20);
    expect(thresholdFor(17)).toBe(20);
    expect(thresholdFor(18)).toBe(40);
    expect(thresholdFor(null)).toBe(40);
    expect([stageOf(5), stageOf(30), stageOf(75)]).toEqual(["early", "whorl", "late"]);
  });

  test("verdict: act, near or fine; after tasselling spraying is not advised", () => {
    expect(verdict(50, 11, 12)).toMatchObject({ pct: 22, threshold: 20, act: true });
    expect(verdict(50, 13, 25)).toMatchObject({ pct: 26, threshold: 40, act: false, near: false });
    expect(verdict(50, 16, 25)).toMatchObject({ pct: 32, act: false, near: true });
    expect(verdict(50, 30, 75)).toMatchObject({ pct: 60, stage: "late", act: false, near: false });
    expect(verdict(50, 51, 20)).toBeNull();
    expect(verdict(0, 0, 20)).toBeNull();
  });

  test("push-pull: plots of at most 50 × 50 m, desmodium 1 kg an acre, three border rows", () => {
    const one = pushPullPlan(1)!;
    expect(one.plots).toBe(2);
    expect(one.side).toBe(45);
    expect(one.desmodiumKg).toBe(1);
    expect(one.brachiaria).toBeGreaterThan(one.napier); // 30 cm apart instead of 50
    expect(pushPullPlan(0.04)).toBeNull(); // under 15 × 15 m
    expect(pushPullPlan(NaN)).toBeNull();
  });

  test("pest watch answers are cleaned: junk gives null, numbers are clamped", () => {
    expect(cleanPestWatch(null)).toBeNull();
    expect(cleanPestWatch({ reports: 3 })).toBeNull();
    const w = cleanPestWatch({ county: "Nyeri", reports: 2, over_threshold: 9, avg_pct: 250, max_pct: -4, level: "panic", source: "x", last_report: "soon" })!;
    expect(w).toMatchObject({ county: "Nyeri", reports: 2, over_threshold: 2, avg_pct: 0, max_pct: 0, level: "low", source: "SAMPLE", last_report: null });
    expect(cleanPestWatch({ county: "Nyeri", reports: 0, level: "high" })!.level).toBe("none");
  });
});

test.describe("soil and lime", () => {
  test("lime by pH: none from 5.5, about 1 t/ha below, 2 t/ha under 5.0", () => {
    expect(limeAdvice(null, "maize", 1)).toEqual({ kind: "unknown" });
    expect(limeAdvice(6.0, "maize", 1)).toEqual({ kind: "none", ph: 6.0 });
    expect(limeAdvice(5.2, "maize", 1)).toMatchObject({ kind: "lime", kgPerAcre: 400, kg: 400, bags: 8, microKg: 100 });
    expect(limeAdvice(4.8, "beans", 2)).toMatchObject({ kind: "lime", kgPerAcre: 800, kg: 1600, bags: 32 });
  });

  test("potatoes are limed only below pH 5.0 (scab risk)", () => {
    expect(limeAdvice(5.2, "potatoes", 1).kind).toBe("none");
    expect(limeAdvice(4.7, "potatoes", 1).kind).toBe("lime");
    expect([phBand(4.6), phBand(5.3), phBand(6.2), phBand(7.9)]).toEqual(["veryAcid", "acid", "good", "alkaline"]);
  });
});

test.describe("dairy and hatching", () => {
  test("a cow's water and dairy meal from her litres", () => {
    expect(waterFor(14)).toBe(128); // 65 L + 4.5 L a litre
    expect(waterFor(0)).toBe(65);
    expect(dairyMealFor(14)).toBe(5.5); // 1 kg per 2.5 L, to the half kilo
    const milk: MilkEntry[] = [1, 2, 3].map((d) => ({ id: `m${d}`, animalId: "c1", date: addDays(TODAY, -d), litres: 10 + d }));
    expect(dailyLitres(milk, "c1", TODAY)).toBe(12);
    expect(dailyLitres(milk, "c2", TODAY)).toBeNull();
  });

  test("co-op month and payslip: expected pay after deductions, litres missing and their worth", () => {
    const d = (date: string, litres: number): Delivery => ({ id: date, date, litres });
    const ds = [d("2026-10-01", 12), d("2026-10-02", 11.5), d("2026-09-30", 20)];
    const st = monthStatement(ds, "2026-10", { price: 50, deduction: 5 });
    expect(st).toEqual({ month: "2026-10", litres: 23.5, days: 2, gross: 1175, deductions: 118, net: 1057 });
    expect(monthStatement(ds, "2026-10", { price: null, deduction: null }).net).toBeNull();
    expect(payslipGap(23.5, 20, { price: 50, deduction: 5 })).toEqual({ gap: 3.5, worth: 158, matches: false });
    expect(payslipGap(23.5, 23, { price: 50, deduction: 5 }).matches).toBe(true);
  });

  test("hatching calendar: candling, lockdown and hatch day; ticked steps drop out", () => {
    const set = addDays(TODAY, -7);
    const hen: Hatch = { id: "h", set, eggs: 12, method: "hen" };
    const inc: Hatch = { id: "i", set, eggs: 60, method: "incubator" };
    expect(hatchSteps(hen).map((s) => s.day)).toEqual([7, 21]);
    expect(hatchSteps(inc).map((s) => s.day)).toEqual([7, 14, 18, 21]);
    const due = dueHatchSteps([hen, inc], {}, TODAY);
    expect(due.map((d) => `${d.hatch.id}:${d.step.id}:${d.inDays}`)).toEqual(["h:candle1:0", "i:candle1:0"]);
    expect(dueHatchSteps([hen], { "hatch:h:candle1": true }, TODAY)).toEqual([]);
    expect([brooderTemp(1), brooderTemp(2), brooderTemp(5), brooderTemp(9)]).toEqual([35, 32, 23, 21]);
  });
});

test.describe("farm trivia", () => {
  test("the bank is sound: unique ids, 3–4 options, the answer in range, both languages", () => {
    const ids = new Set(BANK.map((t) => t.id));
    expect(ids.size).toBe(BANK.length);
    expect(BANK.length).toBeGreaterThanOrEqual(30);
    for (const t of BANK) {
      expect(t.options.length).toBeGreaterThanOrEqual(3);
      expect(t.options.length).toBeLessThanOrEqual(4);
      expect(t.answer).toBeGreaterThanOrEqual(0);
      expect(t.answer).toBeLessThan(t.options.length);
      expect(t.q.sw.length).toBeGreaterThan(10);
      expect(t.q.en.length).toBeGreaterThan(10);
      expect(t.why.sw.length).toBeGreaterThan(10);
    }
  });

  test("the day's five are the same on every phone, differ by day, and skip questions already answered", () => {
    const a = pickDaily("2026-10-05", {});
    const b = pickDaily("2026-10-05", {});
    const c = pickDaily("2026-10-06", {});
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(a).not.toEqual(c);
    const answered = Object.fromEntries(a.map((id) => [id, { ok: true, date: "2026-10-04" }]));
    const d = pickDaily("2026-10-05", answered);
    expect(d.some((id) => a.includes(id))).toBe(false);
    expect(seededShuffle([1, 2, 3, 4, 5], "x")).toEqual(seededShuffle([1, 2, 3, 4, 5], "x"));
    expect([...seededShuffle([1, 2, 3, 4, 5], "x")].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test("answers move the score and the streak; answering twice changes nothing", () => {
    let s = withDay(EMPTY_QUIZ, TODAY);
    const [q1, q2] = s.day!.ids;
    s = answer(s, q1, true, TODAY);
    s = answer(s, q2, false, TODAY);
    s = answer(s, q1, false, TODAY); // already answered today: ignored
    expect(todayScore(s, TODAY)).toEqual({ done: 2, right: 1, of: 5 });
    expect(s.right).toBe(1);
    expect(s.total).toBe(2);
    expect(s.streak).toBe(1);
    expect(liveStreak(s, TODAY)).toBe(1);
    const tomorrow = addDays(TODAY, 1);
    const t = answer(withDay(s, tomorrow), withDay(s, tomorrow).day!.ids[0], true, tomorrow);
    expect(t.streak).toBe(2);
    expect(liveStreak(t, addDays(TODAY, 3))).toBe(0); // a gap breaks the streak
    expect(withDay(t, tomorrow).day!.date).toBe(tomorrow);
  });
});

test.describe("farm shows", () => {
  test("dates read naturally and the calendar link carries the show", () => {
    expect(whenText("en", "2026-10-07", "2026-10-10")).toBe("7–10 Oct");
    expect(whenText("en", "2026-09-28", "2026-10-04")).toBe("28 Sep – 4 Oct");
    expect(whenText("sw", "2026-10-07", "2026-10-07")).toBe("7 Okt");
    expect(onNow({ start: "2026-10-03", end: "2026-10-07" }, "2026-10-05")).toBe(true);
    expect(onNow({ start: "2026-10-06", end: "2026-10-07" }, "2026-10-05")).toBe(false);
    const url = googleCalendarUrl({ name: "Kitale National Show", start: "2026-10-07", end: "2026-10-10", venue: "Kitale Showground", town: "Kitale", organiser: "ASK", url: null, estimated: false });
    expect(url).toContain("calendar.google.com/calendar/render?action=TEMPLATE");
    expect(url).toContain("dates=20261007%2F20261011");
    expect(url).toContain("location=Kitale+Showground%2C+Kitale%2C+Kenya");
  });

  test("the bookings store drops junk and lists upcoming ones soonest first", () => {
    const good = { id: "b1", token: "t", event_id: "e1", name: "Show", start: "2026-12-01", end: "2026-12-02", town: "Nakuru", calendar_url: "https://calendar.google.com/x", remind_on: "2026-11-28", email: "SENT", created: "x" };
    const s = sanitizeBookings({ bookings: [good, { ...good, id: "b2", start: "2026-10-01", end: "2026-10-02" }, { ...good, id: "b3", calendar_url: "javascript:alert(1)" }, { id: 5 }, null, { ...good, id: "b4", email: "maybe", start: "2026-11-01", end: "2026-11-01" }] });
    expect(s.bookings.map((b) => b.id)).toEqual(["b1", "b2", "b4"]);
    expect(s.bookings[2].email).toBe("NONE");
    expect(upcomingBookings(s.bookings, "2026-10-05").map((b) => b.id)).toEqual(["b4", "b1"]);
    expect(sanitizeBookings("junk").bookings).toEqual([]);
  });
});

test.describe("server connection", () => {
  test("a typed address becomes a base URL; junk is refused", () => {
    expect(cleanBase("192.168.0.12:4517")).toBe("http://192.168.0.12:4517");
    expect(cleanBase("192.168.0.12")).toBe("http://192.168.0.12:4517");
    expect(cleanBase("  HTTP://My-Laptop.local:4517/ ")).toBe("http://my-laptop.local:4517");
    expect(cleanBase("https://sentinel.example.com")).toBe("https://sentinel.example.com");
    expect(cleanBase("")).toBeNull();
    expect(cleanBase("not an address")).toBeNull();
    expect(cleanBase("http://x:99999")).toBeNull();
    expect(cleanBase("ftp://x")).toBeNull();
    expect(hostOf("http://192.168.0.12:4517/")).toBe("192.168.0.12:4517");
  });
});

test.describe("news and shows answers are cleaned", () => {
  test("news: items need a title and a link or an in-app route; the rest is defaulted or dropped", () => {
    const n = cleanNews({ county: "Nakuru", source: "LIVE", items: [
      { id: "a", title: "Good story", link: "https://x.test/a", source: "The Standard", published: "2026-10-03T03:00:00.000Z", summary: "s", image: "https://x.test/i.jpg", scope: "county", county: "Nakuru" },
      { id: "b", title: "Tip", route: "/daktari?crop=maize", title_sw: "Dondoo", scope: "tip" },
      { id: "c", title: "No link" }, { title: "" }, "x", { id: "d", title: "Bad link", link: "javascript:alert(1)" },
      { id: "e", title: "Weird", link: "https://x.test/e", scope: "galaxy", published: "yesterday" },
    ] })!;
    expect(n.items.map((i) => i.id)).toEqual(["a", "b", "e"]);
    expect(n.items[2]).toMatchObject({ scope: "national", published: null, source: "", summary: "" });
    expect(cleanNews({ items: [] })).toBeNull();
    expect(cleanNews({ items: [{ id: "a", title: "x", link: "https://x" }], source: "???" })!.source).toBe("SAMPLE");
  });

  test("shows: dates must be real days; a booking needs its calendar link and .ics", () => {
    const s = cleanShows({ county: "Nakuru", events: [
      { id: "ok", name: "Show", town: "Nakuru", county: "Nakuru", start: "2026-10-07", end: "2026-10-10", kind: "show", distance_km: 12.4, days_until: 2, estimated: true },
      { id: "bad", name: "Show", town: "Nakuru", county: "Nakuru", start: "2026-10-10", end: "2026-10-07" },
      { id: "junk", name: "Show", town: "Nakuru", county: "Nakuru", start: "soon", end: "later" },
    ] })!;
    expect(s.events.map((e) => e.id)).toEqual(["ok"]);
    expect(s.events[0]).toMatchObject({ distance_km: 12, days_until: 2, estimated: true, venue: "Nakuru", url: null });
    const b = cleanBooking({ booking_id: "b", token: "t", calendar_url: "https://calendar.google.com/x", ics: "BEGIN:VCALENDAR", remind_on: "2026-10-04", email: "SIMULATED",
      event: { id: "ok", name: "Show", town: "Nakuru", county: "Nakuru", start: "2026-10-07", end: "2026-10-10" }, steps: [{ agent: "Scout", action: "Found it", latency_ms: 3 }, { agent: 1 }] })!;
    expect(b.steps).toHaveLength(1);
    expect(b.email).toBe("SIMULATED");
    expect(cleanBooking({ booking_id: "b", token: "t", calendar_url: "data:text/html", ics: "x", remind_on: "2026-10-04", event: {} })).toBeNull();
  });
});

test("Nurseries: the plan validator keeps well-formed rows, drops malformed ones, clamps lengths; the helpers read right", () => {
  const good = {
    need: "avocado", need_label: { en: "Avocado seedlings", sw: "Miche ya parachichi" }, from: { county: "Nakuru", lat: -0.3, lon: 36.07, gps: false }, acres: 2,
    per_acre: { n: 80, unit: "seedlings", spacing: "7 m × 7 m" },
    nurseries: [
      { id: "a", name: "A", kind: "research", town: "T", county: "Nakuru", lat: -0.3, lon: 36.0, carries: ["avocado", 7], url: "https://a.example", distance_km: 3.14, carries_need: true, transport: { mode: "boda", one_way_kes: 100, round_trip_kes: 200, minutes: 7 } },
      { id: "b", name: "B", kind: "weird", town: "T", county: "Nakuru", lat: -0.3, lon: 36.0, carries: [], url: "javascript:alert(1)", distance_km: 30, carries_need: "yes", transport: { mode: "matatu", round_trip_kes: 300 } },
      { id: "c" },
      null,
    ],
    advice: { text: "x".repeat(2000), source: "LIVE", lang: "sw" }, steps: [{ agent: "Scout", action: "s", latency_ms: 1 }, { agent: 3 }], generated_at: "now",
  };
  const p = cleanNurseryPlan(good)!;
  expect(p.nurseries.map((n) => n.id)).toEqual(["a", "b"]);
  expect(p.nurseries[0].carries).toEqual(["avocado"]);
  expect(p.nurseries[1]).toMatchObject({ kind: "supplier", url: null, carries_need: false, transport: { mode: "matatu", one_way_kes: 0, minutes: 0 } });
  expect(p.advice.text).toHaveLength(1200);
  expect(p.advice.source).toBe("LIVE");
  expect(p.steps).toHaveLength(1);
  expect(cleanNurseryPlan({ need: "x" })).toBeNull();
  expect(cleanNurseryPlan("nope")).toBeNull();
  expect(kmText(0.84)).toBe("0.8 km");
  expect(kmText(13.8)).toBe("14 km");
  expect(fareText("en", { mode: "boda", round_trip_kes: 360, minutes: 20 })).toBe("≈ KES 360 by boda, 20 min");
  expect(fareText("sw", { mode: "matatu", round_trip_kes: 910, minutes: 132 })).toBe("≈ KES 910 kwa matatu, saa 2 dakika 12");
  expect(fareText("en", { mode: "matatu", round_trip_kes: 1120, minutes: 166 })).toBe("≈ KES 1,120 by matatu, 2 h 46 min"); // long trips read in hours, money with a separator
  expect(minutesText("en", 120)).toBe("2 h");
  expect(minutesText("sw", 45)).toBe("dakika 45");
  expect(mapsUrl(-0.33, 35.95)).toBe("https://www.google.com/maps/dir/?api=1&destination=-0.33000,35.95000");
  expect(needLabel("sw", "potato")).toBe("Mbegu za viazi");
});

test("Fish: stocking density, the growth curve, feed by size, the harvest plan re-anchored by a weighing, and the pond calendar", () => {
  expect(stockingFor("tilapia", "earthen", 300)).toBe(900);
  expect(stockingFor("catfish", "liner", 100)).toBe(800);
  expect(weightAfter("tilapia", 5, 180)).toBeCloseTo(300, 0);
  expect(weightAfter("catfish", 5, 180)).toBeCloseTo(600, 0);
  expect(weightAfter("tilapia", 5, 0)).toBeCloseTo(5, 5);
  expect([feedRate(8), feedRate(15), feedRate(150), feedRate(400)]).toEqual([7, 5, 2.5, 1.5]);
  expect([feedStage(3), feedStage(10), feedStage(60), feedStage(150)]).toEqual(["fry", "starter", "grower", "finisher"]);

  const pond: Pond = { id: "p", name: "P", species: "tilapia", kind: "earthen", areaM2: 300, stocked: addDays(TODAY, -60), fingerlings: 900, startG: 5 };
  const f = feedToday(pond, [], [{ id: "l", pondId: "p", date: addDays(TODAY, -10), count: 50 }], TODAY);
  expect(f.alive).toBe(850);
  expect(f.kgPerDay).toBeCloseTo((850 * f.g * feedRate(f.g)) / 100 / 1000, 2);
  const plain = harvestPlan(pond, [], [], TODAY);
  const heavy = harvestPlan(pond, [{ id: "s", pondId: "p", date: addDays(TODAY, -2), avgG: 200 }], [], TODAY);
  expect(plain.daysLeft).toBeGreaterThan(heavy.daysLeft); // a heavy weighing brings the harvest closer
  expect(plain.kg).toBeGreaterThan(230);
  expect(plain.kg).toBeLessThan(250); // 900 fish, 1 in 10 lost, about 300 g
  expect(plain.value).toBe(plain.kg * 350);
  expect(plain.fcr).toBeGreaterThan(1.2);
  expect(plain.fcr).toBeLessThan(2.2);
  const ready = harvestPlan(pond, [{ id: "s", pondId: "p", date: TODAY, avgG: 320 }], [], TODAY);
  expect(ready).toMatchObject({ reached: true, daysLeft: 0, feedKg: 0 });

  const tasks = pondTasks(pond, [], [], TODAY);
  expect(tasks.map((t) => t.kind)).toEqual(expect.arrayContaining(["sample", "manure", "feedChange", "harvest"]));
  expect(tasks[tasks.length - 1].kind).toBe("harvest");
  const sample = tasks.find((t) => t.kind === "sample")!;
  expect(sample.due >= TODAY && sample.due <= addDays(TODAY, 14)).toBe(true);
  expect(pondTasks({ ...pond, kind: "tank" }, [], [], TODAY).some((t) => t.kind === "manure")).toBe(false);
  for (const p of FISH_PROBLEMS) expect(p.sign.sw && p.act.sw && p.act.en).toBeTruthy();
  expect(POND_PREP).toHaveLength(6);

  const clean = sanitizeFish({ ponds: [pond, { ...pond, id: "bad", species: "shark" }], samples: [{ id: "s", pondId: "p", date: TODAY, avgG: 80 }, { id: "x", pondId: "ghost", date: TODAY, avgG: 80 }, { id: "y", pondId: "p", date: "nope", avgG: 80 }], losses: [{ id: "l", pondId: "p", date: TODAY, count: 2.5 }], prices: { tilapia: 380, catfish: -1 } });
  expect(clean.ponds.map((p) => p.id)).toEqual(["p"]);
  expect(clean.samples.map((s) => s.id)).toEqual(["s"]);
  expect(clean.losses).toEqual([]);
  expect(clean.prices).toEqual({ tilapia: 380, catfish: null });
  expect(sanitizeFish("garbage").ponds).toEqual([]);
});

test("SACCOs: the farm's focus, the season's input bill, the stored requests, and the response validators", () => {
  expect(farmFocus([], 2)).toBe("dairy");
  expect(farmFocus([{ crop: "maize", acres: 2 }, { crop: "tomato", acres: 1 }], 0)).toBe("grain");
  expect(farmFocus([{ crop: "tomato", acres: 2 }, { crop: "maize", acres: 1 }], 0)).toBe("horticulture");
  expect(farmFocus([], 0)).toBeNull();
  const b = budgetFor("maize", 1, { pricePerKg: 0 });
  const want = b.lines.filter((l) => l.key === "seed" || l.key === "dap" || l.key === "can").reduce((s, l) => s + l.cost, 0);
  expect(seasonInputs([{ crop: "maize", acres: 1 }]).total).toBe(want);
  expect(seasonInputs([{ crop: "maize", acres: 1 }], { dap: 5000 }).total).toBeGreaterThan(want); // the farmer's own prices count
  expect(seasonInputs([]).total).toBe(0);

  const stored = sanitizeSaccos({ applications: [{ id: "a", token: "t", reference: "KO-1", sacco_id: "taifa", name: "Taifa Sacco", town: "Nyeri" }, { id: "b" }, null] });
  expect(stored.applications.map((a) => a.id)).toEqual(["a"]);
  expect(sanitizeSaccos(42).applications).toEqual([]);

  const list = cleanSaccoList({ from: { county: "Nyeri", lat: -0.4, lon: 36.9 }, focus: "lizards", saccos: [
    { id: "x", name: "X Sacco", kind: "bank", town: "T", county: "C", lat: 0, lon: 0, focus: ["dairy", "lizards"], services: ["input_credit", "free_money"], distance_km: 3, transport: { round_trip_kes: 100 } },
    { id: "y", name: "No transport", town: "T", county: "C", lat: 0, lon: 0, distance_km: 3 },
  ] })!;
  expect(list.focus).toBeNull();
  expect(list.saccos).toHaveLength(1);
  expect(list.saccos[0]).toMatchObject({ kind: "sacco", focus: ["dairy"], services: ["input_credit"], transport: { mode: "matatu", minutes: 0 } });
  expect(cleanSaccoList({ from: {} })).toBeNull();
  expect(cleanSaccoApplication({ application_id: "a", reference: "KO-1", sacco: { id: "s", name: "S", town: "T", county: "C", lat: 0, lon: 0 } })).toBeNull(); // no token
  const app = cleanSaccoApplication({ application_id: "a", token: "t", reference: "KO-1", email: "WHATEVER", sacco: { id: "s", name: "S", town: "T", county: "C", lat: 0, lon: 0 }, checklist: [{ en: "ID", sw: "Kitambulisho" }, { en: "half" }], steps: [] })!;
  expect(app).toMatchObject({ email: "NONE", checklist: [{ en: "ID", sw: "Kitambulisho" }] });
  expect(kmText(0.3)).toBe("< 1 km");
  const plan = cleanNurseryPlan({ need: "fingerlings", from: { county: "K", lat: 0, lon: 0 }, advice: { text: "x" }, per_acre: {}, quantity: { n: 900, unit: "fingerlings", basis: "pond_m2", amount: 300 }, nurseries: [] })!;
  expect(plan.quantity).toEqual({ n: 900, unit: "fingerlings", basis: "pond_m2", amount: 300 });
  expect(cleanNurseryPlan({ need: "x", from: { county: "K", lat: 0, lon: 0 }, advice: { text: "x" }, per_acre: {}, quantity: { basis: "furlongs" } })!.quantity).toBeNull();
});
