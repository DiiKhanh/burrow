import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isMetric } from "./status/MenuPreferences";
import { StatusPanel } from "./status/StatusPanel";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Burrow: #root is missing from index.html");

const metric = new URLSearchParams(location.search).get("panel");
createRoot(root).render(<StrictMode>{isMetric(metric) ? <StatusPanel metric={metric} /> : <App />}</StrictMode>);
