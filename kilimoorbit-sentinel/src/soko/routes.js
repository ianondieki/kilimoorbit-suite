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
 *   POST /api/soko/price-suggest         { crop }
 */
import express from "express";
import {
  createListing,
  listListings,
  claimListing,
  deliverListing,
  suggestPrice,
  ValidationError,
} from "./store.js";

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
    }).map((l) => withLiveFair(l, feed));
    res.json({ listings: rows, count: rows.length });
  });

  router.post("/listings", (req, res) => {
    try {
      const listing = createListing(req.body ?? {}, commodities());
      res.status(201).json({ listing });
    } catch (err) {
      if (err instanceof ValidationError)
        return res.status(400).json({ error: err.message, fields: err.fields });
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  router.post("/listings/:id/claim", (req, res) => {
    try {
      const result = claimListing(req.params.id, req.body ?? {});
      res.json(result);
    } catch (err) {
      if (err instanceof ValidationError)
        return res.status(400).json({ error: err.message, fields: err.fields });
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  router.post("/listings/:id/deliver", (req, res) => {
    try {
      const listing = deliverListing(req.params.id);
      res.json({ listing });
    } catch (err) {
      if (err instanceof ValidationError)
        return res.status(400).json({ error: err.message, fields: err.fields });
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  router.post("/price-suggest", (req, res) => {
    const crop = req.body?.crop;
    if (!crop) return res.status(400).json({ error: "A crop is required.", fields: ["crop"] });
    res.json(suggestPrice(crop, commodities()));
  });

  return router;
}
