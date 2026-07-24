# Soko — Community Produce Marketplace

A farmer-to-buyer produce marketplace built with Expo (React Native) +
TypeScript + Expo Router. Farmers list surplus produce, and buyers / e-boda
riders claim delivery **runs**. Every listing is priced against KilimoOrbit's
live commodity board, so a **fair-price badge** shows how an ask compares to the
nearest masoko ("12% below market").

It's the face of the `kilimoorbit-sentinel` backend — the same server that
powers the Sentinel app also serves the Soko API at `/api/soko/*`.

## Tabs

| Tab | What it does |
|---|---|
| **Market** 🛒 | Browse all listings, filter by `open` / `claimed` / `delivered`, pull-to-refresh. Each card shows the ask vs the live market price, and a **Mark delivered** button on claimed runs. |
| **Sell** 🏷 | Post surplus produce (crop, county, kg, ask). "Check market price" pulls the live per-market board before you commit. |
| **Runs** 🛵 | Open runs only. Claim one as a **rider** or **buyer** from a bottom sheet; it flips to `claimed` for everyone. |

Listings move through **open → claimed → delivered**.

Three themes (Loam · Nyota · Savanna) shared with the Sentinel app — tap the
chip in the header to cycle; the choice is persisted with AsyncStorage.

## Prerequisites

- Node.js 18+, the **Expo Go** app (SDK 54), and the **kilimoorbit-sentinel
  server running** (it's the brain — this app is the face).

## Run it

```bash
# 1. Start the backend (in ../kilimoorbit-sentinel)
npm start                    # Mission Control + Soko API on :4517

# 2. Point the app at the backend:
cp .env.example .env         # then set EXPO_PUBLIC_API_BASE, or edit lib/config.ts
#    Android emulator:            http://10.0.2.2:4517
#    Physical phone (same Wi-Fi): http://<your-laptop-LAN-IP>:4517

# 3. Start the app
npm install
npm start                    # scan the QR with Expo Go
```

## API it talks to (`/api/soko/*`)

| Method | Path | Used by |
|--------|------|---------|
| `GET`  | `/listings?status=` | Market, Runs |
| `POST` | `/listings` | Sell |
| `POST` | `/listings/:id/claim` | Runs |
| `POST` | `/listings/:id/deliver` | Market (Mark delivered) |
| `POST` | `/price-suggest` | Sell |

## Layout

```
soko-mobile/
├── app/
│   ├── _layout.tsx              # theme provider + status bar
│   └── (tabs)/
│       ├── _layout.tsx          # Market · Sell · Runs tabs
│       ├── index.tsx            # Market
│       ├── sell.tsx             # Sell
│       └── runs.tsx             # Runs
├── components/
│   ├── ui.tsx                   # Header, Card, Badge, Button, Field, Empty
│   └── ListingCard.tsx          # listing card + fair-price badge
└── lib/
    ├── config.ts                # single backend swap point
    ├── api.ts                   # Soko types + fetch client
    ├── themes.ts                # shared palette
    └── theme-context.tsx        # theme provider + cycle
```
