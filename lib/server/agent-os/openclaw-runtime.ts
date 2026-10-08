import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";

/**
 * Boundary between Altum and the internal OpenClaw fork.
 *
 * OpenClaw itself remains responsible for agent sessions, skills, tools and
 * execution. Altum remains the source of truth for tenant data, user intent,
 * approval policy, business objects and what is shown in the Comando.
 */
export const OPENCLAW_RUNTIME_SOURCE = {
  repository: "openclaw/openclaw",
  commit: "f45e4dac14547bdc78d90c95384ca65c2de3ef4e",
  license: "MIT",
} as const;

export const OPENCLAW_MISSION_OPERATIONS = ["plan", "execute", "pause", "cancel"] as const;
export type OpenClawMissionOperation = (typeof OPENCLAW_MISSION_OPERATIONS)[number];

export const openClawMissionEnvelopeSchema = z.object({
  protocol: z.literal("altum.openclaw.mission.v1"),
  dispatchId: z.string().min(1).max(180),
  operation: z.enum(OPENCLAW_MISSION_OPERATIONS),
  mission: z.object({
    id: z.string().min(1).max(180),
    tenantId: z.string().min(1).max(180),
    conversationId: z.string().max(180).nullable(),
    title: z.string().min(1).max(160),
    objective: z.string().min(1).max(4_000),
    template: z.string().min(1).max(60),
    risk: z.enum(["low", "medium", "high"]),
    budgetBrl: z.number().finite().min(0),
    constraints: z.array(z.string().max(300)).max(24),
  }),
  policy: z.object({
    externalActionsRequireApproval: z.literal(true),
    secretHandling: z.literal("altum_vault_only"),
    artifactDelivery: z.literal("altum_private_library"),
  }),
  callback: z.object({
    url: z.string().url(),
    signatureHeader: z.literal("x-altum-runtime-signature"),
    timestampHeader: z.literal("x-altum-runtime-timestamp"),
  }),
});

export type OpenClawMissionEnvelope = z.infer<typeof openClawMissionEnvelopeSchema>;

