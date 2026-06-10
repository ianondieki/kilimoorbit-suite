# KilimoOrbit Sentinel

An AI agri-logistics decision engine for Kenyan smallholder farmers, powered by Google Gemini (APEX core). It routes JSON payloads through five execution modes — market arbitrage, farmer chat, alert broadcast, onboarding, and logistics replanning — and ships with a Mission Control web dashboard plus a 7-test verification suite.

## Prerequisites

- **Node.js 18+**
- **Google AI Studio free API key** (no credit card) → get one here: **https://aistudio.google.com/apikey**

## Setup

```bash
npm install
cp .env.example .env       # then paste your GEMINI_API_KEY into .env
npm test                   # runs the 7-test verification suite
npm start                  # launches Mission Control → http://localhost:4517
```

> **No key yet?** The engine automatically falls back to a deterministic **offline mock** that implements the exact same route contracts, so `npm test` passes 7/7 and the dashboard is fully demoable without any API key. Set `APEX_MOCK=1` to force it; add a valid `GEMINI_API_KEY` to go live on `gemini-2.5-flash`.

## Route reference

| Route | `execution_mode`     | Purpose                                                                 |
|:-----:|----------------------|-------------------------------------------------------------------------|
| A     | `arbitrage_compile`  | Compare markets and project the highest net-profit harvest run (KES)    |
| B     | `user_chat`          | Answer a farmer's free-text question (<25 words, Swahili/English aware) |
| C     | `alert_broadcast`    | Convert system alerts into SMS-safe (≤160 char) farmer push messages    |
| D     | `onboarding_intake`  | Drive step-by-step farmer profile completion with the next question     |
| E     | `logistics_replan`   | Re-route an active delivery after a disruption, preserving net profit   |

Invalid or missing `execution_mode` → structured `UNKNOWN_ROUTE` error. Out-of-bounds telemetry (e.g. `battery_level: 150`) → structured `DATA_ERROR` listing every offending field.

## Project layout

```
kilimoorbit-sentinel/
├── src/
│   ├── apex_client.js        # Gemini caller + APEX XML system prompt + offline engine
│   ├── server.js             # Mission Control API (Express)
│   ├── routes/               # one runnable script per route (npm run route:*)
│   └── tests/run_all_tests.js
├── payloads/                 # the five canonical test payloads
└── public/index.html         # Mission Control dashboard (vanilla JS, zero build)
```

## The Apex v2.0 system prompt

The governing prompt is loaded verbatim from **`src/apex_system_prompt.md`** (your Apex v2.0 production release) and passed as the Gemini system instruction on every call. Edit that one file to evolve the prompt — nothing else changes. The offline engine mirrors the same contract: Section 1 telemetry bounds, the Section 2 Kenyan seasonal/altitude risk matrix, the §2.4 logistics weather gate, stale-data suppression (>120 min), and all five Section 3 output schemas plus the 3.5 error schemas.

## Beyond the spec — extra features

- **Sentinel Autopilot (agentic chain)** — `POST /api/autopilot` runs SENSE → Route A arbitrage → §2.4 weather gate → auto Route C broadcast (if the gate holds dispatch) → mission brief, with a per-step trace rendered as a timeline in the dashboard.
- **Voice assistant** — the Farmer Chat card has a 🎙 mic (Web Speech API, free, in-browser) and spoken replies (TTS, Swahili/English aware, toggleable). Works best in Chrome/Edge.
- **Live marquee ticker** (per Apex §4.1) — commodity prices, e-boda battery, soil moisture, and weather alerts scroll under the header.
- **Three handcrafted themes** — Loam (night field), Nyota (satellite night), Savanna (daylight); persisted across sessions.
- **Climate Sentinel cards** — frost/drought/flood pills, seed-variety guidance, and the seasonal caution rendered on every arbitrage and step-5 onboarding result.

## Scripts

| Command                  | What it does                                  |
|--------------------------|-----------------------------------------------|
| `npm test`               | Cold start + integrity + all 5 routes (7/7)   |
| `npm start`              | Mission Control dashboard on port 4517        |
| `npm run route:arbitrage`| Fire Route A alone (likewise `route:chat`, `route:alert`, `route:onboarding`, `route:replan`) |
"# kilimoorbit" 
