import { Router } from "express";
import "dotenv/config";

const router = Router();

const KEY = process.env.MARKET_API_KEY || "";
const BASE = "https://market.csgo.com/api";

const cache = new Map<string, { data: unknown; expires: number }>();
const TTL = { offers: 15000, price: 30000, search: 30000 };

const queue: {
  url: string;
  resolve: (r: Response) => void;
  reject: (e: Error) => void;
}[] = [];
let last = 0;

function throttledFetch(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject });
    pump();
  });
}

function pump() {
  if (!queue.length) return;
  const wait = Math.max(0, last + 210 - Date.now());
  setTimeout(async () => {
    last = Date.now();
    const job = queue.shift();
    if (!job) return;
    try {
      job.resolve(await fetch(job.url));
    } catch (e) {
      job.reject(e as Error);
    }
    pump();
  }, wait);
}

async function cachedGet(url: string, ttl: number) {
  const hit = cache.get(url);
  if (hit && Date.now() < hit.expires) return hit.data;
  const res = await throttledFetch(url);
  const data = await res.json();
  cache.set(url, { data, expires: Date.now() + ttl });
  return data;
}

const normalizeName = (name: string): string =>
  String(name).trim().replace(/\s+/g, " ").toLowerCase();

const getWeaponName = (hash: string): string => {
  let name = String(hash)
    .replace(/^StatTrak™\s+/i, "")
    .replace(/^Souvenir\s+/i, "");
  if (name.startsWith("★ ")) name = name.slice(2);
  return name.split(" | ")[0].trim();
};

const heToCategory = (t: string | undefined): string | undefined => {
  const v = String(t ?? "").toLowerCase();
  // порядок важен: "снайперская винтовка" содержит "винтовка",
  // "пистолет-пулемёт" содержит "пистолет"
  if (v.includes("снайперская") || v.includes("sniper")) return "Sniper Rifle";
  if (v.includes("винтовка") || v.includes("rifle")) return "Rifle";
  if (v.includes("пулемёт") || v.includes("machinegun")) return "Machinegun";
  if (v.includes("пистолет") || v.includes("pistol")) return "Pistol";
  if (v.includes("нож") || v.includes("knife")) return "Knife";
  if (v.includes("перчатк") || v.includes("gloves")) return "Gloves";
  if (v.includes("дробовик") || v.includes("shotgun")) return "Shotgun";
  if (v === "smg" || v.includes("пистолет-пулемет")) return "SMG";
  if (v.includes("наклейк") || v.includes("sticker")) return "Stickers";
  if (
    v.includes("кейс") ||
    v.includes("контейнер") ||
    v.includes("case") ||
    v.includes("container")
  )
    return "Container";
  return undefined;
};

const WEAPON_CATEGORIES = [
  "Rifle",
  "Sniper Rifle",
  "Pistol",
  "SMG",
  "Machinegun",
  "Shotgun",
  "Knife",
  "Gloves",
];

