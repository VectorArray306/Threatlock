import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import CloudApp from "./CloudApp";
const mode = import.meta.env.VITE_APP_MODE;
if (mode !== "local" && mode !== "cloud")
  throw new Error("Set VITE_APP_MODE to local or cloud explicitly.");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {mode === "local" ? <App /> : <CloudApp />}
  </React.StrictMode>,
);
