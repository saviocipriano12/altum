import { normalizeFreeLlmApiUrl } from "@/lib/server/agent-os/freellmapi";

export type OpenJevQuestion = { type: "noul"; instructions: string; criteria?: { true: string; false: string } } | { type: "choice"; instructions: string; criteria: Record<string, string> } | { type: "score"; instructions: string; criteria: string[] };

export function normalizeOpenJevUrl(value: unknown) { return normalizeFreeLlmApiUrl(value); }

export async function probeOpenJev(value: unknown, apiKey?: string) {
  const baseUrl = normalizeOpenJevUrl(value);
  const response = await fetch(`${baseUrl}/v1/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined, cache: "no-store", signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new Error(`openjev_unhealthy_${response.status}`);
  const body = await response.json().catch(() => ({})) as { data?: unknown[] };
  return { baseUrl, modelCount: Array.isArray(body.data) ? body.data.length : 0 };
}

export async function decideWithOpenJev(input: { baseUrl: string; apiKey?: string; state: string; questions: Record<string, OpenJevQuestion>; model?: string }) {
  const baseUrl = normalizeOpenJevUrl(input.baseUrl);
  const response = await fetch(`${baseUrl}/v1/systemone`, { method: "POST", headers: { "Content-Type": "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) }, signal: AbortSignal.timeout(20_000), body: JSON.stringify({ model: input.model || "openjev-latest", state: input.state.slice(0, 16_000), questions: input.questions }) });
  const payload = await response.json().catch(() => ({})) as { answers?: Record<string, unknown>; model?: unknown; usage?: unknown; error?: { message?: unknown } };
  if (!response.ok || !payload.answers) throw new Error(typeof payload.error?.message === "string" ? `openjev_failed_${payload.error.message.slice(0, 180)}` : `openjev_failed_${response.status}`);
  return { model: typeof payload.model === "string" ? payload.model : "openjev-latest", answers: payload.answers, usage: payload.usage || null };
}
