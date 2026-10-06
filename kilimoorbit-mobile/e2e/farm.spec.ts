/**
 * Farmer flows end to end: Today (weather windows, tasks), Shamba (calendar,
 * livestock, records), Masoko (prices, Soko, alerts), Daktari (diagnosis →
 * Apex), offline, Kiswahili, and crash resistance (corrupted storage, a
 * server answering garbage). Each test starts signed in on a fresh phone.
 *
 * Every test also fails on any uncaught page error, a crashed card (Guard)
 * or a crashed screen (ErrorBoundary): "it rendered" is not enough.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { byId, pickDaily } from "../lib/trivia";
import { todayKey } from "../lib/dates";

const test = base.extend<{ noCrash: void }>({
  noCrash: [async ({ page }, use) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    page.on("console", (m) => { if (m.text().includes("[Guard")) problems.push(`card crashed: ${m.text()}`); });
    await use();
    expect(problems, "uncaught errors or crashed cards").toEqual([]);
    await expect(page.getByTestId("screen-error")).toHaveCount(0);
  }, { auto: true }],
});

/** A planting `daysAgo` days back, in the app's local-date format. */
const planted = (crop: string, daysAgo: number, acres = 1) => ({ crop, daysAgo, acres });

type StoredLot = { crop: string; kg: number; daysAgo: number; hermetic: boolean };

/** Herd JSON with day offsets ("@7" = 7 days ago) turned into dates in the page. */
type HerdSeed = Record<string, unknown>;

