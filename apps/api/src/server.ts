import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import authRouter from "./routes/auth";
import marketRouter from "./routes/market";
import steamSessionRouter from "./routes/steam-session";
import scannerRouter from "./routes/scanner";
import scannerCatalogRouter from "./routes/scanner-catalog";
import scannerPriceHistoryRouter from "./routes/scanner-price-history";
import { startScannerHistoryWorker } from "./services/scanner-history-worker";
import { startScannerCatalogWorker } from "./services/scanner-catalog-worker";

dotenv.config();

const app = express();

const PORT = 4000;
const MARKET_URL = "http://localhost:3000";

app.use(express.json());

app.use(
  cors({
    origin: [MARKET_URL, "chrome-extension://cmcdpenepjodckkceadflldahnelnnid"],
    credentials: true,
  }),
);

app.use("/auth", authRouter);
app.use("/api", steamSessionRouter);
app.use("/api", marketRouter);
app.use("/api", scannerRouter);
app.use("/api", scannerCatalogRouter);
app.use("/api", scannerPriceHistoryRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);

  const appId = Number(process.env.STEAM_APP_ID);

  // if (Number.isInteger(appId) && appId > 0) {
  //   startScannerHistoryWorker(appId);
  //   startScannerCatalogWorker(appId);
  // }
});
