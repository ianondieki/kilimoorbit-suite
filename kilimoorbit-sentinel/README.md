# KilimoOrbit Sentinel

An AI agri-logistics decision engine for Kenyan smallholder farmers, powered by Google Gemini (APEX core). It routes JSON payloads through five execution modes — market arbitrage, farmer chat, alert broadcast, onboarding, and logistics replanning — and ships with a Mission Control web dashboard, an investor one-pager at `/pitch`, farm-weather, price-history, county pest-watch, farm-news and farm-show APIs (with a booking agent that emails confirmations and reminders), and five verification suites (30 APEX contract checks, 12 Soko store checks, 34 farm-weather, price, pest-watch, news and show checks, 45 HTTP integration checks, 7 LIVE→MOCK fallback checks).

## Prerequisites

- **Node.js 20+** (the `@google/genai` SDK and nodemailer 10 require it)
- **Google AI Studio free API key** (no credit card) → get one here: **https://aistudio.google.com/apikey**

## Setup

```bash
npm install
cp .env.example .env       # then paste your GEMINI_API_KEY into .env
npm test                   # APEX (30) + Soko (12) + weather, prices, pest watch, news & shows (34) + HTTP (45) + fallback (7)
npm start                  # launches Mission Control → http://localhost:4517
npm run dev                # same, with auto-restart on file changes
```

> **No key yet?** The engine automatically falls back to a deterministic **offline mock** that implements the exact same route contracts, so `npm test` is all green and the dashboard is fully demoable without any API key. Set `APEX_MOCK=1` to force it; add a valid `GEMINI_API_KEY` to go live on `gemini-2.5-flash` (override with `APEX_MODEL`; `APEX_TIMEOUT_MS` defaults to 45000).

### Deploy

```bash
docker build -t kilimoorbit-sentinel .
docker run --rm -p 4517:4517 --env-file .env -v sentinel-data:/app/data kilimoorbit-sentinel
```

Set `TRUST_PROXY=1` behind Render/Fly/nginx so rate limits key on the real client IP. `SOKO_STORE_PATH` relocates the marketplace file (e.g. onto a mounted volume). CI (`.github/workflows/ci.yml`) runs the four suites on Node 20/22 and builds the image.

## Route reference

| Route | `execution_mode`     | Purpose                                                                 |
|:-----:|----------------------|-------------------------------------------------------------------------|
| A     | `arbitrage_compile`  | Compare markets and project the highest net-profit harvest run (KES)    |
| B     | `user_chat`          | Answer a farmer's free-text question (<25 words, Swahili/English aware) |
| C     | `alert_broadcast`    | Convert system alerts into SMS-safe (≤160 char) farmer push messages    |
| D     | `onboarding_intake`  | Drive step-by-step farmer profile completion with the next question     |
| E     | `logistics_replan`   | Re-route an active delivery after a disruption, preserving net profit   |

Invalid or missing `execution_mode` → structured `UNKNOWN_ROUTE` error. Out-of-bounds telemetry (e.g. `battery_level: 150`), a non-array route list, an onboarding step of 9, an unknown month, or a market quote without a price → structured `DATA_ERROR` listing every offending field (market quotes are indexed, e.g. `market_data.available_markets[1].wholesale_price_per_kg`). Malformed input never reaches (or gets billed by) Gemini. Month names are accepted in English or Kiswahili (`April` / `Aprili`).

The yield behind Route A's headline number is never invented: pass `estimated_yield_kg` and it is used verbatim (`yield_basis: "payload"`); omit it and the engine derives it from `field_area_acres` at a conservative regional rate and says so (`yield_basis: "assumed_from_field_area"` plus a `data_quality_notice`). If both are absent the route returns `DATA_ERROR`.

### LIVE → MOCK fallback

If Gemini answers 429 (quota), 503 (overload), times out, or the network drops, `callApex` returns the deterministic engine's answer for the same payload, tagged `engine_fallback: { from: "LIVE", to: "MOCK", reason, status }` — a farmer never sees a `CLIENT_FAILURE` because Google is busy. Authentication errors (401/403) are never masked. `APEX_FALLBACK=0` disables it; `npm run test:fallback` exercises it.

### LIVE-output guardrails

Every Gemini response passes through `harden()` before it leaves the server. It re-enforces the deterministic parts of the contract a model can drift on: stale feeds (>120 min) always suppress profit projections, `live_market_wholesale_price_per_kg` is re-sourced from the payload (§1.3 — never inferred), a destination that isn't in `market_data` is recomputed deterministically, farmer-facing strings are clamped under 25 words (keeping the single emoji), `alert_id` is always a real UUID, and an elliptical follow-up keeps its conversation thread's intent. When it intervenes the result carries a `guardrail_notes` array (shown as a 🛡 banner in Mission Control).

