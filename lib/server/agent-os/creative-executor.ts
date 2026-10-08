import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { RouteAuthError } from "@/app/lib/server/route-auth";
import { signedStorageReadUrl } from "@/lib/server/firebase-storage";
import { routeCreativeModel } from "@/lib/server/agent-os/creative-model-router";

export type CreativeJob = {
  id: string;
  capability: string;
  format: string;
  prompt: string;
  tenantId: string;
  projectId: string;
  outputId: string;
  creativeModel?: unknown;
  identityReferenceId?: unknown;
  sourceImageStoragePath?: unknown;
};

export type MediaConnection = {
  providerId?: unknown;
  displayName?: unknown;
  baseUrl?: unknown;
  credential?: unknown;
  creativeModel?: unknown;
  connectionType?: unknown;
};

export type CreativeExecutionResult = {
  providerJobId: string | null;
  providerStatusUrl: string | null;
  assetUrl: string | null;
  status: "submitted" | "completed";
};

export type CreativeExecutionAttempt = {
  connectionId: string;
  providerId: string;
  status: "started" | "failed" | "submitted" | "completed";
  reason?: string;
};

export type RoutedCreativeExecutionResult = CreativeExecutionResult & {
  connectionId: string;
  providerId: string;
  attempts: CreativeExecutionAttempt[];
};

export function creativeExecutorEndpoint(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteAuthError(409, "media_endpoint_missing", "A conexão de mídia precisa de uma URL de executor para rodar este job.");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new RouteAuthError(400, "media_endpoint_invalid", "A URL do executor de mídia é inválida."); }
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new RouteAuthError(400, "media_endpoint_unsafe", "O executor de mídia deve usar HTTPS, exceto um serviço local em localhost.");
  }
  return url.toString();
}

function optionalUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch { return null; }
}

function providerId(connection: MediaConnection) {
  return typeof connection.providerId === "string" ? connection.providerId.trim().toLowerCase() : "";
}

function configuredModel(connection: MediaConnection, fallback: string) {
  return typeof connection.creativeModel === "string" && /^[a-z0-9][a-z0-9_./-]{2,180}$/i.test(connection.creativeModel)
    ? connection.creativeModel : fallback;
}

