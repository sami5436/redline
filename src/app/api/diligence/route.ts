import { runDiligence } from "@/lib/pipeline";
import type { DiligenceEvent } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { subject?: string; context?: string };
  const subject = body.subject?.trim().slice(0, 200);
  const context = body.context?.trim().slice(0, 500) ?? "";
  if (!subject) return Response.json({ error: "subject is required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: DiligenceEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runDiligence(subject, context, emit);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
