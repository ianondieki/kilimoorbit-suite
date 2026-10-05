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

async function start(page: Page, path: string, lang: "en" | "sw" = "en", farm?: { county?: string; plantings?: ReturnType<typeof planted>[] }) {
  await page.addInitScript(([l, f]) => {
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
      }));
    }
  }, [lang, farm ?? null] as const);
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
  "ko-farm": JSON.stringify({ county: 42, acres: "big", plantings: [{ id: 1, crop: "maize" }, { id: "p", crop: "maize", acres: 1, plantedOn: "2026-13-45" }, null], entries: "no", done: [] }),
  "ko-herd": JSON.stringify({ animals: [{ id: "a", species: "cow", events: [{ id: "e", kind: "served", date: "bad" }, { kind: "birth" }] }, { id: 5 }, { id: "b", species: "dragon" }], milk: [{ animalId: "a", litres: "x" }], done: "x", milkPrice: -3 }),
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
  for (const path of ["/", "/shamba", "/shamba?tab=livestock", "/shamba?tab=records", "/masoko", "/daktari", "/chat", "/autopilot"]) {
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
  await start(page, "/");
  await expect(page.getByText("Can't reach KilimoOrbit right now.")).toBeVisible();
  await expect(page.getByText("The forecast will show when you're online.")).toBeVisible();
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
