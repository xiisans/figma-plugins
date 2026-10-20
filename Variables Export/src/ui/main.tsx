import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { fixtureData } from "./fixture";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const demoState = import.meta.env.DEV ? params.get("state") ?? undefined : undefined;
if (import.meta.env.DEV) document.body.classList.add(params.get("theme") === "light" ? "figma-light" : "figma-dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialData={import.meta.env.DEV ? fixtureData : undefined} demoState={demoState} />
  </StrictMode>,
);
