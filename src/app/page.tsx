"use client";

import { useMemo, useRef, useState } from "react";
import type { Claim, DiligenceEvent, ModelCall, PlannedQuery, Report, Source, StageId, Tier } from "@/lib/types";

const STAGES: { id: StageId; label: string; engine: string; tier?: Tier }[] = [
  { id: "plan", label: "Plan research", engine: "Nemotron Super", tier: "super" },
  { id: "search", label: "Search the web", engine: "Tavily" },
  { id: "extract", label: "Extract claims", engine: "Nemotron Nano", tier: "nano" },
  { id: "judge", label: "Judge risk", engine: "Nemotron Ultra", tier: "ultra" },
];

const EXAMPLES = [
  { subject: "Evolve Bank & Trust", context: "Evaluating as a banking-as-a-service partner for our fintech" },
  { subject: "Synapse Financial Technologies", context: "Considering as a payments middleware vendor" },
  { subject: "CrowdStrike", context: "Renewing an endpoint security contract" },
];

type StageState = { status: "idle" | "running" | "done"; detail?: string };

const SIGNAL_DOT: Record<Claim["signal"], string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  neutral: "bg-zinc-400",
};

const SEVERITY: Record<"high" | "medium" | "low", string> = {
  high: "border-red-500/60 bg-red-500/5",
  medium: "border-amber-500/60 bg-amber-500/5",
  low: "border-zinc-400/60 bg-zinc-500/5",
};

