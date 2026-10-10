export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
  published_date?: string;
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; topic?: "general" | "news" } = {},
): Promise<TavilyResult[]> {
  if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      topic: opts.topic ?? "general",
      search_depth: "advanced",
      chunks_per_source: 3,
      max_results: opts.maxResults ?? 5,
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { results?: TavilyResult[] };
  return body.results ?? [];
}
