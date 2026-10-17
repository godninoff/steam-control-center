type Game = {
  name: string;
  iconUrl?: string;
};

export type MarketHistoryItem = {
  id: string;
  date: string;
  item: string;
  game: Game;
  type: "buy" | "sell";
  price: number;
  fee: number;
  received: number;
  imageUrl?: string;
  appId: string;
  marketHashName: string;
  marketAppId: string;
};

export type BuyOrder = {
  id: string;
  item: string;
  game: string;
  price: number;
  quantity: number;
  total: number;
  marketAppId: string;
  marketHashName: string;
};

export type MarketSellListing = {
  id: string;
  item: string;
  game: string;
  price: number;
  sellerPrice: number;
  imageUrl?: string;
  appId: string;
  marketAppId: string;
  marketHashName: string;
};
