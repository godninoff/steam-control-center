import { randomUUID } from "node:crypto";
import { fetchSteamCatalogPage, getStoredSteamCatalog } from "./catalog";
import {
  getCachedScannerPriceHistory,
  getScannerPriceHistory,
} from "./scanner-price-history";
import { analyzePriceHistory } from "./scanner-analysis";
import type { ScannerSettings } from "./scanner";

export type ScannerJobStatus = "queued" | "running" | "completed" | "failed";

export interface ScannerCandidate {
  appId: number;
  name: string;
  marketHashName: string;
  marketUrl: string;
  buyPrice: number;
  currency: string;
  analysis: ReturnType<typeof analyzePriceHistory>;
  imageUrl: string | null;
}

export interface ScannerJob {
  id: string;
  status: ScannerJobStatus;
  appId: number;
  scanned: number;
  totalCount: number | null;
  currentItem: string | null;
  candidates: ScannerCandidate[];
  error: string | null;
  historyFetched: number;
  historyPending: number;
  catalogSynced: boolean;
  createdAt: string;
  updatedAt: string;
  settings: {
    historyDays: number;
    priceBasis: "median" | "current";
    minProfitPercent: number;
    minSalesCount: number;
    maxBuyPrice: number | null;
  };
}

interface ScannerJobInput extends ScannerSettings {
  pageSize?: number;
}

const MAX_HISTORY_FETCHES_PER_JOB = 100;
const HISTORY_DELAY_MS = 500;
const MIN_PRICE_UAH = 7;
const MAX_PRICE_UAH = 5000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const updateJob = (job: ScannerJob) => {
  job.updatedAt = new Date().toISOString();
};

export const getScannerJob = (id: string): ScannerJob | null => {
  return jobs.get(id) ?? null;
};

const jobs = new Map<string, ScannerJob>();

export const startScannerJob = (settings: ScannerJobInput): ScannerJob => {
  const job: ScannerJob = {
    id: randomUUID(),
    status: "queued",
    appId: settings.appId,
    scanned: 0,
    totalCount: null,
    currentItem: null,
    candidates: [],
    error: null,
    historyFetched: 0,
    historyPending: 0,
    catalogSynced: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      historyDays: settings.historyDays,
      priceBasis: settings.priceBasis,
      minProfitPercent: settings.minProfitPercent,
      minSalesCount: settings.minSalesCount,
      maxBuyPrice: settings.maxBuyPrice,
    },
  };

  jobs.set(job.id, job);
  console.log("[Scanner] startScannerJob CALLED", settings.appId);
  setImmediate(() => {
    void runScannerJob(job, settings);
  });

  return job;
};

const isSteamRateLimited = (error: unknown): boolean =>
  error instanceof Error && /HTTP 429/.test(error.message);

const isSteamForbidden = (error: unknown): boolean =>
  error instanceof Error && /HTTP 403/.test(error.message);

const fetchHistoryWithRetry = async (
  steamId: string,
  appId: number,
  marketHashName: string,
  retries = 3,
) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getScannerPriceHistory(steamId, appId, marketHashName);
    } catch (error) {
      if (isSteamForbidden(error) || isSteamRateLimited(error)) {
        throw error;
      }

      if (attempt >= retries) {
        throw error;
      }

      const delay = attempt * 5000;

      console.warn(
        `[Scanner] Retry ${attempt}/${retries} for ${marketHashName} in ${delay}ms`,
      );

      await sleep(delay);
    }
  }
};

const runScannerJob = async (
  job: ScannerJob,
  settings: ScannerJobInput,
): Promise<void> => {
  try {
    job.status = "running";
    updateJob(job);

    const catalogPage = await fetchSteamCatalogPage(
      settings.appId,
      settings.start,
      settings.count,
    );

    const catalog = catalogPage.items.map((item) => ({
      appId: item.appId,
      name: item.name,
      marketHashName: item.marketHashName,
      marketUrl: item.marketUrl,
      imageUrl: item.iconUrl,
      sellPrice: item.sellPrice === null ? null : item.sellPrice / 100,
      sellListings: item.sellListings,
    }));

    job.catalogSynced = false;
    job.totalCount = catalog.length;
    job.scanned = 0;
    updateJob(job);

    for (const item of catalog) {
      job.currentItem = item.marketHashName;
      updateJob(job);

      const price = item.sellPrice;

      if (price == null || price < MIN_PRICE_UAH || price > MAX_PRICE_UAH) {
        job.scanned += 1;
        updateJob(job);
        continue;
      }

      try {
        const buyPrice = price;
        const withinBudget =
          settings.maxBuyPrice === null || buyPrice <= settings.maxBuyPrice;

        if (!withinBudget) continue;

        let history = await getCachedScannerPriceHistory(
          settings.appId,
          item.marketHashName,
        );

        if (!history) {
          if (job.historyFetched >= MAX_HISTORY_FETCHES_PER_JOB) {
            job.historyPending += 1;
            continue;
          }

          history = await fetchHistoryWithRetry(
            settings.steamId,
            settings.appId,
            item.marketHashName,
          );

          job.historyFetched += 1;
          updateJob(job);

          await sleep(HISTORY_DELAY_MS);
        }

        const analysis = analyzePriceHistory(
          history.points,
          {
            historyDays: settings.historyDays,
            priceBasis: settings.priceBasis,
            minProfitPercent: settings.minProfitPercent,
            minSalesCount: settings.minSalesCount,
            maxBuyPrice: settings.maxBuyPrice,
          },
          buyPrice,
        );

        if (analysis.isCandidate) {
          job.candidates.push({
            appId: settings.appId,
            name: item.name,
            marketHashName: item.marketHashName,
            marketUrl: item.marketUrl,
            imageUrl: item.imageUrl,
            buyPrice,
            currency: history.currency,
            analysis,
          });
        }
      } catch (error) {
        if (isSteamForbidden(error) || isSteamRateLimited(error)) {
          throw error;
        }

        console.warn(
          `[Scanner] Skipped ${item.marketHashName}:`,
          error instanceof Error ? error.message : error,
        );
      } finally {
        job.scanned += 1;
        updateJob(job);
      }
    }

    job.status = "completed";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Scanner failed";

    console.error(`[Scanner job ${job.id}]`, error);
  } finally {
    job.currentItem = null;
    updateJob(job);
  }
};
