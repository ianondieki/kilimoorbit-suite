/**
 * Farm weather verification suite (src/agro/weather.js).
 * Pure functions only: no server, no network (Open-Meteo is a stubbed fetch),
 * so it is fast and deterministic.
 */
import {
  COUNTIES, findCounty, sampleForecast, withWindows, forecastFor, mapOpenMeteo, seasonOfMonth, eatDateKey, _clearCache,
  SPRAY_MAX_WIND_KMH, PLANT_MIN_RAIN_MM,
} from "../agro/weather.js";
import { levelFor, priceOn, boardFor, historyFor } from "../agro/prices.js";
import { createPestWatch, sampleWatch, thresholdFor, validateReport, WINDOW_DAYS } from "../agro/pests.js";
import { createNews, decodeEntities, parseRss, SAMPLE_TIPS } from "../agro/news.js";
import {
  EVENTS, confirmationMessage, createBookings, distanceKm, eventsNear, findEvent, googleCalendarUrl, icsFor, reminderMessage, remindersOf, upcoming, validateBooking,
} from "../agro/events.js";
import { digestMessage, validateDigest } from "../agro/records.js";
import { readFileSync, unlinkSync } from "node:fs";

const FEED_PATH = new URL("../../payloads/commodity_feed.json", import.meta.url);
const freshFeed = () => JSON.parse(readFileSync(FEED_PATH, "utf8"));

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0, total = 0;
async function check(name, fn) {
  total++;
  let ok = false, detail = "";
  try { const r = await fn(); ok = r?.ok ?? Boolean(r); detail = r?.detail ?? ""; }
  catch (err) { detail = `threw: ${err?.message ?? err}`; }
  if (ok) passed++;
  console.log(`  ${ok ? C.green("PASS") : C.red("FAIL")}  ${name}${detail ? C.dim("  · " + detail) : ""}`);
}

const day = (o) => ({ date: "2026-10-05", tmax: 25, tmin: 13, rain_mm: 0, rain_chance: 10, wind_kmh: 8, sky: "sunny", ...o });
const meru = findCounty("Meru");
const OCT = new Date("2026-10-05T06:00:00Z");

console.log(C.bold("\n" + "═".repeat(57)));
console.log(C.bold("  FARM WEATHER + MARKET PRICES"));
console.log("═".repeat(57));

await check("47 counties, unique names, coordinates inside Kenya", () => {
  const names = new Set(COUNTIES.map((c) => c.name));
  const inKenya = COUNTIES.every((c) => c.lat > -5 && c.lat < 5.1 && c.lon > 33.9 && c.lon < 42 && c.alt >= 0 && c.alt < 3000);
  return { ok: COUNTIES.length === 47 && names.size === 47 && inKenya, detail: `${COUNTIES.length} counties` };
});

await check("findCounty ignores case, spaces, hyphens, apostrophes", () =>
  findCounty("muranga")?.name === "Murang'a" && findCounty("  UASIN gishu ")?.name === "Uasin Gishu" &&
  findCounty("taita taveta")?.name === "Taita-Taveta" && findCounty("Atlantis") === null);

await check("sample forecast: 7 days from today (EAT), deterministic", () => {
  const a = sampleForecast(meru, { now: OCT });
  const b = sampleForecast(meru, { now: OCT });
  return { ok: a.length === 7 && a[0].date === "2026-10-05" && a[6].date === "2026-10-11" && JSON.stringify(a) === JSON.stringify(b), detail: a.map((d) => d.sky).join(",") };
});

await check("EAT date key: 22:30 UTC is already tomorrow in Nairobi", () =>
  eatDateKey(new Date("2026-10-05T22:30:00Z")) === "2026-10-06");

await check("a given date keeps its weather when the window slides", () => {
  const a = sampleForecast(meru, { now: OCT });
  const b = sampleForecast(meru, { now: new Date("2026-10-06T06:00:00Z") });
  return JSON.stringify(a[1]) === JSON.stringify(b[0]);
});

