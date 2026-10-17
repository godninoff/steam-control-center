import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type SteamSession = {
  steamLoginSecure: string;
  sessionId: string;
};

const sessions = new Map<string, SteamSession>();

const dataDir = path.resolve(process.cwd(), "data");
const sessionsFile = path.join(dataDir, "steam-sessions.json");

let activeSteamId: string | null = null;

const loadSessions = () => {
  try {
    const data: Record<string, unknown> = JSON.parse(
      readFileSync(sessionsFile, "utf-8"),
    );

    for (const [steamId, value] of Object.entries(data)) {
      // Поддерживаем старый формат файла с одним steamLoginSecure.
      if (typeof value === "string") {
        sessions.set(steamId, {
          steamLoginSecure: value,
          sessionId: "",
        });
      } else if (
        typeof value === "object" &&
        value !== null &&
        "steamLoginSecure" in value &&
        "sessionId" in value &&
        typeof value.steamLoginSecure === "string" &&
        typeof value.sessionId === "string"
      ) {
        sessions.set(steamId, {
          steamLoginSecure: value.steamLoginSecure,
          sessionId: value.sessionId,
        });
      }
    }

    const savedSteamIds = [...sessions.keys()];

    if (savedSteamIds.length > 0) {
      activeSteamId = savedSteamIds[savedSteamIds.length - 1];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to load Steam sessions:", error);
    }
  }
};

const saveSessions = () => {
  mkdirSync(dataDir, { recursive: true });

  writeFileSync(
    sessionsFile,
    JSON.stringify(Object.fromEntries(sessions), null, 2),
    { mode: 0o600 },
  );
};

loadSessions();

export const setSteamSession = (steamId: string, session: SteamSession) => {
  sessions.set(steamId, session);
  activeSteamId = steamId;
  saveSessions();
};

export const getActiveSteamSession = () => {
  if (!activeSteamId) return null;

  const session = sessions.get(activeSteamId);

  if (!session) return null;

  return {
    steamId: activeSteamId,
    ...session,
  };
};

export const getSteamSession = (steamId: string) => {
  return sessions.get(steamId)?.steamLoginSecure;
};

export const getSteamSessionId = (steamId: string) => {
  return sessions.get(steamId)?.sessionId;
};
