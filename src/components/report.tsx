"use client";

import { useState } from "react";
import type { Claim, Report, Source } from "@/lib/types";
import { Cite, CitedText } from "./evidence";
import { Gauge, riskTone } from "./gauge";
import { Timeline } from "./timeline";

const SEV = {
  high: { pill: "bg-red text-white", rail: "bg-red" },
  medium: { pill: "bg-amber text-white", rail: "bg-amber" },
  low: { pill: "bg-line text-ink", rail: "bg-muted/40" },
};

function Heading({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <h3 className="font-serif text-2xl">{children}</h3>
      {note && <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">{note}</span>}
    </div>
  );
}

function Evidence({ ids }: { ids: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? ids : ids.slice(0, 6);
  return (
    <>
      <Cite ids={shown} />
      {ids.length > 6 && !all && (
        <button onClick={() => setAll(true)} className="ml-1 font-mono text-[10.5px] text-muted hover:text-red">
          +{ids.length - 6}
        </button>
      )}
    </>
  );
}

export function ReportView({
  report,
  claims,
  sources,
  onExport,
}: {
  report: Report;
  claims: Claim[];
  sources: Source[];
  onExport: () => void;
}) {
  const tone = riskTone(report.riskScore);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const cited = new Set(
    [...report.redFlags, ...report.strengths, ...report.contradictions].flatMap((x) => x.evidence),
  ).size;
  const stats = [
    { k: "sources read", v: sources.length },
    { k: "claims extracted", v: claims.length },
    { k: "claims cited", v: cited },
    { k: "invented citations", v: report.droppedCitations, note: "removed by verifier" },
  ];

  return (
    <section className="rise mt-12">
      {/* Verdict */}
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
          <div className="flex justify-center sm:block">
            <Gauge score={report.riskScore} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Diligence file · {report.entityType}
              </span>
              <button
                onClick={onExport}
                className="rounded-full border border-line px-3 py-1 text-xs transition hover:border-ink"
              >
                Export memo ↓
              </button>
            </div>
            <h2 className="mt-1 font-serif text-4xl leading-tight sm:text-5xl">{report.subject}</h2>
            <p className={`mt-2 text-lg font-medium leading-snug ${tone.text}`}>{report.verdict}</p>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink/80">
              <CitedText text={report.summary} />
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.k} className="bg-card px-6 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">{s.k}</dt>
              <dd className="font-serif text-2xl tabular-nums">
                {s.v}
                {s.note && <span className="ml-2 font-sans text-[11px] text-muted">{s.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-10">
          {/* Red flags */}
          <div>
            <Heading note={`${report.redFlags.length} evidenced`}>Red flags</Heading>
            {report.redFlags.length === 0 && (
              <p className="text-sm text-muted">No red flags survived evidence checks. The record looks clean.</p>
            )}
            <div className="space-y-3">
              {report.redFlags.map((f, i) => (
                <article
                  key={f.title}
                  className="rise relative rounded-xl border border-line bg-card p-4 pl-5"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${SEV[f.severity].rail}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${SEV[f.severity].pill}`}
                    >
                      {f.severity}
                    </span>
                    <h4 className="font-medium">{f.title}</h4>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink/80">
                    <CitedText text={f.explanation} />
                    <Evidence ids={f.evidence} />
                  </p>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    {f.corroboration > 1
                      ? `corroborated by ${f.corroboration} independent domains`
                      : "single source: verify independently"}
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {claims.length > 0 && (
            <div>
              <Heading note="dated claims by year">Signal history</Heading>
              <Timeline claims={claims} sourceById={sourceById} />
            </div>
          )}

          {/* Contradictions */}
          {report.contradictions.length > 0 && (
            <div>
              <Heading note="sources disagree">Contradictions</Heading>
              <ul className="space-y-3">
                {report.contradictions.map((c) => (
                  <li key={c.summary} className="rounded-xl border border-dashed border-amber/60 p-4 text-sm leading-relaxed">
                    <span className="mr-1 font-mono text-amber">≠</span>
                    <CitedText text={c.summary} />
                    <Cite ids={c.evidence} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-10">
          {/* Mitigations */}
          {report.mitigations.length > 0 && (
            <div>
              <Heading note="if you proceed">Deal protections</Heading>
              <ol className="space-y-3">
                {report.mitigations.map((m, i) => (
                  <li key={m.action} className="flex gap-3 text-sm leading-relaxed">
                    <span className="font-serif text-xl leading-none text-red">{i + 1}</span>
                    <div>
                      <div>{m.action}</div>
                      {m.addresses && <div className="mt-0.5 text-xs text-muted">↳ {m.addresses}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div>
            <Heading>Strengths</Heading>
            <ul className="space-y-2 text-sm leading-relaxed">
              {report.strengths.map((s) => (
                <li key={s.point} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-green" />
                  <span>
                    {s.point}
                    <Evidence ids={s.evidence} />
                  </span>
                </li>
              ))}
              {report.strengths.length === 0 && <li className="text-muted">None evidenced.</li>}
            </ul>
          </div>

          {report.openQuestions.length > 0 && (
            <div>
              <Heading>Still to verify</Heading>
              <ul className="space-y-2 text-sm leading-relaxed">
                {report.openQuestions.map((q) => (
                  <li key={q} className="flex gap-2">
                    <span className="font-mono text-muted">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