await check("sample values stay plausible in every county and season", () => {
  const bad = [];
  for (const c of COUNTIES)
    for (const m of [0, 3, 6, 10]) {
      for (const d of sampleForecast(c, { now: new Date(Date.UTC(2026, m, 10, 6)) })) {
        if (!(d.tmax > d.tmin && d.tmax <= 40 && d.tmin >= 0 && d.rain_mm >= 0 && d.rain_mm < 80 && d.rain_chance >= 0 && d.rain_chance <= 100 && d.wind_kmh >= 0 && d.wind_kmh < 60))
          bad.push(`${c.name} ${d.date}`);
      }
    }
  return { ok: bad.length === 0, detail: bad.slice(0, 3).join("; ") };
});

await check("rainy seasons are wetter than dry ones (Nakuru, 4 weeks)", () => {
  const n = findCounty("Nakuru");
  const sum = (m) => [1, 8, 15, 22].reduce((s, dd) => s + sampleForecast(n, { now: new Date(Date.UTC(2026, m, dd, 6)) }).reduce((x, d) => x + d.rain_mm, 0), 0);
  const april = sum(3), feb = sum(1);
  return { ok: april > feb, detail: `Apr ${april.toFixed(0)} mm vs Feb ${feb.toFixed(0)} mm` };
});

await check("highlands are cooler than the coast", () => {
  const avg = (c) => sampleForecast(findCounty(c), { now: OCT }).reduce((s, d) => s + d.tmax, 0) / 7;
  return { ok: avg("Nyandarua") + 5 < avg("Mombasa"), detail: `Nyandarua ${avg("Nyandarua").toFixed(1)}° vs Mombasa ${avg("Mombasa").toFixed(1)}°` };
});

await check("spray window: calm dry day ok; rain or wind blocks it", () => {
  const [calm, rain, wind] = withWindows([day({}), day({ rain_chance: 70, rain_mm: 6 }), day({ wind_kmh: SPRAY_MAX_WIND_KMH + 1 })]);
  return calm.spray.ok && !rain.spray.ok && rain.spray.reason === "rain" && !wind.spray.ok && wind.spray.reason === "wind";
});

await check(`plant window: needs ≥ ${PLANT_MIN_RAIN_MM} mm over 3 days`, () => {
  const d = withWindows([day({ rain_mm: 5 }), day({ rain_mm: 8 }), day({ rain_mm: 9 }), day({ rain_mm: 0 })]);
  return { ok: d[0].plant.ok && d[0].plant.rain_3d_mm === 22 && !d[1].plant.ok && !d[3].plant.ok, detail: d.map((x) => x.plant.rain_3d_mm).join("/") };
});

await check("dry window: blocked by rain chance ≥ 30 %", () => {
  const [a, b] = withWindows([day({ rain_chance: 20 }), day({ rain_chance: 35 })]);
  return a.dry.ok && !b.dry.ok;
});

await check("Open-Meteo daily block maps to our day shape", () => {
  const days = mapOpenMeteo({
    daily: {
      time: ["2026-10-05", "2026-10-06"], temperature_2m_max: [24.6, 21.2], temperature_2m_min: [12.1, 13.4],
      precipitation_sum: [0, 12.34], precipitation_probability_max: [5, 80], wind_speed_10m_max: [9.4, 18.6], weather_code: [0, 63],
    },
  });
  return { ok: days.length === 2 && days[0].sky === "sunny" && days[0].tmax === 25 && days[1].sky === "rain" && days[1].rain_mm === 12.3 && days[1].wind_kmh === 19, detail: JSON.stringify(days[1]) };
});

await check("WEATHER_PROVIDER=open-meteo uses the live answer", async () => {
  _clearCache();
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ daily: { time: ["2026-10-05"], temperature_2m_max: [23], temperature_2m_min: [11], precipitation_sum: [1.2], precipitation_probability_max: [55], wind_speed_10m_max: [7], weather_code: [61] } }),
  });
  const r = await forecastFor(meru, { provider: "open-meteo", now: OCT, fetchImpl });
  return { ok: r.source === "OPEN_METEO" && r.days.length === 1 && r.days[0].sky === "showers" && r.days[0].spray.ok === false, detail: r.source };
});

