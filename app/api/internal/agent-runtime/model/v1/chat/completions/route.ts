import { z } from "zod";
import { requestRuntimeModel, runtimeChatCompletion } from "@/lib/server/agent-os/openclaw-model-gateway";
import { verifyOpenClawRuntimeBearer } from "@/lib/server/agent-os/openclaw-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "developer"]),
  content: z.string().trim().min(1).max(24_000),
});

const requestSchema = z.object({
  model: z.string().trim().min(1).max(180).default("altum-agent"),
  messages: z.array(messageSchema).min(1).max(80),
  max_tokens: z.number().int().min(1).max(8_000).optional(),
  max_completion_tokens: z.number().int().min(1).max(8_000).optional(),
  stream: z.literal(false).optional(),
});

function error(message: string, status: number, type: string) {
  return Response.json({ error: { message, type } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Private OpenAI-compatible endpoint used only by the OpenClaw runtime. */
export async function POST(request: Request) {
  const secret = process.env.ALTUM_OPENCLAW_SHARED_SECRET?.trim() || "";
  if (!verifyOpenClawRuntimeBearer(request.headers.get("authorization"), secret)) {
    return error("Runtime não autorizado.", 401, "authentication_error");
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Pedido de modelo inválido.", 400, "invalid_request_error");
  if (parsed.data.stream) return error("Streaming ainda não é suportado pelo gateway interno.", 400, "invalid_request_error");

  try {
    const result = await requestRuntimeModel({
      model: parsed.data.model,
      messages: parsed.data.messages,
      maxTokens: parsed.data.max_completion_tokens || parsed.data.max_tokens || 1_000,
    });
    return Response.json(runtimeChatCompletion(result), { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("[openclaw-model-gateway] model routing failed", cause instanceof Error ? cause.message : "unknown");
    return error("Nenhum modelo configurado respondeu no momento.", 503, "service_unavailable");
  }
}
