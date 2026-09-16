/**
 * Soko — marketplace API router.
 *
 * Mounted at /api/soko by the Mission Control server. Listings and claims live
 * in the flat-file store; the fair-price intelligence is borrowed from the
 * live commodity feed the server already maintains, so prices drift with the
 * rest of the dashboard.
 *
 *   GET  /api/soko/listings              ?status=&crop=&county=
 *   POST /api/soko/listings              { farmer_name, crop, county, qty_kg, ask_per_kg }
 *   POST /api/soko/listings/:id/claim    { claimer, role: "buyer"|"rider" }
 *   POST /api/soko/listings/:id/deliver  (claimed → delivered)
 *   POST /api/soko/listings/:id/cancel   { owner_token }  (open → cancelled; token returned once on create)
 *   GET  /api/soko/listings/:id
 *   GET  /api/soko/stats
 *   POST /api/soko/price-suggest         { crop }
 */
import express from "express";
import {
  createListing,
  listListings,
  claimListing,
  deliverListing,
  cancelListing,
  getListing,
  stats,
  suggestPrice,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "./store.js";

/** Map store errors to HTTP: NotFound → 404, Validation → 400, else 500. */
const fail = (res, err) => {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message, fields: err.fields });
  if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message, fields: err.fields });
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message, fields: err.fields });
  return res.status(500).json({ error: err?.message ?? String(err) });
};

/**
 * @param {object} deps
 * @param {() => {commodities: Array}} deps.liveFeed - returns the current commodity feed.
 */
export function createSokoRouter({ liveFeed }) {
  const router = express.Router();
  const commodities = () => liveFeed()?.commodities ?? [];

  // Re-price an open listing against the *current* feed so the badge stays live;
  // claimed/delivered listings keep the price they were locked in at.
  const withLiveFair = (l, feed) =>
    l.status === "open"
      ? { ...l, fair_price_per_kg: suggestPrice(l.crop, feed).fair_price_per_kg ?? l.fair_price_per_kg }
      : l;

  router.get("/listings", (req, res) => {
    const feed = commodities();
    const rows = listListings({
      status: req.query.status,
      crop: req.query.crop,
      county: req.query.county,
      limit: req.query.limit,
    }).map((l) => withLiveFair(l, feed));
    res.json({ listings: rows, count: rows.length });
  });

  router.get("/stats", (_req, res) => res.json(stats()));

  router.get("/listings/:id", (req, res) => {
    const l = getListing(req.params.id);
    if (!l) return res.status(404).json({ error: "No listing with that id.", fields: ["listing_id"] });
    res.json({ listing: withLiveFair(l, commodities()) });
  });

  router.post("/listings", (req, res) => {
    try {
      const listing = createListing(req.body ?? {}, commodities());
      res.status(201).json({ listing });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/listings/:id/claim", (req, res) => {
    try {
      const result = claimListing(req.params.id, req.body ?? {});
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/listings/:id/deliver", (req, res) => {
    try {
      const listing = deliverListing(req.params.id);
      res.json({ listing });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/listings/:id/cancel", (req, res) => {
    try {
      res.json({ listing: cancelListing(req.params.id, req.body ?? {}) });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/price-suggest", (req, res) => {
    const crop = typeof req.body?.crop === "string" ? req.body.crop.slice(0, 40) : "";
    if (!crop.trim()) return res.status(400).json({ error: "A crop is required.", fields: ["crop"] });
    res.json(suggestPrice(crop, commodities()));
  });

  return router;
}
