import { useLots, type Lot } from "../hooks/useLots";

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

export function LotsTable() {
  const { lots, error, reload } = useLots(30000);

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
                ? "Зелёная цена рынка — ваш лот самый дешёвый"
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
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Предмет</th>
                <th className="px-5 py-4 text-right">Моя цена</th>
                <th className="px-5 py-4 text-right">Цена рынка</th>
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
