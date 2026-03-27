import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { setupHttpClient } from "./shared/http";
import { App } from "./app/App";

setupHttpClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
