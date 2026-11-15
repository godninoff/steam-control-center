import { Router } from "express";

const router = Router();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function getSteamPrice(
  hashName: string,
  currency: string,
): Promise<string | null> {
  const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${currency}&market_hash_name=${encodeURIComponent(hashName)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.success ? (data.lowest_price ?? null) : null;
}

function netOfFee(lowest: string): string | null {
  const m = lowest
    .replace(/\u00A0/g, "")
    .replace(",", ".")
    .match(/([\d.]+)/);
  if (!m) return null;
  return `${(parseFloat(m[1]) / 1.15).toFixed(2)} ₽`;
}

// ——— стакан ордеров: новый name-based роут, без item_nameid
async function getOrderBook(hashName: string, currency: string) {
  const url = new URL("https://steamcommunity.com/market/orderbook");
  url.search = new URLSearchParams({
    q: "Load",
    qp: JSON.stringify([730, hashName]),
    cc: "RU",
    l: "russian",
    currency: "5",
  }).toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(hashName)}`,
      "x-valve-request-type": "queryAction",
    },
  });

  if (res.status === 429) throw new Error("лимит стима (429)");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = await res.text();
  if (raw.trimStart().startsWith("<"))
    throw new Error("пришел HTML вместо JSON");

  const outer = JSON.parse(raw);
  // стим шлет ответ либо как {success, data}, либо как {data: {success, data}}
  const payload = "success" in outer ? outer : outer.data;
  if (!payload?.success)
    throw new Error("success=false — проверь имя предмета");

  const d = payload.data;

  // rgCompactBuyOrders/rgCompactSellOrders — плоский массив [цена_в_копейках, кол-во, ...]
  const toRows = (flat: unknown) => {
    if (!Array.isArray(flat)) return [];
    const rows: { price: string; quantity: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      rows.push({ price: (flat[i] / 100).toFixed(2), quantity: flat[i + 1] });
    }
    return rows.slice(0, 50);
  };

  return {
    buys: toRows(d.rgCompactBuyOrders),
    sells: toRows(d.rgCompactSellOrders),
    top: {
      bestBuy:
        d.amtMaxBuyOrder != null ? (d.amtMaxBuyOrder / 100).toFixed(2) : null,
      bestSell:
        d.amtMinSellOrder != null ? (d.amtMinSellOrder / 100).toFixed(2) : null,
      totalBuyOrders: d.cBuyOrders ?? null,
      totalSellOrders: d.cSellOrders ?? null,
    },
  };
}

router.get("/cases/prices", async (req, res) => {
  const names = String(req.query.names ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const withBook = req.query.book === "1";
  const currency = req.query.currency === "18" ? "18" : "5";

  const items = await Promise.all(
    names.map(async (hashName) => {
      const lowest = await getSteamPrice(hashName, currency).catch(() => null);

      let book: { buys: any[]; sells: any[] } | null = null;
      let bookError: string | null = null;

      if (withBook) {
        try {
          book = await getOrderBook(hashName, currency);
        } catch (e: any) {
          bookError = `ошибка: ${e?.message ?? e}`;
        }
      }

      return {
        hashName,
        steam: lowest,
        steamNet: lowest ? netOfFee(lowest) : null,
        book,
        bookError,
      };
    }),
  );

  res.json({ items });
});

export default router;
