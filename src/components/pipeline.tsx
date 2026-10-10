"use client";

import type { ModelCall, StageId, Tier } from "@/lib/types";

export type StageState = { status: "idle" | "running" | "done"; detail?: string };

export const STAGES: { id: StageId; label: string; engine: string; tier?: Tier; blurb: string }[] = [
  { id: "plan", label: "Plan", engine: "Nemotron Super", tier: "super", blurb: "Writes targeted queries across 7 risk dimensions" },
  { id: "search", label: "Search", engine: "Tavily", blurb: "Pulls live sources: filings, regulators, courts, news" },
  { id: "extract", label: "Extract", engine: "Nemotron Nano", tier: "nano", blurb: "Reads every source in parallel, keeps only verifiable claims" },
  { id: "judge", label: "Judge", engine: "Nemotron Ultra", tier: "ultra", blurb: "Weighs the evidence; every flag must cite a claim" },
];

export function usageByTier(calls: ModelCall[]) {
  const by: Record<Tier, { n: number; tokens: number; ms: number; model: string }> = {
    super: { n: 0, tokens: 0, ms: 0, model: "" },
    nano: { n: 0, tokens: 0, ms: 0, model: "" },
    ultra: { n: 0, tokens: 0, ms: 0, model: "" },
  };
  for (const c of calls) {
    const u = by[c.tier];
    u.n++;
    u.tokens += c.promptTokens + c.completionTokens;
    u.ms += c.ms;
    u.model = c.model;
  }
  return by;
}

export function Pipeline({
  stages,
  calls,
  models,
  progress,
}: {
  stages: Record<StageId, StageState>;
  calls: ModelCall[];
  models: Record<Tier, string> | null;
  progress: { read: number; total: number };
}) {
  const usage = usageByTier(calls);
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
      {STAGES.map((st, i) => {
        const s = stages[st.id];
        const u = st.tier ? usage[st.tier] : null;
        const model = st.tier && models ? models[st.tier].replace(/^nvidia\//i, "") : null;
        return (
          <li key={st.id} className={`relative bg-card p-4 ${s.status === "idle" ? "text-muted" : ""}`}>
            {s.status === "running" && <div className="scan absolute inset-x-0 top-0 h-0.5 overflow-hidden" />}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">0{i + 1}</span>
              {s.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red" />}
              {s.status === "done" && <span className="text-xs text-green">✓</span>}
            </div>
            <div className="mt-2 font-serif text-2xl leading-none">{st.label}</div>
            <div className="mt-1 text-xs font-medium">{st.engine}</div>
            {model && <div className="truncate font-mono text-[10px] text-muted" title={model}>{model}</div>}
            <div className="mt-3 min-h-4 text-xs text-muted">
              {st.id === "extract" && s.status === "running"
                ? `${progress.read}/${progress.total} sources read`
                : (s.detail ?? "")}
            </div>
            {u && u.n > 0 && (
              <div className="font-mono text-[10px] text-muted">
                {u.n}× · {u.tokens.toLocaleString()} tok
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
