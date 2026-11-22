import { useEffect, useMemo, useState } from "react";
import { useLots, type Lot } from "../hooks/useLots";
import { getMarketHistory } from "../model/repository";
import type { MarketHistoryItem } from "../model/types";

const formatPrice = (price: number) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);

const StatusBadge = ({ position }: { position: number }) => {
  if (!position) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-700">
        Оффлайн
      </span>
    );
  }
  if (position === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Лот №1 — первым
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-400 ring-1 ring-sky-500/30">
      В очереди: #{position}
    </span>
  );
};

const PriceCell = ({
  mine,
  market,
}: {
  mine: number;
  market: number | null;
}) => {
  if (market == null) {
    return <span className="text-slate-600">—</span>;
  }
  const diff = mine - market;
  if (diff <= 0) {
    return (
      <span className="font-semibold tabular-nums text-emerald-400">
        {formatPrice(market)} ₽
      </span>
    );
  }
  return (
    <span className="tabular-nums text-slate-400">
      {formatPrice(market)} ₽
      <span className="ml-1.5 text-xs text-rose-400">
        +{formatPrice(diff)} ₽
      </span>
    </span>
  );
};

const pct = (a: number, b: number) => ((a / b - 1) * 100).toFixed(1);

const PurchaseCell = ({
  prices,
  mine,
  market,
}: {
  prices: number[] | undefined;
  mine: number;
  market: number | null;
}) => {
  if (!prices?.length) {
    return <span className="text-slate-600">—</span>;
  }
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  return (
    <span className="flex flex-col items-end">
      {prices.map((p, i) => (
        <span key={i} className="whitespace-nowrap tabular-nums text-slate-400">
          {formatPrice(p)} ₽
          <span
            className={`ml-2 text-xs font-semibold ${
              mine >= p ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {mine >= p ? "+" : ""}
            {pct(mine, p)}%
          </span>
          {market != null && (
            <span
              className={`ml-1.5 text-xs ${
                market >= p ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {market >= p ? "+" : ""}
              {pct(market, p)}%
            </span>
          )}
        </span>
      ))}
      <span className="mt-0.5 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-300">
        ср. {formatPrice(avg)} ₽
        <span
          className={`ml-2 ${mine >= avg ? "text-emerald-400" : "text-rose-400"}`}
        >
          {mine >= avg ? "+" : ""}
          {pct(mine, avg)}%
        </span>
        {market != null && (
          <span
            className={`ml-1.5 ${market >= avg ? "text-emerald-400" : "text-rose-400"}`}
          >
            {market >= avg ? "+" : ""}
            {pct(market, avg)}%
          </span>
        )}
      </span>
    </span>
  );
};

