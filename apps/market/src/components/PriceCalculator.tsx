import { useState } from "react";

type PriceCalculatorProps = {
  price: number;
};

export const PriceCalculator = ({ price }: PriceCalculatorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputPrice, setInputPrice] = useState("");

  const value = Number(inputPrice);
  const percent =
    price > 0 && inputPrice !== "" ? ((value - price) / price) * 100 : 0;

  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(true);
          }}
          className="text-slate-400 hover:text-white"
        >
          Калькулятор
        </button>
      ) : (
        <div
          className="flex items-center justify-end gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={inputPrice}
            onChange={(event) => setInputPrice(event.target.value)}
            placeholder="Цена"
            className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-sm text-slate-100 outline-none focus:border-indigo-500"
          />

          {inputPrice !== "" && Number.isFinite(value) && (
            <span
              className={`min-w-20 text-right font-semibold ${
                percent >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {percent > 0 ? "+" : ""}
              {percent.toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};
