import { Router } from "express";
import { getScannerPriceHistory } from "../services/scanner-price-history";
import { analyzePriceHistory } from "../services/scanner-analysis";
import { getSteamSession } from "../services/steam-session";
import { fetchSteamCatalogPage } from "../services/catalog";

const router = Router();

router.get("/scanner/price-history", async (req, res) => {
  const steamId =
    typeof req.query.steamId === "string" ? req.query.steamId : "";
  const appId = Number(req.query.appid ?? 730);
  const marketHashName =
    typeof req.query.marketHashName === "string"
      ? req.query.marketHashName
      : "";

  if (!steamId || !marketHashName) {
    return res.status(400).json({
      error: "steamId and marketHashName are required",
    });
  }

  if (!Number.isInteger(appId) || appId <= 0) {
    return res.status(400).json({
      error: "appid must be a positive integer",
    });
  }

  try {
    console.log("[Scanner] route reached", { steamId, appId, marketHashName });
    const history = await getScannerPriceHistory(
      steamId,
      appId,
      marketHashName,
    );

    const historyDays = Number(req.query.historyDays ?? 30);

    const priceBasis =
      req.query.priceBasis === "current" ? "current" : "median";

    const minProfitPercent = Number(req.query.minProfitPercent ?? 3);
    const minSalesCount = Number(req.query.minSalesCount ?? 50);

    const maxBuyPrice =
      req.query.maxBuyPrice === undefined || req.query.maxBuyPrice === ""
        ? 5000
        : req.query.maxBuyPrice === "none"
          ? null
          : Number(req.query.maxBuyPrice);

    if (
      !Number.isInteger(historyDays) ||
      historyDays < 1 ||
      historyDays > 3650
    ) {
      return res.status(400).json({
        error: "historyDays must be an integer between 1 and 3650",
      });
    }

    if (
      req.query.priceBasis !== undefined &&
      req.query.priceBasis !== "median" &&
      req.query.priceBasis !== "current"
    ) {
      return res.status(400).json({
        error: "priceBasis must be median or current",
      });
    }

    if (
      !Number.isFinite(minProfitPercent) ||
      minProfitPercent < 0 ||
      minProfitPercent > 10000
    ) {
      return res.status(400).json({
        error: "minProfitPercent must be between 0 and 10000",
      });
    }

    if (
      !Number.isFinite(minSalesCount) ||
      !Number.isInteger(minSalesCount) ||
      minSalesCount < 0
    ) {
      return res.status(400).json({
        error: "minSalesVolume must be a non-negative integer",
      });
    }

    if (
      maxBuyPrice !== null &&
      (!Number.isFinite(maxBuyPrice) || maxBuyPrice <= 0)
    ) {
      return res.status(400).json({
        error: "maxBuyPrice must be positive or none",
      });
    }

    if (
      !Number.isInteger(historyDays) ||
      historyDays < 1 ||
      historyDays > 3650
    ) {
      return res.status(400).json({
        error: "historyDays must be an integer between 1 and 3650",
      });
    }

    const steamLoginSecure = getSteamSession(steamId);

    if (!steamLoginSecure) {
      return res.status(404).json({
        error: "Steam session not found",
      });
    }

    const catalogPage = await fetchSteamCatalogPage(appId, 0, 100);

    console.log("[Scanner] catalog loaded", {
      count: catalogPage.items.length,
      requestedItem: marketHashName,
      found: catalogPage.items.some(
        (item) => item.marketHashName === marketHashName,
      ),
    });

    const catalogItem = catalogPage.items.find(
      (item) => item.marketHashName === marketHashName,
    );

    if (!catalogItem || catalogItem.sellPrice === null) {
      return res.status(404).json({
        error: "Item not found in the first catalog page",
      });
    }

    // Каталог отдаёт цену в минимальных денежных единицах.
    // Например, 6400 = 64 ₴.
    const buyPrice = catalogItem.sellPrice / 100;

    const analysis = analyzePriceHistory(
      history.points,
      {
        historyDays,
        priceBasis,
        minProfitPercent,
        minSalesCount,
        maxBuyPrice,
      },
      buyPrice,
    );

    return res.json({
      appId: history.appId,
      marketHashName: history.marketHashName,
      currency: history.currency,
      buyPrice,
      settings: {
        historyDays,
        priceBasis,
        minProfitPercent,
        minSalesCount,
        maxBuyPrice,
      },
      analysis,
    });
  } catch (error) {
    console.error("[Scanner price history]", error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch Steam price history",
    });
  }
});

export default router;
