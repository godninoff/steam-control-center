import { Router } from "express";
import { getSteamSession } from "../services/steam-session";
import { fetchSteamCatalogPage } from "../services/catalog";
const router = Router();
router.get("/scanner/catalog", async (req, res) => {
  const appId = Number(req.query.appid ?? 730);
  const start = Number(req.query.start ?? 0);
  const count = Number(req.query.count ?? 100);
  const steamId =
    typeof req.query.steamId === "string" ? req.query.steamId : "";
  if (!Number.isInteger(appId) || appId <= 0) {
    return res.status(400).json({ error: "Invalid appid" });
  }
  if (!Number.isInteger(start) || start < 0) {
    return res.status(400).json({ error: "Invalid start" });
  }
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return res.status(400).json({ error: "count must be between 1 and 100" });
  }
  if (!steamId) {
    return res.status(400).json({ error: "steamId is required" });
  }

  const steamLoginSecure = getSteamSession(steamId);
  if (!steamLoginSecure) {
    return res.status(404).json({
      error: "Steam session not found. Update it using the browser extension.",
    });
  }
  try {
    const page = await fetchSteamCatalogPage(appId, start, count);
    return res.json(page);
  } catch (error) {
    console.error("Failed to fetch Steam catalog:", error);
    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch Steam catalog",
    });
  }
});
export default router;
