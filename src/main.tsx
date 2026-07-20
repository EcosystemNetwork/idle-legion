import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { initMotion } from "./fx/quality.ts";

// Resolve the motion/quality tier before the first paint, so ambient animation
// never starts at full tilt on a machine (or for a player) that wants less.
initMotion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
