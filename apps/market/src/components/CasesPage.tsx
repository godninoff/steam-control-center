import { Fragment, useEffect, useState } from "react";
import { addCase, loadCases, removeCase, type CaseEntry } from "../lib/cases";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type OrderRow = { price: string; quantity: number };

type PriceRow = {
  hashName: string;
  steam: string | null;
  book: { buys: OrderRow[]; sells: OrderRow[] } | null;
};

function pct(net: number, buyPrice: number): number {
  return ((net - buyPrice) / buyPrice) * 100;
}

function fmtPct(v: number): { text: string; color: string } {
  const rounded = v >= 0 ? Math.floor(v * 10) / 10 : Math.ceil(v * 10) / 10;
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`,
    color: rounded >= 0 ? "#2ecc71" : "#e74c3c",
  };
}

function parsePrice(s: string | null): number | null {
  if (!s) return null;
  const m = s
    .replace(/\u00A0/g, "")
    .replace(",", ".")
    .match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseEntry[]>(() => loadCases());
  const [prices, setPrices] = useState<Record<string, PriceRow>>({});
  const [title, setTitle] = useState("");
  const [hashName, setHashName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [currency, setCurrency] = useState(
    () => localStorage.getItem("cur") ?? "5",
  );
  const [rate, setRate] = useState(() => localStorage.getItem("rate") ?? "2");

  const rateNum = parseFloat(rate) || 1;
  // цена приходит в валюте аккаунта (Steam) → в рубли для расчётов
  const toRub = (n: number): number => (currency === "18" ? n * rateNum : n);
  // стакан всегда приходит в рублях → в валюту для отображения
  const toDisplay = (n: number): number =>
    currency === "18" ? n / rateNum : n;

  const steamUrl = (hashName: string) =>
    `https://steamcommunity.com/market/listings/730/${encodeURIComponent(hashName)}`;

  async function refresh(withBook: boolean) {
    if (!cases.length) return;
    setLoading(true);
    try {
      const q = encodeURIComponent(cases.map((c) => c.hashName).join(","));
      const res = await fetch(
        `${API}/api/cases/prices?names=${q}&currency=${currency}${withBook ? "&book=1" : ""}`,
      );
      const data = await res.json();
      setPrices(
        Object.fromEntries(
          (data.items as PriceRow[]).map((i) => [i.hashName, i]),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  function onAdd() {
    if (!hashName.trim()) return;
    setCases(
      addCase(
        title.trim() || hashName.trim(),
        hashName.trim(),
        buyPrice ? Number(buyPrice) : null,
      ),
    );
    setTitle("");
    setHashName("");
    setBuyPrice("");
  }

  function OrderList({
    rows,
    buyPrice,
    symbol,
    toDisplay,
  }: {
    rows: OrderRow[];
    buyPrice: number | null;
    symbol: string;
    toDisplay: (n: number) => number;
  }) {
    if (!rows.length) return <div className="book-empty">—</div>;
    return (
      <div className="book-list">
        {rows.map((o, i) => {
          const priceRub = parsePrice(o.price) ?? 0;
          const net = priceRub / 1.15;
          const p = buyPrice != null ? pct(net, buyPrice) : null;
          const colored = p != null ? fmtPct(p) : null;
          return (
            <div className="book-row" key={i}>
              <span className="book-price">
                {toDisplay(priceRub).toFixed(2)} {symbol}
              </span>
              <span className="book-qty">× {o.quantity}</span>
              {colored && (
                <span className="book-net" style={{ color: colored.color }}>
                  → {net.toFixed(2)} ₽ ({colored.text})
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="cases-wrap">
      <style>{`
        .cases-wrap { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #e6e6e6; }
        .cases-form { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .cases-form input, .cur-select {
          background: #1e2229; border: 1px solid #333a45; border-radius: 6px;
          color: #e6e6e6; padding: 8px 10px; font-size: 13px; outline: none;
        }
        .cases-form input:focus, .cur-select:focus { border-color: #4a7dff; }
        .cases-form input::placeholder { color: #6b7280; }
        .cases-form button {
          background: #2b3644; color: #e6e6e6; border: 1px solid #3d4a5c;
          border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer;
        }
        .cases-form button:hover:not(:disabled) { background: #38475c; }
        .cases-form button:disabled { opacity: 0.5; cursor: default; }
        table.cases-table {
          width: 100%; border-collapse: collapse; font-size: 13px;
          background: #171a20; border-radius: 8px; overflow: hidden;
          border: 1px solid #2a303b;
        }
        .cases-table th {
          text-align: left; padding: 10px 12px; background: #1e2229;
          color: #9aa4b2; font-weight: 600; text-transform: uppercase; font-size: 11px;
          letter-spacing: 0.4px; border-bottom: 1px solid #2a303b;
        }
        .cases-table td { padding: 10px 12px; border-bottom: 1px solid #232833; }
        tr.case-row:hover td { background: #1e242e; }
        tr.case-row.open td { background: #1e242e; }
        td.case-name { font-weight: 600; color: #f0f0f0; }
        .case-name a { color: #e6e6e6; text-decoration: none; }
        .case-name a:hover { color: #4a7dff; text-decoration: underline; }
        .btn-del {
          background: none; border: none; color: #6b7280; cursor: pointer;
          font-size: 14px; padding: 2px 6px; border-radius: 4px;
        }
        .btn-del:hover { color: #e74c3c; background: #2a1d20; }
        .book-panel { background: #12151a; padding: 12px; border-radius: 6px; }
        .book-cols { display: flex; gap: 32px; }
        .book-title { font-size: 11px; color: #9aa4b2; text-transform: uppercase;
          letter-spacing: 0.4px; margin-bottom: 8px; }
        .book-list { max-height: 340px; overflow-y: auto; min-width: 280px; }
        .book-row { display: flex; gap: 10px; padding: 3px 0;
          font-variant-numeric: tabular-nums; font-size: 13px; }
        .book-price { color: #f0f0f0; min-width: 76px; }
        .book-qty { color: #9aa4b2; min-width: 46px; }
        .book-net { margin-left: auto; }
        .book-empty { color: #4a5260; padding: 4px 0; }
        .cases-empty { text-align: center; color: #6b7280; padding: 24px !important; }
        .rate-input { width: 100px; }
        .rate-input:disabled { opacity: 0.4; }
      `}</style>

      <h2>Кейсы</h2>

      <div className="cases-form">
        <input
          placeholder="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          placeholder="market_hash_name"
          value={hashName}
          onChange={(e) => setHashName(e.target.value)}
        />
        <input
          placeholder="Цена покупки, ₽"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          type="number"
        />
        <select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            localStorage.setItem("cur", e.target.value);
          }}
          className="cur-select"
        >
          <option value="5">₽ RUB</option>
          <option value="18">₴ UAH</option>
        </select>
        <input
          placeholder="1 ₴ = ? ₽"
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            localStorage.setItem("rate", e.target.value);
          }}
          className="rate-input"
          disabled={currency !== "18"}
        />
        <button onClick={onAdd}>Добавить</button>
        <button onClick={() => refresh(false)} disabled={loading}>
          {loading ? "..." : "Обновить цены"}
        </button>
        <button onClick={() => refresh(true)} disabled={loading}>
          Обновить со стаканом
        </button>
      </div>

      <table className="cases-table">
        <thead>
          <tr>
            <th>Кейс</th>
            <th>Покупка</th>
            <th>Steam</th>
            <th>На руки</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const p = prices[c.hashName];
            const isOpen = openId === c.id;
            // Steam-цена в валюте аккаунта, «на руки» всегда в рублях
            const steamNum = parsePrice(p?.steam ?? null);
            const netRub =
              steamNum != null ? (toRub(steamNum) / 1.15).toFixed(2) : null;
            const symbol = currency === "18" ? "₴" : "₽";
            return (
              <Fragment key={c.id}>
                <tr
                  className={`case-row ${isOpen ? "open" : ""}`}
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                >
                  <td className="case-name">
                    <a
                      href={steamUrl(c.hashName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.title}
                    </a>
                  </td>
                  <td>
                    {c.buyPrice != null ? `${c.buyPrice.toFixed(2)} ₽` : "—"}
                  </td>
                  <td>{p?.steam ?? "—"}</td>
                  <td>{netRub != null ? `${netRub} ₽` : "—"}</td>
                  <td>
                    <button
                      className="btn-del"
                      title="Удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCases(removeCase(c.id));
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5}>
                      {p?.book ? (
                        <div className="book-panel">
                          <div className="book-cols">
                            <div>
                              <div className="book-title">
                                Ордера на покупку
                              </div>
                              <OrderList
                                rows={p.book.buys}
                                buyPrice={c.buyPrice}
                                symbol={symbol}
                                toDisplay={toDisplay}
                              />
                            </div>
                            <div>
                              <div className="book-title">
                                Ордера на продажу
                              </div>
                              <OrderList
                                rows={p.book.sells}
                                buyPrice={c.buyPrice}
                                symbol={symbol}
                                toDisplay={toDisplay}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="cases-empty">
                          Стакан не загружен — нажми «Обновить со стаканом»
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!cases.length && (
            <tr>
              <td className="cases-empty" colSpan={5}>
                Кейсы не добавлены
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
