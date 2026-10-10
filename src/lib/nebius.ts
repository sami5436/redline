import OpenAI from "openai";
import type { Tier } from "./types";

const BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1";

let client: OpenAI | null = null;
function tokenFactory() {
  if (!process.env.NEBIUS_API_KEY) throw new Error("NEBIUS_API_KEY is not set");
  client ??= new OpenAI({ apiKey: process.env.NEBIUS_API_KEY, baseURL: BASE_URL });
  return client;
}

// Explicit env overrides win; otherwise resolve the newest matching Nemotron
// from Token Factory's live model list so IDs never go stale.
const ENV_MODEL: Record<Tier, string | undefined> = {
  nano: process.env.MODEL_NANO,
  super: process.env.MODEL_SUPER,
  ultra: process.env.MODEL_ULTRA,
};
const PATTERN: Record<Tier, RegExp> = {
  nano: /nemotron.*nano/i,
  super: /nemotron.*super/i,
  ultra: /nemotron.*ultra/i,
};

let resolved: Promise<Record<Tier, string>> | null = null;
export function models(): Promise<Record<Tier, string>> {
  resolved ??= (async () => {
    const need = (Object.keys(PATTERN) as Tier[]).filter((t) => !ENV_MODEL[t]);
    let ids: string[] = [];
    if (need.length) {
      const list = await tokenFactory().models.list();
      for await (const m of list) ids.push(m.id);
      // Prefer Nemotron 3 family, skip vision/omni/embedding variants.
      ids = ids
        .filter((id) => !/vl|omni|embed|reward|guard/i.test(id))
        .sort((a, b) => Number(/nemotron-?3/i.test(b)) - Number(/nemotron-?3/i.test(a)));
    }
    const out = {} as Record<Tier, string>;
    for (const tier of Object.keys(PATTERN) as Tier[]) {
      const pick = ENV_MODEL[tier] ?? ids.find((id) => PATTERN[tier].test(id));
      if (!pick) throw new Error(`No Nemotron ${tier} model found on Token Factory; set MODEL_${tier.toUpperCase()}`);
      out[tier] = pick;
    }
    return out;
  })().catch((err) => {
    resolved = null;
    throw err;
  });
  return resolved;
}

export interface JsonCallResult<T> {
  data: T;
  model: string;
  ms: number;
  promptTokens: number;
  completionTokens: number;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Model returned no JSON object");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export async function chatJson<T>(
  tier: Tier,
  system: string,
  user: string,
  parse: (raw: unknown) => T,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<JsonCallResult<T>> {
  const model = (await models())[tier];
  const started = Date.now();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await tokenFactory().chat.completions.create({
        model,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
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
    }
  }
  throw lastErr;
}
