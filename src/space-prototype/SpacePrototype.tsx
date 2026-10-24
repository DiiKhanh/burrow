// PROTOTYPE (#55), throwaway: the Space tab as three variants, switchable
// with ?variant= and the pink bar (← → keys). ?bg= picks the gradient.
// Run: `bun run prototype:space`.
import { useEffect, useState } from "react";
import { Report } from "./shared";
import { type Space, useSpace } from "./useSpace";
import { nameA, VariantA } from "./VariantA";
import { nameB, VariantB } from "./VariantB";
import { nameC, VariantC } from "./VariantC";

const VARIANTS: [Variant, ...Variant[]] = [
  { key: "A", name: nameA, View: VariantA },
  { key: "B", name: nameB, View: VariantB },
  { key: "C", name: nameC, View: VariantC },
];

type Variant = { key: string; name: string; View: (props: { space: Space }) => React.ReactNode };

const GRADIENTS: Record<string, [string, string]> = {
  teal: ["#1d3a3d", "#16211f"],
  violet: ["#33294a", "#1d1a2b"],
  moss: ["#2e3a22", "#1d2319"],
};

function param(name: string, fallback: string) {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

function setParam(name: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.replaceState(null, "", url);
}

export function SpacePrototype() {
  const [variant, setVariant] = useState(() => param("variant", "A"));
  const [bg, setBg] = useState(() => param("bg", "teal"));
  const [measuring, setMeasuring] = useState(false);
  const [protectedSim, setProtectedSim] = useState(false);
  const space = useSpace({ measuring, protected: protectedSim });

  useEffect(() => {
    const [top, bottom] = GRADIENTS[bg] ?? (GRADIENTS.teal as [string, string]);
    document.documentElement.style.setProperty("--color-space-top", top);
    document.documentElement.style.setProperty("--color-space-bottom", bottom);
  }, [bg]);

  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === variant),
  );
  const go = (d: number) => {
    const next = (VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length] ?? VARIANTS[0]).key;
    setVariant(next);
    setParam("variant", next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const current = VARIANTS[idx] ?? VARIANTS[0];
  const { View } = current;
  const bgs = Object.keys(GRADIENTS);
  return (
    <>
      <View space={space} />
      <Report space={space} />
      {!import.meta.env.PROD && (
        <div className="fixed top-3 right-3 z-[100] flex items-center gap-2 whitespace-nowrap rounded-full bg-[#ff2d78] px-2 py-1.5 font-mono text-[11px] text-white shadow-2xl">
          <button type="button" onClick={() => go(-1)} className="rounded-full px-2 hover:bg-white/20">
            ←
          </button>
          <span className="font-bold">
            {current.key} ({current.name})
          </span>
          <button type="button" onClick={() => go(1)} className="rounded-full px-2 hover:bg-white/20">
            →
          </button>
          <span className="opacity-60">|</span>
          <button
            type="button"
            className="rounded-full px-2 hover:bg-white/20"
            onClick={() => {
              const next = bgs[(bgs.indexOf(bg) + 1) % bgs.length] ?? "teal";
              setBg(next);
              setParam("bg", next);
            }}
          >
            bg: {bg}
          </button>
          <Toggle on={measuring} onClick={() => setMeasuring((m) => !m)} label="measuring" />
          <Toggle on={protectedSim} onClick={() => setProtectedSim((p) => !p)} label="no FDA" />
          <button type="button" onClick={space.pretendClean} className="rounded-full px-2 hover:bg-white/20">
            pretend Clean ran
          </button>
          <span className="opacity-80">
            {space.stack.length - 1 ? `depth ${space.stack.length - 1}` : "overview"} · {space.pickedList.length} picked
          </span>
        </div>
      )}
    </>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2"
      style={on ? { background: "#fff", color: "#ff2d78" } : { textDecoration: "line-through", opacity: 0.7 }}
    >
      {label}
    </button>
  );
}
