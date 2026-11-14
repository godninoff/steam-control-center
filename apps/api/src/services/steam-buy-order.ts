const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const STEAM_CURRENCY = { RUB: 5, UAH: 25 } as const;
const STEAM_CC = { RUB: "RU", UAH: "UA" } as const;

export type SteamCurrency = keyof typeof STEAM_CURRENCY;

export type SteamOrderBook = {
  buyOrderRub: number | null;
  // Топ-3 уровня ордеров от максимального вниз
  buyOrders: number[];
};

const cache = new Map<string, { value: SteamOrderBook; fetchedAt: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

let chain: Promise<void> = Promise.resolve();

const queue = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn);
  chain = run.then(() => sleep(1_000)).catch(() => {});
  return run;
};

// rgCompactBuyOrders — плоский массив [цена, кол-во, цена, кол-во, ...],
// уровни идут от максимального вниз. Берём первые TOP_N пар.
const TOP_N = 3;

const decodeBuyOrders = (compact: number[]): SteamOrderBook => {
  const levels: number[] = [];

  for (let i = 0; i + 1 < compact.length && levels.length < TOP_N; i += 2) {
    const price = Number(compact[i]) / 100;
    if (Number.isFinite(price) && price > 0) levels.push(price);
  }

  return {
    buyOrderRub: levels[0] ?? null,
    buyOrders: levels,
  };
};

export const getSteamBuyOrder = async (
  name: string,
  currency: SteamCurrency = "RUB",
): Promise<SteamOrderBook> => {
  const cacheKey = `${currency}:${name}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.value;
  }

  return queue(async () => {
    const listingUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`;

    const query = new URLSearchParams({
      q: "Load",
      qp: JSON.stringify([730, name]),
      cc: STEAM_CC[currency],
      l: currency === "RUB" ? "russian" : "ukrainian",
      currency: String(STEAM_CURRENCY[currency]),
    });

    const res = await fetch(
      `https://steamcommunity.com/market/orderbook?${query}`,
      {
        headers: {
          accept: "application/json",
          referer: listingUrl,
          "x-valve-request-type": "queryAction",
          "User-Agent": UA,
        },
      },
    );

    console.log(`[Steam orderbook] ${name} (${currency}): HTTP ${res.status}`);

    if (!res.ok) return { buyOrderRub: null, buyOrders: [] };

    const raw = await res.text();

    if (raw.trimStart().startsWith("<")) {
      console.log(`[Steam orderbook] ${name}: got HTML instead of JSON`);
      return { buyOrderRub: null, buyOrders: [] };
    }

    const outer = JSON.parse(raw) as { success?: boolean; data?: unknown };

    const payload = ("success" in outer ? outer : (outer.data as never)) as {
      success?: boolean;
      data?: {
        amtMaxBuyOrder?: number | string;
        rgCompactBuyOrders?: number[];
      };
    };

    if (!payload?.success) {
      console.log(`[Steam orderbook] ${name}: success=false (ордеров нет)`);
      return { buyOrderRub: null, buyOrders: [] };
    }

    // Если компактного списка нет — хотя бы максимум
    const compact = payload.data?.rgCompactBuyOrders;

    const book: SteamOrderBook = Array.isArray(compact)
      ? decodeBuyOrders(compact)
      : (() => {
          const rawOrder = payload.data?.amtMaxBuyOrder;
          const top = rawOrder != null ? Number(rawOrder) / 100 : null;
          return {
            buyOrderRub:
              top != null && Number.isFinite(top) && top > 0 ? top : null,
            buyOrders:
              top != null && Number.isFinite(top) && top > 0 ? [top] : [],
          };
        })();

    cache.set(cacheKey, { value: book, fetchedAt: Date.now() });

    return book;
  });
};