router.get("/lots", async (_req, res) => {
  try {
    const [data, pricesData] = await Promise.all([
      cachedGet(`${BASE}/GetMySellOffers/?key=${KEY}`, TTL.offers),
      cachedGet("https://market.csgo.com/api/v2/prices/RUB.json", TTL.price),
    ]);

    const offers = data?.offers ?? data?.items;
    if (!Array.isArray(offers)) {
      return res.status(502).json({
        ok: false,
        error: data?.error ?? "Маркет не вернул список лотов",
        raw: data,
      });
    }

    // Прайс-лист
    const priceList: any[] = Array.isArray(pricesData)
      ? pricesData
      : Array.isArray(pricesData?.items)
        ? pricesData.items
        : [];

    const priceMap = new Map<string, number>();
    for (const p of priceList) {
      const rawPrice = p?.price;
      if (p?.market_hash_name || p?.name) {
        const name = normalizeName(p.market_hash_name ?? p.name);
        const price =
          typeof rawPrice === "string" ? Number(rawPrice) : rawPrice;
        if (name && typeof price === "number" && price > 0) {
          priceMap.set(name, price);
        }
      }
    }

    // Собираем уникальные market_hash_name для поиска
    const uniqueNames = [
      ...new Set(
        offers
          .map((i: any) => String(i.i_market_hash_name ?? i.i_name ?? ""))
          .filter(Boolean),
      ),
    ];

    const positionsByName = new Map<string, Map<number, number>>();

    type Offer = { id: number; price: number };

    const offersByName = new Map<string, Offer[]>();

    await Promise.all(
      uniqueNames.map(async (name) => {
        try {
          const url = `https://market.csgo.com/api/v2/search-item-by-hash-name?key=${KEY}&hash_name=${encodeURIComponent(name)}`;
          const data: any = await cachedGet(url, TTL.search);
          const rows: any[] = Array.isArray(data?.data) ? data.data : [];
          const offers: Offer[] = rows
            .map((o) => ({ id: Number(o.id ?? 0), price: Number(o.price) }))
            .filter((o) => o.price > 0);
          if (offers.length) offersByName.set(name, offers);
        } catch {
          // позиция останется 0
        }
      }),
    );

    const positionFor = (
      offers: Offer[] | undefined,
      myPriceKop: number,
      myId: number,
    ) => {
      if (!offers) return 0;
      let cheaper = 0;
      let same = 0;
      for (const o of offers) {
        if (o.price < myPriceKop) cheaper++;
        else if (o.price === myPriceKop && o.id < myId) same++;
      }
      return cheaper + same + 1;
    };

    const lots = offers
      .filter((i: any) => Number(i.ui_status) === 1)
      .map((i: any) => {
        const name = String(i.i_market_hash_name ?? i.i_name ?? "");
        const category = heToCategory(i.he_name);
        const weaponName = getWeaponName(name);
        const image = `https://cdn.csgo.com/item/${name.replace(/ /g, "+")}/150.png`;

        let url: string;
        if (category && WEAPON_CATEGORIES.includes(category)) {
          url = `https://market.csgo.com/en/${category}/${encodeURIComponent(weaponName)}/${encodeURIComponent(name)}?id=${i.ui_id}`;
        } else if (category) {
          url = `https://market.csgo.com/en/${category}/${encodeURIComponent(name)}?id=${i.ui_id}`;
        } else {
          url = `https://market.csgo.com/en/${encodeURIComponent(name)}?id=${i.ui_id}`;
        }

        const myPriceKop = Math.round(
          (typeof i.ui_price === "string" ? Number(i.ui_price) : i.ui_price) *
            100,
        );

        const position = positionFor(
          offersByName.get(name),
          myPriceKop,
          Number(i.ui_id),
        );

        return {
          id: i.ui_id,
          item_id: i.ui_id,
          classid_instanceid: `${i.i_classid}_${i.i_instanceid}`,
          name,
          price:
            typeof i.ui_price === "string" ? Number(i.ui_price) : i.ui_price,
          position, // 0 если не удалось посчитать
          url,
          market_price: priceMap.get(normalizeName(name)) ?? null,
          image,
        };
      });

    res.json({ ok: true, lots });
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message });
  }
});

router.get("/market-price/:classid_instanceid", async (req, res) => {
  try {
    const data: any = await cachedGet(
      `${BASE}/BestSellOffer/${req.params.classid_instanceid}/?key=${KEY}`,
      TTL.price,
    );
    res.json({ ok: true, best_offer: data.best_offer / 100 });
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message });
  }
});

router.get("/offers/:name", async (req, res) => {
  try {
    const data: any = await cachedGet(
      `${BASE}/SearchItemByName/${encodeURIComponent(req.params.name)}/?key=${KEY}`,
      TTL.search,
    );
    const offers = data.offers.map((o: any) => ({
      price: o.price / 100,
      count: o.count,
      mine: o.my_count > 0,
    }));
    res.json({ ok: true, offers });
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message });
  }
});

router.get("/set-price/:item_id/:price", async (req, res) => {
  try {
    const price = Math.round(Number(req.params.price) * 100);
    const resMarket = await throttledFetch(
      `${BASE}/SetPrice/${req.params.item_id}/${price}/?key=${KEY}`,
    );
    res.json(await resMarket.json());
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message });
  }
});

// Пинг раз в 3 минуты — без него маркет считает бота оффлайн
// и отдаёт position = 0 у всех лотов.
setInterval(() => {
  fetch(`${BASE}/v2/ping-new?key=${KEY}`).catch(() => {});
}, 180000);

// Первый пинг сразу при старте — не ждём 3 минуты до «онлайна».
fetch(`${BASE}/v2/ping-new?key=${KEY}`).catch(() => {});

export default router;
