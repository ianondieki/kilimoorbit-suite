# KilimoOrbit Sentinel — Android App (Expo / React Native)

The farmer-facing mobile client for the KilimoOrbit Sentinel platform. Kiswahili first (English one tap away), built for rural connectivity: every screen works from the last good snapshot when the network drops, and everything the farmer records stays on the phone.

## Screens

Five tabs on a phone; at 900px and wider the sidebar docks and replaces the tab bar.

| Tab | What it does |
|---|---|
| **Leo / Today** | Greeting and season with a **Listen** button that reads the day aloud (Kiswahili or English, for farmers who prefer audio), any **price alert** that has hit, the county's 7-day forecast with plain-language **farming windows** (good day to spray / plant / harvest & dry, and the next good day if not today), this week's farm and livestock tasks to tick off, crop tasks with **weather-aware advice** where the weather decides the timing ("Not today (rain expected): spray Thursday", "Heavy rain today: top-dress after it") and herd jobs grouped ("Deworm: Neema, Bella", one tick records it for both, a second tick undoes it), the best market for the planned harvest, and the season's climate watch. Quick actions: record money, add a crop, record milk (or add an animal), check a sick plant, ask Apex. |
| **Shamba / My farm** | **Calendar**: add crops (maize, beans, tomatoes, potatoes, cabbage, kale) with acreage and planting date; each gets growth stages, a progress bar, dated tasks with the same weather advice, an **expected harvest** for its size and its worth at today's best price, and an **input calculator** (seed / seedlings, DAP and CAN in kg and 50 kg bags). Season suggestions for what to plant now. **Livestock (mifugo)**: cows, goats, sheep, pigs and chicken flocks. Breeding calendars from the last service (heat watch at 21 days, 17 for sheep; vet pregnancy check; dry-off and steaming up; calving / kidding / lambing / farrowing due date, with "not pregnant" and re-service handled), after-birth reminders (colostrum, serve again, weaning), deworming every 3 months and weekly tick control, a chick vaccine schedule by age (Newcastle + IB, Gumboro, fowl pox, boosters), a **milk log** with this week vs last week, a 14-day trend and its value at your price per litre, and a history you can correct. **Records (daftari)**: income and costs by category (crop and livestock: milk, eggs, animal sales, feed, vet) and crop; sales can record the kilos sold, so each crop shows the **average price received** next to today's best market price; profit for this season or all time; **Share report** sends a plain-text season summary (including livestock and milk) for a SACCO, lender, buyer or group. |
| **Masoko / Markets** | Live price ticker; pick a crop to compare today's wholesale price across markets, type your harvest in kg to see what it is worth at each; tap a market for its **14-day price trend** (this week's change, low / high, any day on touch, hover or arrow keys); **Sell on Soko** lists the harvest on the suite's own marketplace with the ask checked against today's fair price, and **My Soko listings** follows each one to claimed / delivered (or withdraw it); **price alerts** ("tell me when maize reaches KES 60"), shown on Today when any market gets there (in-app; the sheet says there is no SMS yet). Below: the planned harvest run (Apex Route A) with **Autopilot** one tap away, and deliveries on the road. |
| **Daktari / Crop doctor** | Offline symptom checker: pick the crop, tick what you see (leaves, stem, fruit / pods / cobs / tubers) and get ranked likely causes among 15 common Kenyan crop problems (fall armyworm, MLN, Tuta absoluta, late blight, bacterial wilt, bean fly, diamondback moth, …), problems **common this season** flagged and listed first, each with what to do now (IPM first, sprays by the label), how to prevent it next season, spraying safety, and "Ask Apex about this". |
| **Uliza Apex / Ask Apex** | Conversational advisory with intent pills, Swahili/English aware **spoken replies** (expo-speech TTS, toggleable), quick prompts. |

**Autopilot** (from Markets or the sidebar) engages the agentic chain on the server and renders the step-by-step timeline + mission brief.

Three themes (Loam · Nyota · Savanna for bright sun) switchable from the sidebar, persisted with AsyncStorage.

### Data honesty

- Prices and (by default) weather are **sample data** and always carry the DEMO / MAJARIBIO tag until real feeds are wired in (`SAMPLE_PRICE_FEED` in `lib/prices.ts`; `WEATHER_PROVIDER=open-meteo` on the server for real forecasts).
- Crop calendars, input rates and the crop doctor are typical extension guidance, not prescriptions; the app says so where the numbers appear. Kiswahili and agronomy content should be reviewed by a native speaker and an extension agronomist before release.
- Yield ranges are typical smallholder figures (average to good practice) and price trends are sample data; both are labelled as estimates.
- Livestock schedules are typical East African extension figures (gestation, heat cycles, deworming, a common chick vaccine schedule); the app tells farmers to follow their vet and the vaccine label.
- Everything the farmer records stays on the phone: the farm (`ko-farm`), animals and milk (`ko-herd`), Soko listings with their private withdraw tokens (`ko-soko`) and price alerts (`ko-alerts`). Signing out with "forget", or a different farmer signing in on a shared phone, removes all of them.

### Crash safety

- Every screen exports an `ErrorBoundary`: a screen that throws shows "Something went wrong on this screen · Try again / Back to Today", never a blank app. Each card on Today, Shamba and Masoko is also wrapped in a `Guard`, so one broken card shows a small "This part couldn't load" note while the rest keeps working.
- Every server answer and every cached copy of one passes through `lib/validate.ts` before the UI reads it; every store (`ko-farm`, `ko-herd`, `ko-soko`, `ko-alerts`, chat log, profile) re-validates what it loads and is bounded in size. Malformed data shows "no data", never a crash.
- The e2e suite fails on any uncaught page error or crashed card, and includes corrupted storage, broken JSON and a server answering garbage.

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

`e2e/farm.spec.ts` drives 19 farmer flows at phone (390px) and desktop (1280px) widths: Today (weather windows, county picker, adding a crop, ticking a task, weather-aware advice), Shamba (calendar stage + input calculator, expected harvest, records, kilos sold → average price, the shared report), livestock (a cow in calf, milk log and value, grouped deworming with undo, a flock's vaccine schedule), Masoko (harvest value, 14-day trend, selling on Soko and withdrawing, price alerts, Autopilot), the crop doctor, offline, Kiswahili, and crash resistance (corrupted storage, broken JSON, a server answering garbage, Apex without a market run). Every test also fails on any uncaught error or crashed card. `e2e/logic.spec.ts` unit-tests the pure logic (livestock calendar, alerts, task advice, diagnosis, input calculator, response validation) without a browser. CI runs it on every PR that touches the app or the server (`.github/workflows/mobile-ci.yml`).

## Build an installable APK

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

(Free Expo account; produces a downloadable .apk.)

## Notes

- **Voice**: spoken replies use `expo-speech` (free, on-device, works in Expo Go). Speech-to-text *input* requires a native module (`@react-native-voice/voice`) and an EAS dev build — wire it in when you graduate from Expo Go.
- All Apex schema types live in `lib/api.ts`; `lib/config.ts` is the single backend swap point — same pattern as your SportsFusion apps.
