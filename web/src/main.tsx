import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Instalable en el móvil (solo en la web publicada)
if (import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
