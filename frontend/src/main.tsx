import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSecret } from "./secret";
import "./styles.css";

initSecret();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