await check("Open-Meteo failure → SAMPLE with a fallback reason (never throws)", async () => {
  _clearCache();
  const r = await forecastFor(meru, { provider: "open-meteo", now: OCT, fetchImpl: async () => ({ ok: false, status: 503 }) });
  return { ok: r.source === "SAMPLE" && r.fallback?.from === "OPEN_METEO" && /503/.test(r.fallback.reason) && r.days.length === 7, detail: r.fallback?.reason };
});

await check("forecast carries county, season and windows on every day", async () => {
  const r = await forecastFor(meru, { provider: "", now: OCT });
  return { ok: r.county === "Meru" && r.season === seasonOfMonth(9) && r.season === "vuli" && r.days.every((d) => d.spray && d.plant && d.dry), detail: `${r.source} · ${r.season}` };
});

console.log(C.bold("  — market prices —"));

await check("price levels stay within ±15 % of base for a whole year", () => {
  const feed = freshFeed();
  let lo = 9, hi = 0;
  for (const c of feed.commodities)
    for (const q of c.quotes)
      for (let i = 0; i < 365; i += 3) {
        const l = levelFor(c.crop, q.market, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
        lo = Math.min(lo, l); hi = Math.max(hi, l);
      }
  return { ok: lo > 0.84 && hi < 1.16, detail: `${lo.toFixed(3)}–${hi.toFixed(3)}` };
});

await check("history: 14 days ending today, deterministic, 7-day change matches", () => {
  const a = historyFor(freshFeed(), "maize", { now: OCT });
  const b = historyFor(freshFeed(), "MAIZE", { now: OCT });
  const m = a.markets[0];
  const want = Math.round(((m.prices[13] - m.prices[6]) / m.prices[6]) * 1000) / 10;
  return { ok: a.dates.length === 14 && a.dates[13] === "2026-10-05" && JSON.stringify(a) === JSON.stringify(b) && m.change_7d_pct === want && a.markets.length === 3, detail: `${m.market} ${m.prices.join(",")} (${m.change_7d_pct}%)` };
});

await check("history: unknown crop → null", () => historyFor(freshFeed(), "unobtainium") === null);

await check("board without jitter = today's history close; delta = change since yesterday", () => {
  const board = boardFor(freshFeed(), { now: OCT });
  const h = historyFor(freshFeed(), "tomato", { now: OCT });
  const q = board.commodities.find((c) => c.crop === "tomato").quotes[0];
  const m = h.markets.find((x) => x.market === q.market);
  return { ok: q.price === m.prices[13] && q.delta === m.prices[13] - m.prices[12], detail: `${q.market} ${q.price} (${q.delta >= 0 ? "+" : ""}${q.delta})` };
});

await check("live jitter stays within ±1 % of the day's price", () => {
  const ref = boardFor(freshFeed(), { now: OCT });
  const live = boardFor(freshFeed(), { now: OCT, jitter: 0.01, rand: () => 0.999 });
  const bad = [];
  ref.commodities.forEach((c, i) => c.quotes.forEach((q, j) => {
    const p = live.commodities[i].quotes[j].price;
    if (Math.abs(p - q.price) > Math.max(1, q.price * 0.011)) bad.push(`${c.crop}@${q.market}`);
  }));
  return { ok: bad.length === 0, detail: bad.join(", ") };
});

await check("priceOn never drops below 1 shilling", () => priceOn(1, "x", "y", "2026-10-05") >= 1);

/* ── pest watch ── */
await check("pest report: valid → canonical county, percent, threshold by crop age", () => {
  const young = validateReport({ county: "muranga", crop: "Maize", plants: 50, hit: 11, age_days: 14 }).report;
  const older = validateReport({ county: "Meru", crop: "maize", plants: 50, hit: 11, age_days: 30 }).report;
  return {
    ok: young.county === "Murang'a" && young.pct === 22 && young.over === true && older.over === false
      && thresholdFor(17) === 20 && thresholdFor(18) === 40 && thresholdFor(null) === 40,
    detail: `${young.county} ${young.pct}% over=${young.over}; day 30 over=${older.over}`,
  };
});

await check("pest report: junk is refused field by field, extra keys are not kept", () => {
  const bad = [
    validateReport(null), validateReport([]), validateReport({}),
    validateReport({ county: "Atlantis", crop: "maize", plants: 50, hit: 1 }),
    validateReport({ county: "Meru", crop: "rice", plants: 50, hit: 1 }),
    validateReport({ county: "Meru", crop: "maize", plants: 5, hit: 1 }),
    validateReport({ county: "Meru", crop: "maize", plants: 50, hit: 51 }),
    validateReport({ county: "Meru", crop: "maize", plants: 50.5, hit: 1 }),
    validateReport({ county: "Meru", crop: "maize", plants: 50, hit: "3" }),
    validateReport({ county: "Meru", crop: "maize", plants: 50, hit: 3, age_days: "ten" }),
    validateReport({ county: "Meru", crop: "maize", plants: 50, hit: 3, pest: "locust" }),
  ];
  const kept = validateReport({ county: "Meru", crop: "maize", plants: 50, hit: 3, phone: "+254712345678", name: "Wanjiru" }).report;
  return { ok: bad.every((b) => b.error) && !("phone" in kept) && !("name" in kept), detail: bad.map((b) => (b.fields ?? []).join("+") || "body").join(" · ") };
});

await check("pest watch: farmer reports replace the sample; 14-day window; level", () => {
  const w = createPestWatch();
  const now = new Date("2026-10-05T09:00:00Z");
  const r = (hit, age = 30) => validateReport({ county: "Nyeri", crop: "maize", plants: 50, hit, age_days: age }).report;
  w.add(r(25), now); w.add(r(5), now); w.add(r(30), new Date("2026-09-01T09:00:00Z")); // last one is too old
  const nyeri = w.watch("nyeri", now);
  const meru = w.watch("Meru", now);
  return {
    ok: nyeri.source === "FARMERS" && nyeri.reports === 2 && nyeri.avg_pct === 30 && nyeri.max_pct === 50
      && nyeri.over_threshold === 1 && nyeri.level === "high" && nyeri.window_days === WINDOW_DAYS
      && meru.source === "SAMPLE" && w.watch("Atlantis", now) === null,
    detail: `Nyeri ${nyeri.reports} reports, avg ${nyeri.avg_pct}%, ${nyeri.level}; Meru ${meru.source}`,
  };
});

await check("pest watch: bounded memory drops the oldest reports", () => {
  const w = createPestWatch({ max: 3 });
  for (let i = 0; i < 5; i++) w.add(validateReport({ county: "Meru", crop: "maize", plants: 50, hit: i }).report);
  return { ok: w.size === 3, detail: `${w.size} kept` };
});

await check("sample watch: stable within a week, sane numbers", () => {
  const a = sampleWatch("Kakamega", new Date("2026-10-05T06:00:00Z"));
  const b = sampleWatch("Kakamega", new Date("2026-10-05T18:00:00Z"));
  return {
    ok: JSON.stringify(a) === JSON.stringify(b) && a.source === "SAMPLE" && a.reports >= 0 && a.reports <= 6
      && a.avg_pct >= 0 && a.max_pct <= 100 && ["none", "low", "high"].includes(a.level),
    detail: `${a.reports} reports, avg ${a.avg_pct}%, ${a.level}`,
  };
});

/* ── farm news ── */
const FEED = readFileSync(new URL("./fixtures/news_feed.xml", import.meta.url), "utf8");
const feedFetch = (text, status = 200) => async () => ({ ok: status === 200, status, text: async () => text });

await check("news: RSS items are parsed, cleaned and sorted newest first", () => {
  const items = parseRss(FEED, "Fixture");
  const [a, b] = items;
  return {
    ok: items.length === 4 && a.title === "Nakuru farmers warned over fake & expired pesticides" && a.source === "Fixture"
      && a.summary === "Farmers in Nakuru have been asked to check labels…" && a.image === "https://example.com/img.jpg"
      && a.published === "2026-10-03T03:00:00.000Z" && b.title === "Maize prices ease as harvest starts" && b.source === "Kilimo News" && b.summary === ""
      && decodeEntities("a &amp; b &#39;c&#x27; &nbsp;d") === "a & b 'c'  d" && parseRss("<not xml", "x").length === 0,
    detail: `${items.length} items · "${a.title}"`,
  };
});

await check("news: the county's items come first, old and duplicate stories are dropped, source LIVE", async () => {
  const news = createNews({ fetchImpl: feedFetch(FEED) });
  const r = await news.newsFor("Nakuru", { now: OCT });
  const titles = r.items.map((i) => i.title);
  return {
    ok: r.source === "LIVE" && r.county === "Nakuru" && r.items[0].scope === "county" && r.items[0].county === "Nakuru"
      && !titles.includes("Old story from last year") && titles.filter((t) => t === "Maize prices ease as harvest starts").length === 1
      && r.items.every((i) => /^https?:/.test(i.link)),
    detail: titles.join(" | "),
  };
});

await check("news: no feed reachable → SAMPLE tips (bilingual, in-app routes); a dead feed keeps its last copy", async () => {
  const dead = createNews({ fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
  const r = await dead.newsFor("Meru", { now: OCT });
  let calls = 0;
  const flaky = createNews({ fetchImpl: async () => { calls++; if (calls > 3) throw new Error("down"); return { ok: true, status: 200, text: async () => FEED }; } });
  const first = await flaky.newsFor("Nakuru", { now: OCT });
  const later = await flaky.newsFor("Nakuru", { now: new Date(OCT.getTime() + 2 * 60 * 60_000) }); // feeds down, cache 2 h old
  return {
    ok: r.source === "SAMPLE" && r.items.length === SAMPLE_TIPS.length && r.items.every((i) => i.title_sw && i.route && i.link === null)
      && first.source === "LIVE" && later.source === "CACHED" && later.items.length === first.items.length,
    detail: `dead → ${r.source} (${r.items.length}); flaky → ${first.source} then ${later.source}`,
  };
});

/* ── farm shows ── */
await check("shows: a past show is projected to next year and marked estimated; distances are sane", () => {
  const kitale = upcoming(findEvent("ask-kitale-2026"), "2026-10-05");
  const nakuru = upcoming(findEvent("ask-nakuru-2026"), "2026-10-05");
  const km = Math.round(distanceKm(findCounty("Nakuru"), findCounty("Nairobi")));
  return {
    ok: kitale.start === "2026-10-07" && kitale.estimated === false && kitale.days_until === 2
      && nakuru.start === "2027-07-01" && nakuru.end === "2027-07-05" && nakuru.estimated === true && km > 120 && km < 180
      && EVENTS.every((e) => findCounty(e.county) && e.start <= e.end),
    detail: `Kitale in ${kitale.days_until} days; Nakuru → ${nakuru.start} (estimated); Nakuru–Nairobi ${km} km`,
  };
});

await check("shows: eventsNear puts shows within 60 days first (soonest), then the rest nearest first; on-now case", () => {
  const near = eventsNear("Nakuru", { now: OCT, limit: 6 });
  const nairobi = eventsNear("Nairobi", { now: new Date("2026-09-30T06:00:00Z"), limit: 3 });
  const rest = near.events.slice(2);
  return {
    ok: near.county === "Nakuru" && near.events[0].id === "ask-kitale-2026" && near.events[1].id === "ask-ploughing-2026"
      && rest[0].id === "ask-nakuru-2026" && rest[0].distance_km === 0 && rest.every((e, i, a) => i === 0 || e.distance_km >= a[i - 1].distance_km)
      && nairobi.events[0].id === "ask-nairobi-2026" && nairobi.events[0].days_until < 0 && eventsNear("Atlantis") === null,
    detail: near.events.map((e) => `${e.town} ${e.distance_km}km ${e.start}`).join(" · "),
  };
});

await check("shows: Google Calendar link and .ics carry the dates (all-day, exclusive end) and a reminder alarm", () => {
  const ev = upcoming(findEvent("ask-kitale-2026"), "2026-10-05");
  const url = googleCalendarUrl(ev);
  const ics = icsFor(ev, { uid: "u1@kilimoorbit", remindDays: 3, now: OCT });
  return {
    ok: url.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE") && url.includes("dates=20261007%2F20261011")
      && url.includes("text=Kitale+National+Show") && ics.includes("DTSTART;VALUE=DATE:20261007") && ics.includes("DTEND;VALUE=DATE:20261011")
      && ics.includes("TRIGGER:-P3DT17H") && ics.includes("SUMMARY:Kitale National Show") && ics.includes("UID:u1@kilimoorbit") && ics.endsWith("END:VCALENDAR\r\n"),
    detail: url.slice(0, 90) + "…",
  };
});

await check("shows: booking validation refuses junk field by field", () => {
  const bad = [
    validateBooking(null), validateBooking({}), validateBooking({ event_id: "nope", name: "W" }),
    validateBooking({ event_id: "ask-kitale-2026", name: "" }), validateBooking({ event_id: "ask-kitale-2026", name: "W", email: "not-an-email" }),
    validateBooking({ event_id: "ask-kitale-2026", name: "W", remind_days: 2 }),
  ];
  const good = validateBooking({ event_id: "ask-nakuru-2026", name: "  Wanjiru   Kamau ", email: "W@Example.com", county: "nakuru", phone: "+254700000000" }, OCT);
  return {
    ok: bad.every((b) => b.error) && good.input.name === "Wanjiru Kamau" && good.input.email === "w@example.com" && good.input.county === "Nakuru"
      && good.input.remind_days === 3 && good.input.event.start === "2027-07-01" && !("phone" in good.input),
    detail: bad.map((b) => (b.fields ?? []).join("+") || "body").join(" · "),
  };
});

await check("shows: the booking agent runs scout → planner → messenger → reminder, emails a confirmation, reminds N days before and on the morning, cancels", async () => {
  const path = `${process.env.TMPDIR || "/tmp"}/events_test_${process.pid}.json`;
  try { unlinkSync(path); } catch {}
  const sent = [];
  const mailer = async (msg) => { sent.push(msg); };
  const store = createBookings({ storePath: path, now: () => OCT });
  const { input } = validateBooking({ event_id: "ask-kitale-2026", name: "Wanjiru", email: "w@example.com", remind_days: 1 }, OCT);
  const r = await store.book(input, { mailer });
  const silent = await store.book({ ...input, email: null }, { mailer });
  // The day before: the first reminder is due; the morning of the show: the second.
  const eve = createBookings({ storePath: path, now: () => new Date("2026-10-06T06:00:00Z") });
  const due = eve.due();
  const msg = reminderMessage(due[0], due[0].due_on);
  eve.markReminder(due[0].id, due[0].due_on, "SENT");
  const after = eve.due();
  const morning = createBookings({ storePath: path, now: () => new Date("2026-10-07T04:00:00Z") });
  const dayOf = morning.due();
  const dayOfMsg = reminderMessage(dayOf[0], dayOf[0].due_on);
  morning.markReminder(dayOf[0].id, dayOf[0].due_on, "SIMULATED");
  const done = morning.due();
  const sizeBefore = morning.size;
  const cancel = [morning.cancel(r.booking_id, "wrong"), morning.cancel(r.booking_id, r.token), morning.cancel(r.booking_id, r.token)];
  try { unlinkSync(path); } catch {}
  return {
    ok: r.status === "BOOKED" && r.steps.map((s) => s.agent).join(">") === "Scout>Planner>Messenger>Reminder" && r.email === "SENT" && r.remind_on === "2026-10-06"
      && r.reminders.join(",") === "2026-10-06,2026-10-07" && r.steps[3].action.includes("2026-10-06 (1 day before) and 2026-10-07 (the morning of the show)")
      && sent.length === 1 && sent[0].to === "w@example.com" && sent[0].attachments[0].content.includes("BEGIN:VEVENT") && r.ics.includes("TRIGGER:-P1DT17H")
      && sent[0].text.includes("We will email you a reminder on 2026-10-06 and 2026-10-07") && sent[0].html.includes("Add to Google Calendar")
      && silent.email === "NONE" && silent.steps.length === 4 && silent.reminders.length === 2
      && due.length === 1 && due[0].due_on === "2026-10-06" && msg.subject === "Kitale National Show starts tomorrow" && msg.html.includes("starts <strong>tomorrow</strong>") && after.length === 0
      && dayOf.length === 1 && dayOf[0].due_on === "2026-10-07" && dayOfMsg.subject === "Kitale National Show starts today" && done.length === 0
      && sizeBefore === 2 && cancel.join(",") === "forbidden,ok,missing" && morning.size === 1,
    detail: `${r.steps.length} steps · reminders ${r.reminders.join(" + ")} · "${msg.subject}" · "${dayOfMsg.subject}"`,
  };
});

await check("shows: a show that starts today gets only the morning reminder; an older one-reminder record still reads", async () => {
  const store = createBookings({ now: () => new Date("2026-10-07T05:00:00Z") });
  const { input } = validateBooking({ event_id: "ask-kitale-2026", name: "Wanjiru", email: "w@example.com", remind_days: 3 }, new Date("2026-10-07T05:00:00Z"));
  const r = await store.book(input, { mailer: async () => {} });
  const legacy = remindersOf({ remind_on: "2026-10-04", reminder: "SCHEDULED" });
  const conf = confirmationMessage({ name: "W", email: "w@example.com", event: input.event, calendar_url: "https://calendar.google.com/x", reminders: [], remind_days: 3 });
  return {
    ok: r.reminders.join(",") === "2026-10-07" && r.remind_on === "2026-10-07" && store.due().length === 1 && r.steps[3].action.includes("the morning of the show")
      && legacy.length === 1 && legacy[0].on === "2026-10-04" && legacy[0].state === "SCHEDULED" && conf.text.includes("already started"),
    detail: `reminders ${r.reminders.join(",")}`,
  };
});

await check("records: the digest is validated field by field and becomes a text + HTML email in the farmer's language", () => {
  const good = validateDigest({
    name: "  Wanjiru  Kamau ", email: "W@Example.com", lang: "en", period: "This season",
    totals: { income: 42000, expense: 15500.4 }, crops: [{ crop: "maize", profit: 20000 }, { crop: "beans", profit: -1500 }],
    entries: 7, last: "Cost · Fertilizer · maize · KES 3,500 · 12 Oct", text: "KilimoOrbit · Farm report\nIncome: KES 42,000",
  });
  const bad = [
    validateDigest(null), validateDigest({}), validateDigest({ name: "W", email: "nope", lang: "en", period: "x", totals: { income: 1, expense: 1 }, text: "t" }),
    validateDigest({ name: "W", email: "w@x.co", lang: "fr", period: "x", totals: { income: 1, expense: 1 }, text: "t" }),
    validateDigest({ name: "W", email: "w@x.co", lang: "sw", period: "x", totals: { income: -1, expense: 1 }, text: "t" }),
    validateDigest({ name: "W", email: "w@x.co", lang: "sw", period: "x", totals: { income: 1, expense: 1 }, text: "x".repeat(7000) }),
    validateDigest({ name: "W", email: "w@x.co", lang: "sw", period: "x", totals: { income: 1, expense: 1 }, text: "t", crops: [{ crop: "<b>", profit: 1 }] }),
  ];
  const msg = digestMessage(good.input);
  const sw = digestMessage({ ...good.input, lang: "sw", totals: { income: 100, expense: 400, profit: -300 } });
  return {
    ok: !good.error && good.input.name === "Wanjiru Kamau" && good.input.email === "w@example.com" && good.input.totals.profit === 26500 && good.input.totals.expense === 15500
      && bad.every((b) => b.error) && bad[2].fields.includes("email") && bad[3].fields.includes("lang") && bad[4].fields.includes("totals") && bad[5].fields.includes("text") && bad[6].fields.includes("crops")
      && msg.to === "w@example.com" && msg.subject === "Farm records · This season: profit KES 26,500" && msg.text.includes("Income: KES 42,000") && msg.text.includes("- beans: −KES 1,500")
      && msg.html.includes("KES 26,500") && msg.html.includes("Latest entry") && !msg.html.includes("<b>")
      && sw.subject === "Daftari la shamba · This season: hasara KES 300" && sw.text.includes("Hasara: KES 300"),
    detail: `"${msg.subject}" · "${sw.subject}"`,
  };
});

console.log("─".repeat(57));
const ok = passed === total;
console.log((ok ? C.green : C.red)(C.bold(`  ${ok ? "✓" : "✗"} ${passed}/${total} farm weather, prices, pest watch, news, shows + records tests passed`)));
process.exit(ok ? 0 : 1);