export function LotsTable() {
  const { lots, error, reload } = useLots(30000);
  const [history, setHistory] = useState<MarketHistoryItem[]>([]);
  const [rate, setRate] = useState(1);

  const IS_UAH = import.meta.env.VITE_UAH === "1";

  useEffect(() => {
    const steamId = localStorage.getItem("steamId");
    if (!steamId) return;
    getMarketHistory(steamId)
      .then(({ items }) => setHistory(items))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!IS_UAH) return;
    fetch("https://www.cbr-xml-daily.ru/daily_json.js")
      .then((r) => r.json())
      .then((data) => {
        const uah = data.Valute?.UAH;
        if (uah?.Value && uah.Nominal) {
          setRate(uah.Value / uah.Nominal);
        }
      })
      .catch(() => {});
  }, []);

  const dateTs = (d: string): number => {
    const m = d.match(/(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
    return m
      ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime()
      : 0;
  };

  const toRub = (item: MarketHistoryItem): number | null =>
    typeof item.received === "number" ? item.received * rate : null;

  const purchaseStats = useMemo(() => {
    const byName = new Map<string, MarketHistoryItem[]>();
    for (const item of history) {
      if (item.type !== "buy" || !item.marketHashName) continue;
      const arr = byName.get(item.marketHashName) ?? [];
      arr.push(item);
      byName.set(item.marketHashName, arr);
    }
    const map = new Map<string, number[]>();
    for (const [name, items] of byName) {
      const prices = items
        .sort((a, b) => dateTs(b.date) - dateTs(a.date))
        .slice(0, 3)
        .map(toRub)
        .filter((p): p is number => p !== null); // <-- вот это
      map.set(name, prices);
    }
    return map;
  }, [history, rate]);

  const totalValue = lots.reduce((sum, lot) => sum + lot.price, 0);
  const cheapest = lots.filter((l) => l.position === 1).length;
  const aboveMarket = lots.filter(
    (l) => l.market_price != null && l.price > l.market_price,
  ).length;

  async function setMarketPrice(lot: Lot) {
    if (!lot.market_price) return;
    const newPrice = Math.max(1, lot.market_price - 0.01);
    if (newPrice >= lot.price) return;
    await fetch(`/api/set-price/${lot.item_id}/${newPrice}`);
    reload();
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4 text-sm text-rose-300">
        Ошибка загрузки лотов market.csgo.com: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0b1524] px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Лотов
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{lots.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0b1524] px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            На сумму
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">
            {formatPrice(totalValue)} ₽
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0b1524] px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Первые в очереди
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{cheapest}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0b1524] px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Выше рынка
          </p>
          <p className="mt-1 text-2xl font-bold text-rose-400">{aboveMarket}</p>
        </div>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0b1524]">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="font-semibold text-white">Лоты market.csgo.com</h3>
            <p className="mt-1 text-sm text-slate-400">
              {lots.length
                ? "Зелёная маржа — продаёте дороже покупки в Steam"
                : "Лотов на продаже нет"}
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Обновить
          </button>
        </div>

        {lots.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="font-medium text-slate-300">Пусто</p>
            <p className="mt-2 text-sm text-slate-500">
              Выставьте предметы на продажу в боте или через API
            </p>
          </div>
        ) : (
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Предмет</th>
                <th className="px-5 py-4 text-right">Моя цена на маркете КС</th>
                <th className="px-5 py-4 text-right">
                  <div>Мин. цена маркета КС</div>
                  <div className="mt-1 normal-case text-[13px] font-normal text-slate-600">
                    в скобках: маржа моей цены к мин. цене
                  </div>
                </th>
                <th className="px-5 py-4 text-right">
                  <div>Покупка (Steam)</div>
                  <div className="mt-1 normal-case text-[13px] font-normal text-slate-600">
                    первая цифра: моя цена к покупке · вторая: мин. цена к
                    покупке
                  </div>
                </th>
                <th className="px-5 py-4 text-center">Позиция</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/80">
              {lots.map((lot) => (
                <tr key={lot.id} className="transition hover:bg-slate-800/40">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-linear-to-br from-slate-800 to-slate-900 ring-1 ring-slate-700/60">
                        <img
                          src={lot.image}
                          alt={lot.name}
                          loading="lazy"
                          className="h-9 w-auto"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </div>

                      <a
                        href={lot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-slate-200 transition hover:text-emerald-400"
                      >
                        {lot.name}
                      </a>
                    </div>
                  </td>

                  <td className="px-5 py-4 text-right text-base font-bold tabular-nums text-white">
                    {formatPrice(lot.price)} ₽
                  </td>
                  <td className="px-5 py-4 text-right">
                    <PriceCell
                      mine={lot.price}
                      market={lot.market_price ?? null}
                    />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <PurchaseCell
                      prices={purchaseStats.get(lot.name)}
                      mine={lot.price}
                      market={lot.market_price ?? null}
                    />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <StatusBadge position={lot.position} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setMarketPrice(lot)}
                      disabled={
                        !lot.market_price || lot.price <= lot.market_price
                      }
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      Подогнать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
