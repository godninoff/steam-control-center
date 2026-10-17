export interface SteamCatalogItem {
  appId: number;
  name: string;
  marketHashName: string;
  sellListings: number;
  sellPrice: number | null;
  sellPriceText: string | null;
  iconUrl: string | null;
  marketUrl: string;
}

export interface SteamCatalogResponse {
  success: boolean;
  start: number;
  pagesize: number;
  total_count: number;
  results: Array<{
    name?: string;
    hash_name?: string;
    sell_listings?: number;
    sell_price?: number;
    sell_price_text?: string;
    asset_description?: {
      icon_url?: string;
      icon_url_large?: string;
      market_hash_name?: string;
    };
  }>;
}

export interface SteamCatalogPage {
  appId: number;
  items: SteamCatalogItem[];
  start: number;
  nextStart: number | null;
  totalCount: number;
}

export interface CatalogSyncProgress {
  processed: number;
  totalCount: number;
  currentItem: string | null;
}

export interface CatalogSyncResult {
  synced: boolean;
  processed: number;
  totalCount: number;
}

export interface StoredCatalogItem {
  appId: number;
  name: string;
  marketHashName: string;
  sellListings: number;
  sellPrice: number | null;
  marketUrl: string;
  imageUrl: string | null;
}
