import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { applyElectronShims } from "./lib/electron-shims";
import { getRouter } from "./router";
import "./styles.css";

applyElectronShims();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);
