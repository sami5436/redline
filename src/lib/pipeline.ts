import { z } from "zod";
import { chatJson, type JsonCallResult } from "./nebius";
import { tavilySearch } from "./tavily";
import type { Claim, DiligenceEvent, PlannedQuery, Report, Source, StageId, Tier } from "./types";

type Emit = (e: DiligenceEvent) => void;

const DIMENSIONS = [
  "litigation & lawsuits",
  "regulatory & enforcement actions",
  "financial health & funding",
  "leadership & governance",
  "security incidents & data breaches",
  "customer complaints & reviews",
  "recent news & strategic changes",
] as const;

const MAX_SOURCES = 24;
const EXTRACT_CONCURRENCY = 6;

// ---------- schemas (lenient: models drift, the UI must not crash) ----------

const PlanSchema = z.object({
  entity_type: z.string().catch("organization"),
  canonical_name: z.string(),
  queries: z
    .array(z.object({ dimension: z.string(), query: z.string().min(3) }))
    .min(3)
    .max(10),
});

const SignalSchema = z.enum(["red", "amber", "green", "neutral"]).catch("neutral");

const ExtractSchema = z.object({
  about_subject: z.boolean().catch(true),
  claims: z
    .array(
      z.object({
        text: z.string().min(8),
        category: z.string().catch("other"),
        signal: SignalSchema,
        date: z.string().nullish(),
      }),
    )
    .max(6)
    .catch([]),
});

const JudgeSchema = z.object({
  risk_score: z.coerce.number().min(0).max(100),
  verdict: z.string(),
  summary: z.string(),
  red_flags: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(["high", "medium", "low"]).catch("medium"),
        explanation: z.string(),
        evidence: z.array(z.string()).catch([]),
      }),
    )
    .catch([]),
  strengths: z.array(z.object({ point: z.string(), evidence: z.array(z.string()).catch([]) })).catch([]),
  open_questions: z.array(z.string()).catch([]),
});

// ---------- helpers ----------

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function record<T>(emit: Emit, stage: StageId, tier: Tier, r: JsonCallResult<T>): T {
  emit({
    type: "call",
    call: {
      stage,
      tier,
      model: r.model,
      ms: r.ms,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
    },
  });
  return r.data;
}

// ---------- stages ----------

async function plan(subject: string, context: string, emit: Emit) {
  const system = `You are a senior due-diligence analyst. Plan web research to uncover risks about a subject.
Cover these dimensions: ${DIMENSIONS.join("; ")}.
Write 7 precise web search queries (one per dimension). Use the subject's full legal or common name, add disambiguating terms (industry, country) when the name is ambiguous, and prefer queries that surface primary evidence (court filings, regulator orders, breach disclosures, earnings).
Respond with JSON: {"entity_type": "company|startup|nonprofit|person|product|other", "canonical_name": string, "queries": [{"dimension": string, "query": string}]}`;
  const user = `Subject: ${subject}\nWhy we're vetting it: ${context || "general due diligence before doing business"}`;
  return record(emit, "plan", "super", await chatJson("super", system, user, (raw) => PlanSchema.parse(raw)));
}

async function search(queries: PlannedQuery[]): Promise<Source[]> {
  const results = await Promise.all(
    queries.map(async (q) => {
      const isNews = /news|recent/i.test(q.dimension);
      const hits = await tavilySearch(q.query, { maxResults: 5, topic: isNews ? "news" : "general" }).catch(() => []);
      return hits.map((h) => ({ ...h, dimension: q.dimension }));
    }),
  );
  // Interleave across dimensions so one noisy query can't crowd out the rest.
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (let rank = 0; rank < 5 && sources.length < MAX_SOURCES; rank++) {
    for (const hits of results) {
      const h = hits[rank];
      if (!h || seen.has(h.url) || sources.length >= MAX_SOURCES) continue;
      seen.add(h.url);
      sources.push({
        id: `S${sources.length + 1}`,
        url: h.url,
        title: h.title,
        content: h.content.slice(0, 3000),
        published: h.published_date,
        dimension: h.dimension,
        score: h.score,
      });
    }
  }
  return sources;
}

