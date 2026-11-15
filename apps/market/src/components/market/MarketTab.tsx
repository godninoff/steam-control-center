import { useCallback, useEffect, useState } from "react";

type MarketItem = {
  marketHashName: string;
  imageUrl: string | null;
  steamPriceUah: number | null;
  marketPriceRub: number;
  marketBuyOrderRub: number | null;
  sales7d: number | null;
};

const API = "http://localhost:4000";

const PAGE_SIZE = 50;

export function MarketTab() {
  // черновик — то, что сейчас в инпутах
  const [minPrice, setMinPrice] = useState("5000");
  const [maxPrice, setMaxPrice] = useState("10000");
  // применённый фильтр — то, по чему реально идёт запрос
  const [applied, setApplied] = useState({ min: "5000", max: "10000" });

  const [items, setItems] = useState<MarketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (from: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          appid: "730",
          minPrice: applied.min,
          maxPrice: applied.max,
          limit: String(PAGE_SIZE),
          offset: String(from),
        });

        const res = await fetch(`${API}/api/market-items?${params}`);
        const data = await res.json();

        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setOffset(from + data.items.length);
      } finally {
        setLoading(false);
      }
    },
    [applied],
  );

  useEffect(() => {
    load(0, false);
  }, [load]);

  function applyFilters() {
    setApplied({ min: minPrice, max: maxPrice });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <input
          type="number"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Цена от, ₽"
          className="rounded border px-2 py-1"
        />
        <input
          type="number"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="до, ₽"
          className="rounded border px-2 py-1"
        />
        <button
          type="button"
          onClick={applyFilters}
          className="rounded border px-3 py-1"
        >
          Применить
        </button>
        {loading && <span>Загрузка…</span>}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {items.map((item) => (
          <MarketCard key={item.marketHashName} item={item} />
        ))}
      </div>

      {items.length < total && (
        <button
          disabled={loading}
          onClick={() => load(offset, true)}
          className="mt-4 rounded border px-4 py-2"
        >
          Подгрузить ещё {PAGE_SIZE}
        </button>
      )}
      <div className="mt-2 text-sm opacity-60">
        Показано {items.length} из {total}
      </div>
    </div>
  );
}

function MarketCard({ item }: { item: MarketItem }) {
  const [steamData, setSteamData] = useState<{
    buyOrderRub: number | null;
    buyOrders: number[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSteamData = () => {
    setLoading(true);

    fetch(
      `${API}/api/steam-buy-order?name=${encodeURIComponent(item.marketHashName)}`,
    )
      .then((r) => r.json())
      .then((d) => setSteamData(d))
      .finally(() => setLoading(false));
  };

  const marketImage = `https://cdn.csgo.com/item/${encodeURI(item.marketHashName).replaceAll("%20", "+")}/150.png`;
  const finalImage = item.imageUrl ?? marketImage;

  // Разница: маркет минус ордер стима
  const profit =
    steamData?.buyOrderRub != null
      ? item.marketPriceRub - steamData.buyOrderRub
      : null;

  const profitPercent =
    profit != null && item.marketPriceRub > 0
      ? (profit / item.marketPriceRub) * 100
      : null;

  return (
    <div className="relative rounded-lg border p-3">
      {item.sales7d != null && (
        <div className="absolute top-2 right-2 text-xs">📈 {item.sales7d}</div>
      )}

      {finalImage && (
        <img
          src={finalImage}
          alt={item.marketHashName}
          loading="lazy"
          className="mb-2 h-32 w-full object-contain"
        />
      )}

      <div className="mb-1 truncate font-semibold">{item.marketHashName}</div>

      <div>Маркет: {item.marketPriceRub.toLocaleString("ru-RU")} ₽</div>

      {steamData == null ? (
        <button
          type="button"
          onClick={loadSteamData}
          disabled={loading}
          className="mt-1 rounded border px-2 py-1 text-sm"
        >
          {loading ? "Загрузка…" : "Ордер стима"}
        </button>
      ) : (
        <>
          {steamData.buyOrders.length > 0 ? (
            <div className="mt-1 text-sm">
              <div className="opacity-60">Ордера стима:</div>
              {steamData.buyOrders.map((order, index) => {
                const diff = item.marketPriceRub - order;
                const percent =
                  item.marketPriceRub > 0
                    ? (diff / item.marketPriceRub) * 100
                    : null;

                return (
                  <div key={index}>
                    {index + 1}.{" "}
                    <span
                      className="font-semibold"
                      style={{ color: diff > 0 ? "#22c550" : "#ef4444" }}
                    >
                      {order.toLocaleString("ru-RU")} ₽
                    </span>
                    {percent != null && (
                      <span className="ml-1 text-sm font-normal opacity-60">
                        ({diff > 0 ? "+" : ""}
                        {percent.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm opacity-60">Ордеров нет</div>
          )}

          {profit != null && (
            <div
              className="font-semibold"
              style={{ color: profit > 0 ? "#22c550" : "#ef4444" }}
            >
              Разница: {profit > 0 ? "+" : ""}
              {profit.toLocaleString("ru-RU", {
                minimumFractionDigits: 2,
              })}{" "}
              ₽
              {profitPercent != null && (
                <span className="ml-1 text-sm font-normal">
                  ({profitPercent > 0 ? "+" : ""}
                  {profitPercent.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-2 flex gap-3 text-sm">
        <button
          type="button"
          onClick={() =>
            window.open(
              `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item.marketHashName)}`,
              "_blank",
              "noopener,noreferrer",
            )
          }
          className="text-emerald-400 hover:underline"
        >
          Steam
        </button>
        <button
          type="button"
          onClick={() => {
            const firstWord = item.marketHashName.split(" ")[0];

            window.open(
              `https://market.csgo.com/en/${encodeURIComponent(firstWord)}/${encodeURIComponent(item.marketHashName)}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          className="text-emerald-400 hover:underline"
        >
          Маркет
        </button>
      </div>
    </div>
  );
}
