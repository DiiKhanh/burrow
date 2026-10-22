// PROTOTYPE switcher bar: not part of the design being evaluated.
import { useEffect } from "react";

type Props = { variants: { key: string; name: string }[]; current: string; onChange: (key: string) => void; state: string };

export function PrototypeSwitcher({ variants, current, onChange, state }: Props) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (d: number) => onChange(variants[(idx + d + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-[#ff2d78] px-2 py-1.5 font-mono text-xs text-white shadow-2xl">
      <button onClick={() => go(-1)} className="rounded-full px-2 hover:bg-white/20">←</button>
      <span className="font-bold">
        {variants[idx].key} ({variants[idx].name})
      </span>
      <span className="opacity-80">{state}</span>
      <button onClick={() => go(1)} className="rounded-full px-2 hover:bg-white/20">→</button>
    </div>
  );
}
