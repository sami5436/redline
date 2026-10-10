export type Tier = "super" | "nano" | "ultra";

export type StageId = "plan" | "search" | "extract" | "judge";

export type Signal = "red" | "amber" | "green" | "neutral";

export interface PlannedQuery {
  dimension: string;
  query: string;
}

export interface Source {
  id: string; // S1, S2, ...
  url: string;
  title: string;
  content: string;
  published?: string;
  dimension: string;
  score: number;
}

export interface Claim {
  id: string; // C1, C2, ...
  sourceId: string;
  text: string;
  category: string;
  signal: Signal;
  date?: string;
}

export interface RedFlag {
  title: string;
  severity: "high" | "medium" | "low";
  explanation: string;
  evidence: string[]; // claim ids, verified to exist
  corroboration: number; // distinct domains behind the evidence
}

export interface Contradiction {
  summary: string;
  evidence: string[];
}

export interface Mitigation {
  action: string;
  addresses: string; // red flag title
}

export interface Report {
  subject: string;
  entityType: string;
  riskScore: number; // 0 (clean) – 100 (walk away)
  verdict: string;
  summary: string;
  redFlags: RedFlag[];
  strengths: { point: string; evidence: string[] }[];
  contradictions: Contradiction[];
  mitigations: Mitigation[];
  openQuestions: string[];
  droppedCitations: number; // citations the judge model invented, removed by verifier
}

export interface ModelCall {
  stage: StageId;
  tier: Tier;
  model: string;
  ms: number;
  promptTokens: number;
  completionTokens: number;
}

export type DiligenceEvent =
  | { type: "provider"; name: string; models: Record<Tier, string> }
  | { type: "stage"; stage: StageId; status: "running" | "done"; detail?: string }
  | { type: "plan"; entityType: string; canonicalName: string; queries: PlannedQuery[] }
  | { type: "sources"; sources: Source[] }
  | { type: "claims"; sourceId: string; claims: Claim[] }
  | { type: "call"; call: ModelCall }
  | { type: "report"; report: Report }
  | { type: "error"; message: string };