export function outputUrl(value: unknown): string | null {
  const direct = optionalUrl(value);
  if (direct) return direct;
  if (Array.isArray(value)) return value.map(outputUrl).find((item): item is string => Boolean(item)) || null;
  if (value && typeof value === "object") {
    for (const key of ["url", "video", "video_url", "image", "image_url", "audio", "audio_url", "output", "data", "images"]) {
      const found = outputUrl((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return null;
}

export function alibabaApiRoot(value: unknown) {
  const baseUrl = creativeExecutorEndpoint(value);
  const url = new URL(baseUrl);
  return `${url.origin}/api/v1`;
}

function providerError(payload: Record<string, unknown>, fallback: string) {
  const value = payload.detail || payload.error || payload.message;
  return typeof value === "string" && value.trim() ? value.slice(0, 500) : fallback;
}

async function executeFal(job: CreativeJob, connection: MediaConnection, credential: string): Promise<CreativeExecutionResult> {
  const baseUrl = creativeExecutorEndpoint(connection.baseUrl).replace(/\/$/, "");
  const model = configuredModel({ ...connection, creativeModel: job.creativeModel || connection.creativeModel }, job.format === "video" ? "bytedance/seedance-2.0/text-to-video" : "fal-ai/flux-2/klein/9b");
  const body: Record<string, unknown> = { prompt: job.prompt };
  if (model === "higgsfield-ai/soul/v2/standard" && typeof job.identityReferenceId === "string" && /^[A-Za-z0-9-]{20,80}$/.test(job.identityReferenceId)) {
    body.custom_reference_id = job.identityReferenceId;
    body.custom_reference_strength = 1;
  }
  const response = await fetch(`${baseUrl}/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${credential}` },
    // Keep the first provider call to the common prompt-only contract. The
    // provider-specific adapter can add inspected schema fields later without
    // guessing duration, ratio, or image-size parameter names.
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(502, "fal_generation_failed", providerError(payload, "A fal não aceitou a geração."));
  const assetUrl = outputUrl(payload);
  return {
    providerJobId: typeof payload.request_id === "string" ? payload.request_id : null,
    providerStatusUrl: optionalUrl(payload.status_url) || optionalUrl(payload.response_url),
    assetUrl,
    status: assetUrl ? "completed" : "submitted",
  };
}

async function executeReplicate(job: CreativeJob, connection: MediaConnection, credential: string): Promise<CreativeExecutionResult> {
  const baseUrl = creativeExecutorEndpoint(connection.baseUrl).replace(/\/$/, "");
  const model = configuredModel(connection, "bytedance/seedance-1-pro").split("/");
  if (model.length !== 2) throw new RouteAuthError(400, "replicate_model_invalid", "O modelo padrão da conexão Replicate é inválido.");
  const response = await fetch(`${baseUrl}/models/${model[0]}/${model[1]}/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}`, Prefer: "wait=10" },
    body: JSON.stringify({ input: { prompt: job.prompt } }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(502, "replicate_generation_failed", providerError(payload, "A Replicate não aceitou a geração."));
  const status = String(payload.status || "").toLowerCase();
  const assetUrl = outputUrl(payload.output);
  if (!assetUrl && ["succeeded", "successful", "completed", "failed", "canceled", "cancelled"].includes(status)) {
    throw new RouteAuthError(502, "replicate_output_missing", "A Replicate encerrou a geração sem retornar um arquivo utilizável.");
  }
  const urls = payload.urls && typeof payload.urls === "object" ? payload.urls as Record<string, unknown> : {};
  return {
    providerJobId: typeof payload.id === "string" ? payload.id : null,
    providerStatusUrl: optionalUrl(urls.get),
    assetUrl,
    // A completed provider task without a usable asset must not be delivered
    // as a successful render. Keep polling only while truly in progress.
    status: assetUrl ? "completed" : "submitted",
  };
}

/** Higgsfield uses the same asynchronous request shape as fal, but authenticates
 * with `Authorization: Key <complete key>` and has its own API hostname. */
async function executeHiggsfield(job: CreativeJob, connection: MediaConnection, credential: string): Promise<CreativeExecutionResult> {
  const baseUrl = creativeExecutorEndpoint(connection.baseUrl).replace(/\/$/, "");
  const model = configuredModel({ ...connection, creativeModel: job.creativeModel || connection.creativeModel }, job.format === "video" ? "bytedance/seedance-2.0/text-to-video" : "higgsfield-ai/soul/standard");
  const body: Record<string, unknown> = { prompt: job.prompt };
  // This is an intentionally narrow adapter for the documented Seedance image
  // to video endpoint. The source is kept private in Altum; the provider gets a
  // short-lived signed read URL only while executing this already-approved job.
  if (model === "bytedance/seedance-2.5/image-to-video") {
    const storagePath = typeof job.sourceImageStoragePath === "string" ? job.sourceImageStoragePath : "";
    const expectedPrefix = `agent-media/${job.tenantId}/`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
      throw new RouteAuthError(409, "video_source_missing", "A imagem-base privada necessária para animar este vídeo não está disponível.");
    }
    const imageUrl = await signedStorageReadUrl(storagePath);
    if (!imageUrl) throw new RouteAuthError(409, "video_source_unavailable", "Não foi possível liberar a imagem-base para a geração do vídeo.");
    body.image_url = imageUrl;
    body.duration = 5;
    body.resolution = "720p";
    body.output_format = "mp4";
    body.generate_audio = true;
  }
  if (model === "higgsfield-ai/soul/v2/standard" && typeof job.identityReferenceId === "string" && /^[A-Za-z0-9-]{20,80}$/.test(job.identityReferenceId)) {
    body.custom_reference_id = job.identityReferenceId;
    body.custom_reference_strength = 1;
  }
  const response = await fetch(`${baseUrl}/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${credential}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(502, "higgsfield_generation_failed", providerError(payload, "O Higgsfield não aceitou a geração."));
  const assetUrl = outputUrl(payload);
  return {
    providerJobId: typeof payload.request_id === "string" ? payload.request_id : null,
    providerStatusUrl: optionalUrl(payload.status_url) || (typeof payload.request_id === "string" ? `${baseUrl}/requests/${encodeURIComponent(payload.request_id)}/status` : null),
    assetUrl,
    status: assetUrl ? "completed" : "submitted",
  };
}

/**
 * Qwen Image implements the OpenAI Images contract at Model Studio's
 * compatible-mode base URL. This is intentionally a dedicated adapter rather
 * than treating every OpenAI-compatible text API as a media provider.
 */
async function executeAlibabaImage(job: CreativeJob, connection: MediaConnection, credential: string): Promise<CreativeExecutionResult> {
  const baseUrl = creativeExecutorEndpoint(connection.baseUrl).replace(/\/$/, "");
  const model = configuredModel({ ...connection, creativeModel: job.creativeModel || connection.creativeModel }, "qwen-image-3.0");
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
    body: JSON.stringify({ model, prompt: job.prompt, n: 1, prompt_extend: true, ...(model.startsWith("qwen-image-3.0") ? { enable_thinking: true } : {}) }),
    cache: "no-store",
    // The documented synchronous image endpoint may legitimately take longer
    // than an ordinary chat completion.
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(502, "alibaba_image_generation_failed", providerError(payload, "O Alibaba Model Studio não aceitou a geração de imagem."));
  const assetUrl = outputUrl(payload.data) || outputUrl(payload.output) || outputUrl(payload);
  if (!assetUrl) throw new RouteAuthError(502, "alibaba_image_missing", "O Alibaba Model Studio concluiu a solicitação sem retornar uma imagem utilizável.");
  return {
    providerJobId: response.headers.get("x-request-id") || null,
    providerStatusUrl: null,
    assetUrl,
    status: "completed",
  };
}

/** Wan's video endpoint is intentionally separate from OpenAI-compatible
 * chat/images: it creates an asynchronous task, which the media worker polls
 * through the documented /api/v1/tasks/{taskId} endpoint. */
async function executeAlibabaVideo(job: CreativeJob, connection: MediaConnection, credential: string): Promise<CreativeExecutionResult> {
  const apiRoot = alibabaApiRoot(connection.baseUrl);
  const model = configuredModel({ ...connection, creativeModel: job.creativeModel || connection.creativeModel }, "wan2.7-t2v");
  const response = await fetch(`${apiRoot}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}`, "X-DashScope-Async": "enable" },
    body: JSON.stringify({
      model,
      input: { prompt: job.prompt.slice(0, 5_000) },
      // Cost-bearing values remain deliberately conservative. The person has
      // already approved the job, and can ask for a premium variant after
      // reviewing this first delivery.
      parameters: { resolution: "720P", ratio: "9:16", duration: 5, prompt_extend: true, watermark: false },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(502, "alibaba_video_generation_failed", providerError(payload, "O Alibaba Model Studio não aceitou a geração de vídeo."));
  const output = payload.output && typeof payload.output === "object" ? payload.output as Record<string, unknown> : {};
  const taskId = typeof output.task_id === "string" ? output.task_id : "";
  if (!taskId || !/^[A-Za-z0-9_-]{8,200}$/.test(taskId)) {
    throw new RouteAuthError(502, "alibaba_video_task_missing", "O Alibaba Model Studio aceitou a solicitação sem retornar um identificador de tarefa utilizável.");
  }
  return {
    providerJobId: taskId,
    providerStatusUrl: `${apiRoot}/tasks/${encodeURIComponent(taskId)}`,
    assetUrl: outputUrl(output),
    status: outputUrl(output) ? "completed" : "submitted",
  };
}

export async function executeCreativeJob(job: CreativeJob, connection: MediaConnection): Promise<CreativeExecutionResult> {
  const credential = decryptSecret(connection.credential);
  if (!credential) throw new RouteAuthError(409, "media_credential_missing", "A conexão de mídia não tem uma chave salva.");
  if (providerId(connection) === "fal") return executeFal(job, connection, credential);
  if (providerId(connection) === "replicate") return executeReplicate(job, connection, credential);
  if (providerId(connection) === "higgsfield") return executeHiggsfield(job, connection, credential);
  if (providerId(connection) === "alibaba-model-studio") return job.format === "video"
    ? executeAlibabaVideo(job, connection, credential)
    : executeAlibabaImage(job, connection, credential);
  const url = creativeExecutorEndpoint(connection.baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Altum-Creative-Version": "1",
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify({
      jobId: job.id,
      providerId: String(connection.providerId || ""),
      capability: job.capability,
      format: job.format,
      prompt: job.prompt,
      context: { tenantId: job.tenantId, projectId: job.projectId, outputId: job.outputId },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error.slice(0, 500) : "O executor não aceitou o job.";
    throw new RouteAuthError(502, "media_executor_failed", detail);
  }
  const assetUrl = optionalUrl(payload.assetUrl);
  return {
    providerJobId: typeof payload.jobId === "string" ? payload.jobId.slice(0, 200) : null,
    providerStatusUrl: optionalUrl(payload.statusUrl),
    assetUrl,
    status: assetUrl ? "completed" : "submitted",
  };
}

/**
 * Runs an already-approved request through its persisted compatible providers.
 * A provider is an executor, not a user-facing choice.  We try the next
 * compatible provider for availability/quota/request failures and record each
 * attempt on the job; only after all routes fail does the job become failed.
 *
 * Identity image-to-video chains deliberately arrive with just one candidate,
 * because silently moving an anchored identity to a different provider would
 * break visual continuity and consent expectations.
 */
export async function executeCreativeJobWithFallback(input: {
  job: CreativeJob;
  candidates: Array<{ id: string; connection: MediaConnection }>;
}): Promise<RoutedCreativeExecutionResult> {
  const attempts: CreativeExecutionAttempt[] = [];
  let lastError: unknown = null;
  for (let index = 0; index < input.candidates.length; index += 1) {
    const candidate = input.candidates[index];
    const candidateProvider = providerId(candidate.connection);
    if (!candidateProvider) continue;
    attempts.push({ connectionId: candidate.id, providerId: candidateProvider, status: "started" });
    try {
      const creativeModel = index === 0
        ? input.job.creativeModel
        : routeCreativeModel({ providerId: candidateProvider, format: input.job.format, prompt: input.job.prompt, fallbackModel: candidate.connection.creativeModel }).model;
      const result = await executeCreativeJob({ ...input.job, creativeModel }, candidate.connection);
      attempts[attempts.length - 1] = { connectionId: candidate.id, providerId: candidateProvider, status: result.status };
      return { ...result, connectionId: candidate.id, providerId: candidateProvider, attempts };
    } catch (error) {
      lastError = error;
      attempts[attempts.length - 1] = {
        connectionId: candidate.id,
        providerId: candidateProvider,
        status: "failed",
        reason: error instanceof Error ? error.message.slice(0, 500) : "provider_unavailable",
      };
    }
  }
  const details = attempts.map((item) => `${item.providerId}: ${item.reason || "indisponível"}`).join(" | ");
  const failure = new RouteAuthError(502, "media_all_routes_failed", details || (lastError instanceof Error ? lastError.message : "Nenhum executor compatível conseguiu concluir esta geração.")) as RouteAuthError & { attempts?: CreativeExecutionAttempt[] };
  failure.attempts = attempts;
  throw failure;
}

export async function refreshCreativeJob(connection: MediaConnection, providerStatusUrl: unknown): Promise<CreativeExecutionResult> {
  const statusUrl = optionalUrl(providerStatusUrl);
  if (!statusUrl) throw new RouteAuthError(409, "media_status_missing", "Este provider ainda não informou como consultar o resultado.");
  const credential = decryptSecret(connection.credential);
  if (!credential) throw new RouteAuthError(409, "media_credential_missing", "A conexão de mídia não tem uma chave salva.");
  const authorization = ["fal", "higgsfield"].includes(providerId(connection)) ? `Key ${credential}` : `Bearer ${credential}`;
  const response = await fetch(statusUrl, { headers: { Authorization: authorization }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(502, "media_status_failed", providerError(payload, "Não foi possível consultar o resultado da geração."));
  let source = payload;
  const responseUrl = optionalUrl(payload.response_url);
  if (!outputUrl(source) && responseUrl) {
    const resultResponse = await fetch(responseUrl, { headers: { Authorization: authorization }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (resultResponse.ok) source = await resultResponse.json().catch(() => payload) as Record<string, unknown>;
  }
  const assetUrl = outputUrl(source.output) || outputUrl(source);
  const output = payload.output && typeof payload.output === "object" ? payload.output as Record<string, unknown> : {};
  const state = String(payload.status || source.status || output.task_status || "").toLowerCase();
  if (["failed", "canceled", "cancelled", "error"].includes(state)) throw new RouteAuthError(502, "media_generation_failed", providerError(payload, "A geração foi encerrada pelo provider."));
  if (!assetUrl && ["succeeded", "successful", "completed", "success"].includes(state)) {
    throw new RouteAuthError(502, "media_output_missing", "O provedor concluiu a geração, mas não retornou um arquivo utilizável.");
  }
  return {
    providerJobId: typeof output.task_id === "string" ? output.task_id : typeof payload.request_id === "string" ? payload.request_id : typeof payload.id === "string" ? payload.id : null,
    providerStatusUrl: responseUrl || statusUrl,
    assetUrl,
    status: assetUrl ? "completed" : "submitted",
  };
}

/** A read-only credential check. It never starts a prediction or spends media credits. */
export async function probeReplicate(connection: MediaConnection) {
  const baseUrl = creativeExecutorEndpoint(connection.baseUrl).replace(/\/$/, "");
  const credential = decryptSecret(connection.credential);
  if (!credential) throw new RouteAuthError(409, "media_credential_missing", "A conexão Replicate não tem uma chave salva.");
  const response = await fetch(`${baseUrl}/account`, {
    headers: { Authorization: `Bearer ${credential}` }, cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RouteAuthError(422, "replicate_connection_unavailable", providerError(payload, "A Replicate não aceitou esta chave."));
  return { provider: "Replicate", account: typeof payload.name === "string" ? payload.name.slice(0, 120) : typeof payload.username === "string" ? payload.username.slice(0, 120) : "Conta conectada" };
}

export async function probeCreativeExecutor(connection: MediaConnection) {
  const url = creativeExecutorEndpoint(connection.baseUrl);
  const credential = decryptSecret(connection.credential);
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Altum-Creative-Version": "1", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) throw new Error("creative_executor_unavailable");
  return { provider: typeof payload.provider === "string" ? payload.provider.slice(0, 120) : String(connection.providerId || "creative"), capabilities: Array.isArray(payload.capabilities) ? payload.capabilities.map(String).slice(0, 12) : [] };
}