## Project layout

```
kilimoorbit-sentinel/
├── src/
│   ├── apex_client.js        # Gemini caller + offline engine + LIVE guardrails (harden)
│   ├── apex_system_prompt.md # Apex v2.0 system prompt, loaded verbatim
│   ├── suite.js              # the 30-case contract catalogue (CLI + dashboard share it)
│   ├── server.js             # Mission Control API (Express) — exports createApp()
│   ├── routes/               # one runnable script per route (npm run route:*)
│   ├── soko/                 # Soko marketplace: flat-file store + API router
│   ├── agro/weather.js       # farm weather: 47 counties, sample/Open-Meteo forecast, farming windows
│   ├── agro/prices.js        # daily price levels: live board, 14-day history, day-over-day ▲/▼
│   └── tests/                # run_all_tests.js · soko_tests.js · agro_tests.js · server_tests.js · fallback_tests.js
├── payloads/                 # the five canonical test payloads + commodity feed
├── docs/                     # FUNDING_ROADMAP.md + funding_deadlines.ics
├── data/                     # Soko runtime store (gitignored, created on first listing)
├── public/index.html         # Mission Control dashboard (vanilla JS, zero build)
├── public/pitch.html         # investor one-pager, served at /pitch
└── Dockerfile                # node:22-alpine image with healthcheck
```

## Soko — community produce marketplace

