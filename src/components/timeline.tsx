"use client";

import type { Claim, Source } from "@/lib/types";

function yearOf(c: Claim, s?: Source): number | null {
  const m = (c.date ?? "").match(/(19|20)\d{2}/) ?? (s?.published ?? "").match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

const SEGMENTS = [
  { key: "red", color: "var(--red)" },
  { key: "amber", color: "var(--amber)" },
  { key: "green", color: "var(--green)" },
] as const;

/** Signal history: dated red/amber/green claims per year as stacked bars. */
export function Timeline({ claims, sourceById }: { claims: Claim[]; sourceById: Map<string, Source> }) {
  const dated = claims
    .filter((c) => c.signal !== "neutral")
    .map((c) => ({ c, y: yearOf(c, sourceById.get(c.sourceId)) }))
    .filter((d): d is { c: Claim; y: number } => d.y !== null);
  if (dated.length < 3) return <p className="text-sm text-muted">Not enough dated evidence to chart.</p>;

  const now = new Date().getFullYear();
  const min = Math.max(Math.min(...dated.map((d) => d.y)), now - 11);
  const years = Array.from({ length: now - min + 1 }, (_, i) => min + i);
  const counts = new Map(years.map((y) => [y, { red: 0, amber: 0, green: 0 }]));
  for (const d of dated) {
    const bucket = counts.get(Math.max(d.y, min));
    if (bucket && d.c.signal !== "neutral") bucket[d.c.signal]++;
  }
  const peak = Math.max(...[...counts.values()].map((v) => v.red + v.amber + v.green), 1);

  return (
    <div>
      <div className="flex h-36 items-end gap-1.5">
        {years.map((y) => {
          const v = counts.get(y)!;
          const total = v.red + v.amber + v.green;
          return (
            <div key={y} className="group flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 font-mono text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
                {total || ""}
              </span>
              <div
                className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-sm"
                style={{ height: `${(total / peak) * 100}%`, minHeight: total ? 3 : 0 }}
                title={`${y}: ${v.red} red · ${v.amber} amber · ${v.green} green`}
              >
                {SEGMENTS.map((s) => (
                  <div key={s.key} style={{ flexGrow: v[s.key], background: s.color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 border-t border-line pt-1">
        {years.map((y) => (
          <div key={y} className="flex-1 text-center font-mono text-[10px] text-muted">
            &apos;{String(y).slice(2)}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red" />risk</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber" />caution</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green" />positive</span>
      </div>
    </div>
  );
}
