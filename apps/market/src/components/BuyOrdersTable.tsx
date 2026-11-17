import { useEffect, useState } from "react";
import type { BuyOrder } from "../model/types";

const API = "http://localhost:4000";

type MarketInfo = {
  marketPriceRub: number | null;
  marketBuyOrderRub: number | null;
};

type SteamInfo = {
  steamPriceRub: number | null;
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);

export function BuyOrdersTable({ orders }: { orders: BuyOrder[] }) {
  const [rate, setRate] = useState<number | null>(() => {
    const saved = parseFloat(localStorage.getItem("marketRate") ?? "");
    return Number.isFinite(saved) ? saved : null;
  });
  const [rateError, setRateError] = useState(false);
  const [marketData, setMarketData] = useState<Record<string, MarketInfo>>({});
  const [steamData, setSteamData] = useState<Record<string, SteamInfo>>({});
  const [marketLoading, setMarketLoading] = useState(false);

  useEffect(() => {
    if (rate !== null) return;

    fetch(`${API}/api/steam-rate`)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((data) => {
        const value =
          typeof data.marketRate === "number" && data.marketRate > 0
            ? data.marketRate
            : typeof data.steamRate === "number" && data.steamRate > 0
              ? data.steamRate
              : typeof data.rate === "number" && data.rate > 0
                ? data.rate
                : null;

        if (value != null) {
          setRate(value);
          localStorage.setItem("marketRate", String(value));
        } else {
          setRateError(true);
        }
      })
      .catch(() => setRateError(true));
  }, []);

  const loadMarket = () => {
    if (orders.length === 0 || marketLoading) return;
    setMarketLoading(true);

    const names = orders.map((o) => o.marketHashName);

    // Маркет: один запрос на все ордера
    const marketFetch = fetch(`${API}/api/market-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    })
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, MarketInfo> = {};
        for (const item of data.items ?? []) {
          map[item.marketHashName] = {
            marketPriceRub: item.marketPriceRub,
            marketBuyOrderRub: item.marketBuyOrderRub,
          };
        }
        setMarketData(map);
      })
      .catch(() => {});

    // Стим: цена = минимальный лот из автобая, по запросу на предмет
    const steamFetch = Promise.all(
      orders.map((o) =>
        fetch(
          `${API}/api/steam-buy-order?name=${encodeURIComponent(o.marketHashName)}`,
        )
          .then((r) => r.json())
          .then((d) => {
            const buyOrders: number[] = d.buyOrders ?? [];
            const top = buyOrders[0] ?? d.buyOrderRub ?? null;
            return [o.marketHashName, top] as const;
          })
          .catch(() => [o.marketHashName, null] as const),
      ),
    ).then((results) => {
      const map: Record<string, SteamInfo> = {};
      for (const [name, price] of results) {
        map[name] = { steamPriceRub: price };
      }
      setSteamData(map);
    });

    Promise.all([marketFetch, steamFetch]).finally(() =>
      setMarketLoading(false),
    );
  };

  const hasData =
    Object.keys(steamData).length > 0 || Object.keys(marketData).length > 0;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0b1524]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <h3 className="font-semibold text-white">Активные заявки на покупку</h3>
        <button
          type="button"
          onClick={loadMarket}
          disabled={marketLoading || orders.length === 0}
          className="rounded-lg bg-[#1b2838] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a475e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {marketLoading
            ? "Загрузка…"
            : hasData
              ? "Освежить цены"
              : "Проверить цены"}
        </button>
      </div>

      <table className="w-full min-w-170 text-left text-sm">
        <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-5 py-4">Предмет</th>
            <th className="px-5 py-4">Игра / приложение</th>
            <th className="px-5 py-4 text-right">Цена за шт.</th>
            <th className="px-5 py-4 text-right">Сумма</th>
            {hasData && (
              <>
                <th className="px-5 py-4 text-right">Стим</th>
                <th className="px-5 py-4 text-right">Маркет</th>
                <th className="px-5 py-4 text-right">Разница (Стим)</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {orders.map((order) => {
            const orderRub = rate != null ? order.price * rate : null;
            const steam = steamData[order.marketHashName];
            const info = marketData[order.marketHashName];

            // разница по Стиму: цена Стима минус мой ордер
            const diffRub =
              steam?.steamPriceRub != null && orderRub != null
                ? steam.steamPriceRub - orderRub
                : null;
            const diffUah =
              rate != null && diffRub != null ? diffRub / rate : null;
            const diffPercent =
              diffRub != null && orderRub != null && orderRub > 0
                ? (diffRub / orderRub) * 100
                : null;

            return (
              <tr key={order.id} className="transition hover:bg-slate-800/50">
                <td className="px-5 py-4">
                  <a
                    href={`https://steamcommunity.com/market/listings/${order.marketAppId}/${encodeURIComponent(order.marketHashName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-200 transition hover:text-emerald-400"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {order.item}
                  </a>
                </td>
                <td className="px-5 py-4">
                  {order.game && (
                    <a
                      href={`https://store.steampowered.com/app/${order.marketAppId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <img
                        src={order.game}
                        alt=""
                        className="h-8 w-auto rounded"
                      />
                    </a>
                  )}
                </td>
                <td className="px-5 py-4 text-right text-slate-300">
                  {formatPrice(order.price)}
                </td>

                {/* Сумма: гривны сверху, рубли снизу */}
                <td className="px-5 py-4 text-right">
                  <div className="font-semibold tabular-nums text-emerald-400">
                    {formatPrice(order.total)} ₴
                  </div>
                  <div className="text-xs tabular-nums text-slate-400">
                    {orderRub != null
                      ? `${formatPrice(order.total * rate!)} ₽`
                      : "—"}
                  </div>
                </td>

                {hasData && (
                  <>
                    {/* Стим: гривны сверху, рубли снизу */}
                    <td className="px-5 py-4 text-right">
                      <div className="tabular-nums text-slate-300">
                        {steam?.steamPriceRub != null && rate != null
                          ? `${formatPrice(steam.steamPriceRub / rate)} ₴`
                          : "—"}
                      </div>
                      <div className="text-xs tabular-nums text-slate-500">
                        {steam?.steamPriceRub != null
                          ? `${formatPrice(steam.steamPriceRub)} ₽`
                          : "—"}
                      </div>
                    </td>

                    {/* Маркет: гривны сверху, рубли снизу */}
                    <td className="px-5 py-4 text-right">
                      <div className="tabular-nums text-slate-300">
                        {info?.marketPriceRub != null && rate != null
                          ? `${formatPrice(info.marketPriceRub / rate)} ₴`
                          : "—"}
                      </div>
                      <div className="text-xs tabular-nums text-slate-500">
                        {info?.marketPriceRub != null
                          ? `${formatPrice(info.marketPriceRub)} ₽`
                          : "—"}
                      </div>
                    </td>

                    {/* Разница по Стиму: гривны сверху, рубли и % снизу */}
                    <td
                      className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums"
                      style={{
                        color:
                          diffRub == null
                            ? undefined
                            : diffRub > 0
                              ? "#22c550"
                              : "#ef4444",
                      }}
                    >
                      {diffRub != null && diffUah != null ? (
                        <>
                          <div>
                            {diffUah > 0 ? "+" : ""}
                            {formatPrice(diffUah)} ₴
                          </div>
                          <div className="text-xs font-normal text-slate-500">
                            {diffRub > 0 ? "+" : ""}
                            {formatPrice(diffRub)} ₽ ·{" "}
                            {diffPercent! > 0 ? "+" : ""}
                            {diffPercent!.toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {orders.length === 0 && (
        <div className="px-5 py-12 text-center text-sm text-slate-500">
          Активных заявок на покупку нет
        </div>
      )}

      {rateError && (
        <div className="border-t border-slate-800 px-5 py-3 text-sm text-amber-400">
          Курс не загрузился — рублёвые суммы и разница скрыты. Обнови вкладку
          позже.
        </div>
      )}
    </div>
  );
}
