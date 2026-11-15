export type CaseEntry = {
  id: string;
  title: string; // как показывать
  hashName: string; // точный market_hash_name для цен
  buyPrice: number | null;
};

const KEY = "cases:list";

export function loadCases(): CaseEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveCases(list: CaseEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addCase(
  title: string,
  hashName: string,
  buyPrice: number | null,
): CaseEntry[] {
  const list = loadCases();
  const entry: CaseEntry = {
    id: crypto.randomUUID(),
    title,
    hashName,
    buyPrice,
  };
  saveCases([...list, entry]);
  return [...list, entry];
}

export function removeCase(id: string): CaseEntry[] {
  const list = loadCases().filter((c) => c.id !== id);
  saveCases(list);
  return list;
}
