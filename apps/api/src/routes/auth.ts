import { Router } from "express";
import { getSteamAuthUrl, verifySteamLogin } from "../services/auth";

const router = Router();

router.get("/steam", (req, res) => {
  res.redirect(getSteamAuthUrl());
});

router.get("/steam/callback", async (req, res) => {
  try {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") {
        params.set(key, value);
      }
    }

    const steamId = await verifySteamLogin(params);

    res.redirect(
      `http://localhost:3000?steamId=${encodeURIComponent(steamId)}`,
    );
  } catch (error) {
    console.error("Steam auth error:", error);

    res.status(401).json({
      error: "Steam authentication failed",
    });
  }
});

export default router;
