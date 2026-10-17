export type ScannerPriceBasis = "median" | "current";

export interface ScannerSettings {
  maxBuyPrice: number | null;
  minProfitPercent: number;
  minSalesCount: number;
  historyDays: number;
  priceBasis: ScannerPriceBasis;
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  maxBuyPrice: 5000,
  minProfitPercent: 3,
  minSalesCount: 50,
  historyDays: 30,
  priceBasis: "median",
};

export interface ScannerSettingsInput {
  maxBuyPrice: number | null;
  minProfitPercent: number;
  minSalesCount: number;
  historyDays: number;
  priceBasis: ScannerPriceBasis;
}
