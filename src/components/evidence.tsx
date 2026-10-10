"use client";

import { createContext, useContext } from "react";
import type { Claim, Source } from "@/lib/types";

export interface EvidenceIndex {
  claim: (id: string) => Claim | undefined;
  source: (id: string) => Source | undefined;
}

export const EvidenceContext = createContext<EvidenceIndex>({ claim: () => undefined, source: () => undefined });

export const SIGNAL_COLOR: Record<Claim["signal"], string> = {
  red: "bg-red",
  amber: "bg-amber",
  green: "bg-green",
  neutral: "bg-muted/50",
};

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Citation chips with a hover card showing the exact claim and its source. */
export function Cite({ ids }: { ids: string[] }) {
  const ev = useContext(EvidenceContext);
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
      {/* Unknown ids (e.g. invented inline in prose) are dropped, not shown. */}
      {ids.filter((id) => ev.claim(id)).map((id) => {
        const c = ev.claim(id);
        const s = c ? ev.source(c.sourceId) : undefined;
        return (
          <span key={id} className="group relative inline-block">
            <a
              href={`#claim-${id}`}
              className="rounded border border-line bg-card px-1 font-mono text-[10.5px] leading-4 text-muted transition hover:border-red hover:text-red"
            >
              {id}
            </a>
            {c && (
              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-72 -translate-x-1/2 rounded-lg border border-line bg-card p-3 text-left text-xs leading-relaxed text-ink shadow-xl group-hover:block">
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${SIGNAL_COLOR[c.signal]}`} />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{c.category}</span>
                </span>
                <span className="mt-1 block">{c.text}</span>
                {s && <span className="mt-2 block truncate font-mono text-[10px] text-muted">{hostname(s.url)}</span>}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Prose where inline "(C12, C14)" style references become citation chips. */
export function CitedText({ text }: { text: string }) {
  const parts = text.split(/\s*\(?\b(C\d+(?:\s*[,;/]\s*C\d+)*)\b\)?/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <Cite key={i} ids={p.split(/\s*[,;/]\s*/)} /> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
