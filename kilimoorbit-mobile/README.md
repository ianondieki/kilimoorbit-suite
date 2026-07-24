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