async function extract(subject: string, sources: Source[], emit: Emit): Promise<Claim[]> {
  const system = `You extract verifiable factual claims about a specific subject from one web source, for a due-diligence file.
Rules:
- Only claims explicitly stated in the source text about the subject. No inference, no outside knowledge.
- If the source is about a different entity with a similar name, set "about_subject": false and return no claims.
- Each claim is one self-contained sentence with concrete specifics (amounts, dates, agencies, counterparties).
- signal: "red" = serious risk (fraud, enforcement, lawsuit, breach, insolvency), "amber" = caution (layoffs, complaints, leadership churn, losses), "green" = positive evidence (audits passed, profitability, certifications), "neutral" = context.
- At most 5 claims, most diligence-relevant first.
Respond with JSON: {"about_subject": boolean, "claims": [{"text": string, "category": string, "signal": "red|amber|green|neutral", "date": string|null}]}`;

  let counter = 0;
  const perSource = await pool(sources, EXTRACT_CONCURRENCY, async (src) => {
    const user = `Subject: ${subject}\nSource ${src.id}: ${src.title}\nURL: ${src.url}\nPublished: ${src.published ?? "unknown"}\n---\n${src.content}`;
    try {
      const data = record(
        emit,
        "extract",
        "nano",
        await chatJson("nano", system, user, (raw) => ExtractSchema.parse(raw), { maxTokens: 1024, temperature: 0 }),
      );
      const claims: Claim[] = data.about_subject
        ? data.claims.map((c) => ({
            id: `C${++counter}`,
            sourceId: src.id,
            text: c.text,
            category: c.category,
            signal: c.signal,
            date: c.date ?? undefined,
          }))
        : [];
      emit({ type: "claims", sourceId: src.id, claims });
      return claims;
    } catch {
      emit({ type: "claims", sourceId: src.id, claims: [] });
      return [];
    }
  });
  return perSource.flat();
}

async function judge(subject: string, context: string, entityType: string, claims: Claim[], emit: Emit): Promise<Report> {
  const system = `You are the head of risk at an investment and procurement firm. You receive a file of claims extracted from web sources about a subject, each with an id like C12.
Produce a diligence verdict.
Rules:
- Every red flag and strength MUST cite claim ids from the file in "evidence". Never cite ids that are not in the file.
- Weigh severity, recency, corroboration across independent sources, and relevance to the stated purpose. Corroborated, recent, high-severity issues dominate.
- Merge duplicate claims into one flag. Do not inflate minor issues; say so if the record is clean.
- open_questions: what a careful analyst would still need to verify (things the sources could not settle).
- risk_score: 0 = no concerns, 30 = normal business noise, 60 = proceed only with mitigations, 85+ = walk away.
- verdict: one short line, e.g. "Proceed with standard terms" or "Do not proceed without escrow and audit rights".
Respond with JSON: {"risk_score": number, "verdict": string, "summary": string (3-4 sentences), "red_flags": [{"title": string, "severity": "high|medium|low", "explanation": string, "evidence": [claim ids]}], "strengths": [{"point": string, "evidence": [claim ids]}], "open_questions": [string]}`;
  const file = claims.map((c) => `${c.id} [${c.signal}] [${c.category}]${c.date ? ` (${c.date})` : ""} ${c.text} — ${c.sourceId}`).join("\n");
  const user = `Subject: ${subject} (${entityType})\nPurpose: ${context || "general due diligence"}\n\nClaims file (${claims.length} claims):\n${file || "(no claims found)"}`;

  const data = record(
    emit,
    "judge",
    "ultra",
    await chatJson("ultra", system, user, (raw) => JudgeSchema.parse(raw), { maxTokens: 4096, temperature: 0.1 }),
  );

  // Verifier: strip any citation the judge invented; drop flags left with no evidence.
  const valid = new Set(claims.map((c) => c.id));
  let dropped = 0;
  const keep = (ids: string[]) => {
    const ok = ids.map((id) => id.trim().toUpperCase()).filter((id) => valid.has(id));
    dropped += ids.length - ok.length;
    return [...new Set(ok)];
  };
  const redFlags = data.red_flags
    .map((f) => ({ ...f, evidence: keep(f.evidence) }))
    .filter((f) => f.evidence.length > 0);
  const strengths = data.strengths
    .map((s) => ({ ...s, evidence: keep(s.evidence) }))
    .filter((s) => s.evidence.length > 0);

  return {
    subject,
    entityType,
    riskScore: Math.round(data.risk_score),
    verdict: data.verdict,
    summary: data.summary,
    redFlags,
    strengths,
    openQuestions: data.open_questions,
    droppedCitations: dropped,
  };
}

// ---------- orchestration ----------

export async function runDiligence(subject: string, context: string, emit: Emit) {
  emit({ type: "stage", stage: "plan", status: "running" });
  const p = await plan(subject, context, emit);
  emit({ type: "plan", entityType: p.entity_type, canonicalName: p.canonical_name, queries: p.queries });
  emit({ type: "stage", stage: "plan", status: "done", detail: `${p.queries.length} queries` });

  emit({ type: "stage", stage: "search", status: "running" });
  const sources = await search(p.queries);
  emit({ type: "sources", sources });
  emit({ type: "stage", stage: "search", status: "done", detail: `${sources.length} sources` });
  if (!sources.length) throw new Error("Tavily returned no sources for this subject");

  emit({ type: "stage", stage: "extract", status: "running" });
  const claims = await extract(p.canonical_name, sources, emit);
  emit({ type: "stage", stage: "extract", status: "done", detail: `${claims.length} claims` });

  emit({ type: "stage", stage: "judge", status: "running" });
  const report = await judge(p.canonical_name, context, p.entity_type, claims, emit);
  emit({ type: "report", report });
  emit({ type: "stage", stage: "judge", status: "done", detail: `risk ${report.riskScore}/100` });
}
