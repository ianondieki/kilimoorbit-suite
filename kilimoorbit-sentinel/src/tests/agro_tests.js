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
  EVENTS, createBookings, distanceKm, eventsNear, findEvent, googleCalendarUrl, icsFor, reminderMessage, upcoming, validateBooking,
} from "../agro/events.js";
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

await check("shows: the booking agent runs scout → planner → messenger → reminder, persists, reminds on the day, cancels", async () => {
  const path = `${process.env.TMPDIR || "/tmp"}/events_test_${process.pid}.json`;
  try { unlinkSync(path); } catch {}
  const sent = [];
  const mailer = async (msg) => { sent.push(msg); };
  const store = createBookings({ storePath: path, now: () => OCT });
  const { input } = validateBooking({ event_id: "ask-kitale-2026", name: "Wanjiru", email: "w@example.com", remind_days: 1 }, OCT);
  const r = await store.book(input, { mailer });
  const silent = await store.book({ ...input, email: null }, { mailer });
  const reopened = createBookings({ storePath: path, now: () => new Date("2026-10-06T06:00:00Z") });
  const due = reopened.due();
  const msg = reminderMessage(due[0]);
  reopened.markReminder(due[0].id, "SENT");
  const after = reopened.due();
  const sizeBefore = reopened.size;
  const cancel = [reopened.cancel(r.booking_id, "wrong"), reopened.cancel(r.booking_id, r.token), reopened.cancel(r.booking_id, r.token)];
  try { unlinkSync(path); } catch {}
  return {
    ok: r.status === "BOOKED" && r.steps.map((s) => s.agent).join(">") === "Scout>Planner>Messenger>Reminder" && r.email === "SENT" && r.remind_on === "2026-10-06"
      && sent.length === 1 && sent[0].to === "w@example.com" && sent[0].attachments[0].content.includes("BEGIN:VEVENT") && r.ics.includes("TRIGGER:-P1DT17H")
      && silent.email === "NONE" && silent.steps.length === 4 && sizeBefore === 2
      && due.length === 1 && msg.subject === "Kitale National Show starts tomorrow" && after.length === 0
      && cancel.join(",") === "forbidden,ok,missing" && reopened.size === 1,
    detail: `${r.steps.length} steps · reminder ${r.remind_on} · "${msg.subject}"`,
  };
});

/* ── seedlings near the farmer (src/agro/nurseries.js) ── */
const nz = await import("../agro/nurseries.js");

