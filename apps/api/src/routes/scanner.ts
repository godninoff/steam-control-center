import { Router } from "express";
import { DEFAULT_SCANNER_SETTINGS } from "../types/scanner";
import { validateScannerSettings } from "../services/validate-settings";
import { getScannerJob, startScannerJob } from "../services/scanner-jobs";
import { getSteamSession } from "../services/steam-session";

const router = Router();

router.get("/scanner/settings", (_req, res) => {
  return res.json({
    settings: DEFAULT_SCANNER_SETTINGS,
  });
});

router.post("/scanner/settings/validate", (req, res) => {
  try {
    const settings = validateScannerSettings(req.body);
    return res.json({ settings });
  } catch (error) {
    return res.status(400).json({
      error:
        error instanceof Error ? error.message : "Invalid scanner settings",
    });
  }
});

// Запуск фонового сканирования.
router.post("/scanner/scan", (req, res) => {
  const steamId = typeof req.body?.steamId === "string" ? req.body.steamId : "";

  const appId = Number(req.body?.appid ?? 730);
  const start = Number(req.body?.start ?? 0);
  const count = Number(req.body?.count ?? 100);

  if (!steamId) {
    return res.status(400).json({ error: "steamId is required" });
  }

  if (!Number.isInteger(appId) || appId <= 0) {
    return res.status(400).json({ error: "Invalid appid" });
  }

  if (
    !Number.isInteger(start) ||
    start < 0 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100
  ) {
    return res.status(400).json({
      error: "Invalid start or count (1–100)",
    });
  }

  if (!getSteamSession(steamId)) {
    return res.status(404).json({
      error: "Steam session not found. Update it using the browser extension.",
    });
  }

  try {
    const settings = validateScannerSettings({
      ...DEFAULT_SCANNER_SETTINGS,
      historyDays: Number(
        req.body?.historyDays ?? DEFAULT_SCANNER_SETTINGS.historyDays,
      ),
      priceBasis: req.body?.priceBasis ?? DEFAULT_SCANNER_SETTINGS.priceBasis,
      minProfitPercent: Number(
        req.body?.minProfitPercent ?? DEFAULT_SCANNER_SETTINGS.minProfitPercent,
      ),
      minSalesCount: Number(
        req.body?.minSalesCount ?? DEFAULT_SCANNER_SETTINGS.minSalesCount,
      ),
      maxBuyPrice:
        req.body?.maxBuyPrice === "none"
          ? null
          : Number(
              req.body?.maxBuyPrice ?? DEFAULT_SCANNER_SETTINGS.maxBuyPrice,
            ),
    });

    const job = startScannerJob({
      appId,
      start,
      count,
      steamId,
      ...settings,
    });

    return res.status(202).json({
      job,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Scanner failed",
    });
  }
});

// Получение прогресса задачи.
router.get("/scanner/scan/:jobId", (req, res) => {
  const job = getScannerJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: "Scanner job not found",
    });
  }

  return res.json(job);
});

export default router;
