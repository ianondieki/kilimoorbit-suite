# KilimoOrbit suite

Three projects in one repository:

| Folder | What it is | Runs on |
|---|---|---|
| `kilimoorbit-sentinel/` | The server: the Gemini-backed APEX engine, farm weather, market prices, the county pest watch, farm news, farm shows with the booking agent, and the Mission Control dashboard | Node.js 20+, port 4517 |
| `kilimoorbit-mobile/` | The farmer's app, KilimoOrbit (Expo SDK 57, Kiswahili and English) | Expo Go on Android, or the browser |
| `soko-mobile/` | The Soko marketplace app (Expo) | Expo Go on Android, or the browser |

## Run it

```bash
npm install          # once, from this folder: installs the root tools and all three projects
npm start            # the server → http://localhost:4517 (it prints the address a phone should use)
npm run app          # in a second terminal: the KilimoOrbit app → scan the QR code with Expo Go
```

- Put your Gemini key in `kilimoorbit-sentinel/.env` (`cp .env.example .env` in that folder). Without one the server runs its offline mock engine, so everything still works.
- The phone and the computer must be on the same Wi-Fi. The server prints `From a phone on this Wi-Fi: http://192.168.x.x:4517  (Wi-Fi)`; if the app shows **Offline**, tap **Fix connection** and type that address — the Wi-Fi one, not a vEthernet/WSL address (the server lists those separately as not reachable from a phone).
- `npm run dev` starts the server and both apps in the browser (ports 4517, 8081 and 8082); `npm run soko` starts the Soko app for the phone.
- `npm test` runs the server's five test suites. The app's own checks run inside `kilimoorbit-mobile/`: `npm run typecheck` and `npm run e2e`.

Each folder's README has the details: [kilimoorbit-sentinel](kilimoorbit-sentinel/README.md), [kilimoorbit-mobile](kilimoorbit-mobile/README.md), [soko-mobile](soko-mobile/README.md).
