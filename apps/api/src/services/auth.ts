const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

export const getSteamAuthUrl = () => {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": "http://localhost:4000/auth/steam/callback",
    "openid.realm": "http://localhost:4000",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return `${STEAM_OPENID_URL}?${params.toString()}`;
};

export const verifySteamLogin = async (params: URLSearchParams) => {
  const verifyParams = new URLSearchParams(params);

  verifyParams.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: verifyParams.toString(),
  });

  const text = await response.text();

  if (!response.ok || !text.includes("is_valid:true")) {
    throw new Error("Steam OpenID verification failed");
  }

  const claimedId = params.get("openid.claimed_id");

  if (!claimedId) {
    throw new Error("Steam ID not found");
  }

  const steamId = claimedId.split("/").pop();

  if (!steamId) {
    throw new Error("Steam ID not found");
  }

  return steamId;
};