A lightweight marketplace layer that lets farmers list surplus produce and lets
buyers / e-boda riders claim delivery runs. Listings are priced against the live
commodity feed, so each one shows a **fair price** versus the nearest masoko.
Persistence is a single gitignored flat file (`data/soko_store.json`) — no DB.

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/soko/listings` | Open listings, newest first (`?status=&crop=&county=`); fair price refreshed off the live feed |
| `POST` | `/api/soko/listings` | Create a listing `{ farmer_name, crop, county, qty_kg, ask_per_kg }`; fair price auto-seeded |
| `POST` | `/api/soko/listings/:id/claim` | Claim a run `{ claimer, role: "buyer"\|"rider" }` |
| `POST` | `/api/soko/listings/:id/deliver` | Mark a claimed run delivered (claimed → delivered) |
| `POST` | `/api/soko/listings/:id/cancel` | `{ owner_token }` — farmer withdraws an open listing (open → cancelled) |
| `GET`  | `/api/soko/listings/:id` | One listing |
| `GET`  | `/api/soko/stats` | Counts by status + kg listed — traction metrics for the pitch |
| `POST` | `/api/soko/price-suggest` | `{ crop }` → fair price + per-market comparison from the feed |

Listings move through **open → claimed → delivered** (or **open → cancelled**). The `owner_token` is returned once, in the `POST /listings` response, and is never exposed on reads — keep it client-side to allow cancellation. Unknown ids return 404, a missing/wrong token 403, validation failures 400 with a `fields` array. Writes are atomic (write-then-rename) and a corrupt store file is quarantined rather than overwritten. Run the marketplace suite with `npm run test:soko` (12/12, no LLM, no server).

## Farm weather — forecast + farming windows

`GET /api/weather?county=Meru` returns a 7-day forecast for any of Kenya's 47 counties (case-, space- and apostrophe-insensitive: `muranga` finds Murang'a), and on every day the three verdicts smallholders act on:

| Window | Good when | Why |
|---|---|---|
| `spray` | rain chance < 40 %, rain < 2 mm, wind ≤ 15 km/h | a washed-off or drifting spray is wasted money and a safety risk (`reason`: `rain` / `wind`) |
| `plant` | ≥ 20 mm over that day and the next two | the usual extension rule for "the rains have established" (`rain_3d_mm` included) |
| `dry` | rain chance < 30 %, rain < 1 mm | safe to harvest and sun-dry grain; wet grain is how aflatoxin starts |

By default the forecast is **SAMPLE** data: deterministic per county and date (altitude, rainfall region and the Kenyan season drive it), so a refresh never changes the forecast, and the apps label it DEMO / MAJARIBIO. Set `WEATHER_PROVIDER=open-meteo` for real forecasts from [Open-Meteo](https://open-meteo.com) (free, no key, cached 30 min per county); any failure falls back to SAMPLE with a `fallback` reason. Unknown or missing county → `400` `UNKNOWN_COUNTY` / `MISSING_COUNTY` with `fields`. `npm run test:agro` covers it (15/15, no network).

## Market prices — live board + 14-day history

The commodity board (`/api/meta` → `commodity_feed`) is sample data with market behaviour: every crop × market has a daily price level (a slow 18–41 day swing plus a few days of wobble, within about ±15 % of `payloads/commodity_feed.json`) that depends only on the date. So the board, its history and Soko's fair price always agree, a board's ▲/▼ `delta` is the real change since yesterday, and a refresh never rewrites the past; the live board adds ±1 % intraday movement.

`GET /api/prices/history?crop=maize` → `{ crop, dates[14], markets: [{ market, prices[14], change_7d_pct }], source: "SAMPLE" }`, oldest first, ending today (East Africa Time). Unknown or missing crop → `400` `UNKNOWN_CROP` / `MISSING_CROP`. The apps label it DEMO / MAJARIBIO until a real feed (e.g. KAMIS) replaces `src/agro/prices.js`.

## Pest watch — fall armyworm reports by county

Farmers' fall armyworm scouting walks, pooled by county so neighbours can see what others are finding this fortnight (the idea behind FAO's FAMEWS app).

- `POST /api/pests/report` `{ county, crop: "maize" | "sorghum", plants: 10–200, hit: 0–plants, age_days? }` → `201 { report, watch }`. The server computes the share of plants hit and whether it is above the action threshold for the crop's age (CIMMYT's guide for African smallholders: about 20 % in the first 2½ weeks, 40 % from 3 weeks to tasselling). Anything else in the body (a name, a phone) is ignored and never stored. Invalid → `400` `VALIDATION_ERROR` with `fields`. 30 reports per 10 minutes per IP.
- `GET /api/pests/watch?county=Nyeri` → `{ county, pest: "faw", window_days: 14, source, reports, over_threshold, avg_pct, max_pct, last_report, level: "none" | "low" | "high" }`. `level` is `high` when a third or more of the reports are above the threshold.

Reports are kept in memory (at most 5,000; a restart clears them). A county with no farmer reports in the last 14 days gets a deterministic **SAMPLE** watch (labelled, like the sample weather and prices), so the app never presents invented numbers as farmers' reports. Logic: `src/agro/pests.js`.

## Farm news

`GET /api/news?county=Nakuru` → `{ county, fetched_at, source: "LIVE" | "CACHED" | "SAMPLE", items[≤12] }`, each item `{ id, title, source, link, published, summary, image, scope: "county" | "national" | "tip", county }`. The server reads public RSS feeds (The Standard's agriculture feed, Kilimo News, and a Google News search for the county) with an 8 s timeout, caches each source for 30 minutes and keeps a source's last good copy for a day when it is down (`CACHED`). County items come first, old (> 60 days) and duplicate stories are dropped. When no feed can be read at all (no internet on the server), five evergreen KilimoOrbit tips are served with `source: "SAMPLE"`, `link: null` and an in-app `route`, and the app labels them DEMO. Logic: `src/agro/news.js`. 60 requests/min per IP.

## Farm shows — near the farmer, with a booking agent

- `GET /api/events?county=Nakuru` → `{ county, today, theme, source: "ASK 2026 calendar", events[≤8] }`: the Agricultural Society of Kenya's published 2026 show calendar plus the Nairobi expos (Africa Agri Expo, Agritec Africa, Africa FarmTech), each with `start`, `end`, `town`, `county`, `venue`, `organiser`, `url`, `distance_km` from the farmer's county centre, `days_until` (negative while on), and `estimated: true` when a show's dates have passed and were projected to the same dates next year. Shows within 60 days come first (soonest first), then the rest nearest first. Unknown or missing county → `400`.
- `POST /api/events/book` `{ event_id, name, email?, county?, remind_days: 1 | 3 | 7 }` → `201 { booking_id, token, status: "BOOKED", event, calendar_url, ics, email: "SENT" | "SIMULATED" | "NONE" | "FAILED", remind_on, steps[] }`. The booking agent runs four steps (`steps` carries them for the app's timeline): **Scout** finds the show, **Planner** builds the calendar entry (an `.ics` with a reminder alarm, and a Google Calendar "add event" link the farmer opens on the phone), **Messenger** emails a confirmation with the `.ics` attached when SMTP is configured (SIMULATED and logged otherwise, exactly like sign-in), **Reminder** stores the reminder. A scheduler in the server sends reminder emails on `remind_on` (checked every minute; a reminder missed while the server was down is sent up to two days late). Bookings live in `data/events_bookings.json` (`EVENTS_STORE_PATH`), at most 2,000, with the farmer's name and email only to send those emails. 10 bookings per hour per IP (it sends email). Invalid → `400` `VALIDATION_ERROR` with `fields`.
- `DELETE /api/events/book/:id?token=…` cancels the booking and its reminder with the token returned at booking time (`403` wrong token, `404` unknown).

Logic: `src/agro/events.js`. At start-up the server also prints the addresses a phone on the same Wi-Fi can use, named by adapter and Wi-Fi first (`From a phone on this Wi-Fi: http://192.168.x.x:4517  (Wi-Fi)`), which the app's Connection screen asks for; Windows' vEthernet (WSL, Hyper-V) and Docker adapters, which a phone cannot reach, go on a separate "Not reachable from a phone" line.

