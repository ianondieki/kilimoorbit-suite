# KilimoOrbit Sentinel

An AI agri-logistics decision engine for Kenyan smallholder farmers, powered by Google Gemini (APEX core). It routes JSON payloads through five execution modes — market arbitrage, farmer chat, alert broadcast, onboarding, and logistics replanning — and ships with a Mission Control web dashboard, an investor one-pager at `/pitch`, farm-weather and price-history APIs, and five verification suites (30 APEX contract checks, 12 Soko store checks, 21 farm-weather and price checks, 37 HTTP integration checks, 7 LIVE→MOCK fallback checks).

## Prerequisites

- **Node.js 20+** (the `@google/genai` SDK requires it)
- **Google AI Studio free API key** (no credit card) → get one here: **https://aistudio.google.com/apikey**

## Setup

```bash
npm install
cp .env.example .env       # then paste your GEMINI_API_KEY into .env
npm test                   # APEX (30) + Soko (12) + weather & prices (21) + HTTP (37) + fallback (7)
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

## API hardening

- Per-IP rate limits (dependency-free): APEX 60/min, Autopilot 20/min, suite 6/min, marketplace 120/min, weather 120/min, price history 120/min, sign-in 5/hour (the sign-in endpoint sends email, so it is capped hardest). `429` responses carry `Retry-After`. Set `RATE_LIMIT_DISABLED=1` for load tests.
- Malformed JSON bodies → `400 {"error_type":"BAD_JSON"}`; unknown `/api/*` routes → `404` JSON; bodies over 256 KB → `413`.
- `GET /api/health` reports engine, model, version and uptime for uptime monitors and the Docker healthcheck.

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
| `npm test`               | All five suites: APEX contract (30) + Soko store (12) + farm weather & prices (21) + HTTP (37) + fallback (7) |
| `npm run test:apex`      | Cold start + integrity + all 5 routes + climate + guardrails (30/30) |
| `npm run test:soko`      | Soko marketplace store + fair-price suite (12/12)             |
| `npm run test:agro`      | Farm weather (counties, sample forecast, farming windows, Open-Meteo mapping + fallback) and market prices (levels, history, board consistency) (21/21) |
| `npm run test:server`    | Boots the real server on a random port, hits every endpoint (37/37) |
| `npm run check`          | Syntax-check every module (fast CI gate)      |
| `npm start` / `npm run dev` | Mission Control dashboard on port 4517 (dev = auto-restart) |
| `npm run docker:build`   | Build the production image                    |
| `npm run route:arbitrage`| Fire Route A alone (likewise `route:chat`, `route:alert`, `route:onboarding`, `route:replan`) |
