import { getSteamSession } from "./steam-session";

type SteamGame = {
  iconUrl?: string;
};

type SteamAsset = {
  id?: string;
  unowned_id?: string;
  name?: string;
  market_name?: string;
  market_hash_name?: string;
  type?: string;
  icon_url?: string;
  icon_url_large?: string;
  appid?: number | string;
  contextid?: string;
  unowned_contextid?: string;
  classid?: string;
  instanceid?: string;
  descriptions?: Array<{ value?: string; name?: string; type?: string }>;
  asset_properties?: {
    appid?: number | string;
  };
};

type SteamPurchase = {
  purchaseid: string | number;
  time_sold: number;
  steamid_purchaser: string;
  publisher_fee_app?: number | string;
  received_amount?: number;
  paid_amount?: number;
  asset: {
    appid: number | string;
    contextid: string;
    id: string;
    new_id?: string;
    new_contextid?: string;
  };
  paid_fee?: number;
  currencyid?: string;
  received_currencyid?: string;
  steam_fee?: number;
  publisher_fee?: number;
};

const gamesCache = new Map<string, SteamGame>();

const getGame = async (appid: string): Promise<SteamGame> => {
  const cached = gamesCache.get(appid);
  if (cached) return cached;

  const fallback: SteamGame = {
    iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
  };

  try {
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=russian`,
    );

    if (!response.ok) return fallback;

    const result = await response.json();
    const gameData = result?.[appid]?.data;

    const game: SteamGame = {
      iconUrl:
        gameData?.header_image ??
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    };

    if (gameData?.name) {
      gamesCache.set(appid, game);
    }

    return game;
  } catch {
    return fallback;
  }
};

const flattenAssets = (assets: unknown): SteamAsset[] => {
  const result: SteamAsset[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }

    if (!value || typeof value !== "object") return;

    const object = value as Record<string, unknown>;

    if (
      ("id" in object || "unowned_id" in object) &&
      ("icon_url" in object ||
        "market_name" in object ||
        "market_hash_name" in object ||
        "name" in object ||
        "descriptions" in object)
    ) {
      result.push(object as SteamAsset);
      return;
    }

    for (const entry of Object.values(object)) visit(entry);
  };

  visit(assets);
  return result;
};

const findAsset = (
  assets: SteamAsset[],
  purchase: SteamPurchase,
): SteamAsset | undefined => {
  const { appid, contextid, id, new_id, new_contextid } = purchase.asset;

  const exact = assets.find(
    (asset) =>
      String(asset.appid ?? appid) === String(appid) &&
      String(asset.contextid ?? contextid) === String(contextid) &&
      String(asset.id) === String(id),
  );

  if (exact && (exact.market_name || exact.name || exact.market_hash_name)) {
    return exact;
  }

  const candidates = assets.filter(
    (asset) =>
      String(asset.id ?? "") === String(id) ||
      String(asset.unowned_id ?? "") === String(id) ||
      (!!new_id && String(asset.id ?? "") === String(new_id)) ||
      (!!new_id && String(asset.unowned_id ?? "") === String(new_id)),
  );

  const named = candidates.find(
    (asset) => asset.market_name || asset.name || asset.market_hash_name,
  );

  if (named) return named;

  if (exact) return exact;

  if (candidates.length === 1) return candidates[0];

  if (new_id) {
    return assets.find(
      (asset) =>
        String(asset.id ?? "") === String(new_id) &&
        (!asset.contextid ||
          String(asset.contextid) === String(new_contextid ?? contextid)),
    );
  }

  return undefined;
};

const getItemName = (asset: SteamAsset | undefined, id: string): string => {
  const name = asset?.market_name ?? asset?.name ?? asset?.market_hash_name;

  if (name) return name;

  const descriptionName = asset?.descriptions?.find(
    (description) => description.name,
  )?.name;

  if (descriptionName) return descriptionName;

  return `Asset ${id}`;
};

const fetchHistoryPage = async (steamLoginSecure: string, start: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(
      `https://steamcommunity.com/market/myhistory/render/?start=${start}&count=500&norender=1&l=russian`,
      {
        headers: {
          Cookie: `steamLoginSecure=${steamLoginSecure}`,
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Steam history failed: status=${response.status}, start=${start}`,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Steam history request timed out at offset ${start}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const getMarketHistory = async (steamId: string, start = 0) => {
  const steamLoginSecure = getSteamSession(steamId);

  if (!steamLoginSecure) {
    throw new Error("Steam session not found");
  }

  const data = await fetchHistoryPage(steamLoginSecure, start);

  const purchases = Object.values(data.purchases ?? {}) as SteamPurchase[];

  const assets = flattenAssets(data.assets);

  const items = await Promise.all(
    purchases.map(async (purchase) => {
      const purchaseAsset = purchase.asset;
      const asset = findAsset(assets, purchase);

      const marketAppId = String(purchaseAsset.appid);

      const appid =
        marketAppId === "753"
          ? String(
              asset?.asset_properties?.appid ??
                purchase.publisher_fee_app ??
                753,
            )
          : marketAppId;

      const game = await getGame(appid);

      const iconUrl = asset?.icon_url_large ?? asset?.icon_url;
      const marketHashName = (
        asset?.market_hash_name ??
        asset?.market_name ??
        asset?.name ??
        ""
      ).replace(/ \(Trading Card\)$/, "");

      return {
        id: String(purchase.purchaseid),
        date: new Date(Number(purchase.time_sold) * 1000).toLocaleString(
          "ru-RU",
        ),
        item: getItemName(asset, String(purchaseAsset.id)),
        game,
        type:
          purchase.steamid_purchaser === steamId
            ? ("buy" as const)
            : ("sell" as const),
        received:
          Number(
            purchase.steamid_purchaser === steamId
              ? (purchase.paid_amount ?? 0) + (purchase.paid_fee ?? 0)
              : (purchase.received_amount ?? 0),
          ) / 100,
        imageUrl: iconUrl
          ? `https://community.cloudflare.steamstatic.com/economy/image/${iconUrl}`
          : undefined,
        appId: String(appid),
        marketAppId,
        marketHashName: marketHashName ?? "",
        paidAmount: purchase.paid_amount,
        paidFee: purchase.paid_fee,
        currencyId: purchase.currencyid,
        receivedAmount: purchase.received_amount,
        receivedCurrencyId: purchase.received_currencyid,
      };
    }),
  );

  return {
    items,
    nextStart:
      start + purchases.length < Number(data.total_count ?? 0)
        ? start + purchases.length
        : null,
  };
};

