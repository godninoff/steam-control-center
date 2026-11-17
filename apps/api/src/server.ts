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

import marketItemsRouter from "./routes/market-items";
import casesRouter from "./routes/cases";
import marketProxyRouter from "./routes/market-proxy";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 4000;

const MARKET_URL = process.env.MARKET_URL || "http://localhost:3000";
const CHROME_EXTENSION_ID = process.env.CHROME_EXTENSION_ID || "";

const ALLOWED_ORIGINS = [
  MARKET_URL,
  ...(CHROME_EXTENSION_ID ? [`chrome-extension://${CHROME_EXTENSION_ID}`] : []),
];

app.use(express.json());

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  }),
);

app.use("/auth", authRouter);
app.use("/api", steamSessionRouter);
app.use("/api", marketRouter);
app.use("/api", scannerRouter);
app.use("/api", scannerCatalogRouter);
app.use("/api", scannerPriceHistoryRouter);
app.use("/api", marketItemsRouter);
app.use("/api", casesRouter);
app.use("/api", marketProxyRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on http://localhost:${PORT}`);

  const appId = Number(process.env.STEAM_APP_ID);

  // if (Number.isInteger(appId) && appId > 0) {
  //   startScannerHistoryWorker(appId);
  //   startScannerCatalogWorker(appId);
  // }
});