## API hardening

- Per-IP rate limits (dependency-free): APEX 60/min, Autopilot 20/min, suite 6/min, marketplace 120/min, weather 120/min, price history 120/min, pest watch 120/min, pest reports 30 per 10 min, news 60/min, shows 120/min, show bookings 10/hour, sign-in 5/hour (the sign-in endpoint sends email, so it is capped hardest). `429` responses carry `Retry-After`. Set `RATE_LIMIT_DISABLED=1` for load tests.
- Malformed JSON bodies → `400 {"error_type":"BAD_JSON"}`; unknown `/api/*` routes → `404` JSON; bodies over 256 KB → `413`.
- `GET /api/health` reports engine, model, version and uptime for uptime monitors and the Docker healthcheck.
- Every async route catches its own errors (`500` JSON, never a hung request), query parameters must be plain strings (`?crop[]=` or repeated keys → `400`), and a process-level `unhandledRejection` handler logs anything that still slips through instead of letting Node exit: one bad request never takes the server down for every farmer.

## The Apex v2.0 system prompt

The governing prompt is loaded verbatim from **`src/apex_system_prompt.md`** (your Apex v2.0 production release) and passed as the Gemini system instruction on every call. Edit that one file to evolve the prompt — nothing else changes. The offline engine mirrors the same contract: Section 1 telemetry bounds, the Section 2 Kenyan seasonal/altitude risk matrix, the §2.4 logistics weather gate, stale-data suppression (>120 min), and all five Section 3 output schemas plus the 3.5 error schemas.

## Beyond the spec — extra features

- **Sentinel Autopilot (agentic chain)** — `POST /api/autopilot` runs SENSE → Route A arbitrage → §2.4 weather gate → auto Route C broadcast (if the gate holds dispatch) → mission brief, with a per-step trace rendered as a timeline in the dashboard.
- **Voice assistant** — the Farmer Chat card has a 🎙 mic (Web Speech API, free, in-browser) and spoken replies (TTS, Swahili/English aware, toggleable). Works best in Chrome/Edge.
- **Live marquee ticker** (per Apex §4.1) — commodity prices, e-boda battery, soil moisture, and weather alerts scroll under the header.
- **Three handcrafted themes** — Loam (night field), Nyota (satellite night), Savanna (daylight); persisted across sessions.
- **Keyboard-first console** — `Ctrl+Enter` transmits, `Alt+A`–`Alt+E` jump between ground stations, one-click copy of the decision JSON, toast notifications for every failure path, `aria-live` decision region.
- **Investor one-pager** at `/pitch` (print-ready) and a 12-month funding calendar in `docs/` with an importable `.ics`.
- **Climate Sentinel cards** — frost/drought/flood pills, seed-variety guidance, and the seasonal caution rendered on every arbitrage and step-5 onboarding result.

## Scripts

| Command                  | What it does                                  |
|--------------------------|-----------------------------------------------|
| `npm test`               | All five suites: APEX contract (30) + Soko store (12) + farm weather, prices, pest watch, news & shows (34) + HTTP (45) + fallback (7) |
| `npm run test:apex`      | Cold start + integrity + all 5 routes + climate + guardrails (30/30) |
| `npm run test:soko`      | Soko marketplace store + fair-price suite (12/12)             |
| `npm run test:agro`      | Farm weather (counties, sample forecast, farming windows, Open-Meteo mapping + fallback), market prices (levels, history, board consistency), the pest watch (validation, thresholds, window, bounds, sample), farm news (RSS parsing, county-first merge, cache and SAMPLE fallback) and farm shows (projection, distance, calendar entries, the booking agent, reminders, cancellation) (34/34) |
| `npm run test:server`    | Boots the real server on a random port (stubbed news feeds, a temp bookings file), hits every endpoint, including hostile query shapes and payloads, and checks the start-up address ranking (45/45) |
| `npm run check`          | Syntax-check every module (fast CI gate)      |
| `npm start` / `npm run dev` | Mission Control dashboard on port 4517 (dev = auto-restart) |
| `npm run docker:build`   | Build the production image                    |
| `npm run route:arbitrage`| Fire Route A alone (likewise `route:chat`, `route:alert`, `route:onboarding`, `route:replan`) |
