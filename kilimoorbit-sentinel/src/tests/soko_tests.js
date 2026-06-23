/**
 * Soko — marketplace store verification suite.
 * Exercises the flat-file store and the fair-price logic directly (no server,
 * no LLM), so it stays fast and deterministic. Runs against a temp store path.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createListing,
  listListings,
  claimListing,
  suggestPrice,
  _reset,
  ValidationError,
} from "../soko/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const feed = JSON.parse(
  readFileSync(join(here, "../../payloads/commodity_feed.json"), "utf8")
);
const commodities = feed.commodities;

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
const results = [];
function check(name, fn) {
  let ok = false;
  let detail = "";
  try {
    const r = fn();
    ok = r?.ok ?? Boolean(r);
    detail = r?.detail ?? "";
  } catch (err) {
    detail = `threw: ${err?.message ?? err}`;
  }
  if (ok) passed++;
  results.push({ name, ok });
  console.log(
    `  ${ok ? C.green("PASS") : C.red("FAIL")}  ${name}${detail ? C.dim("  · " + detail) : ""}`
  );
}

console.log(C.bold("\n═".repeat(1) + "═".repeat(56)));
console.log(C.bold("  SOKO — MARKETPLACE STORE SUITE"));
console.log("═".repeat(57));

_reset();

check("1 · suggestPrice(maize) returns a fair price from the feed", () => {
  const p = suggestPrice("maize", commodities);
  return { ok: p.found && p.fair_price_per_kg > 0 && p.markets.length >= 2, detail: `fair = KES ${p.fair_price_per_kg}/kg · best ${p.best_market}` };
});

check("2 · suggestPrice(unicorn) → found:false, no price", () => {
  const p = suggestPrice("unicorn", commodities);
  return { ok: p.found === false && p.fair_price_per_kg === null };
});

check("3 · createListing seeds fair_price + opens as 'open'", () => {
  const l = createListing(
    { farmer_name: "Wanjiku", crop: "maize", county: "Meru", qty_kg: 200, ask_per_kg: 48 },
    commodities
  );
  return { ok: l.status === "open" && l.fair_price_per_kg > 0 && Boolean(l.id), detail: `ask 48 vs fair ${l.fair_price_per_kg}` };
});

check("4 · createListing rejects qty_kg <= 0 with field error", () => {
  try {
    createListing({ farmer_name: "X", crop: "beans", county: "Nakuru", qty_kg: 0, ask_per_kg: 100 }, commodities);
    return { ok: false };
  } catch (err) {
    return { ok: err instanceof ValidationError && err.fields.includes("qty_kg") };
  }
});

check("5 · createListing rejects missing crop", () => {
  try {
    createListing({ farmer_name: "X", county: "Nakuru", qty_kg: 10, ask_per_kg: 100 }, commodities);
    return { ok: false };
  } catch (err) {
    return { ok: err instanceof ValidationError && err.fields.includes("crop") };
  }
});

check("6 · listListings(status=open) returns the open listing", () => {
  const rows = listListings({ status: "open" });
  return { ok: rows.length >= 1 && rows.every((l) => l.status === "open"), detail: `${rows.length} open` };
});

check("7 · claimListing flips status → claimed and records a claim", () => {
  const [target] = listListings({ status: "open" });
  const { listing, claim } = claimListing(target.id, { claimer: "Boda-007", role: "rider" });
  return { ok: listing.status === "claimed" && claim.role === "rider" && claim.listing_id === target.id, detail: `${claim.claimer} took ${listing.crop}` };
});

check("8 · double-claim is rejected (already claimed)", () => {
  const claimed = listListings({}).find((l) => l.status === "claimed");
  try {
    claimListing(claimed.id, { claimer: "Other", role: "buyer" });
    return { ok: false };
  } catch (err) {
    return { ok: err instanceof ValidationError && err.fields.includes("status") };
  }
});

check("9 · claim rejects an invalid role", () => {
  const l = createListing({ farmer_name: "Otieno", crop: "onions", county: "Kisumu", qty_kg: 50, ask_per_kg: 80 }, commodities);
  try {
    claimListing(l.id, { claimer: "Z", role: "wholesaler" });
    return { ok: false };
  } catch (err) {
    return { ok: err instanceof ValidationError && err.fields.includes("role") };
  }
});

check("10 · claim on an unknown id is rejected", () => {
  try {
    claimListing("does-not-exist", { claimer: "Z", role: "buyer" });
    return { ok: false };
  } catch (err) {
    return { ok: err instanceof ValidationError && err.fields.includes("listing_id") };
  }
});

_reset();

const TOTAL = results.length;
console.log("─".repeat(57));
console.log(
  passed === TOTAL
    ? C.green(C.bold(`  ✓ ${passed}/${TOTAL} Soko tests passed`))
    : C.red(C.bold(`  ✗ ${passed}/${TOTAL} Soko tests passed`))
);
console.log("");
process.exit(passed === TOTAL ? 0 : 1);
