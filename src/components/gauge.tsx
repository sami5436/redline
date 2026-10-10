export function riskTone(score: number) {
  if (score >= 70) return { label: "High risk", text: "text-red", stroke: "var(--red)" };
  if (score >= 40) return { label: "Elevated", text: "text-amber", stroke: "var(--amber)" };
  return { label: "Low risk", text: "text-green", stroke: "var(--green)" };
}

/** Semicircular 0–100 risk dial. */
export function Gauge({ score }: { score: number }) {
  const tone = riskTone(score);
  const r = 70;
  const len = Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * len;
  return (
    <div className="relative w-48">
      <svg viewBox="0 0 180 100" className="w-full" role="img" aria-label={`Risk score ${score} of 100`}>
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M20 90 A70 70 0 0 1 160 90"
          fill="none"
          stroke={tone.stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${len}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className={`font-serif text-5xl leading-none tabular-nums ${tone.text}`}>{score}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{tone.label}</div>
      </div>
    </div>
  );
}
