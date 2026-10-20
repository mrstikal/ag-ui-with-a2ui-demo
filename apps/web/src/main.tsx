import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@copilotkit/react-core/v2/styles.css";
import "./index.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