await check("Nurseries: every entry has a known county, coordinates in Kenya and known needs", async () => {
  const bad = nz.NURSERIES.filter((n) => !findCounty(n.county) || !(n.lat > -5 && n.lat < 5.5 && n.lon > 33.5 && n.lon < 42) || n.carries.some((c) => !nz.NEEDS[c]) || !/^https:\/\//.test(n.url));
  const ids = new Set(nz.NURSERIES.map((n) => n.id));
  return { ok: bad.length === 0 && ids.size === nz.NURSERIES.length && nz.NURSERIES.length >= 30, detail: `${nz.NURSERIES.length} entries, ${bad.length} bad` };
});

await check("Nurseries: sources carrying the need come first, nearest first, then the nearest others", async () => {
  const rows = nz.nurseriesNear({ lat: -0.3, lon: 36.07, need: "potato", limit: 5 }); // Nakuru town
  const carrying = rows.filter((r) => r.carries_need);
  const sorted = carrying.every((r, i) => i === 0 || r.distance_km >= carrying[i - 1].distance_km);
  return { ok: rows.length === 5 && carrying.length >= 3 && carrying[0].id === "kalro-njoro" && sorted && rows.every((r) => r.transport.round_trip_kes > 0), detail: rows.map((r) => `${r.id} ${r.distance_km}km${r.carries_need ? "" : " (other)"}`).join(", ") };
});

await check("Nurseries: transport quotes the cheaper of boda and matatu, so the fare grows with distance", async () => {
  const a = nz.transportEstimate(4), b = nz.transportEstimate(40), c = nz.transportEstimate(13.8);
  const fares = [1, 3, 6, 7, 10, 14, 20, 45, 120].map((km) => nz.transportEstimate(km).round_trip_kes);
  const monotonic = fares.every((f, i) => i === 0 || f >= fares[i - 1]);
  return {
    ok: a.mode === "boda" && b.mode === "matatu" && c.mode === "matatu" && monotonic && b.round_trip_kes > a.round_trip_kes && a.minutes >= 5 && b.minutes > a.minutes && c.round_trip_kes === 430 && c.minutes === 36,
    detail: `${a.mode} KES ${a.round_trip_kes} · ${c.mode} KES ${c.round_trip_kes} · ${b.mode} KES ${b.round_trip_kes} · ${fares.join("<")}`,
  };
});

await check("Nurseries: the farmer's position is the GPS fix when plausible, else the county centre", async () => {
  const gps = nz.farmerPosition({ county: "Nakuru", lat: -0.72, lon: 36.43 });
  const far = nz.farmerPosition({ county: "Nakuru", lat: 48.8, lon: 2.3 }); // Paris: ignored
  const none = nz.farmerPosition({ county: "Atlantis" });
  return { ok: gps.gps === true && gps.lat === -0.72 && far.gps === false && far.county === "Nakuru" && none === null, detail: `${gps.lat},${gps.lon} · fallback ${far.lat},${far.lon}` };
});

await check("Nurseries: validation names each bad field; acres default to 1", async () => {
  const bad = nz.validatePlanRequest({ need: "unicorns", county: "Nowhere", acres: -3 });
  const ok = nz.validatePlanRequest({ need: "Avocado", county: "nakuru" });
  return { ok: bad.error === "VALIDATION_ERROR" && bad.fields.need && bad.fields.county && bad.fields.acres && ok.input.need === "avocado" && ok.input.county === "Nakuru" && ok.input.acres === 1 && ok.input.lang === "en", detail: JSON.stringify(bad.fields) };
});

await check("Nurseries: the agent writes a deterministic plan without a model, and uses the model's text when it answers", async () => {
  const fixed = () => new Date("2026-10-07T08:00:00Z");
  const mock = await nz.planNurseries({ need: "avocado", county: "Nakuru", acres: 2, lang: "en" }, { llm: null, now: fixed });
  const live = await nz.planNurseries({ need: "avocado", county: "Nakuru", acres: 2, lang: "sw" }, { llm: async () => "  **Nenda** KALRO kwanza.  ", now: fixed });
  const steps = mock.steps.map((s) => s.agent).join(">");
  return {
    ok: steps === "Scout>Planner>Advisor" && mock.advice.source === "MOCK" && /160 seedlings/.test(mock.advice.text) && /Confirm/.test(mock.advice.text)
      && live.advice.source === "LIVE" && live.advice.text === "Nenda KALRO kwanza." && mock.per_acre.n === 80 && mock.nurseries.length === 5 && mock.from.gps === false
      && /^Searched 39 sources near Nakuru$/.test(mock.steps[0].action) && /^Imetafuta vyanzo 39 karibu na Nakuru$/.test(live.steps[0].action) && /modeli/.test(live.steps[2].action), // the step lines follow the farmer's language
    detail: `${steps} · ${mock.advice.text.slice(0, 60)}…`,
  };
});

await check("Nurseries: a model that throws or answers nothing falls back to the directory plan", async () => {
  const boom = await nz.planNurseries({ need: "tea", county: "Kericho", acres: 0.5, lang: "en" }, { llm: async () => { throw new Error("quota"); } });
  const empty = await nz.planNurseries({ need: "tea", county: "Kericho", acres: 0.5, lang: "en" }, { llm: async () => "" });
  return { ok: boom.advice.source === "MOCK" && empty.advice.source === "MOCK" && boom.nurseries[0].id === "tri-kericho" && /2,800 cuttings/.test(boom.advice.text), detail: boom.advice.text.slice(0, 80) };
});

console.log("─".repeat(57));
const ok = passed === total;
console.log((ok ? C.green : C.red)(C.bold(`  ${ok ? "✓" : "✗"} ${passed}/${total} farm weather, prices, pest watch, news + shows tests passed`)));
process.exit(ok ? 0 : 1);
