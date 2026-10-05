# KilimoOrbit Sentinel — Android App (Expo / React Native)

The farmer-facing mobile client for the KilimoOrbit Sentinel platform. Kiswahili first (English one tap away), built for rural connectivity: every screen works from the last good snapshot when the network drops, and everything the farmer records stays on the phone.

## Screens

Five tabs on a phone; at 900px and wider the sidebar docks and replaces the tab bar.

| Tab | What it does |
|---|---|
| **Leo / Today** | Greeting and season with a **Listen** button that reads the day aloud (Kiswahili or English, for farmers who prefer audio), the county's 7-day forecast with plain-language **farming windows** (good day to spray / plant / harvest & dry, and the next good day if not today), this week's farm tasks to tick off, each with **weather-aware advice** where the weather decides the timing ("Not today (rain expected): spray Thursday", "Heavy rain today: top-dress after it"), the best market for the planned harvest, and the season's climate watch. Quick actions: record money, add a crop, check a sick plant, ask Apex. |
| **Shamba / My farm** | **Calendar**: add crops (maize, beans, tomatoes, potatoes, cabbage, kale) with acreage and planting date; each gets growth stages, a progress bar, dated tasks (land prep, planting, weeding, top-dressing, scouting, harvest, storage) with the same weather advice, an **expected harvest** for its size and its worth at today's best price, and an **input calculator** (seed / seedlings, DAP and CAN in kg and 50 kg bags). Season suggestions for what to plant now. **Records (daftari)**: income and costs by category and crop; sales can record the kilos sold, so each crop shows the **average price received** next to today's best market price; profit for this season or all time; **Share report** sends a plain-text season summary (for a SACCO, lender, buyer or group) through the phone's share sheet. |
| **Masoko / Markets** | Live price ticker; pick a crop to compare today's wholesale price across markets, type your harvest in kg to see what it is worth at each; tap a market for its **14-day price trend** (this week's change, low / high, any day on touch, hover or arrow keys); **Sell on Soko** lists the harvest on the suite's own marketplace with the ask checked against today's fair price, and **My Soko listings** follows each one to claimed / delivered (or withdraw it). Below: the planned harvest run (Apex Route A) with **Autopilot** one tap away, and deliveries on the road. |
| **Daktari / Crop doctor** | Offline symptom checker: pick the crop, tick what you see (leaves, stem, fruit / pods / cobs / tubers) and get ranked likely causes among 15 common Kenyan crop problems (fall armyworm, MLN, Tuta absoluta, late blight, bacterial wilt, bean fly, diamondback moth, …), problems **common this season** flagged and listed first, each with what to do now (IPM first, sprays by the label), how to prevent it next season, spraying safety, and "Ask Apex about this". |
| **Uliza Apex / Ask Apex** | Conversational advisory with intent pills, Swahili/English aware **spoken replies** (expo-speech TTS, toggleable), quick prompts. |

**Autopilot** (from Markets or the sidebar) engages the agentic chain on the server and renders the step-by-step timeline + mission brief.

Three themes (Loam · Nyota · Savanna for bright sun) switchable from the sidebar, persisted with AsyncStorage.

### Data honesty

- Prices and (by default) weather are **sample data** and always carry the DEMO / MAJARIBIO tag until real feeds are wired in (`SAMPLE_PRICE_FEED` in `lib/prices.ts`; `WEATHER_PROVIDER=open-meteo` on the server for real forecasts).
- Crop calendars, input rates and the crop doctor are typical extension guidance, not prescriptions; the app says so where the numbers appear. Kiswahili and agronomy content should be reviewed by a native speaker and an extension agronomist before release.
- Yield ranges are typical smallholder figures (average to good practice) and price trends are sample data; both are labelled as estimates.
- The farm (crops, tasks, money records) lives in `ko-farm` on the phone, and the farmer's Soko listings with their private withdraw tokens in `ko-soko`. Signing out with "forget", or a different farmer signing in on a shared phone, removes both.

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

## End-to-end tests (Playwright)

```bash
npm run e2e        # boots the Sentinel server (mock engine) + a static web export, then runs the farmer flows
```

`e2e/farm.spec.ts` drives Today (weather windows, county picker, adding a crop, ticking a task, weather-aware task advice), Shamba (calendar stage + input calculator, expected harvest, records validation and profit, kilos sold → average price, the shared season report), Masoko (harvest value, 14-day trend per market, selling on Soko and withdrawing, Autopilot), the crop doctor (diagnosis → Apex handoff, in-season flags), offline with nothing cached, and Kiswahili: 12 flows, each at phone (390px) and desktop (1280px) widths. CI runs it on every PR that touches the app or the server (`.github/workflows/mobile-ci.yml`).

## Build an installable APK

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

(Free Expo account; produces a downloadable .apk.)

## Notes

- **Voice**: spoken replies use `expo-speech` (free, on-device, works in Expo Go). Speech-to-text *input* requires a native module (`@react-native-voice/voice`) and an EAS dev build — wire it in when you graduate from Expo Go.
- All Apex schema types live in `lib/api.ts`; `lib/config.ts` is the single backend swap point — same pattern as your SportsFusion apps.
