/**
 * Farmer flows end to end: Today (weather windows, tasks), Shamba (calendar,
 * records), Masoko (price comparison), Daktari (diagnosis → Apex), offline,
 * and Kiswahili. Each test starts signed in on a fresh phone (empty storage).
 */
import { test, expect, type Page } from "@playwright/test";

async function start(page: Page, path: string, lang: "en" | "sw" = "en") {
  await page.addInitScript((l) => {
    if (sessionStorage.getItem("ko-e2e-seeded")) return;
    sessionStorage.setItem("ko-e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("ko-profile", JSON.stringify({
      v: 2, name: "Wanjiru Kamau", method: "phone", phone: "+254712345678",
      lang: l, signedInAt: new Date().toISOString(), serverAck: true,
    }));
    localStorage.setItem("ko-lang", l);
  }, lang);
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
