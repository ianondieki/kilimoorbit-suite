/**
 * Soko — flat-file marketplace store.
 *
 * Frugal, no-DB persistence that matches the Sentinel ethos: a single JSON
 * file (data/soko_store.json) holds produce listings and rider/buyer claims.
 * Reads return deep clones so callers can't corrupt the in-memory shape, and
 * every mutation is written through to disk so listings survive a restart.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "data");
const storePath = join(dataDir, "soko_store.json");

const EMPTY = { listings: [], claims: [] };

function read() {
  if (!existsSync(storePath)) return structuredClone(EMPTY);
  try {
    const db = JSON.parse(readFileSync(storePath, "utf8"));
    return { listings: db.listings ?? [], claims: db.claims ?? [] };
  } catch {
    // A corrupt file shouldn't take the whole API down — start clean.
    return structuredClone(EMPTY);
  }
}

function write(db) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(storePath, JSON.stringify(db, null, 2));
}

/** Throwable validation error the router maps to a 400. */
export class ValidationError extends Error {
  constructor(message, fields = []) {
    super(message);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v) => String(v ?? "").trim();

/**
 * Suggest a fair price (KES/kg) for a crop from a commodity feed.
 * Returns the average and best quote plus the full market list so the app can
 * render a "12% below Wakulima" badge. `found:false` when the crop isn't tracked.
 */
export function suggestPrice(crop, commodities = []) {
  const key = str(crop).toLowerCase();
  const match = commodities.find((c) => str(c.crop).toLowerCase() === key);
  if (!match || !Array.isArray(match.quotes) || match.quotes.length === 0)
    return { crop: str(crop), found: false, fair_price_per_kg: null, markets: [] };

  const quotes = match.quotes.filter((q) => isNum(q.price));
  const avg = quotes.reduce((s, q) => s + q.price, 0) / quotes.length;
  const best = quotes.reduce((a, b) => (b.price > a.price ? b : a));
  return {
    crop: str(crop),
    emoji: match.emoji ?? "",
    found: true,
    fair_price_per_kg: Math.round(avg),
    best_market: best.market,
    best_price_per_kg: best.price,
    markets: quotes.map((q) => ({ market: q.market, price: q.price, delta: q.delta ?? 0 })),
  };
}

/**
 * Validate + create a listing. `commodities` (the live feed) seeds the fair
 * price so a farmer instantly sees how their ask compares to the masoko.
 */
export function createListing(input = {}, commodities = []) {
  const farmer_name = str(input.farmer_name);
  const crop = str(input.crop);
  const county = str(input.county);
  const qty_kg = Number(input.qty_kg);
  const ask_per_kg = Number(input.ask_per_kg);

  const bad = [];
  if (!farmer_name) bad.push("farmer_name");
  if (!crop) bad.push("crop");
  if (!county) bad.push("county");
  if (!isNum(qty_kg) || qty_kg <= 0 || qty_kg > 100000) bad.push("qty_kg");
  if (!isNum(ask_per_kg) || ask_per_kg <= 0 || ask_per_kg > 100000) bad.push("ask_per_kg");
  if (bad.length)
    throw new ValidationError("A listing needs farmer_name, crop, county, a positive qty_kg and ask_per_kg.", bad);

  const price = suggestPrice(crop, commodities);
  const listing = {
    id: randomUUID(),
    farmer_name,
    crop,
    county,
    qty_kg,
    ask_per_kg,
    fair_price_per_kg: price.fair_price_per_kg,
    best_market: price.best_market ?? null,
    status: "open",
    created_at: new Date().toISOString(),
  };

  const db = read();
  db.listings.unshift(listing);
  write(db);
  return listing;
}

/** List listings, newest first, optionally filtered by status/crop/county. */
export function listListings({ status, crop, county } = {}) {
  const db = read();
  return db.listings.filter((l) => {
    if (status && l.status !== str(status).toLowerCase()) return false;
    if (crop && str(l.crop).toLowerCase() !== str(crop).toLowerCase()) return false;
    if (county && str(l.county).toLowerCase() !== str(county).toLowerCase()) return false;
    return true;
  });
}

export function getListing(id) {
  return read().listings.find((l) => l.id === id) ?? null;
}

/**
 * Claim an open listing as a buyer or rider. Flips the listing to "claimed"
 * and records the claim. Throws ValidationError for a bad role, a missing
 * listing, or one already taken.
 */
export function claimListing(id, input = {}) {
  const claimer = str(input.claimer);
  const role = str(input.role).toLowerCase();
  const bad = [];
  if (!claimer) bad.push("claimer");
  if (role !== "buyer" && role !== "rider") bad.push("role");
  if (bad.length)
    throw new ValidationError("A claim needs a claimer and a role of 'buyer' or 'rider'.", bad);

  const db = read();
  const listing = db.listings.find((l) => l.id === id);
  if (!listing) throw new ValidationError("No listing with that id.", ["listing_id"]);
  if (listing.status !== "open")
    throw new ValidationError(`Listing is already ${listing.status}.`, ["status"]);

  listing.status = "claimed";
  const claim = {
    id: randomUUID(),
    listing_id: id,
    claimer,
    role,
    claimed_at: new Date().toISOString(),
  };
  db.claims.unshift(claim);
  write(db);
  return { listing, claim };
}

/** Test/maintenance helper — wipe the store. */
export function _reset() {
  write(structuredClone(EMPTY));
}
