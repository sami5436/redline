"use client";

import type { Claim, Source } from "@/lib/types";
import { SIGNAL_COLOR, hostname } from "./evidence";

export function Ledger({
  sources,
  claims,
  running,
}: {
  sources: Source[];
  claims: Record<string, Claim[]>;
  running: boolean;
}) {
  const all = Object.values(claims).flat();
  const counts = { red: 0, amber: 0, green: 0, neutral: 0 };
  all.forEach((c) => counts[c.signal]++);

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
        <div>
          <h2 className="font-serif text-3xl">Evidence ledger</h2>
          <p className="text-sm text-muted">
            Every claim Nemotron Nano pulled from {sources.length} sources. Same-name entities are discarded.
          </p>
        </div>
        <div className="flex gap-3 font-mono text-[11px] text-muted">
          {(["red", "amber", "green", "neutral"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${SIGNAL_COLOR[s]}`} />
              {counts[s]}
            </span>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line">
        {sources.map((src) => {
          const cs = claims[src.id];
          return (
            <div key={src.id} className="grid gap-2 py-4 sm:grid-cols-[13rem_1fr]">
              <div className="min-w-0">
                <div className="font-mono text-[10px] text-muted">
                  {src.id} · {src.dimension}
                </div>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-sm font-medium decoration-red underline-offset-2 hover:underline"
                >
                  {src.title}
                </a>
                <div className="truncate font-mono text-[10px] text-muted">
                  {hostname(src.url)}
                  {src.published ? ` · ${src.published.slice(0, 16)}` : ""}
                </div>
              </div>
              <div>
                {cs === undefined ? (
                  <div className="relative h-4 w-40 overflow-hidden rounded bg-line/60">
                    {running && <div className="scan absolute inset-0" />}
                  </div>
                ) : cs.length === 0 ? (
                  <div className="text-xs text-muted">No relevant claims about the subject.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {cs.map((c) => (
                      <li
                        key={c.id}
                        id={`claim-${c.id}`}
                        className="rise flex scroll-mt-24 gap-2 rounded px-1 text-sm leading-relaxed target:bg-hilite"
                      >
                        <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${SIGNAL_COLOR[c.signal]}`} />
                        <span className="w-8 shrink-0 pt-0.5 font-mono text-[10.5px] text-muted">{c.id}</span>
                        <span>
                          {c.text}
                          {c.date && <span className="ml-1 font-mono text-[10px] text-muted">{c.date}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
