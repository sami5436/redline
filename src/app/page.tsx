"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { Claim, DiligenceEvent, ModelCall, PlannedQuery, Report, Source, StageId, Tier } from "@/lib/types";
import { EvidenceContext, type EvidenceIndex } from "@/components/evidence";
import { Ledger } from "@/components/ledger";
import { Pipeline, STAGES, type StageState } from "@/components/pipeline";
import { ReportView } from "@/components/report";
import { toMarkdown } from "@/lib/memo";

const EXAMPLES = [
  { subject: "Evolve Bank & Trust", context: "Choosing a banking-as-a-service partner for our fintech" },
  { subject: "Synapse Financial Technologies", context: "Evaluating a payments middleware vendor" },
  { subject: "CrowdStrike", context: "Renewing an endpoint security contract" },
  { subject: "FTX", context: "Considering a custody and trading counterparty" },
];

function initialStages(): Record<StageId, StageState> {
  return { plan: { status: "idle" }, search: { status: "idle" }, extract: { status: "idle" }, judge: { status: "idle" } };
}

export default function Home() {
  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState(initialStages);
  const [provider, setProvider] = useState<{ name: string; models: Record<Tier, string> } | null>(null);
  const [queries, setQueries] = useState<PlannedQuery[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [claims, setClaims] = useState<Record<string, Claim[]>>({});
  const [calls, setCalls] = useState<ModelCall[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const allClaims = useMemo(() => sources.flatMap((s) => claims[s.id] ?? []), [sources, claims]);
  const index = useMemo<EvidenceIndex>(() => {
    const c = new Map(allClaims.map((x) => [x.id, x]));
    const s = new Map(sources.map((x) => [x.id, x]));
    return { claim: (id) => c.get(id), source: (id) => s.get(id) };
  }, [allClaims, sources]);

  function handle(e: DiligenceEvent) {
    switch (e.type) {
      case "provider":
        setProvider({ name: e.name, models: e.models });
        break;
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
    const t0 = Date.now();
    setStartedAt(t0);
    setElapsed(0);
    const tick = setInterval(() => setElapsed(Date.now() - t0), 250);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
      clearInterval(tick);
      setElapsed(Date.now() - t0);
      setRunning(false);
    }
  }

  function exportMemo() {
    if (!report) return;
    const md = toMarkdown(report, index, provider?.name ?? "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${report.subject.replace(/[^\w]+/g, "-").toLowerCase()}-diligence.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const started = startedAt > 0;
  const read = Object.keys(claims).length;

  return (
    <EvidenceContext.Provider value={index}>
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-8">
        <nav className="flex items-center justify-between py-6">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="relative font-serif text-3xl leading-none">
              Redline
              <span className="absolute inset-x-0 top-1/2 h-[3px] -rotate-2 bg-red transition-transform group-hover:-rotate-3" />
            </span>
          </Link>
          <div className="flex items-center gap-4 font-mono text-[11px] text-muted">
            <span className="hidden sm:inline">Nemotron · Tavily</span>
            <a href="https://github.com/sami5436/redline" target="_blank" rel="noreferrer" className="hover:text-ink">
              GitHub ↗
            </a>
          </div>
        </nav>

        {/* Hero */}
        <header className={`transition-all ${started ? "pt-6" : "pt-14 sm:pt-24"}`}>
          {!started && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-red">Due diligence with receipts</p>
          )}
          <h1 className={`mt-3 max-w-4xl font-serif leading-[0.95] ${started ? "text-4xl" : "text-5xl sm:text-7xl"}`}>
            Know who you&apos;re <em className="text-red">really</em> dealing with.
          </h1>
          {!started && (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Name a company, vendor or counterparty. Redline investigates the live web, extracts every verifiable
              claim, and hands you a verdict where each red flag links to the source that proves it. No citation, no
              claim.
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
            className="mt-8 rounded-2xl border border-line bg-card p-2 shadow-[0_1px_0_var(--line),0_20px_50px_-30px_rgba(0,0,0,.35)]"
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
              <label className="rounded-xl px-3 py-2 focus-within:bg-paper">
                <span className="block font-mono text-[10px] uppercase tracking-[0.15em] text-muted">Who</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Company, vendor, person…"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted/60"
                />
              </label>
              <label className="rounded-xl px-3 py-2 focus-within:bg-paper sm:border-l sm:border-line">
                <span className="block font-mono text-[10px] uppercase tracking-[0.15em] text-muted">Why</span>
                <input
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. choosing a payments vendor"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted/60"
                />
              </label>
              <button
                disabled={running || !subject.trim()}
                className="rounded-xl bg-ink px-6 py-3 font-medium text-paper transition hover:bg-red disabled:opacity-30 disabled:hover:bg-ink"
              >
                {running ? `Investigating… ${(elapsed / 1000).toFixed(0)}s` : "Investigate →"}
              </button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-[11px] text-muted">Try</span>
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
                className="rounded-full border border-line px-3 py-1 text-[13px] transition hover:border-ink disabled:opacity-40"
              >
                {ex.subject}
              </button>
            ))}
          </div>
        </header>

        {/* How it works (landing only) */}
        {!started && (
          <section className="mt-20 sm:mt-28">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">How it works</p>
            <ol className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
              {STAGES.map((st, i) => (
                <li key={st.id} className="bg-card p-5">
                  <div className="font-mono text-[10px] text-muted">0{i + 1}</div>
                  <div className="mt-2 font-serif text-3xl">{st.label}</div>
                  <div className="mt-1 text-sm font-medium text-red">{st.engine}</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{st.blurb}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 grid gap-4 text-sm leading-relaxed text-muted sm:grid-cols-3">
              <p>
                <span className="text-ink">Right model, right job.</span> Around 25 fast Nano calls read sources in
                parallel; one Ultra call does the hard reasoning.
              </p>
              <p>
                <span className="text-ink">Citations are checked.</span> A verifier removes any claim ID the judge
                invents and drops flags left without evidence.
              </p>
              <p>
                <span className="text-ink">Built for decisions.</span> You get contradictions between sources and
                concrete deal protections, not just a summary.
              </p>
            </div>
          </section>
        )}

        <div ref={resultsRef} className="scroll-mt-4" />

        {error && (
          <div className="mt-6 rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm text-red">{error}</div>
        )}

        {started && (
          <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted">
              <span>{provider ? `Inference: ${provider.name}` : "Connecting…"}</span>
              <span>
                {(elapsed / 1000).toFixed(1)}s · {calls.length} model calls
              </span>
            </div>
            <Pipeline
              stages={stages}
              calls={calls}
              models={provider?.models ?? null}
              progress={{ read, total: sources.length }}
            />

            {queries.length > 0 && !report && (
              <div className="rise mt-6 rounded-2xl border border-line bg-card p-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">Research plan</div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {queries.map((q) => (
                    <li key={q.query} className="text-sm">
                      <span className="text-muted">{q.dimension}</span>
                      <div className="font-mono text-xs">{q.query}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {report && <ReportView report={report} claims={allClaims} sources={sources} onExport={exportMemo} />}

        {sources.length > 0 && <Ledger sources={sources} claims={claims} running={running} />}

        <footer className="mt-24 flex flex-wrap justify-between gap-2 border-t border-line pt-5 font-mono text-[11px] text-muted">
          <span>NVIDIA Nemotron · Nebius Token Factory · Tavily</span>
          <span>A research aid, not legal or financial advice.</span>
        </footer>
      </main>
    </EvidenceContext.Provider>
  );
}
