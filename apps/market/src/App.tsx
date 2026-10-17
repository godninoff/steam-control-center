import { useEffect, useState } from "react";
import {
  getBuyOrders,
  getMarketHistory,
  getSellListings,
  scanCatalog,
  getScannerJob,
} from "./model/repository";
import type { ScannerResult } from "./model/repository";
import type {
  BuyOrder,
  MarketHistoryItem,
  MarketSellListing,
} from "./model/types";
import { Table } from "./components/Table";
import { historyColumns } from "./helpers/table-config";

import type { ScannerSettings } from "./model/scanner-types";
import { ScannerFilters } from "./components/scanner/ScannerFilters";

type Tab = "history" | "sell" | "buy" | "scanner";

const tabs: { id: Tab; label: string }[] = [
  { id: "history", label: "История" },
  { id: "sell", label: "Лоты на продажу" },
  { id: "buy", label: "Лоты на покупку" },
  { id: "scanner", label: "Сканер" },
];

const formatPrice = (price: number) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);

const App = () => {
  const [history, setHistory] = useState<MarketHistoryItem[]>([]);
  const [sellListings, setSellListings] = useState<MarketSellListing[]>([]);
  const [buyOrders, setBuyOrders] = useState<BuyOrder[]>([]);
  const [scannerSettings, setScannerSettings] =
    useState<ScannerSettings | null>(null);
  const [scannerResult, setScannerResult] = useState<ScannerResult | null>(
    null,
  );
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nextStart, setNextStart] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [q, setQ] = useState("");

  const steamId = localStorage.getItem("steamId");

  useEffect(() => {
    if (!steamId) {
      setLoading(false);
      return;
    }

    Promise.all([
      getMarketHistory(steamId)
        .then(({ items, nextStart }) => {
          setHistory(items);
          setNextStart(nextStart);
        })
        .catch((error) =>
          console.error("Failed to load market history:", error),
        ),
      getSellListings(steamId)
        .then(setSellListings)
        .catch((error) =>
          console.error("Failed to load sell listings:", error),
        ),
      getBuyOrders(steamId)
        .then(setBuyOrders)
        .catch((error) => console.error("Failed to load buy orders:", error)),
    ]).finally(() => setLoading(false));
  }, [steamId]);

  const search = q.trim().toLocaleLowerCase("ru");

  const filteredHistory = history.filter((item) =>
    item.item.toLocaleLowerCase("ru").includes(search),
  );

  const filteredSellListings = sellListings.filter((item) =>
    item.item.toLocaleLowerCase("ru").includes(search),
  );

  const filteredBuyOrders = buyOrders.filter((item) =>
    item.item.toLocaleLowerCase("ru").includes(search),
  );

  const loadMoreHistory = async () => {
    if (!steamId || nextStart === null || loadingMore) return;

    setLoadingMore(true);

    try {
      const page = await getMarketHistory(steamId, nextStart);
      setHistory((prev) => [...prev, ...page.items]);
      setNextStart(page.nextStart);
    } catch (error) {
      console.error("Failed to load more market history:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const runScanner = async () => {
    if (!steamId || !scannerSettings || scannerLoading) return;

    setScannerLoading(true);
    setScannerError("");
    setScannerResult(null);

    try {
      // Запускаем задачу. API сразу возвращает jobId и начальный статус.
      let job = await scanCatalog(steamId, scannerSettings, 0, 10);
      setScannerResult(job);

      // Получаем обновлённое состояние, пока задача не завершится.
      while (job.status === "queued" || job.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        job = await getScannerJob(job.id);
        setScannerResult(job);
      }

      if (job.status === "failed") {
        throw new Error(job.error ?? "Сканирование завершилось с ошибкой");
      }
    } catch (error) {
      setScannerError(
        error instanceof Error
          ? error.message
          : "Не удалось запустить сканирование",
      );
    } finally {
      setScannerLoading(false);
    }
  };

  if (!steamId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111f]">
        <a
          href="http://localhost:4000/auth/steam"
          className="rounded-lg bg-[#1b2838] px-6 py-3 font-medium text-white transition hover:bg-[#2a475e]"
        >
          Войти через Steam
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pt-12 text-slate-500">Загрузка торговой площадки…</div>
    );
  }

  const activeCount =
    activeTab === "scanner"
      ? null
      : activeTab === "history"
        ? filteredHistory.length
        : activeTab === "sell"
          ? filteredSellListings.length
          : filteredBuyOrders.length;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Торговая площадка</h1>
        <p className="mt-1 text-sm text-slate-400">
          История операций, активные лоты и заявки Steam
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-xs opacity-70">
              {tab.id === "history"
                ? history.length
                : tab.id === "sell"
                  ? sellListings.length
                  : tab.id === "buy"
                    ? buyOrders.length
                    : ""}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {tabs.find((tab) => tab.id === activeTab)?.label}
            </h2>
            {activeCount !== null && (
              <p className="mt-1 text-sm text-slate-500">
                Найдено: {activeCount}
              </p>
            )}
          </div>

          {activeTab === "history" && nextStart !== null && (
            <button
              type="button"
              onClick={loadMoreHistory}
              disabled={loadingMore}
              className="rounded-lg bg-[#1b2838] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a475e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "Загрузка…" : "Загрузить ещё"}
            </button>
          )}
        </div>

        <div className="relative">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Поиск предмета…"
            className="w-64 max-w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-9 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {activeTab === "scanner" && (
        <div className="space-y-4">
          <ScannerFilters
            apiBaseUrl="http://localhost:4000/api"
            onApply={setScannerSettings}
          />

          <button
            type="button"
            onClick={runScanner}
            disabled={!scannerSettings || scannerLoading}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scannerLoading ? "Сканирование…" : "Запустить сканирование"}
          </button>

          {scannerError && (
            <p role="alert" className="text-sm text-red-400">
              {scannerError}
            </p>
          )}

          {scannerResult && (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0b1524] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">
                    Результат сканирования
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Статус: {scannerResult.status === "queued" && "В очереди"}
                    {scannerResult.status === "running" && "Сканирование"}
                    {scannerResult.status === "completed" && "Завершено"}
                    {scannerResult.status === "failed" && "Ошибка"}
                  </p>
                </div>

                <div className="text-sm text-slate-400">
                  Найдено кандидатов:{" "}
                  <span className="font-semibold text-emerald-400">
                    {scannerResult.candidates.length}
                  </span>
                </div>
              </div>

              <div className="text-sm text-slate-400">
                Обработано: {scannerResult.scanned}
                {scannerResult.totalCount !== null &&
                  ` из ${scannerResult.totalCount}`}
              </div>

              {scannerResult.currentItem && (
                <p className="truncate text-sm text-slate-500">
                  Сейчас проверяется: {scannerResult.currentItem}
                </p>
              )}

              {scannerResult.totalCount !== null &&
                scannerResult.totalCount > 0 && (
                  <div className="h-2 overflow-hidden rounded bg-slate-800">
                    <div
                      className="h-full rounded bg-emerald-500 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (scannerResult.scanned / scannerResult.totalCount) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                )}

              {scannerResult.error && (
                <p className="text-sm text-red-400">{scannerResult.error}</p>
              )}
            </div>
          )}

          {scannerResult && scannerResult.candidates.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0b1524]">
              <div className="border-b border-slate-800 px-5 py-4">
                <h3 className="font-semibold text-white">Найденные предметы</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Всего: {scannerResult.candidates.length}
                </p>
              </div>

              <table className="w-full min-w-150 text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Предмет</th>
                    <th className="px-5 py-4 text-right">Цена покупки</th>
                    <th className="px-5 py-4 text-right">Доходность</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {scannerResult.candidates.map((candidate) => (
                    <tr
                      key={`${candidate.appId}-${candidate.marketHashName}`}
                      onClick={() =>
                        window.open(
                          candidate.marketUrl,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      title="Открыть предмет на торговой площадке Steam"
                      className="cursor-pointer transition hover:bg-slate-800/60"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {candidate.imageUrl ? (
                            <img
                              src={candidate.imageUrl}
                              alt=""
                              loading="lazy"
                              className="h-12 w-16 shrink-0 rounded object-contain"
                            />
                          ) : (
                            <div className="h-12 w-16 shrink-0 rounded bg-slate-800" />
                          )}

                          <div className="min-w-0">
                            <p className="font-medium text-slate-200">
                              {candidate.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {candidate.marketHashName}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-emerald-400">
                        {formatPrice(candidate.buyPrice)} {candidate.currency}
                      </td>

                      <td className="px-5 py-4 text-right text-slate-300">
                        {candidate.analysis.profitPercent != null
                          ? `${candidate.analysis.profitPercent.toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scannerResult &&
            scannerResult.status === "completed" &&
            scannerResult.candidates.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-[#0b1524] px-5 py-10 text-center">
                <p className="font-medium text-slate-300">
                  Подходящих предметов не найдено
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Попробуй изменить фильтры сканера.
                </p>
              </div>
            )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-4">
          <Table
            columns={historyColumns}
            rows={filteredHistory}
            onRowClick={(item) => {
              window.open(
                `https://steamcommunity.com/market/listings/${item.marketAppId}/${encodeURIComponent(item.marketHashName)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          />
        </div>
      )}

      {activeTab === "sell" && (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0b1524]">
          <table className="w-full min-w-140 text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Предмет</th>
                <th className="px-5 py-4">Игра / приложение</th>
                <th className="px-5 py-4 text-right">Цена</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredSellListings.map((item) => (
                <tr
                  key={item.id}
                  onClick={() =>
                    item.marketHashName &&
                    window.open(
                      `https://steamcommunity.com/market/listings/${item.marketAppId}/${encodeURIComponent(item.marketHashName)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="cursor-pointer transition hover:bg-slate-800/50"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-10 w-14 rounded object-contain"
                        />
                      ) : (
                        <div className="h-10 w-14 rounded bg-slate-800" />
                      )}
                      <span className="font-medium text-slate-200">
                        {item.item}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {item.game && (
                      <img
                        src={item.game}
                        alt={item.item}
                        className="h-8 w-auto rounded"
                      />
                    )}
                  </td>

                  <td className="px-5 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-base font-bold tabular-nums text-slate-400 ">
                        {formatPrice(item.price)}
                      </span>
                      <span className="text-xs tabular-nums text-emerald-400">
                        {formatPrice(item.sellerPrice)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredSellListings.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {q
                ? "По этому запросу ничего не найдено"
                : "Активных лотов на продажу нет"}
            </div>
          )}
        </div>
      )}

      {activeTab === "buy" && (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0b1524]">
          <table className="w-full min-w-150 text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Предмет</th>
                <th className="px-5 py-4">Игра / приложение</th>
                <th className="px-5 py-4 text-right">Цена за шт.</th>
                <th className="px-5 py-4 text-right">Количество</th>
                <th className="px-5 py-4 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredBuyOrders.map((order) => (
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
                  <td className="px-5 py-4 text-right text-slate-300">
                    {order.quantity}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-emerald-400">
                    {formatPrice(order.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredBuyOrders.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {q
                ? "По этому запросу ничего не найдено"
                : "Активных заявок на покупку нет"}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default App;
