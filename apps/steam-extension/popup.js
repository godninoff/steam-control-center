const button = document.getElementById("connect");
const statusEl = document.getElementById("status");

button.addEventListener("click", async () => {
  statusEl.textContent = "Получаем Steam-сессию...";

  try {
    const [loginCookie, sessionCookie] = await Promise.all([
      chrome.cookies.get({
        url: "https://steamcommunity.com",
        name: "steamLoginSecure",
      }),
      chrome.cookies.get({
        url: "https://steamcommunity.com",
        name: "sessionid",
      }),
    ]);

    if (!loginCookie || !sessionCookie) {
      statusEl.textContent = "Не найдены cookies Steam";
      return;
    }

    const steamId = decodeURIComponent(loginCookie.value).split("|")[0];

    const response = await fetch("http://localhost:4000/api/steam/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        steamId,
        steamLoginSecure: loginCookie.value,
        sessionId: sessionCookie.value,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    statusEl.textContent = "Steam-сессия обновлена";
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Ошибка";
  }
});