export type MarketSellListing = {
  id: string;
  item: string;
  game: string;
  price: number;
  imageUrl?: string;
  appId: string;
  marketAppId: string;
  marketHashName: string;
};

type SteamMarketListingData = {
  success?: boolean | number;
  listings?: Record<string, unknown>[] | Record<string, unknown>;
  buy_orders?: Record<string, unknown>[] | Record<string, unknown>;
  listinginfo?: Record<string, Record<string, unknown>>;
  assets?: unknown;
  results_html?: string;
  total_count?: number;
};

type MarketBuyOrder = {
  id: string;
  item: string;
  game: string;
  price: number;
  quantity: number;
  total: number;
  marketAppId: string;
  marketHashName: string;
};

const fetchMyListings = async (
  steamLoginSecure: string,
): Promise<SteamMarketListingData> => {
  const count = 100;
  let start = 0;

  const allListings: Record<string, unknown>[] = [];
  const allListingInfo: Record<string, unknown> = {};
  const allAssets: Record<string, unknown> = {};
  const allBuyOrders: Record<string, unknown>[] = [];

  let totalCount = 0;

  do {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let data: SteamMarketListingData;

    try {
      const response = await fetch(
        `https://steamcommunity.com/market/mylistings/?query=&start=${start}&count=${count}&norender=1&l=russian`,
        {
          headers: {
            Cookie: `steamLoginSecure=${steamLoginSecure}`,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Steam listings failed: status=${response.status}`);
      }

      data = (await response.json()) as SteamMarketListingData;

      if (start === 0) {
        allBuyOrders.push(...asRecords(data.buy_orders));
      }

      if (data.success === false || data.success === 0) {
        throw new Error("Steam rejected the market listings request");
      }
    } finally {
      clearTimeout(timeout);
    }

    totalCount = data.total_count ?? 0;

    const listings = asRecords(data.listings);
    const listingInfo = data.listinginfo ?? {};

    if (listings.length > 0) {
      allListings.push(...listings);
    } else {
      for (const [id, value] of Object.entries(listingInfo)) {
        allListings.push({
          ...(value as Record<string, unknown>),
          listingid: id,
        });
      }
    }

    Object.assign(allListingInfo, listingInfo);

    for (const [appId, contexts] of Object.entries(data.assets ?? {})) {
      const existingContexts =
        (allAssets[appId] as Record<string, unknown> | undefined) ?? {};

      for (const [contextId, items] of Object.entries(
        contexts as Record<string, unknown>,
      )) {
        const existingItems =
          (existingContexts[contextId] as
            | Record<string, unknown>
            | undefined) ?? {};

        Object.assign(existingItems, items as Record<string, unknown>);

        existingContexts[contextId] = existingItems;
      }

      allAssets[appId] = existingContexts;
    }

    start += count;
  } while (start < totalCount);

  return {
    success: true,
    total_count: totalCount,
    pagesize: count,
    listings: allListings,
    listinginfo: allListingInfo,
    buy_orders: allBuyOrders,
    assets: allAssets,
  } as SteamMarketListingData;
};

const asRecords = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }

  return [];
};

const getNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getListingAsset = (
  assets: SteamAsset[],
  listing: Record<string, unknown>,
): SteamAsset | undefined => {
  const asset = listing.asset;

  if (!asset || typeof asset !== "object") {
    return undefined;
  }

  const reference = asset as Record<string, unknown>;

  return assets.find(
    (candidate) =>
      String(candidate.id ?? "") === String(reference.id ?? "") &&
      String(candidate.appid ?? reference.appid ?? "") ===
        String(reference.appid ?? "") &&
      String(candidate.contextid ?? reference.contextid ?? "") ===
        String(reference.contextid ?? ""),
  );
};

export const getMarketSellListings = async (
  steamId: string,
): Promise<MarketSellListing[]> => {
  const steamLoginSecure = getSteamSession(steamId);

  if (!steamLoginSecure) {
    throw new Error("Steam session not found");
  }

  const data = await fetchMyListings(steamLoginSecure);
  const assets = flattenAssets(data.assets);

  const rawListings: Record<string, unknown>[] =
    asRecords(data.listings).length > 0
      ? asRecords(data.listings)
      : Object.entries(data.listinginfo ?? {}).map(
          ([id, value]): Record<string, unknown> => ({
            ...value,
            listingid: id,
          }),
        );

  return Promise.all(
    [...rawListings].reverse().map(async (listing, index) => {
      const asset = getListingAsset(assets, listing);
      const assetReference =
        listing.asset && typeof listing.asset === "object"
          ? (listing.asset as Record<string, unknown>)
          : {};

      const marketAppId = String(asset?.appid ?? assetReference.appid ?? "753");

      const appId =
        marketAppId === "753"
          ? String(asset?.asset_properties?.appid ?? 753)
          : marketAppId;

      const game = await getGame(appId);

      const rawName =
        asset?.market_hash_name ??
        asset?.market_name ??
        asset?.name ??
        listing.market_hash_name ??
        listing.market_name ??
        listing.name;

      const marketHashName =
        typeof rawName === "string" ? rawName.replace(/^\d+-/, "") : "";

      const item =
        marketHashName || `Лот ${String(listing.listingid ?? index + 1)}`;

      const buyerPrice =
        getNumber(listing.converted_price ?? listing.price) +
        getNumber(listing.converted_fee ?? listing.fee);

      const sellerPrice = getNumber(listing.converted_price ?? listing.price);

      const icon = asset?.icon_url_large ?? asset?.icon_url;

      return {
        id: String(listing.listingid ?? listing.id ?? index),
        item,
        game: game.iconUrl ?? "",
        price: buyerPrice / 100,
        sellerPrice: sellerPrice / 100,
        imageUrl: icon
          ? `https://community.cloudflare.steamstatic.com/economy/image/${icon}`
          : undefined,
        appId,
        marketAppId,
        marketHashName,
      };
    }),
  );
};

export const getMarketBuyOrders = async (
  steamId: string,
): Promise<MarketBuyOrder[]> => {
  const steamLoginSecure = getSteamSession(steamId);

  if (!steamLoginSecure) {
    throw new Error("Steam session not found");
  }

  const data = await fetchMyListings(steamLoginSecure);
  const rawOrders = asRecords(data.buy_orders);

  return Promise.all(
    rawOrders.map(async (order, index) => {
      const description =
        order.description && typeof order.description === "object"
          ? (order.description as Record<string, unknown>)
          : {};

      const price = getNumber(order.price) / 100;
      const quantity = getNumber(order.quantity_remaining ?? order.quantity);

      const appId = String(
        description.market_fee_app ?? description.appid ?? order.appid ?? "753",
      );

      const rawName = String(
        description.name ??
          description.market_name ??
          order.hash_name ??
          description.market_hash_name ??
          "Неизвестный предмет",
      );

      const marketHashName = String(
        order.hash_name ??
          description.market_hash_name ??
          description.market_name ??
          description.name ??
          "",
      );

      const marketAppId = String(
        description.market_fee_app ?? description.appid ?? order.appid ?? "753",
      );

      const game = await getGame(marketAppId);

      return {
        id: String(order.buy_orderid ?? order.id ?? index),
        item: rawName.replace(/^\d+-/, ""),
        game: game.iconUrl ?? "",
        marketAppId,
        marketHashName,
        price,
        quantity,
        total: price * quantity,
      };
    }),
  );
};
