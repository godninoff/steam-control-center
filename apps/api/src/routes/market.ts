import { Router } from "express";
import {
  getMarketBuyOrders,
  getMarketSellListings,
  getMarketHistory,
} from "../services/market";

const router = Router();

router.get("/market/history", async (req, res) => {
  const steamId = req.query.steamId;
  const startParam = req.query.start ?? "0";

  if (typeof steamId !== "string") {
    return res.status(400).json({
      error: "steamId is required",
    });
  }

  const start = Number(startParam);

  if (!Number.isInteger(start) || start < 0) {
    return res.status(400).json({
      error: "start must be a non-negative integer",
    });
  }

  try {
    const result = await getMarketHistory(steamId, start);

    return res.json(result);
  } catch (error) {
    console.error("Market history error:", error);

    return res.status(500).json({
      error: "Failed to load Steam Market history",
    });
  }
});

router.get("/market/sell-listings", async (req, res) => {
  const steamId = req.query.steamId;

  if (typeof steamId !== "string") {
    return res.status(400).json({ error: "steamId is required" });
  }

  try {
    const sellListings = await getMarketSellListings(steamId);
    return res.json({ sellListings });
  } catch (error) {
    console.error("Market sell listings error:", error);
    return res.status(500).json({
      error: "Failed to load Steam sell listings",
    });
  }
});

router.get("/market/buy-orders", async (req, res) => {
  const steamId = req.query.steamId;

  if (typeof steamId !== "string") {
    return res.status(400).json({ error: "steamId is required" });
  }

  try {
    const buyOrders = await getMarketBuyOrders(steamId);
    return res.json({ buyOrders });
  } catch (error) {
    console.error("Market buy orders error:", error);

    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
