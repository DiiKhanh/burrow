// Hand-written SVG charts (ADR 0002: no chart library).
import { useId } from "react";

type SparkProps = { data: number[]; max?: number; color: string; height?: number; className?: string };

function points(data: number[], max: number, w: number, h: number) {
  const step = w / (data.length - 1);
  return data.map((v, i) => [i * step, h - (Math.min(v, max) / max) * (h - 2) - 1] as const);
}

export function Sparkline({ data, max = Math.max(...data, 1), color, height = 40, className }: SparkProps) {
  const w = 240;
  const d = points(data, max, w, height).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`block min-w-0 ${className ?? ""}`} style={{ height }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaSpark({ data, max = Math.max(...data, 1), color, height = 40, className }: SparkProps) {
  const id = useId();
  const w = 240;
  const pts = points(data, max, w, height);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`block min-w-0 ${className ?? ""}`} style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function BarSpark({ data, max = 100, color, height = 40, className }: SparkProps) {
  const w = 240;
  const gap = 1.5;
  const bw = w / data.length - gap;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`block min-w-0 ${className ?? ""}`} style={{ height }}>
      {data.map((v, i) => {
        const h = Math.max(1.5, (Math.min(v, max) / max) * height);
        return <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx="1" fill={color} opacity={0.35 + 0.65 * (i / data.length)} />;
      })}
    </svg>
  );
}

export function MeterBar({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-surface-sunken ${className ?? ""}`}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${value * 100}%`, background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, transparent), ${color})` }} />
    </div>
  );
}

export function Ring({ value, color, size = 34, stroke = 3 }: { value: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line-strong" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" />
    </svg>
  );
}
