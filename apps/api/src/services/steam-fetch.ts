import { getActiveSteamSession } from "./steam-session";

type SteamFetchOptions = RequestInit;

export const steamFetch = (
  url: string | URL,
  options: SteamFetchOptions = {},
): Promise<Response> => {
  const session = getActiveSteamSession();

  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json, text/javascript, */*; q=0.01");
  headers.set("User-Agent", "Mozilla/5.0");
  headers.set("Referer", "https://steamcommunity.com/market/");
  headers.set("Accept-Language", "en-US,en;q=0.9,uk;q=0.8");

  if (session) {
    const cookies = [
      `steamLoginSecure=${session.steamLoginSecure}`,
      ...(session.sessionId ? [`sessionid=${session.sessionId}`] : []),
    ];

    headers.set("Cookie", cookies.join("; "));
  }

  return fetch(url, {
    ...options,
    headers,
  });
};
