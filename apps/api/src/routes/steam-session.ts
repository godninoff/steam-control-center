import { Router } from "express";
import { setSteamSession } from "../services/steam-session";

const router = Router();

router.post("/steam/session", (req, res) => {
  const { steamId, steamLoginSecure, sessionId } = req.body;

  if (
    typeof steamId !== "string" ||
    typeof steamLoginSecure !== "string" ||
    typeof sessionId !== "string"
  ) {
    return res.status(400).json({
      error: "steamId, steamLoginSecure and sessionId are required",
    });
  }

  setSteamSession(steamId, {
    steamLoginSecure,
    sessionId,
  });

  return res.json({ success: true });
});

export default router;
