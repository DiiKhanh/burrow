import { useEffect, type ReactNode } from "react";
import { BurrowMark } from "./Burrow";

export type Tab = "clean" | "status";

const BG: Record<Tab, string> = {
  clean: "bg-linear-to-b from-clean-top to-clean-bottom",
  status: "bg-linear-to-b from-status-top to-status-bottom",
};

/** Window chrome: traffic lights over a full-size content view, per-tab gradient. */
export function Window({ tab, children }: { tab: Tab; children: ReactNode }) {
  return (
    <div className={`relative flex h-full flex-col overflow-hidden transition-colors duration-500 ${BG[tab]}`}>
      <div className="absolute top-[18px] left-[18px] z-10 flex gap-2">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} className="size-3 rounded-full" style={{ background: c }} />
        ))}
      </div>
      {children}
    </div>
  );
}

export function PillTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "1") onChange("clean");
      if (e.key === "2") onChange("status");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <nav className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 backdrop-blur" role="tablist">
      <span className="px-1"><BurrowMark /></span>
      {(["clean", "status"] as const).map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={tab === t}
          onClick={() => onChange(t)}
          className={`rounded-full px-4 py-1.5 font-mono text-[13px] font-semibold capitalize transition-colors ${
            tab === t ? "bg-pill text-pill-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}

export function PillButton({ children, onClick, variant = "solid", className = "" }: { children: ReactNode; onClick?: () => void; variant?: "solid" | "outline"; className?: string }) {
  const look =
    variant === "solid"
      ? "bg-pill text-pill-ink shadow-[0_8px_30px_rgb(0_0_0/0.35)] hover:brightness-95"
      : "border border-line-strong text-size hover:bg-surface";
  return (
    <button onClick={onClick} className={`rounded-full px-6 py-2.5 text-[15px] font-semibold transition ${look} ${className}`}>
      {children}
    </button>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-label font-semibold tracking-[0.14em] uppercase ${className}`}>{children}</span>;
}
