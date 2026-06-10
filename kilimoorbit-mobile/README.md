<<<<<<< HEAD
# KilimoOrbit Sentinel — Android App (Expo / React Native)

The farmer-facing mobile client for the KilimoOrbit Sentinel platform, implementing the Apex v2.0 §4.1 UI architecture: header bar with live connection status, scrolling marquee price/alert ticker, hamburger sidebar (Settings · Notification Profiles · Quick Access · Sign Out), dashboard cards (Market Pricing Matrix, Climate Sentinel, Route Optimizer, Active Deliveries), and a pulsing FAB with a quick-action modal.

## Tabs

| Tab | What it does |
|---|---|
| **Dashboard** | Live arbitrage hero (projected net KES), climate risk pills + seasonal caution, market matrix with the ★ optimal destination, e-boda telemetry in the ticker, pull-to-refresh |
| **Apex Chat** | Conversational advisory with intent pills, Swahili/English aware **spoken replies** (expo-speech TTS, toggleable), quick prompts |
| **Autopilot** | Engages the agentic chain on the server and renders the step-by-step timeline + mission brief |

Three themes (Loam · Nyota · Savanna) switchable from the sidebar, persisted with AsyncStorage.

## Prerequisites

- Node.js 18+, the **Expo Go** app on your Android phone (Play Store), and the **kilimoorbit-sentinel server running** (it is the brain — this app is the face).

## Run it

```bash
# 1. Start the backend (in the kilimoorbit-sentinel folder)
npm start                    # Mission Control + API on :4517

# 2. Point the app at the backend — edit lib/config.ts:
#    Android emulator:        http://10.0.2.2:4517
#    Physical phone (same Wi-Fi): http://<your-laptop-LAN-IP>:4517   ← run `ipconfig`/`ip a`
#    Deployed backend:        https://your-sentinel.onrender.com

# 3. Start the app (in this folder)
npm install
npm start                    # scan the QR with Expo Go on Android
```

`npm run typecheck` runs the strict TypeScript check (passes clean).

## Build an installable APK

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

(Free Expo account; produces a downloadable .apk.)

## Notes

- **Voice**: spoken replies use `expo-speech` (free, on-device, works in Expo Go). Speech-to-text *input* requires a native module (`@react-native-voice/voice`) and an EAS dev build — wire it in when you graduate from Expo Go.
- All Apex schema types live in `lib/api.ts`; `lib/config.ts` is the single backend swap point — same pattern as your SportsFusion apps.
=======
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
>>>>>>> 1a7694b745e9dbc8ac9f5d49b2b0b448c551cc3f