async function start(
  page: Page, path: string, lang: "en" | "sw" = "en",
  farm?: { county?: string; plantings?: ReturnType<typeof planted>[]; store?: StoredLot[]; soilPh?: number },
  herd?: HerdSeed,
) {
  await page.addInitScript(([l, f, h]) => {
    if (sessionStorage.getItem("ko-e2e-seeded")) return;
    sessionStorage.setItem("ko-e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("ko-profile", JSON.stringify({
      v: 2, name: "Wanjiru Kamau", method: "phone", phone: "+254712345678",
      lang: l, signedInAt: new Date().toISOString(), serverAck: true,
    }));
    localStorage.setItem("ko-lang", l);
    if (f) {
      const key = (n: number) => {
        const d = new Date(); d.setDate(d.getDate() - n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      localStorage.setItem("ko-farm", JSON.stringify({
        v: 1, county: f.county ?? null, acres: null, done: {}, entries: [],
        plantings: (f.plantings ?? []).map((p: any, i: number) => ({ id: `e2e${i}`, crop: p.crop, acres: p.acres, plantedOn: key(p.daysAgo) })),
        store: (f.store ?? []).map((l: any, i: number) => ({ id: `lot${i}`, crop: l.crop, kg: l.kg, since: key(l.daysAgo), hermetic: l.hermetic })),
        soilPh: f.soilPh ?? null,
      }));
    }
    if (h) {
      const key = (n: number) => {
        const d = new Date(); d.setDate(d.getDate() - n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      localStorage.setItem("ko-herd", JSON.stringify(h, (_k, v) => (typeof v === "string" && /^@\d+$/.test(v) ? key(Number(v.slice(1))) : v)));
    }
  }, [lang, farm ?? null, herd ?? null] as const);
  await page.goto(path);
}

test("Today: weather windows, county choice, and a new crop fills this week's tasks", async ({ page }) => {
  await start(page, "/");
  await expect(page.getByText("GOOD DAYS FOR FARM WORK")).toBeVisible();
  for (const w of ["Spraying", "Planting", "Harvest & drying"])
    await expect(page.getByText(w, { exact: true })).toBeVisible();

  await page.getByTestId("choose-county").click();
  await page.getByTestId("county-search").fill("kisu");
  await page.getByRole("radio", { name: "Kisumu" }).click();
  await page.getByTestId("farm-save").click();
  await expect(page.getByText("WEATHER · KISUMU")).toBeVisible();

  await page.getByTestId("today-add-crop").click();
  await page.getByTestId("crop-maize").click();
  await page.getByRole("radio", { name: "2 weeks ago" }).click();
  await expect(page.getByText("10 kg", { exact: true })).toBeVisible(); // seed for 1 acre
  await page.getByTestId("add-crop-save").click();

  // Planted two weeks ago: land prep and planting are already done, scouting is due today.
  const scout = page.getByTestId("task-maize-faw1");
  await expect(scout).toBeVisible();
  await expect(page.getByTestId("task-maize-plant")).toHaveCount(0);
  await scout.click();
  await expect(scout).toHaveAttribute("aria-checked", "true");
});

test("Shamba records: an empty amount is refused; income minus costs is the profit", async ({ page }) => {
  await start(page, "/shamba");
  await page.getByRole("radio", { name: "Records" }).click();
  await page.getByTestId("records-add").click();
  await page.getByTestId("record-save").click();
  await expect(page.getByText("Enter an amount above zero.")).toBeVisible();
  await page.getByTestId("record-amount").fill("4000");
  await page.getByTestId("record-save").click();

  await page.getByTestId("records-add").click();
  await page.getByRole("radio", { name: "Income" }).click();
  await page.getByTestId("record-amount").fill("10000");
  await page.getByTestId("record-save").click();

  await expect(page.getByText("KES 10,000", { exact: true })).toBeVisible();
  await expect(page.getByText("KES 6,000", { exact: true })).toBeVisible();
});

test("Shamba calendar: a crop shows its stage, inputs for its size, and can be removed", async ({ page }) => {
  await start(page, "/shamba");
  await page.getByTestId("farm-add-crop").first().click();
  await page.getByTestId("crop-beans").click();
  await page.getByRole("button", { name: /How many acres\? \+/ }).click(); // 1 → 1.25 acres
  await page.getByTestId("add-crop-save").click();

  await expect(page.getByText(/Planted .* · 1.25 acres/)).toBeVisible();
  await page.getByTestId("planting-toggle-beans").click();
  await expect(page.getByText("What you'll need")).toBeVisible();
  await expect(page.getByText("31.3 kg", { exact: true })).toBeVisible(); // 25 kg/acre × 1.25
  await page.getByRole("button", { name: "Remove crop" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByText("No crops yet")).toBeVisible();
});

test("Masoko: harvest value follows the quantity; the planned run opens Autopilot", async ({ page }) => {
  await start(page, "/masoko");
  await page.getByTestId("mk-crop-maize").click();
  await page.getByTestId("mk-qty").fill("1000");
  await expect(page.getByText(/pays KES [\d,]+ more than .+ for 1,000 kg\./)).toBeVisible();
  await expect(page.getByText("Best", { exact: true })).toBeVisible();

  await page.getByTestId("open-autopilot").click();
  await page.getByRole("button", { name: "Engage autopilot" }).click();
  await expect(page.getByText(/MISSION BRIEF/)).toBeVisible();
});

test("Crop doctor: leaf mines on tomato point to Tuta absoluta, then hand off to Apex", async ({ page }) => {
  await start(page, "/daktari");
  await page.getByTestId("dr-crop-tomato").click();
  await page.getByTestId("sym-mines").click();
  await expect(page.getByTestId("problem-tuta")).toContainText("Strong match");
  await expect(page.getByText("What to do now".toUpperCase())).toBeVisible(); // top match opens itself
  await page.getByTestId("ask-tuta").click();
  await expect(page.getByTestId("chat-input")).toHaveValue(/Tuta absoluta.*tomatoes/);
});

test("Offline with nothing cached: Today still opens and says why", async ({ page, context }) => {
  await context.route("http://localhost:4517/**", (r) => r.abort());
  await start(page, "/");
  await expect(page.getByText("Can't reach KilimoOrbit right now.")).toBeVisible();
  await expect(page.getByText("The forecast will show when you're online.")).toBeVisible();
  await expect(page.getByText("THIS WEEK ON YOUR FARM")).toBeVisible();
});

test("Kiswahili is the default language", async ({ page }) => {
  await start(page, "/", "sw");
  await expect(page.getByText(/^Habari za (asubuhi|mchana|jioni), Wanjiru$/)).toBeVisible();
  await expect(page.getByText("SIKU NZURI ZA KAZI")).toBeVisible();
  await expect(page.getByText("KAZI ZA WIKI HII")).toBeVisible();
});

test("Weather-aware tasks: a harvest due today says when to harvest and dry", async ({ page }) => {
  await start(page, "/", "en", { county: "Nakuru", plantings: [planted("maize", 120)] });
  const harvest = page.getByTestId("task-maize-harvest");
  await expect(harvest).toBeVisible();
  await expect(harvest).toContainText(/Dry day: good to harvest and dry|next dry day|No dry day this week/);
});

test("Shamba: each crop shows its expected harvest and value", async ({ page }) => {
  await start(page, "/shamba", "en", { county: "Meru", plantings: [planted("maize", 30, 1)] });
  const outlook = page.getByTestId("outlook-maize");
  await expect(outlook).toContainText("Expected harvest: 900–2,250 kg");
  await expect(outlook).toContainText(/≈ KES [\d,]+–[\d,]+ at today's best price/);
});

test("Records: kilos sold give the average price, and the season report can be shared", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page, "/shamba", "en", { county: "Meru" });
  await page.getByRole("radio", { name: "Records" }).click();
  await page.getByTestId("records-add").click();
  await page.getByRole("radio", { name: "Income" }).click();
  await page.getByTestId("record-amount").fill("12500");
  await page.getByTestId("record-kg").fill("250");
  await expect(page.getByText("= KES 50 a kilo")).toBeVisible();
  await page.getByRole("radio", { name: "Beans" }).first().click();
  await page.getByTestId("record-save").click();
  await expect(page.getByText(/^Avg KES 50\/kg/)).toBeVisible();
  await expect(page.getByText("250 kg · KES 50/kg")).toBeVisible();

  await page.getByTestId("records-share").click();
  await expect(page.getByTestId("records-share")).toContainText(/Report copied|Share report/);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("KilimoOrbit · Farm report");
  expect(text).toContain("Beans: +KES 12,500 (250 kg sold, avg KES 50/kg)");
});

test("Masoko: a 14-day trend follows the chosen market; sell on Soko, then withdraw", async ({ page }) => {
  await start(page, "/masoko", "en", {});
  await page.getByTestId("mk-crop-maize").click();
  const trend = page.getByTestId("trend-tile");
  await expect(trend).toContainText(/14-day price · /);
  await page.getByTestId("mk-row-Eldoret Main").click();
  await expect(trend).toContainText("14-day price · Eldoret Main");
  await expect(trend).toContainText(/this week|Steady this week/);

  await page.getByTestId("sell-on-soko").click();
  await page.getByTestId("soko-county").click(); // no county yet: choose one first
  await page.getByTestId("county-search").fill("uasin");
  await page.getByRole("radio", { name: "Uasin Gishu" }).click();
  await page.getByTestId("farm-save").click();
  await page.getByTestId("sell-on-soko").click();
  await page.getByTestId("soko-qty").fill("300");
  await page.getByTestId("soko-ask").fill("30");
  await expect(page.getByText(/below the fair price/)).toBeVisible();
  await page.getByTestId("soko-ask").fill("48");
  await page.getByTestId("soko-submit").click();

  const mine = page.getByTestId("listing-maize").first();
  await expect(mine).toContainText("300 kg · KES 48/kg");
  await expect(mine).toContainText("Waiting for a buyer");
  await mine.getByTestId("soko-withdraw").click();
  await mine.getByTestId("soko-withdraw-yes").click();
  await expect(mine).toContainText("Withdrawn");
});

test("Crop doctor: problems common in the current season are flagged first", async ({ page }) => {
  await start(page, "/daktari");
  await page.getByTestId("dr-crop-tomato").click();
  // Tomato has an in-season problem in every Kenyan season.
  await expect(page.getByText("Common this season").first()).toBeVisible();
});

test("Livestock: a cow served 6 months ago is in calf; milk is recorded; Today groups the deworming", async ({ page }) => {
  await start(page, "/shamba?tab=livestock", "en", { county: "Nyeri" });
  await page.getByTestId("herd-add").first().click();
  await page.getByTestId("animal-name").fill("Neema");
  await page.getByTestId("served-180").click();
  await page.getByTestId("animal-save").click();
  await expect(page.getByText(/^Pregnant · due /)).toBeVisible();
  await expect(page.getByText("Day 180 of 283")).toBeVisible();

  await page.getByTestId("herd-add").first().click();
  await page.getByTestId("animal-name").fill("Bella");
  await page.getByTestId("animal-save").click();

  await page.getByTestId("milk-add").click();
  for (let i = 0; i < 16; i++) await page.getByRole("button", { name: "Litres that day +0.5 L" }).click();
  await page.getByTestId("milk-price").fill("50");
  await page.getByTestId("milk-save").click();
  await expect(page.getByTestId("milk-week")).toHaveText("This week: 8 L · ≈ KES 400");

  await page.goto("/");
  const deworm = page.getByTestId("herd-task-deworm");
  await expect(deworm).toContainText("Deworm: Neema, Bella");
  await deworm.click();
  await expect(deworm).toHaveAttribute("aria-checked", "true");
  await deworm.click(); // undo removes the two records again
  await expect(deworm).toHaveAttribute("aria-checked", "false");
});

test("Livestock: a young flock shows its vaccine schedule", async ({ page }) => {
  await start(page, "/shamba?tab=livestock", "en", { county: "Kiambu" });
  await page.getByTestId("herd-add").first().click();
  await page.getByTestId("sp-chicken").click();
  await page.getByTestId("animal-count").fill("200");
  await page.getByRole("radio", { name: "1 week ago" }).click();
  await page.getByTestId("animal-save").click();
  await expect(page.getByText("200 birds · 1 weeks old")).toBeVisible();
  await expect(page.getByText(/Newcastle \+ IB vaccine/)).toBeVisible();
});

test("Price alert: a target below today's best price shows on Today", async ({ page }) => {
  await start(page, "/masoko");
  await page.getByTestId("mk-crop-maize").click();
  await page.getByTestId("alert-open").click();
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: /^Target price \(KES a kilo\) −/ }).click();
  await page.getByTestId("alert-save").click();
  await expect(page.getByTestId("alert-status")).toContainText("Alert at KES");
  await page.goto("/");
  await expect(page.getByTestId("alert-hit-maize")).toContainText(/Maize: KES \d+\/kg at .+ \(target KES \d+\)/);
});

