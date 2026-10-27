import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@harmonics/lattice-ui/define";
import { defineLatticeBoard } from "@harmonics/lattice-ui/board";
import type {} from "@harmonics/lattice-ui/react";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";

// The shape table's board is its own entry of the kit, loaded only here.
defineLatticeBoard();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
