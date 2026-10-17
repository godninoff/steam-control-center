import { PriceCalculator } from "../components/PriceCalculator";
import { BuyOrder, MarketHistoryItem } from "../model/types";

export type Column<T> = {
  key: string;
  label: string;
  align: string;
  render: (row: T) => React.ReactNode;
};

export const historyColumns: Column<MarketHistoryItem>[] = [
  {
    key: "item",
    label: "Предмет",
    align: "text-left",
    render: (i) => (
      <div className="flex min-w-55 items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-lg font-medium ${
            i.type === "buy"
              ? "bg-rose-500/15 text-rose-400"
              : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {i.type === "buy" ? "+" : "−"}
        </span>

        {i.imageUrl && (
          <img
            src={i.imageUrl}
            alt={i.item}
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded object-contain"
          />
        )}

        <span className="truncate font-medium text-slate-100">{i.item}</span>
      </div>
    ),
  },
  {
    key: "date",
    label: "Дата",
    align: "text-left",
    render: (i) => <span className="text-slate-500">{i.date}</span>,
  },
  {
    key: "game",
    label: "Игра",
    align: "text-left",
    render: (i) => (
      <div className="flex items-center gap-2">
        {i.game.iconUrl && (
          <img
            src={i.game.iconUrl}
            alt={i.game.name}
            className="h-12 w-12 rounded object-contain"
          />
        )}

        <span className="text-slate-400">{i.game.name}</span>
      </div>
    ),
  },
  {
    key: "calculator",
    label: "Калькулятор",
    align: "text-right",
    render: (item) => <PriceCalculator price={item.received} />,
  },
  {
    key: "received",
    label: "Получено",
    align: "text-right",
    render: (i) => (
      <span
        className={`font-bold ${
          i.type === "buy" ? "text-rose-400" : "text-emerald-400"
        }`}
      >
        {i.type === "buy" ? "−" : "+"}
        {i.received.toFixed(2)} ₴
      </span>
    ),
  },
];

export const orderColumns: Column<BuyOrder>[] = [
  {
    key: "item",
    label: "Предмет",
    align: "text-left",
    render: (o) => <span className="font-medium text-slate-100">{o.item}</span>,
  },
  {
    key: "game",
    label: "Игра",
    align: "text-left",
    render: (o) => <span className="text-slate-500">{o.game}</span>,
  },
  {
    key: "price",
    label: "Цена за шт.",
    align: "text-right",
    render: (o) => (
      <span className="text-slate-100">{o.price.toFixed(2)} €</span>
    ),
  },
  {
    key: "quantity",
    label: "Количество",
    align: "text-center",
    render: (o) => (
      <span className="font-mono text-slate-500">{o.quantity}</span>
    ),
  },
  {
    key: "total",
    label: "Всего",
    align: "text-right",
    render: (o) => (
      <span className="font-bold text-emerald-400">{o.total.toFixed(2)} €</span>
    ),
  },
];