/** Junk in every key the app stores: wrong types, missing fields, broken JSON. */
const CORRUPT: Record<string, string> = {
  "ko-farm": JSON.stringify({
    county: 42, acres: "big", entries: "no", done: [],
    plantings: [{ id: 1, crop: "maize" }, { id: "p", crop: "maize", acres: 1, plantedOn: "2026-13-45" }, null, { id: "q", crop: "toString", acres: 1, plantedOn: "2026-01-01" }],
    store: [{ id: "l", crop: "maize", kg: "lots", since: "x" }, { id: "l2", crop: "rice", kg: 5, since: "2026-01-01" }, 7, { id: "l3", crop: "beans", kg: 1e12, since: "2026-01-01" }],
    prices: { dap: "cheap", hack: 5, can: -1, toString: 5 },
    scouts: [{ id: "s", date: "2026-10-01", plants: 50, hit: 99 }, { id: "t", date: "bad", plants: 50, hit: 2 }, "x"], soilPh: "acid", sharePest: "yes",
  }),
  "ko-quiz": JSON.stringify({ answered: { "faw-threshold": { ok: "yes", date: "2026-10-01" }, nope: { ok: true, date: "2026-10-01" }, "maize-spacing": { ok: true, date: "soon" } }, day: { date: "2026-13-01", ids: [1, "x"] }, streak: -4, right: "9", total: 2 }),
  "ko-bookings": JSON.stringify({ bookings: [{ id: "b", token: "t", event_id: "e", name: "x", start: "2026-10-01", end: "bad", calendar_url: "javascript:1" }, 7] }),
  "ko-news-cache": JSON.stringify({ county: "Nakuru", ts: "now", data: { items: [{ title: 5 }, { id: "a", title: "ok", link: "ftp://x" }] } }),
  "ko-shows-cache": JSON.stringify({ ts: -1, data: { county: "Nakuru", events: [{ id: "x", start: "2026-99-99" }] } }),
  "ko-api-base": "javascript:alert(1)",
  "ko-herd": JSON.stringify({
    animals: [{ id: "a", species: "cow", events: [{ id: "e", kind: "served", date: "bad" }, { kind: "birth" }] }, { id: 5 }, { id: "b", species: "dragon" }, { id: "f", species: "chicken", count: "many" }],
    milk: [{ animalId: "a", litres: "x" }], done: "x", milkPrice: -3,
    eggs: [{ id: "g", flockId: "f", date: "2026-01-01", eggs: 5.5 }, { id: "g2", flockId: "a", date: "2026-01-01", eggs: 5 }, "x"], eggPrice: "free",
    deliveries: [{ id: "d", date: "2026-10-01", litres: -4 }, { id: "e", date: "x", litres: 4 }], coop: { price: "fifty", deduction: 900 },
    hatches: [{ id: "h", set: "2026-10-01", eggs: 0, method: "hen" }, { id: "i", set: "2026-10-01", eggs: 12, method: "magic" }, null],
  }),
  "ko-soko": JSON.stringify([{ id: "z", owner_token: "t", qty_kg: "lots", created_at: "never" }, { owner_token: 1 }]),
  "ko-alerts": JSON.stringify({ x: 1 }),
  "ko-weather-cache": JSON.stringify({ county: "Meru", ts: "now", data: { county: "Meru", days: "none" } }),
  "ko-dash-cache": JSON.stringify({ meta: "junk", arb: { execution_mode: "arbitrage_compile" } }),
  "ko-chat-log": JSON.stringify([{ id: 1 }, { id: "m", from: "apex", text: { a: 1 } }, { id: "ok", from: "user", text: "Habari" }]),
};