export const openClawRuntimeEventSchema = z.object({
  protocol: z.literal("altum.openclaw.event.v1"),
  eventId: z.string().trim().min(8).max(180),
  dispatchId: z.string().trim().min(1).max(180),
  missionId: z.string().trim().min(1).max(180),
  tenantId: z.string().trim().min(1).max(180),
  type: z.enum(["mission.progress", "mission.await_approval", "mission.completed", "mission.failed", "mission.cancelled"]),
  occurredAt: z.string().datetime(),
  message: z.string().trim().max(4_000).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  approval: z.object({
    title: z.string().trim().min(3).max(180),
    summary: z.string().trim().min(3).max(2_400),
    actionType: z.string().trim().min(3).max(120),
    risk: z.enum(["low", "medium", "high", "critical"]),
    proposedPayload: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  artifacts: z.array(z.object({
    id: z.string().trim().min(1).max(180),
    kind: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(240),
    url: z.string().url().optional(),
  })).max(50).optional(),
});

export type OpenClawRuntimeEvent = z.infer<typeof openClawRuntimeEventSchema>;

function getRuntimeUrl() {
  return process.env.ALTUM_OPENCLAW_RUNTIME_URL?.trim().replace(/\/$/, "") || "";
}

function getRuntimeCallbackUrl() {
  const base = (process.env.ALTUM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim().replace(/\/$/, "");
  return base ? `${base}/api/internal/agent-runtime/events` : "";
}

export function getOpenClawRuntimeStatus() {
  const runtimeUrl = getRuntimeUrl();
  const callbackUrl = getRuntimeCallbackUrl();
  const sharedSecret = process.env.ALTUM_OPENCLAW_SHARED_SECRET?.trim() || "";
  const missing = [
    !callbackUrl ? "ALTUM_PUBLIC_URL" : null,
    sharedSecret.length < 32 ? "ALTUM_OPENCLAW_SHARED_SECRET" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    // The private runtime can safely pull work from Altum. A public inbound
    // runtime URL is optional: it only enables the lower-latency push path.
    configured: missing.length === 0,
    directDispatchConfigured: missing.length === 0 && Boolean(runtimeUrl),
    missing,
    runtimeUrl,
    callbackUrl,
    sharedSecret,
  };
}

export function signOpenClawRuntimeBody(body: string, secret: string, timestamp: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyOpenClawRuntimeSignature(input: { body: string; secret: string; timestamp: string | null; signature: string | null; now?: number }) {
  if (!input.timestamp || !input.signature || input.secret.length < 32) return false;
  const timestampMs = Number(input.timestamp) * 1_000;
  if (!Number.isFinite(timestampMs) || Math.abs((input.now ?? Date.now()) - timestampMs) > 10 * 60 * 1_000) return false;
  const expected = Buffer.from(signOpenClawRuntimeBody(input.body, input.secret, input.timestamp));
  const received = Buffer.from(input.signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * The OpenAI-compatible model endpoint is called by the private runtime, not
 * by a browser. Its credential is deliberately compared in constant time so a
 * model request cannot be used to probe the Altum runtime secret.
 */
export function verifyOpenClawRuntimeBearer(authorization: string | null, secret: string) {
  if (secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice("Bearer ".length).trim());
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function callbackFailureMessage() {
  return "O runtime interno da Altum ainda não está configurado. A missão foi registrada e poderá ser iniciada assim que o executor for conectado.";
}

export async function dispatchMissionToOpenClaw(input: {
  missionId: string;
  tenantId: string;
  conversationId?: string | null;
  title: string;
  objective: string;
  template: string;
  risk: "low" | "medium" | "high";
  budgetBrl: number;
  constraints: string[];
  operation: OpenClawMissionOperation;
  actorId: string;
}) {
  const dispatchRef = adminDb.collection("agent_runtime_dispatches").doc();
  const status = getOpenClawRuntimeStatus();
  const baseRecord = {
    missionId: input.missionId,
    tenantId: input.tenantId,
    operation: input.operation,
    runtime: "openclaw",
    source: OPENCLAW_RUNTIME_SOURCE.repository,
    sourceCommit: OPENCLAW_RUNTIME_SOURCE.commit,
    createdBy: input.actorId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!status.configured) {
    await Promise.all([
      dispatchRef.set({ ...baseRecord, status: "not_configured", missingConfiguration: status.missing }),
      adminDb.collection("agent_missions").doc(input.missionId).set({ runtimeStatus: "not_configured", runtimeMessage: callbackFailureMessage(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return { dispatched: false as const, reason: "not_configured" as const, dispatchId: dispatchRef.id };
  }

  const envelope: OpenClawMissionEnvelope = {
    protocol: "altum.openclaw.mission.v1",
    dispatchId: dispatchRef.id,
    operation: input.operation,
    mission: {
      id: input.missionId,
      tenantId: input.tenantId,
      conversationId: input.conversationId || null,
      title: input.title,
      objective: input.objective,
      template: input.template,
      risk: input.risk,
      budgetBrl: input.budgetBrl,
      constraints: input.constraints,
    },
    policy: { externalActionsRequireApproval: true, secretHandling: "altum_vault_only", artifactDelivery: "altum_private_library" },
    callback: { url: status.callbackUrl, signatureHeader: "x-altum-runtime-signature", timestampHeader: "x-altum-runtime-timestamp" },
  };
  // Persist the complete, validated envelope before trying the optional push
  // transport. The private OpenClaw service can retrieve this durable item
  // later, so a temporary network failure never loses the user's mission.
  await Promise.all([
    dispatchRef.set({
      ...baseRecord,
      status: "queued",
      envelope,
      deliveryAttempts: 0,
      queuedAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection("agent_missions").doc(input.missionId).set({
      runtimeStatus: "queued",
      runtimeDispatchId: dispatchRef.id,
      runtimeMessage: "A missão entrou na fila segura do executor interno.",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]);

  if (!status.directDispatchConfigured) {
    return { dispatched: true as const, delivery: "queued_for_private_runtime" as const, dispatchId: dispatchRef.id };
  }

  const body = JSON.stringify(envelope);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  try {
    const response = await fetch(`${status.runtimeUrl}/altum/v1/missions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${status.sharedSecret}`,
        "x-altum-runtime-timestamp": timestamp,
        "x-altum-runtime-signature": signOpenClawRuntimeBody(body, status.sharedSecret, timestamp),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody = (await response.text()).slice(0, 2_000);
    if (!response.ok) throw new Error(`runtime_http_${response.status}`);
    await Promise.all([
      dispatchRef.set({
        status: "dispatched",
        responseStatus: response.status,
        responseBody,
        deliveryAttempts: FieldValue.increment(1),
        dispatchedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      adminDb.collection("agent_missions").doc(input.missionId).set({ runtimeStatus: "dispatched", runtimeDispatchId: dispatchRef.id, runtimeMessage: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return { dispatched: true as const, dispatchId: dispatchRef.id };
  } catch (error) {
    await Promise.all([
      dispatchRef.set({
        status: "queued",
        deliveryAttempts: FieldValue.increment(1),
        lastDeliveryFailure: error instanceof Error ? error.message.slice(0, 180) : "runtime_dispatch_failed",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      adminDb.collection("agent_missions").doc(input.missionId).set({ runtimeStatus: "queued", runtimeMessage: "O executor está indisponível agora; a Altum vai tentar novamente sem perder a missão.", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return { dispatched: false as const, reason: "dispatch_failed" as const, dispatchId: dispatchRef.id };
  }
}

export function runtimeEventDocumentId(event: Pick<OpenClawRuntimeEvent, "eventId" | "missionId">) {
  return createHash("sha256").update(`${event.missionId}:${event.eventId}`).digest("hex");
}
