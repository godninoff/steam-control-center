import { useEffect, useState } from "react";
import type { ScannerSettings } from "../../model/scanner-types";
import { DEFAULT_SCANNER_SETTINGS } from "../../model/scanner-types";

interface Props {
  apiBaseUrl: string;
  onApply: (settings: ScannerSettings) => void;
}

export const ScannerFilters = ({ apiBaseUrl, onApply }: Props) => {
  const [settings, setSettings] = useState<ScannerSettings>(
    DEFAULT_SCANNER_SETTINGS,
  );
  const [saving, setSaving] = useState(false);
  const [unlimitedPrice, setUnlimitedPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`${apiBaseUrl}/scanner/settings`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Не удалось загрузить настройки");
        }

        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        setSettings(data.settings);
        setUnlimitedPrice(data.settings.maxBuyPrice === null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const update = <K extends keyof ScannerSettings>(
    key: K,
    value: ScannerSettings[K],
  ) => {
    setSettings((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const applySettings = async () => {
    setSaving(true);
    setError("");

    const payload: ScannerSettings = {
      ...settings,
      maxBuyPrice: unlimitedPrice ? null : settings.maxBuyPrice,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/scanner/settings/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Некорректные настройки");
      }

      setSettings(data.settings);
      onApply(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Загрузка настроек…</p>;
  }

  return (
    <section className="w-full max-w-4xl space-y-6 rounded-xl border border-slate-800 bg-[#0b1524] p-5 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Настройки сканера</h2>
        <p className="mt-1 text-sm text-slate-400">
          Настрой условия поиска прибыльных предметов.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
        {/* Максимальная цена */}
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="scanner-max-price"
            className="text-sm font-medium text-slate-300"
          >
            Максимальная цена покупки, ₴
          </label>

          <input
            id="scanner-max-price"
            type="number"
            min="0.01"
            step="0.01"
            value={settings.maxBuyPrice ?? ""}
            disabled={unlimitedPrice}
            onChange={(event) =>
              update(
                "maxBuyPrice",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={unlimitedPrice}
              onChange={(event) => setUnlimitedPrice(event.target.checked)}
              className="accent-emerald-500"
            />
            Без ограничения цены
          </label>
        </div>

        {/* Доходность */}
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="scanner-min-profit"
            className="text-sm font-medium text-slate-300"
          >
            Минимальная доходность после комиссий, %
          </label>

          <input
            id="scanner-min-profit"
            type="number"
            min="0"
            max="1000"
            step="0.1"
            value={settings.minProfitPercent}
            onChange={(event) =>
              update("minProfitPercent", Number(event.target.value))
            }
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        {/* Количество продаж */}
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="scanner-min-sales"
            className="text-sm font-medium text-slate-300"
          >
            Минимум продаж за период
          </label>

          <input
            id="scanner-min-sales"
            type="number"
            min="0"
            step="1"
            value={settings.minSalesCount}
            onChange={(event) =>
              update("minSalesCount", Number(event.target.value))
            }
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        {/* Период истории */}
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="scanner-history-days"
            className="text-sm font-medium text-slate-300"
          >
            Период истории
          </label>

          <select
            id="scanner-history-days"
            value={settings.historyDays}
            onChange={(event) =>
              update("historyDays", Number(event.target.value))
            }
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
          >
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
        </div>

        {/* Ориентир цены */}
        <div className="flex min-w-0 flex-col gap-2 md:col-span-2">
          <label
            htmlFor="scanner-price-basis"
            className="text-sm font-medium text-slate-300"
          >
            Ориентир цены продажи
          </label>

          <select
            id="scanner-price-basis"
            value={settings.priceBasis}
            onChange={(event) =>
              update(
                "priceBasis",
                event.target.value as ScannerSettings["priceBasis"],
              )
            }
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
          >
            <option value="median">Медианная цена за период</option>
            <option value="current">Текущая цена продажи</option>
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex justify-end border-t border-slate-800 pt-4">
        <button
          type="button"
          onClick={applySettings}
          disabled={saving}
          className="w-full rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Проверка…" : "Применить настройки"}
        </button>
      </div>
    </section>
  );
};
