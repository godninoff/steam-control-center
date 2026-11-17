import { useEffect, useState, useCallback } from "react";

export type Lot = {
  id: string;
  item_id: string;
  name: string;
  price: number;
  position: number;
  market_price?: number;
  url: string;
  image: string;
};

export function useLots(intervalMs = 30000) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:4000/api/lots");

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setLots(data.lots);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);

  return { lots, error, reload: load };
}