test("Corrupted storage never crashes a screen", async ({ page }) => {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem("ko-e2e-corrupt")) return;
    sessionStorage.setItem("ko-e2e-corrupt", "1");
    localStorage.clear();
    localStorage.setItem("ko-profile", JSON.stringify({ v: 2, name: "Wanjiru", method: "phone", phone: "+254712345678", lang: "en", signedInAt: "x", serverAck: true }));
    localStorage.setItem("ko-lang", "en");
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    localStorage.setItem("ko-theme", "{not json");
  }, CORRUPT);
  for (const path of ["/", "/shamba", "/shamba?tab=livestock", "/shamba?tab=records", "/masoko", "/masoko?crop=dragon", "/masoko?crop=maize", "/daktari", "/chat", "/autopilot"]) {
    await page.goto(path);
    await expect(page.locator("body")).toContainText(/\w/);
    await page.waitForTimeout(400);
  }
  await page.goto("/chat");
  await expect(page.getByText("Habari", { exact: true })).toBeVisible(); // the one valid message survives
});

test("Broken JSON in storage is ignored", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("ko-e2e-broken")) return;
    sessionStorage.setItem("ko-e2e-broken", "1");
    localStorage.clear();
    localStorage.setItem("ko-profile", JSON.stringify({ v: 2, name: "Wanjiru", method: "phone", phone: "+254712345678", lang: "en", signedInAt: "x", serverAck: true }));
    for (const k of ["ko-farm", "ko-herd", "ko-soko", "ko-alerts", "ko-weather-cache", "ko-dash-cache", "ko-chat-log"]) localStorage.setItem(k, "{not json");
  });
  for (const path of ["/", "/shamba?tab=livestock", "/masoko", "/chat"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
  }
  await page.goto("/");
  // ko-lang is unset here, so the app falls back to its default, Kiswahili.
  await expect(page.getByText("KAZI ZA WIKI HII")).toBeVisible();
});

test("A server answering garbage degrades to 'no data', never a crash", async ({ page, context }) => {
  await context.route("http://localhost:4517/api/meta", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>proxy error</html>" }));
  await context.route("http://localhost:4517/api/weather**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ county: "Meru", days: [] }) }));
  await context.route("http://localhost:4517/api/prices/history**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ crop: "maize", markets: [{ market: "X", prices: [1] }] }) }));
  await context.route("http://localhost:4517/api/soko/**", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await context.route("http://localhost:4517/api/pests/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ county: 7, level: "high" }) }));
  await context.route("http://localhost:4517/api/news**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>502</html>" }));
  await context.route("http://localhost:4517/api/events**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ county: 5, events: "none" }) }));
  await start(page, "/");
  await expect(page.getByText("Can't reach KilimoOrbit right now.")).toBeVisible();
  await expect(page.getByText("The forecast will show when you're online.")).toBeVisible();
  await expect(page.getByText("News will show when you're online.")).toBeVisible();
  await expect(page.getByText("Shows will appear when you're online.")).toBeVisible();
  await page.goto("/masoko");
  await expect(page.getByText("Prices will show when you're online.")).toBeVisible();
});

test("Apex answering without a market run: board stays, Today explains", async ({ page, context }) => {
  await context.route("http://localhost:4517/api/apex", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { execution_mode: "arbitrage_compile" } }) }));
  await start(page, "/");
  await expect(page.getByText("Apex couldn't plan a market run right now.")).toBeVisible();
  await page.goto("/masoko");
  await expect(page.getByTestId("mk-crop-maize")).toBeVisible();
});

test("Store: a ripe maize harvest goes into store, a sale from it lands in Records, and Markets weighs selling now against storing", async ({ page }) => {
  await start(page, "/shamba", "en", { county: "Nyeri", plantings: [planted("maize", 125, 1.5)] });
  await page.getByTestId("harvest-maize").click();
  await expect(page.getByTestId("store-kg")).toHaveText("= 1,350 kg"); // a typical 900 kg an acre, as 90 kg bags
  await expect(page.getByText("That's 900 kg an acre (typical: 900–2,250)")).toBeVisible();
  await page.getByTestId("store-save").click();
  await expect(page.getByTestId("lot-maize")).toContainText("Maize · 15 bags");

  await page.getByTestId("lot-sell-maize").click();
  await page.getByTestId("lot-price").fill("50");
  await expect(page.getByText("Total: KES 4,500")).toBeVisible();
  await page.getByTestId("lot-save").click();
  await expect(page.getByTestId("lot-maize")).toContainText("Maize · 14 bags");
  await expect(page.getByTestId("lot-maize")).toContainText("1,260 kg");

  await page.getByRole("button", { name: "When to sell?" }).click();
  await expect(page.getByText("Your 1,260 kg in store")).toBeVisible();
  await expect(page.getByTestId("hold-verdict")).toBeVisible();
  await expect(page.getByTestId("hold-bars")).toBeVisible();
  await page.getByTestId("hold-open").click(); // ordinary bags: the plan is re-weighed, nothing breaks
  await expect(page.getByTestId("hold-verdict")).toBeVisible();

  await page.goto("/shamba?tab=records");
  await expect(page.getByText("90 kg · KES 50/kg")).toBeVisible();
  await expect(page.getByText("From the store")).toBeVisible();
});

test("Store checks: a check that is due shows on Today; a tick records it and a second tick undoes it", async ({ page }) => {
  await start(page, "/", "en", { store: [{ crop: "beans", kg: 450, daysAgo: 20, hermetic: false }] });
  const check = page.getByTestId("store-check-beans");
  await expect(check).toContainText("Check stored beans");
  await expect(check).toContainText("6 days late");
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "true");
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "false");
  await page.goto("/shamba");
  await expect(page.getByTestId("lot-check-beans")).toBeVisible(); // undone: still due
});

