import OpenAI from "openai";
import type { Tier } from "./types";

// Any OpenAI-compatible endpoint serving NVIDIA Nemotron works. Nebius Token
// Factory is the primary target; NVIDIA's API catalog is a drop-in fallback.
const NEBIUS_URL = "https://api.tokenfactory.nebius.com/v1";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1";

function endpoint() {
  if (process.env.NEBIUS_API_KEY) {
    return { baseURL: process.env.NEBIUS_BASE_URL ?? NEBIUS_URL, apiKey: process.env.NEBIUS_API_KEY };
  }
  if (process.env.NVIDIA_API_KEY) {
    return { baseURL: process.env.NVIDIA_BASE_URL ?? NVIDIA_URL, apiKey: process.env.NVIDIA_API_KEY };
  }
  throw new Error("No model provider configured: set NEBIUS_API_KEY (or NVIDIA_API_KEY)");
}

export function providerName(): string {
  const { baseURL } = endpoint();
  if (baseURL.includes("nebius")) return "Nebius Token Factory";
  if (baseURL.includes("nvidia")) return "NVIDIA API Catalog";
  return new URL(baseURL).hostname;
}

let client: OpenAI | null = null;
function api() {
  client ??= new OpenAI({ ...endpoint(), maxRetries: 0 });
  return client;
}

// ---------- model routing ----------

const TIERS: Tier[] = ["nano", "super", "ultra"];
const ENV_MODEL: Record<Tier, string | undefined> = {
  nano: process.env.MODEL_NANO,
  super: process.env.MODEL_SUPER,
  ultra: process.env.MODEL_ULTRA,
};
const PATTERN: Record<Tier, RegExp> = {
  nano: /nemotron.*(nano|lightning)/i,
  super: /nemotron.*super/i,
  ultra: /nemotron.*ultra/i,
};
// When a tier is missing or overloaded, borrow from these tiers (in order).
const BORROW: Record<Tier, Tier[]> = { nano: ["super"], super: ["ultra", "nano"], ultra: ["super"] };

function rank(id: string) {
  // Prefer the Nemotron 3 family, "nano" over sibling small models, text-only over omni.
  return (/nemotron-?3/i.test(id) ? 100 : 0) + (/nano/i.test(id) ? 10 : 0) - (/omni/i.test(id) ? 5 : 0);
}

interface Routing {
  primary: Record<Tier, string>;
  candidates: Record<Tier, string[]>; // primary first, then same-tier siblings, then borrowed tiers
}

let routing: Promise<Routing> | null = null;
function route(): Promise<Routing> {
  routing ??= (async () => {
    let ids: string[] = [];
    try {
      for await (const m of await api().models.list()) ids.push(m.id);
    } catch (err) {
      if (TIERS.some((t) => !ENV_MODEL[t])) throw err;
    }
    ids = ids.filter((id) => !/vl\b|-vl|embed|reward|guard|safety|parse|retriever|rerank/i.test(id));
    ids.sort((a, b) => rank(b) - rank(a));

    const own = {} as Record<Tier, string[]>;
    for (const t of TIERS) {
      const listed = ids.filter((id) => PATTERN[t].test(id));
      own[t] = ENV_MODEL[t] ? [ENV_MODEL[t]!, ...listed.filter((id) => id !== ENV_MODEL[t])] : listed;
    }
    const primary = {} as Record<Tier, string>;
    const candidates = {} as Record<Tier, string[]>;
    for (const t of TIERS) {
      const all = [...own[t].slice(0, 2), ...BORROW[t].flatMap((b) => own[b].slice(0, 1))];
      if (!all.length) throw new Error(`No Nemotron ${t} model available; set MODEL_${t.toUpperCase()}`);
      primary[t] = all[0];
      candidates[t] = [...new Set(all)];
    }
    return { primary, candidates };
  })().catch((err) => {
    routing = null;
    throw err;
  });
  return routing;
}

export async function models(): Promise<Record<Tier, string>> {
  return (await route()).primary;
}

// ---------- calls ----------

export interface JsonCallResult<T> {
  data: T;
  model: string;
  ms: number;
  promptTokens: number;
  completionTokens: number;
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:json)?\s*|\s*```$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Model returned no JSON object");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

const status = (err: unknown) => (err as { status?: number })?.status;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One JSON-producing call with failover: on overload (429/5xx) or timeout it
 * backs off and moves to the next candidate model; on 400 it retries without
 * JSON mode / thinking flags; on unparseable output it retries once.
 */
export async function chatJson<T>(
  tier: Tier,
  system: string,
  user: string,
  parse: (raw: unknown) => T,
  opts: { maxTokens?: number; temperature?: number; think?: boolean; timeoutMs?: number } = {},
): Promise<JsonCallResult<T>> {
  const { candidates } = await route();
  const started = Date.now();
  const deadline = started + (opts.timeoutMs ?? 90_000);
  // Primary twice (transient overloads clear fast), then the alternates.
  const plan = [candidates[tier][0], ...candidates[tier]];
  let strict = true;
  let lastErr: unknown;

  for (let i = 0; i < plan.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    const model = plan[i];
    try {
      const res = await api().chat.completions.create(
        {
          model,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 2048,
          ...(strict ? { response_format: { type: "json_object" as const } } : {}),
          // @ts-expect-error chat_template_kwargs is a vLLM/NIM extension, not in the OpenAI types
          chat_template_kwargs: strict ? { enable_thinking: opts.think ?? false } : undefined,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
        { timeout: remaining },
      );
      const data = parse(extractJson(res.choices[0]?.message?.content ?? ""));
      return {
        data,
        model,
        ms: Date.now() - started,
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      lastErr = err;
      const code = status(err);
      if (code === 400) strict = false;
      else if (code === 401 || code === 403) break;
      else if (code === 429 || (code && code >= 500)) await sleep(400 * 2 ** i + Math.random() * 400);
    }
  }
  throw lastErr ?? new Error(`${tier} call timed out`);
}
