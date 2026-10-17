import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const steamId = params.get("steamId");

if (steamId) {
  localStorage.setItem("steamId", steamId);
  window.history.replaceState({}, "", "/");
}

createRoot(document.getElementById("root")!).render(<App />);