test("Will it pay: the budget answers first, the farmer's own DAP price changes it and is remembered", async ({ page }) => {
  await start(page, "/shamba");
  await page.getByTestId("budget-open").click();
  await page.getByTestId("bud-crop-maize").click();
  await page.getByTestId("bud-sell").fill("45");
  await expect(page.getByTestId("bud-profit")).toHaveText("KES 16,000"); // 900 kg × 45 − 24,500 of costs
  await expect(page.getByTestId("bud-breakeven")).toContainText("KES 28 a kilo");
  await page.getByTestId("bud-price-dap").fill("2500");
  await expect(page.getByTestId("bud-profit")).toHaveText("KES 17,000");
  await page.getByTestId("sheet-budget").getByRole("button", { name: "Close" }).click();

  await page.getByTestId("budget-open").click();
  await page.getByTestId("bud-crop-maize").click();
  await expect(page.getByTestId("bud-price-dap")).toHaveValue("2500");
  await page.getByTestId("bud-cmp-beans").click(); // the comparison switches the crop
  await expect(page.getByTestId("bud-crop-beans")).toHaveAttribute("aria-checked", "true");
});

test("A fresh harvest is recorded as a sale with its kilos", async ({ page }) => {
  await start(page, "/shamba", "en", { plantings: [planted("tomato", 80, 0.5)] });
  await page.getByTestId("harvest-tomato").click();
  await expect(page.getByTestId("record-kg")).toBeVisible(); // opened as income · crop sale
  await page.getByTestId("record-amount").fill("3000");
  await page.getByTestId("record-kg").fill("60");
  await page.getByTestId("record-save").click();
  await page.getByRole("radio", { name: "Records" }).click();
  await expect(page.getByText("60 kg · KES 50/kg")).toBeVisible();
});

test("Eggs: a laying flock gets an egg log with trays and the week's total", async ({ page }) => {
  await start(page, "/shamba?tab=livestock");
  await page.getByTestId("herd-add").first().click();
  await page.getByTestId("sp-chicken").click();
  await page.getByTestId("animal-name").fill("Layers");
  await page.getByTestId("animal-count").fill("100");
  await page.getByRole("radio", { name: "6 months ago" }).click();
  await page.getByTestId("animal-save").click();

  await page.getByTestId("egg-add").click();
  await page.getByTestId("egg-count").fill("85");
  await expect(page.getByText("= 2 trays + 25 · 85% of hens")).toBeVisible();
  await page.getByTestId("egg-price").fill("450");
  await page.getByTestId("egg-save").click();
  await expect(page.getByTestId("egg-week")).toHaveText("This week: 85 eggs (2 trays + 25) · ≈ KES 1,275");
});

test("Field size by pacing fills in the acres", async ({ page }) => {
  await start(page, "/shamba");
  await page.getByTestId("farm-add-crop").first().click();
  await page.getByTestId("measure-open").click();
  await page.getByTestId("measure-length").fill("64");
  await page.getByTestId("measure-width").fill("64");
  await expect(page.getByTestId("measure-result")).toHaveText("≈ 1.01 acres (4,096 m²)");
  await page.getByTestId("measure-use").click();
  await expect(page.getByTestId("sheet-add-crop").getByText("1.01", { exact: true })).toBeVisible();
  await page.getByTestId("add-crop-save").click();
  await expect(page.getByText(/Planted .* · 1.01 acres/)).toBeVisible();
});

test("Scouting: a W-walk on young maize gives the verdict, ticks the scouting task and can be shared with the county", async ({ page }) => {
  await start(page, "/daktari", "en", { county: "Nyeri", plantings: [planted("maize", 25, 1)] });
  await page.getByTestId("scout-open").click();
  for (const [stop, n] of [[1, 3], [2, 2], [3, 4], [4, 1], [5, 3]])
    for (let i = 0; i < n; i++) await page.getByTestId(`scout-stop-${stop}`).getByRole("button", { name: /\+/ }).click();
  await expect(page.getByTestId("scout-verdict")).toContainText("13 of 50 plants · 26%");
  await expect(page.getByTestId("scout-verdict")).toContainText("Below the 40% action level"); // day 25: the 40 % threshold
  await page.getByTestId("scout-share").click();
  await page.getByTestId("scout-save").click();
  await expect(page.getByTestId("scout-last")).toContainText("26%");
  await expect(page.getByTestId("pest-watch")).toContainText(/reported in the last 14 days/);

  await page.goto("/shamba");
  await expect(page.getByTestId("scout-line-e2e0")).toContainText("26% of plants (act at 40%)");
  await page.getByTestId("planting-toggle-maize").click();
  await expect(page.getByTestId("task-maize-faw1")).toHaveAttribute("aria-checked", "true"); // the walk ticked it
});

test("Pest watch: when neighbours find fall armyworm above the threshold, Today says so and opens scouting", async ({ page, context }) => {
  await context.route("http://localhost:4517/api/pests/watch**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ county: "Kakamega", pest: "faw", window_days: 14, source: "FARMERS", reports: 5, over_threshold: 3, avg_pct: 34, max_pct: 52, last_report: null, level: "high" }),
  }));
  await start(page, "/", "en", { county: "Kakamega", plantings: [planted("maize", 20)] });
  await expect(page.getByTestId("pest-watch")).toContainText("5 farms reported");
  await expect(page.getByTestId("pest-watch")).toContainText("3 of them above the action level");
  await page.getByTestId("watch-scout").click();
  await expect(page.getByTestId("scout-open")).toBeVisible();
  await expect(page.getByTestId("dr-crop-maize")).toHaveAttribute("aria-checked", "true");
});

test("Push-pull: the planner sizes desmodium and the Napier border for the plot", async ({ page }) => {
  await start(page, "/daktari", "en", { plantings: [planted("maize", 10, 1)] });
  await page.getByTestId("pp-open").click();
  await expect(page.getByTestId("pp-plan")).toContainText("2 · about 45 × 45 m");
  await expect(page.getByTestId("pp-plan")).toContainText("1 kg of seed");
});

