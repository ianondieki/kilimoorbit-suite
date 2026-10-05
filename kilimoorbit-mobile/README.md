# KilimoOrbit Sentinel — Android App (Expo / React Native)

The farmer-facing mobile client for the KilimoOrbit Sentinel platform. Kiswahili first (English one tap away), built for rural connectivity: every screen works from the last good snapshot when the network drops, and everything the farmer records stays on the phone.

## Screens

Five tabs on a phone; at 900px and wider the sidebar docks and replaces the tab bar.

| Tab | What it does |
|---|---|
| **Leo / Today** | Greeting and season, the county's 7-day forecast with plain-language **farming windows** (good day to spray / plant / harvest & dry, and the next good day if not today), this week's farm tasks to tick off, the best market for the planned harvest, and the season's climate watch. Quick actions: record money, add a crop, check a sick plant, ask Apex. |
| **Shamba / My farm** | **Calendar**: add crops (maize, beans, tomatoes, potatoes, cabbage, kale) with acreage and planting date; each gets growth stages, a progress bar, dated tasks (land prep, planting, weeding, top-dressing, scouting, harvest, storage) and an **input calculator** (seed / seedlings, DAP and CAN in kg and 50 kg bags for its size). Season suggestions for what to plant now. **Records (daftari)**: income and costs by category and crop, profit for this season or all time, profit per crop. |
| **Masoko / Markets** | Live price ticker; pick a crop to compare today's wholesale price across markets, type your harvest in kg to see what it is worth at each and how much more the best market pays; the planned harvest run (Apex Route A: net profit after transport, route risk) with **Autopilot** one tap away; deliveries on the road. |
| **Daktari / Crop doctor** | Offline symptom checker: pick the crop, tick what you see (leaves, stem, fruit / pods / cobs / tubers) and get ranked likely causes among 15 common Kenyan crop problems (fall armyworm, MLN, Tuta absoluta, late blight, bacterial wilt, bean fly, diamondback moth, …), each with what to do now (IPM first, sprays by the label), how to prevent it next season, spraying safety, and "Ask Apex about this". |
| **Uliza Apex / Ask Apex** | Conversational advisory with intent pills, Swahili/English aware **spoken replies** (expo-speech TTS, toggleable), quick prompts. |

**Autopilot** (from Markets or the sidebar) engages the agentic chain on the server and renders the step-by-step timeline + mission brief.

Three themes (Loam · Nyota · Savanna for bright sun) switchable from the sidebar, persisted with AsyncStorage.

### Data honesty

- Prices and (by default) weather are **sample data** and always carry the DEMO / MAJARIBIO tag until real feeds are wired in (`SAMPLE_PRICE_FEED` in `lib/prices.ts`; `WEATHER_PROVIDER=open-meteo` on the server for real forecasts).
- Crop calendars, input rates and the crop doctor are typical extension guidance, not prescriptions; the app says so where the numbers appear. Kiswahili and agronomy content should be reviewed by a native speaker and an extension agronomist before release.
- The farm (crops, tasks, money records) lives in `ko-farm` on the phone. Signing out with "forget", or a different farmer signing in on a shared phone, removes it.

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

`e2e/farm.spec.ts` drives Today (weather windows, county picker, adding a crop, ticking a task), Shamba (calendar stage + input calculator, records validation and profit), Masoko (harvest value, Autopilot), the crop doctor (diagnosis → Apex handoff), offline with nothing cached, and Kiswahili, each at phone (390px) and desktop (1280px) widths. CI runs it on every PR that touches the app or the server (`.github/workflows/mobile-ci.yml`).

## Build an installable APK

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

(Free Expo account; produces a downloadable .apk.)

## Notes

- **Voice**: spoken replies use `expo-speech` (free, on-device, works in Expo Go). Speech-to-text *input* requires a native module (`@react-native-voice/voice`) and an EAS dev build — wire it in when you graduate from Expo Go.
- All Apex schema types live in `lib/api.ts`; `lib/config.ts` is the single backend swap point — same pattern as your SportsFusion apps.
