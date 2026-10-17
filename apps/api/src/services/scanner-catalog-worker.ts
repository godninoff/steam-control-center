import { syncSteamCatalog } from "./catalog";

const CATALOG_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const CATALOG_RETRY_INTERVAL_MS = 3 * 60 * 1000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

let workerPromise: Promise<void> | null = null;
let stopRequested = false;

const runCatalogWorker = async (appId: number): Promise<void> => {
  console.log(`[Catalog worker] Started for app ${appId}`);

  while (!stopRequested) {
    let delay = CATALOG_REFRESH_INTERVAL_MS;

    try {
      const result = await syncSteamCatalog(appId, (progress) => {
        console.log(
          `[Catalog worker] ${progress.processed}/${progress.totalCount}`,
        );
      });

      console.log("[Catalog worker] Sync completed:", result);
    } catch (error) {
      delay = CATALOG_RETRY_INTERVAL_MS;

      console.error("[Catalog worker] Sync failed:", error);
    }

    if (!stopRequested) {
      await sleep(delay);
    }
  }

  console.log(`[Catalog worker] Stopped for app ${appId}`);
};

export const startScannerCatalogWorker = (appId: number): void => {
  if (workerPromise) return;

  stopRequested = false;

  workerPromise = runCatalogWorker(appId).finally(() => {
    workerPromise = null;
  });
};

export const stopScannerCatalogWorker = (): void => {
  stopRequested = true;
};