function riskTone(score: number) {
  if (score >= 70) return { text: "text-red-600 dark:text-red-400", bar: "bg-red-500" };
  if (score >= 40) return { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" };
  return { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
}

export default function Home() {
  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<StageId, StageState>>(initialStages());
  const [queries, setQueries] = useState<PlannedQuery[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [claims, setClaims] = useState<Record<string, Claim[]>>({});
  const [calls, setCalls] = useState<ModelCall[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const claimById = useMemo(() => {
    const m = new Map<string, Claim>();
    Object.values(claims).flat().forEach((c) => m.set(c.id, c));
    return m;
  }, [claims]);
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  function handle(e: DiligenceEvent) {
    switch (e.type) {
      case "stage":
        setStages((s) => ({ ...s, [e.stage]: { status: e.status, detail: e.detail } }));
        break;
      case "plan":
        setQueries(e.queries);
        break;
      case "sources":
        setSources(e.sources);
        break;
      case "claims":
        setClaims((c) => ({ ...c, [e.sourceId]: e.claims }));
        break;
      case "call":
        setCalls((c) => [...c, e.call]);
        break;
      case "report":
        setReport(e.report);
        break;
      case "error":
        setError(e.message);
        break;
    }
  }

  async function run(s = subject, c = context) {
    if (!s.trim() || running) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setError(null);
    setStages(initialStages());
    setQueries([]);
    setSources([]);
    setClaims({});
    setCalls([]);
    setReport(null);
    try {
      const res = await fetch("/api/diligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: s, context: c }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line));
      }
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const usage = useMemo(() => {
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
  }, [calls]);

  const started = running || sources.length > 0 || report || error;
  const extracted = Object.keys(claims).length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Red<span className="text-red-600">line</span>
          </h1>
          <span className="text-sm text-zinc-500">due diligence with receipts</span>
        </div>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Name a company, vendor or counterparty. Redline researches the live web, extracts every verifiable claim, and
          returns a risk verdict where each red flag links to the source that proves it.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Who are you vetting?"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Why? e.g. choosing a payments vendor"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <button
            disabled={running || !subject.trim()}
            className="rounded-lg bg-zinc-900 px-5 py-2 font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {running ? "Investigating…" : "Investigate"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="text-zinc-500">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex.subject}
              disabled={running}
              onClick={() => {
                setSubject(ex.subject);
                setContext(ex.context);
                run(ex.subject, ex.context);
              }}
              className="rounded-full border border-zinc-300 px-3 py-0.5 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {ex.subject}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {started && (
        <section className="mt-8">
          <ol className="grid gap-3 sm:grid-cols-4">
            {STAGES.map((st, i) => {
              const s = stages[st.id];
              const u = st.tier ? usage[st.tier] : null;
              return (
                <li
                  key={st.id}
                  className={`rounded-lg border p-3 text-sm transition ${
                    s.status === "running"
                      ? "border-zinc-900 dark:border-zinc-100"
                      : "border-zinc-200 dark:border-zinc-800"
                  } ${s.status === "idle" ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {i + 1}. {st.label}
                    </span>
                    {s.status === "running" && <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-900 dark:bg-zinc-100" />}
                    {s.status === "done" && <span className="text-emerald-600">✓</span>}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">{st.engine}</div>
                  <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {st.id === "extract" && s.status === "running"
                      ? `${extracted}/${sources.length} sources read`
                      : (s.detail ?? " ")}
                  </div>
                  {u && u.n > 0 && (
                    <div className="mt-1 font-mono text-[11px] text-zinc-500">
                      {u.n} call{u.n > 1 ? "s" : ""} · {u.tokens.toLocaleString()} tok · {(u.ms / 1000).toFixed(1)}s
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {queries.length > 0 && !report && (
            <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <div className="mb-2 font-medium">Research plan</div>
              <ul className="space-y-1">
                {queries.map((q) => (
                  <li key={q.query} className="flex gap-2">
                    <span className="w-48 shrink-0 text-zinc-500">{q.dimension}</span>
                    <span className="font-mono text-xs leading-5">{q.query}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {report && (
        <ReportView report={report} claimById={claimById} sourceById={sourceById} usage={usage} />
      )}

      {sources.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-lg font-semibold">Evidence ledger</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Every claim Nemotron Nano extracted, grouped by source. Off-topic sources (name collisions) are discarded.
          </p>
          <div className="space-y-3">
            {sources.map((src) => {
              const cs = claims[src.id];
              return (
                <div key={src.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-zinc-500">{src.id}</span>
                    <a href={src.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {src.title}
                    </a>
                    <span className="text-xs text-zinc-500">
                      {hostname(src.url)}
                      {src.published ? ` · ${src.published.slice(0, 16)}` : ""} · {src.dimension}
                    </span>
                  </div>
                  {cs === undefined ? (
                    <div className="mt-2 text-xs text-zinc-400">{running ? "reading…" : "not read"}</div>
                  ) : cs.length === 0 ? (
                    <div className="mt-2 text-xs text-zinc-400">no relevant claims</div>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {cs.map((c) => (
                        <li
                          key={c.id}
                          id={`claim-${c.id}`}
                          className="flex scroll-mt-24 gap-2 rounded px-1 target:bg-yellow-200/60 dark:target:bg-yellow-500/20"
                        >
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SIGNAL_DOT[c.signal]}`} />
                          <span className="font-mono text-xs leading-5 text-zinc-500">{c.id}</span>
                          <span>{c.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="mt-16 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        Built on NVIDIA Nemotron via Nebius Token Factory · web research by Tavily · not legal or financial advice.
      </footer>
    </main>
  );
}

function ReportView({
  report,
  claimById,
  sourceById,
  usage,
}: {
  report: Report;
  claimById: Map<string, Claim>;
  sourceById: Map<string, Source>;
  usage: Record<Tier, { n: number; tokens: number; ms: number; model: string }>;
}) {
  const tone = riskTone(report.riskScore);
  const Cite = ({ ids }: { ids: string[] }) => (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const c = claimById.get(id);
        const s = c ? sourceById.get(c.sourceId) : undefined;
        return (
          <a
            key={id}
            href={`#claim-${id}`}
            title={c ? `${c.text}\n— ${s?.title ?? c.sourceId}` : id}
            className="rounded bg-zinc-200 px-1.5 font-mono text-[11px] text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {id}
          </a>
        );
      })}
    </span>
  );

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-wide text-zinc-500">{report.entityType}</div>
          <h2 className="text-2xl font-semibold">{report.subject}</h2>
          <p className={`mt-1 text-lg font-medium ${tone.text}`}>{report.verdict}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-40">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-500">Risk</span>
              <span className={`text-3xl font-semibold tabular-nums ${tone.text}`}>{report.riskScore}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className={`h-2 rounded-full ${tone.bar}`} style={{ width: `${report.riskScore}%` }} />
            </div>
          </div>
          <button
            onClick={() => download(report, claimById, sourceById)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export .md
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-3xl leading-relaxed text-zinc-700 dark:text-zinc-300">{report.summary}</p>

      <div className="mt-6 grid gap-6 md:grid-cols-[1.6fr_1fr]">
        <div>
          <h3 className="mb-3 font-semibold">Red flags ({report.redFlags.length})</h3>
          {report.redFlags.length === 0 && <p className="text-sm text-zinc-500">No evidenced red flags found.</p>}
          <div className="space-y-3">
            {report.redFlags.map((f) => (
              <div key={f.title} className={`rounded-lg border-l-4 p-3 ${SEVERITY[f.severity]}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{f.severity}</span>
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {f.explanation}
                  <Cite ids={f.evidence} />
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 font-semibold">Strengths</h3>
            <ul className="space-y-2 text-sm">
              {report.strengths.map((s) => (
                <li key={s.point} className="text-zinc-700 dark:text-zinc-300">
                  {s.point}
                  <Cite ids={s.evidence} />
                </li>
              ))}
              {report.strengths.length === 0 && <li className="text-zinc-500">None evidenced.</li>}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Still to verify</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {report.openQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 font-mono text-[11px] text-zinc-500 dark:border-zinc-800">
            {(["super", "nano", "ultra"] as Tier[]).map((t) => (
              <div key={t}>
                {usage[t].model || t}: {usage[t].n}× · {usage[t].tokens.toLocaleString()} tok
              </div>
            ))}
            <div className="mt-1">
              citation verifier removed {report.droppedCitations} unsupported reference
              {report.droppedCitations === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function initialStages(): Record<StageId, StageState> {
  return { plan: { status: "idle" }, search: { status: "idle" }, extract: { status: "idle" }, judge: { status: "idle" } };
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function download(report: Report, claimById: Map<string, Claim>, sourceById: Map<string, Source>) {
  const cited = new Set([...report.redFlags.flatMap((f) => f.evidence), ...report.strengths.flatMap((s) => s.evidence)]);
  const cite = (ids: string[]) => ids.map((id) => `[${id}]`).join("");
  const md = [
    `# Diligence report: ${report.subject}`,
    `**Risk ${report.riskScore}/100** — ${report.verdict}`,
    "",
    report.summary,
    "",
    "## Red flags",
    ...report.redFlags.map((f) => `- **[${f.severity}] ${f.title}** — ${f.explanation} ${cite(f.evidence)}`),
    "",
    "## Strengths",
    ...report.strengths.map((s) => `- ${s.point} ${cite(s.evidence)}`),
    "",
    "## Still to verify",
    ...report.openQuestions.map((q) => `- ${q}`),
    "",
    "## Evidence",
    ...[...cited].map((id) => {
      const c = claimById.get(id);
      const s = c && sourceById.get(c.sourceId);
      return `- **${id}** ${c?.text ?? ""} — [${s?.title ?? c?.sourceId}](${s?.url ?? ""})`;
    }),
    "",
    "_Generated by Redline · NVIDIA Nemotron on Nebius Token Factory · Tavily_",
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  a.download = `${report.subject.replace(/[^\w]+/g, "-").toLowerCase()}-diligence.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
