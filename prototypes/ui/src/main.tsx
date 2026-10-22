// PROTOTYPE entry: three Burrow UI variants, switchable via ?variant= (A/B/C) and ?tab= (clean/status).
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { useCleanFlow } from "./shared/useCleanFlow";
import { useStatus } from "./mock/status";
import { PrototypeSwitcher } from "./shared/Switcher";
import { formatBytes } from "./mock/format";
import type { Tab } from "./shared/Shell";
import * as A from "./variants/A";
import * as B from "./variants/B";
import * as C from "./variants/C";

const VARIANTS = {
  A: { name: A.name, View: A.VariantA },
  B: { name: B.name, View: B.VariantB },
  C: { name: C.name, View: C.VariantC },
} as const;
type Key = keyof typeof VARIANTS;

function readParam<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = new URLSearchParams(location.search).get(key) as T | null;
  return v && allowed.includes(v) ? v : fallback;
}

function writeParams(variant: string, tab: string) {
  history.replaceState(null, "", `?variant=${variant}&tab=${tab}`);
}

function App() {
  const [variant, setVariant] = useState<Key>(() => readParam("variant", ["A", "B", "C"] as const, "A"));
  const [tab, setTabState] = useState<Tab>(() => readParam("tab", ["clean", "status"] as const, "clean"));
  const flow = useCleanFlow();
  const status = useStatus();
  const { View } = VARIANTS[variant];

  const setTab = (t: Tab) => {
    setTabState(t);
    writeParams(variant, t);
  };
  const changeVariant = (k: string) => {
    setVariant(k as Key);
    writeParams(k, tab);
  };

  const state =
    tab === "clean"
      ? `clean: ${flow.phase} · ${flow.selectedCount} sel · ${formatBytes(flow.selectedBytes)}${flow.cleaned.length ? ` · ${flow.cleaned.length}/${flow.queue.length} done` : ""}`
      : `status: cpu ${Math.round(status.cpu.at(-1)!)}% · mem ${Math.round(status.mem.at(-1)!)}%`;

  return (
    <>
      <View tab={tab} setTab={setTab} flow={flow} status={status} />
      <PrototypeSwitcher
        variants={(Object.keys(VARIANTS) as Key[]).map((key) => ({ key, name: VARIANTS[key].name }))}
        current={variant}
        onChange={changeVariant}
        state={state}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
