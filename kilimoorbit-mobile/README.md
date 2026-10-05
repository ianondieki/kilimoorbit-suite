# KilimoOrbit Sentinel — Android App (Expo / React Native)

The farmer-facing mobile client for the KilimoOrbit Sentinel platform. Kiswahili first (English one tap away), built for rural connectivity: every screen works from the last good snapshot when the network drops, and everything the farmer records stays on the phone.

## Screens

Five tabs on a phone; at 900px and wider the sidebar docks and replaces the tab bar.

| Tab | What it does |
|---|---|
| **Leo / Today** | Greeting and season with a **Listen** button that reads the day aloud (Kiswahili or English, for farmers who prefer audio), a **pest watch** alert when at least two farms in the county have found fall armyworm above the action level (maize growers only), any **price alert** that has hit, the county's 7-day forecast with plain-language **farming windows** (good day to spray / plant / harvest & dry, and the next good day if not today), this week's farm, livestock, store and hatching tasks to tick off, crop tasks with **weather-aware advice** where the weather decides the timing ("Not today (rain expected): spray Thursday", "Heavy rain today: top-dress after it") and herd jobs grouped ("Deworm: Neema, Bella", one tick records it for both, a second tick undoes it), the best market for the planned harvest, and the season's climate watch. Then three sliders: **farm news** (the county's headlines first, then national, from The Standard, Kilimo News and Google News; a story opens in the browser), **farm shows near you** (the ASK 2026 show calendar and the Nairobi expos, soonest first then nearest, with km; "Details & add to calendar" runs the server's booking agent, which prepares the calendar entry, emails a confirmation, schedules a reminder email and hands the farmer an "Open in Google Calendar" button; bookings are remembered on the phone and can be cancelled), and **test your knowledge** (five farm questions a day from the app's own advice, each answer explained, with the day's score and a streak). Quick actions: record money, add a crop, record milk or eggs (or add an animal), check a sick plant, ask Apex. |
| **Shamba / My farm** | **Crops**: add crops (maize, beans, tomatoes, potatoes, cabbage, kale) with acreage (or **measure the field by pacing**: length × width in big steps) and planting date; each gets growth stages, a progress bar, dated tasks with the same weather advice, an **expected harvest** for its size and its worth at today's best price, and an **input calculator** (seed / seedlings, DAP and CAN in kg and 50 kg bags; **lime** for acid soils from the farm's soil-test pH, about 1 t/ha below pH 5.5 and 2 t/ha below 5.0, or a cheaper microdose in the planting holes, potatoes only below 5.0; and how to spot fake seed, KEPHIS scratch-and-SMS to 1397, and get subsidised fertiliser through KIAMIS). Maize cards show the last **fall armyworm scouting walk** and tick the scouting tasks when one is saved. At harvest, grain and potatoes go **into store** and fresh crops are recorded as a sale. **Ghala (store)**: bags in store with the before-storing checklist (salt test for moisture, sorting, pallets), a store check every 2 weeks (monthly in hermetic bags, weekly for potatoes) that shows on Today, selling from store straight into Records with its kilos (or taking some out for home use), and a typical-year line on whether holding pays. **Will it pay?** budgets a crop on your land at your own prices (seed, DAP, CAN, labour, sprays, optional input-loan interest; remembered on the phone): profit, the price and harvest that cover the costs, and the same land under every other crop. Season suggestions for what to plant now. **Livestock (mifugo)**: cows, goats, sheep, pigs and chicken flocks. Breeding calendars from the last service (heat watch at 21 days, 17 for sheep; vet pregnancy check; dry-off and steaming up; calving / kidding / lambing / farrowing due date, with "not pregnant" and re-service handled), after-birth reminders (colostrum, serve again, weaning), deworming every 3 months and weekly tick control, a chick vaccine schedule by age (Newcastle + IB, Gumboro, fowl pox, boosters), a **milk log** with each cow's daily **water** (60–70 L plus 4–5 L a litre of milk, shown in 20 L jerrycans) and **dairy meal** (1 kg per 2–3 L), **co-op deliveries** with the month's expected pay after per-litre deductions and a **payslip check** that shows litres missing and their worth, a **hatching calendar** for eggs under a broody hen or in an incubator (candling at day 7 and 14, stop turning at day 18, hatch at day 21, brooder temperatures, then "add the chicks as a flock"), an **egg log** for laying flocks (trays, laying rate per 100 hens with a warning when it drops, value at your price per tray), each with this week vs last week (by the daily average of recorded days), a trend and its value, and a history you can correct. **Records (daftari)**: income and costs by category (crop and livestock: milk, eggs, animal sales, feed, vet) and crop; sales can record the kilos sold, so each crop shows the **average price received** next to today's best market price; profit for this season or all time; **Share report** sends a plain-text season summary (including livestock, milk, eggs and produce in store) for a SACCO, lender, buyer or group. |
| **Masoko / Markets** | Pick a crop (each chip carries today's best price and its move) to compare today's wholesale price across markets, type your harvest in kg to see what it is worth at each; tap a market for its **14-day price trend** (this week's change, low / high, any day on touch, hover or arrow keys); **Sell on Soko** lists the harvest on the suite's own marketplace with the ask checked against today's fair price, and **My Soko listings** follows each one to claimed / delivered (or withdraw it); **price alerts** ("tell me when maize reaches KES 60"), shown on Today when any market gets there (in-app; the sheet says there is no SMS yet). For maize, beans and potatoes, **Sell now or store?** weighs today's price against the typical seasonal pattern month by month, after storage losses in hermetic or ordinary bags ("Store until April: about KES 6,500 more", or "Selling soon is fine"), using your harvest or what you have in store. Below: the planned harvest run (Apex Route A) with **Autopilot** one tap away, and deliveries on the road. |
| **Daktari / Crop doctor** | For maize, **fall armyworm scouting** first, the FAO FAMEWS / CIMMYT way: walk a W, check 10 plants at each of 5 stops, count fresh damage, and get the verdict against the action level for the crop's age (20 % in the first 2½ weeks, 40 % to tasselling) with what to do, IPM first; share the result anonymously with the county **pest watch** if you choose; and icipe's **push-pull** planner for next season (plots of at most 50 × 50 m, desmodium seed, Napier or Brachiaria border plants for your land). Then the offline symptom checker: pick the crop, tick what you see (leaves, stem, fruit / pods / cobs / tubers) and get ranked likely causes among 15 common Kenyan crop problems (fall armyworm, MLN, Tuta absoluta, late blight, bacterial wilt, bean fly, diamondback moth, …), problems **common this season** flagged and listed first, each with what to do now (IPM first, sprays by the label), how to prevent it next season, spraying safety, and "Ask Apex about this". |
| **Uliza Apex / Ask Apex** | Conversational advisory with intent pills, Swahili/English aware **spoken replies** (expo-speech TTS, toggleable), quick prompts. |

**Autopilot** (from Markets or the sidebar) engages the agentic chain on the server and renders the step-by-step timeline + mission brief.

Three themes (Loam · Nyota · Savanna for bright sun) switchable from the sidebar, persisted with AsyncStorage.

### Connection

On a phone the app reaches the server at the laptop's Wi-Fi address (auto-detected from Expo). When that fails the app shows "Offline" with a **Fix connection** button (also under Settings → KilimoOrbit server): it tests the address, says why it failed (no answer, unreachable, wrong server) with the usual fixes (server running? same Wi-Fi? Windows Firewall allowing Node.js?), and lets you type the address the server prints at start-up ("From a phone on this Wi-Fi: http://192.168.x.x:4517  (Wi-Fi)"). On Windows take the one marked Wi-Fi: the vEthernet (WSL, Hyper-V) addresses are listed separately because a phone cannot reach them. The address is kept on the phone.

### Data honesty

- Prices and (by default) weather are **sample data** and always carry the DEMO / MAJARIBIO tag until real feeds are wired in (`SAMPLE_PRICE_FEED` in `lib/prices.ts`; `WEATHER_PROVIDER=open-meteo` on the server for real forecasts).
- Crop calendars, input rates and the crop doctor are typical extension guidance, not prescriptions; the app says so where the numbers appear. Kiswahili and agronomy content should be reviewed by a native speaker and an extension agronomist before release.
- Yield ranges are typical smallholder figures (average to good practice) and price trends are sample data; both are labelled as estimates.
- Scouting thresholds follow CIMMYT's fall armyworm guide for African smallholders; push-pull follows icipe's Climate-Smart Push-Pull primer; lime rates follow Kenyan trial results (KALRO, One Acre Fund); dairy water and feed are East African extension rules of thumb; the hatching calendar is the standard 21-day chicken schedule. All say a soil test, extension officer or vet has the final word, and should be reviewed before release.
- Farm news is read live from public RSS feeds by the server and labelled by source; when the server itself has no internet it serves KilimoOrbit tips labelled SAMPLE (DEMO tag), never invented headlines. Show dates come from ASK's published 2026 calendar; a show whose dates have passed is projected to next year and labelled "estimated", and the app says to confirm with the organiser. Booking sends the farmer's name and email to the server only to send the reminder; without SMTP on the server the emails are SIMULATED and the calendar alarm is the reminder.
- Trivia questions are drawn from the same extension figures as the rest of the app, so they carry the same review caveat.
- The county pest watch shows farmers' anonymous reports (county, crop and counts only, sent only when the farmer ticks "share"); a county without reports shows a labelled SAMPLE watch.
- "Sell now or store?" uses a typical-year seasonal price shape for Kenyan markets (`lib/postharvest.ts`) and typical storage losses; it says it is not a promise and that prices can fall. The budget's starting input prices (`lib/budget.ts`) are rough guesses the farmer is asked to replace with their own.
- Livestock schedules are typical East African extension figures (gestation, heat cycles, deworming, a common chick vaccine schedule); the app tells farmers to follow their vet and the vaccine label.
- Everything the farmer records stays on the phone: the farm, its store and budget prices (`ko-farm`), animals, milk and eggs (`ko-herd`), trivia progress (`ko-quiz`), show bookings (`ko-bookings`), Soko listings with their private withdraw tokens (`ko-soko`) and price alerts (`ko-alerts`). Signing out with "forget", or a different farmer signing in on a shared phone, removes all of them.

### Crash safety

- Every screen exports an `ErrorBoundary`: a screen that throws shows "Something went wrong on this screen · Try again / Back to Today", never a blank app. Each card on Today, Shamba and Masoko is also wrapped in a `Guard`, so one broken card shows a small "This part couldn't load" note while the rest keeps working.
- Every server answer and every cached copy of one passes through `lib/validate.ts` before the UI reads it; every store (`ko-farm`, `ko-herd`, `ko-soko`, `ko-alerts`, chat log, profile) re-validates what it loads and is bounded in size. Malformed data shows "no data", never a crash.
- The e2e suite fails on any uncaught page error or crashed card, and includes corrupted storage, broken JSON and a server answering garbage.

## Prerequisites

- Node.js 20.19.4+ (or 22.13+), the **Expo Go** app on your Android phone (Play Store), and the **kilimoorbit-sentinel server running** (it is the brain — this app is the face).
- `npm install` ends with `npm audit` advisories; the ones left are inside Expo's build tooling (`@expo/config-plugins` → `xcode` → `uuid`, `node-forge`), on the developer's computer only, not in the app bundle. Do not run `npm audit fix --force`: it downgrades Expo.
- The app is on **Expo SDK 57** (React Native 0.86, React 19.2). Expo Go only opens projects on the SDK it was built for, so use the current Expo Go; if it says the project needs a different SDK, update Expo Go (or the project, with `npx expo install expo@<version> --fix`).

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

`e2e/farm.spec.ts` drives 37 farmer flows at phone (390px) and desktop (1280px) widths: Today (weather windows, county picker, adding a crop, ticking a task, weather-aware advice, store checks with undo), Shamba (calendar stage + input calculator, field size by pacing, expected harvest, harvest into store and a sale from it, a fresh harvest recorded as a sale, the "will it pay?" budget with remembered prices, records, kilos sold → average price, the shared report), livestock (a cow in calf, milk log and value, water and dairy meal per cow, co-op deliveries and a short payslip, egg log with trays, hatching from candling to a new flock, grouped deworming with undo, a flock's vaccine schedule), soil pH and lime, Masoko (harvest value, 14-day trend, sell now or store, selling on Soko and withdrawing, price alerts, Autopilot), the crop doctor (fall armyworm scouting and sharing, the county pest watch on Today, push-pull), the Today sliders (trivia with a persisted score, farm news with the county story first and a sample tip opening the app, show booking through the agent and its cancellation, booking offline with the calendar link still working), the connection screen (offline banner → test, save and reset an address), Markets chips, offline, Kiswahili, and crash resistance (corrupted storage, broken JSON, a server answering garbage, Apex without a market run). Every test also fails on any uncaught error or crashed card. `e2e/logic.spec.ts` unit-tests the pure logic (livestock calendar and egg log, alerts, task advice, diagnosis, input calculator, sell-or-hold plan and store checks, crop budget, field size, scouting thresholds, push-pull, lime, dairy water and feed, co-op payslip, hatching calendar, trivia draw and scoring, show dates and the calendar link, the server-address parser, response validation) without a browser. CI runs it on every PR that touches the app or the server (`.github/workflows/mobile-ci.yml`).

## Build an installable APK

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

(Free Expo account; produces a downloadable .apk.)

## Notes

- **Voice**: spoken replies use `expo-speech` (free, on-device, works in Expo Go). Speech-to-text *input* requires a native module (`@react-native-voice/voice`) and an EAS dev build — wire it in when you graduate from Expo Go.
- All Apex schema types live in `lib/api.ts`; `lib/config.ts` is the single backend swap point — same pattern as your SportsFusion apps.