test("Soil: an acid soil test adds lime to the input list; the seed check is there too", async ({ page }) => {
  await start(page, "/shamba", "en", { county: "Kisii" });
  await page.getByTestId("farm-profile").click();
  await page.getByTestId("ph-set").click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Soil pH \(from a soil test\) −/ }).click(); // 5.5 → 5.2
  await expect(page.getByTestId("ph-band")).toHaveText("Acid: most crops will gain from lime.");
  await page.getByTestId("farm-save").click();

  await page.getByTestId("farm-add-crop").first().click();
  await page.getByTestId("crop-maize").click();
  await expect(page.getByTestId("lime-line")).toContainText("400 kg · 8 bags of 50 kg");
  await expect(page.getByTestId("genuine-note")).toContainText("SMS the code to 1397");
  await page.getByTestId("crop-potatoes").click(); // potatoes are not limed at 5.2
  await expect(page.getByTestId("lime-none")).toBeVisible();
});

test("Dairy: water and dairy meal per cow; co-op deliveries and a payslip that is short", async ({ page }) => {
  const milk = [1, 2, 3, 4, 5].map((d) => ({ id: `m${d}`, animalId: "c1", date: `@${d}`, litres: 14 }));
  await start(page, "/shamba?tab=livestock", "en", undefined, {
    v: 1, animals: [{ id: "c1", species: "cow", name: "Neema", female: true, events: [{ id: "b", kind: "birth", date: "@60" }] }],
    milk, done: {}, milkPrice: null,
  });
  await expect(page.getByTestId("feed-c1")).toHaveText("Neema (14 L a day): water ≈ 128 L (7 jerrycans of 20 L) · dairy meal ≈ 5.5 kg");

  await page.getByTestId("delivery-add").click();
  await page.getByTestId("coop-price").fill("50");
  await page.getByTestId("coop-ded").fill("5");
  await page.getByTestId("delivery-save").click(); // 10 L today
  await expect(page.getByTestId("coop-month")).toContainText("10 L delivered (1 day)");
  await expect(page.getByTestId("coop-month")).toContainText("Expected pay ≈ KES 450");

  await page.getByTestId("payslip-open").click();
  const now = new Date();
  await page.getByTestId(`slip-month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).click();
  await page.getByTestId("slip-litres").fill("8");
  await expect(page.getByTestId("slip-result")).toContainText("2 L missing from the payslip (≈ KES 90)");
});

test("Hatching: candling shows on Today; on hatch day the chicks become a flock", async ({ page }) => {
  await start(page, "/", "en", undefined, {
    v: 1, animals: [], milk: [], done: {}, milkPrice: null,
    hatches: [{ id: "h1", set: "@7", eggs: 12, method: "hen" }, { id: "h2", set: "@21", eggs: 10, method: "incubator" }],
  });
  const candle = page.getByTestId("hatch-step-candle1");
  await expect(candle).toContainText("Candle the 12 eggs");
  await candle.click();
  await expect(candle).toHaveAttribute("aria-checked", "true");
  await candle.click();
  await expect(candle).toHaveAttribute("aria-checked", "false");

  await page.goto("/shamba?tab=livestock");
  await page.getByTestId("hatch-chicks-h2").click();
  await expect(page.getByTestId("animal-count")).toHaveValue("10");
  await page.getByTestId("animal-save").click();
  await expect(page.getByTestId("hatch-h2")).toHaveCount(0);
  await expect(page.getByText("10 birds · 0 weeks old")).toBeVisible();
});

const NEWS = {
  county: "Nakuru", fetched_at: "2026-10-05T06:00:00.000Z", source: "LIVE",
  items: [
    { id: "n1", title: "Nakuru farmers warned over counterfeit pesticides", source: "The Standard", link: "https://example.com/n1", published: new Date(Date.now() - 3 * 3600_000).toISOString(), summary: "Farmers in Nakuru have been asked to check labels.", image: null, scope: "county", county: "Nakuru" },
    { id: "n2", title: "Maize prices ease as the harvest starts", source: "Kilimo News", link: "https://example.com/n2", published: new Date(Date.now() - 2 * 86400_000).toISOString(), summary: "", image: null, scope: "national", county: null },
  ],
};
const SHOWS = {
  county: "Nakuru", today: todayKey(), theme: "", source: "ASK 2026 calendar",
  events: [
    { id: "ask-kitale-2026", name: "Kitale National Show", organiser: "Agricultural Society of Kenya", town: "Kitale", county: "Trans Nzoia", venue: "Kitale Showground", start: "2026-10-07", end: "2026-10-10", kind: "show", url: "https://ask.co.ke/calendar-of-events1/", estimated: false, days_until: 2, distance_km: 127 },
    { id: "ask-nakuru-2026", name: "Nakuru National Agricultural Show", organiser: "Agricultural Society of Kenya", town: "Nakuru", county: "Nakuru", venue: "Nakuru Showground", start: "2027-07-01", end: "2027-07-05", kind: "show", url: null, estimated: true, days_until: 269, distance_km: 0 },
  ],
};
const BOOKING = {
  booking_id: "bk1", token: "tok", status: "BOOKED", event: SHOWS.events[0], email: "SIMULATED", remind_on: "2026-10-04",
  calendar_url: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Kitale+National+Show", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
  steps: [
    { agent: "Scout", action: "Found Kitale National Show", latency_ms: 1 },
    { agent: "Planner", action: "Prepared the calendar entry (.ics and a Google Calendar link)", latency_ms: 2 },
    { agent: "Messenger", action: "Simulated (no SMTP configured) the confirmation email to w•••@example.com", latency_ms: 3 },
    { agent: "Reminder", action: "Reminder email scheduled for 2026-10-04 (3 days before)", latency_ms: 4 },
  ],
};
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

test("Trivia: the day's five questions on a slider; a right answer explains itself, the score persists", async ({ page }) => {
  await start(page, "/", "en", { county: "Nakuru" });
  const ids = pickDaily(todayKey(), {});
  const first = byId(ids[0])!;
  const card = page.getByTestId("trivia-card");
  await card.scrollIntoViewIfNeeded();
  await expect(page.getByText("0/5 today")).toBeVisible();
  await expect(card.getByText(first.q.en)).toBeVisible();
  await page.getByTestId(`trivia-option-1-${first.answer}`).click();
  await expect(page.getByTestId("trivia-why").first()).toContainText("Correct!");
  await expect(page.getByTestId("trivia-why").first()).toContainText(first.why.en);
  await expect(page.getByText("1/5 today")).toBeVisible();
  await page.getByTestId("trivia-next").first().click();
  await expect(page.getByTestId("trivia-dot-1")).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(page.getByText("1/5 today")).toBeVisible(); // kept on the phone
  const wrong = (first.answer + 1) % first.options.length;
  await expect(page.getByTestId(`trivia-option-1-${wrong}`)).toBeDisabled(); // already answered today
});

test("Farm news: the county's story comes first and opens; a sample tip opens the app screen it is about", async ({ page, context }) => {
  await context.route("http://localhost:4517/api/news**", (r) => r.fulfill(json(NEWS)));
  await context.route("https://example.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>story</html>" })); // the test browser has no internet
  await start(page, "/", "en", { county: "Nakuru" });
  const card = page.getByTestId("news-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Nakuru farmers warned over counterfeit pesticides");
  await expect(card).toContainText("The Standard · 3 h ago");
  await expect(card.getByText("Nakuru", { exact: true })).toBeVisible(); // the county tag
  const popup = page.waitForEvent("popup");
  await page.getByTestId("news-open-n1").click();
  expect((await popup).url()).toBe("https://example.com/n1");
  await page.getByTestId("news-dot-1").click();
  await expect(page.getByTestId("news-dot-1")).toHaveAttribute("aria-selected", "true");
  await expect(card).toContainText("2 days ago");

  await context.unroute("http://localhost:4517/api/news**");
  await context.route("http://localhost:4517/api/news**", (r) => r.fulfill(json({
    county: "Nakuru", fetched_at: NEWS.fetched_at, source: "SAMPLE",
    items: [{ id: "tip-faw", title: "Scout maize weekly for fall armyworm", title_sw: "Kagua mahindi", source: "KilimoOrbit", link: null, route: "/daktari?crop=maize", published: null, summary: "", image: null, scope: "tip", county: null }],
  })));
  await page.reload();
  await page.getByTestId("news-card").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("news-card")).toContainText("KilimoOrbit tips, not today's news");
  await page.getByTestId("news-open-tip-faw").click();
  await expect(page.getByTestId("scout-open")).toBeVisible();
});

test("Farm shows: the nearest shows slide; booking runs the agent, offers Google Calendar, and can be cancelled", async ({ page, context }) => {
  await context.route("http://localhost:4517/api/events?**", (r) => r.fulfill(json(SHOWS)));
  await context.route("http://localhost:4517/api/events/book", (r) => r.fulfill(json(BOOKING, 201)));
  await start(page, "/", "en", { county: "Nakuru" });
  const card = page.getByTestId("shows-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Kitale National Show");
  await expect(card).toContainText("7–10 Oct · Kitale · 127 km away");
  await expect(card).toContainText("In 2 days");
  await page.getByTestId("shows-dot-1").click();
  await expect(card.getByText("Estimated", { exact: true })).toBeVisible();

  await page.getByTestId("show-open-ask-kitale-2026").click();
  await page.getByTestId("show-email").fill("wanjiru@example.com");
  await page.getByTestId("show-remind-7").click();
  await page.getByTestId("show-book").click();
  await expect(page.getByTestId("agent-step-3")).toContainText("Reminder email scheduled");
  await expect(page.getByTestId("show-done")).toContainText("no email (SMTP) set up yet");
  await expect(page.getByTestId("show-calendar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.getByText("You're going ✓")).toBeVisible();

  await page.getByTestId("show-open-ask-kitale-2026").click();
  await expect(page.getByTestId("show-mine")).toContainText("reminder is logged on the server");
  await page.getByTestId("show-cancel").click();
  await expect(card.getByText("You're going ✓")).toHaveCount(0);
});

test("Farm shows: when the server can't be reached, booking fails politely and the calendar link still works", async ({ page, context }) => {
  await context.route("http://localhost:4517/api/events?**", (r) => r.fulfill(json(SHOWS)));
  await context.route("http://localhost:4517/api/events/book", (r) => r.abort());
  await context.route("https://calendar.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>calendar</html>" }));
  await start(page, "/", "en", { county: "Nakuru" });
  await page.getByTestId("shows-card").scrollIntoViewIfNeeded();
  await page.getByTestId("show-open-ask-kitale-2026").click();
  await page.getByTestId("show-book").click();
  await expect(page.getByTestId("show-failed")).toContainText("Couldn't reach the KilimoOrbit server");
  const popup = page.waitForEvent("popup");
  await page.getByTestId("show-calendar").click();
  expect((await popup).url()).toContain("calendar.google.com/calendar/render?action=TEMPLATE");
});

test("Connection: the offline banner opens the server screen; a typed address is tested, saved and shown in settings", async ({ page, context }) => {
  await context.route("http://localhost:4517/**", (r) => r.abort());
  await start(page, "/", "en", { county: "Nakuru" });
  await page.getByTestId("fix-connection").click();
  await expect(page.getByTestId("conn-status")).toContainText(/did not answer|cannot reach/);
  await expect(page.getByText("Is the server running on the computer?")).toBeVisible();
  await context.unroute("http://localhost:4517/**");

  await page.getByTestId("conn-input").fill("127.0.0.1:4517"); // the test server, by another name
  await page.getByTestId("conn-test").click();
  await expect(page.getByTestId("conn-status")).toContainText("Connected");
  await page.getByTestId("conn-save").click();
  await expect(page.getByText("Can't reach KilimoOrbit right now.")).toHaveCount(0);

  // The sidebar is a drawer on phones (menu button) and docked on desktop.
  const menu = page.locator('[data-ko-menu-button="1"]');
  if (await menu.count()) await menu.first().click();
  await expect(page.getByTestId("settings-server")).toContainText("127.0.0.1:4517");
  await page.getByTestId("settings-server").click();
  await page.getByTestId("conn-auto").click();
  await expect(page.getByTestId("conn-status")).toContainText("localhost:4517");
});

test("Markets: each crop chip carries today's best price; there is no ticker", async ({ page }) => {
  await start(page, "/masoko");
  await expect(page.getByTestId("mk-crop-maize")).toContainText(/KES \d+/);
  await expect(page.getByText(/E-BODA/)).toHaveCount(0);
});

test("Type: the bundled serif and sans are loaded and used (greeting and question in Fraunces, the rest in Nunito Sans)", async ({ page }) => {
  await start(page, "/", "en", { county: "Nakuru" });
  await expect(page.getByText("0/5 today")).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(loaded).toEqual(expect.arrayContaining(["Fraunces_600SemiBold", "NunitoSans_400Regular", "NunitoSans_700Bold"]));
  const greeting = page.getByRole("heading").filter({ hasText: /^(Good (morning|afternoon|evening|night)|Hello|Habari|Jambo)/ }).first();
  await expect(greeting).toHaveCSS("font-family", /Fraunces_600SemiBold/);
  const first = byId(pickDaily(todayKey(), {})[0])!;
  await expect(page.getByTestId("trivia-card").getByText(first.q.en)).toHaveCSS("font-family", /Fraunces_600SemiBold/);
  await expect(page.getByText("0/5 today")).toHaveCSS("font-family", /NunitoSans_700Bold/);
  await expect(page.getByTestId("trivia-option-1-0").getByText(first.options[0].en)).toHaveCSS("font-family", /NunitoSans_600SemiBold/);
});

test("Trivia: the slider's dots turn green for a right answer and red for a wrong one", async ({ page }) => {
  await start(page, "/", "en", { county: "Nakuru" });
  const ids = pickDaily(todayKey(), {});
  const first = byId(ids[0])!;
  const second = byId(ids[1])!;
  await page.getByTestId("trivia-card").scrollIntoViewIfNeeded();
  await page.getByTestId(`trivia-option-1-${first.answer}`).click();
  await expect(page.getByTestId("trivia-dot-0").locator("div").first()).toHaveCSS("background-color", "rgb(111, 191, 115)"); // Loam: ok
  await page.getByTestId("trivia-next").first().click();
  const wrong = (second.answer + 1) % second.options.length;
  await page.getByTestId(`trivia-option-2-${wrong}`).click();
  await expect(page.getByTestId("trivia-why").nth(1)).toContainText("Not quite");
  await expect(page.getByTestId("trivia-dot-1").locator("div").first()).toHaveCSS("background-color", "rgb(224, 83, 47)"); // Loam: alert
  await expect(page.getByText("2/5 today")).toBeVisible();
});

test("Design: every section label wears its section's colour with an icon badge; buttons that commit carry an icon", async ({ page }) => {
  await start(page, "/", "en", { county: "Nakuru" });
  await expect(page.getByTestId("eyebrow-weather").first().getByRole("heading")).toHaveCSS("color", "rgb(142, 197, 232)"); // Loam: water
  await expect(page.getByTestId("eyebrow-farm").first().getByRole("heading")).toHaveCSS("color", "rgb(111, 191, 115)"); // Loam: ok
  await expect(page.getByTestId("eyebrow-quiz").first().getByRole("heading")).toHaveCSS("color", "rgb(124, 212, 193)"); // Loam: teal
  await expect(page.getByTestId("eyebrow-news").first().getByRole("heading")).toHaveCSS("color", "rgb(201, 185, 242)"); // Loam: violet
  // the badge is a tinted square before the label
  const badge = page.getByTestId("eyebrow-weather").first().getByTestId("icon-badge");
  await expect(badge).toHaveCSS("background-color", "rgba(142, 197, 232, 0.16)");
  // a committing button shows its icon next to the label
  await page.getByTestId("trivia-card").scrollIntoViewIfNeeded();
  const first = byId(pickDaily(todayKey(), {})[0])!;
  await page.getByTestId(`trivia-option-1-${first.answer}`).click();
  const next = page.getByTestId("trivia-next").first();
  await expect(next).toBeVisible();
  expect(await next.locator("div").count()).toBeGreaterThan(0); // the arrow glyph
});

test("Weather: the hero draws the sky for the conditions and the hour, with stat tiles; a live forecast says so", async ({ page, context }) => {
  // A rainy evening: the forecast is stubbed from the server's own sample, the clock fixed at 20:30.
  const base = await (await fetch("http://localhost:4517/api/weather?county=Nakuru")).json();
  const rainy = { ...base, source: "OPEN_METEO", days: base.days.map((d: any, i: number) => (i === 0 ? { ...d, sky: "rain", rain_chance: 82, rain_mm: 14 } : d)) };
  await context.route("http://localhost:4517/api/weather**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rainy) }));
  const evening = new Date(); evening.setHours(20, 30, 0, 0);
  await page.clock.setFixedTime(evening);
  await start(page, "/", "en", { county: "Nakuru" });
  const hero = page.getByTestId("wx-hero");
  await expect(hero).toBeVisible();
  await expect(page.getByTestId("sky-rain-night")).toBeVisible();
  await expect(hero).toContainText("Rain");
  await expect(page.getByTestId("wx-stat-rain")).toContainText("82%");
  await expect(page.getByTestId("wx-live")).toContainText("Open-Meteo");
  await expect(page.getByTestId("eyebrow-weather").first().getByText("DEMO", { exact: true })).toHaveCount(0); // a live forecast carries no sample tag (other cards may)
});
