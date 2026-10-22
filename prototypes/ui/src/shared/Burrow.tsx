// Burrow's own hero visual: concentric "burrow" rings. Deliberately NOT Mole's planets.
type Props = { size?: number; active?: boolean; progress?: number; tone: "clean" | "status" };

export function BurrowRings({ size = 220, active, progress, tone }: Props) {
  const glow = tone === "clean" ? "var(--color-size)" : "var(--color-mem)";
  const rings = [1, 0.78, 0.58, 0.4];
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative ${active ? "animate-breathe" : ""}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full blur-3xl" style={{ background: glow, opacity: 0.16 }} />
      {rings.map((s, i) => (
        <div
          key={s}
          className="absolute rounded-full border"
          style={{
            inset: `${((1 - s) / 2) * 100}%`,
            borderColor: `color-mix(in oklab, ${glow} ${18 + i * 14}%, transparent)`,
            background: `radial-gradient(circle at 50% 35%, color-mix(in oklab, ${glow} ${4 + i * 5}%, transparent), transparent 70%)`,
          }}
        />
      ))}
      {progress !== undefined && (
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={glow} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} className="transition-[stroke-dashoffset] duration-200" />
        </svg>
      )}
    </div>
  );
}

export function BurrowMark({ size = 22 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-full bg-pill" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none" stroke="var(--color-pill-ink)" strokeWidth="1.4">
        <circle cx="6" cy="6" r="5" />
        <circle cx="6" cy="6.8" r="2.6" />
      </svg>
    </span>
  );
}
