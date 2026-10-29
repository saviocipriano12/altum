import { createHash } from "node:crypto";
import type { CanonicalInboundChannel } from "@/lib/server/messaging/inbound-event";

export type InboundEventMetricOutcome =
  | "accepted"
  | "duplicate"
  | "invalid"
  | "out_of_order"
  | "ignored_policy"
  | "media_failed";

function safeMetricKey(value: unknown, fallback = "unknown") {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return clean || fallback;
}

export function getInboundEventMetricDocId(tenantId: string, dateRef: string) {
  const tenantHash = createHash("sha256").update(tenantId.trim()).digest("hex").slice(0, 24);
  return `inbound_events_${tenantHash}_${dateRef.replace(/-/g, "")}`;
}

export function normalizeInboundEventMetric(input: {
  tenantId: string;
  channel: CanonicalInboundChannel;
  outcome: InboundEventMetricOutcome;
  reason?: string | null;
  deliveryClass?: string | null;
  attachmentCount?: number;
  date?: Date;
}) {
  const tenantId = input.tenantId.trim();
  if (!tenantId) throw new Error("tenantId obrigatorio para metrica inbound");
  const date = input.date || new Date();
  const dateRef = date.toISOString().slice(0, 10);
  return {
    tenantId,
    channel: input.channel,
    outcome: input.outcome,
    reason: safeMetricKey(input.reason, "none"),
    deliveryClass: safeMetricKey(input.deliveryClass, "unknown"),
    attachmentCount: Math.max(0, Math.min(12, Math.floor(input.attachmentCount || 0))),
    dateRef,
    docId: getInboundEventMetricDocId(tenantId, dateRef),
  };
}

export async function recordInboundEventMetric(input: {
  tenantId: string;
  channel: CanonicalInboundChannel;
  outcome: InboundEventMetricOutcome;
  reason?: string | null;
  deliveryClass?: string | null;
  attachmentCount?: number;
}) {
  const metric = normalizeInboundEventMetric(input);
  const [{ FieldValue }, { adminDb }] = await Promise.all([
    import("firebase-admin/firestore"),
    import("@/app/lib/server/firebase-admin"),
  ]);
  await adminDb.collection("metrics").doc(metric.docId).set(
    {
      tenantId: metric.tenantId,
      type: "inbound_events_daily",
      dateRef: metric.dateRef,
      counters: { [metric.outcome]: FieldValue.increment(1) },
      channelCounters: {
        [metric.channel]: { [metric.outcome]: FieldValue.increment(1) },
      },
      reasonCounters: { [metric.reason]: FieldValue.increment(1) },
      deliveryCounters: { [metric.deliveryClass]: FieldValue.increment(1) },
      attachments: FieldValue.increment(metric.attachmentCount),
      lastOutcome: metric.outcome,
      lastReason: metric.reason,
      lastChannel: metric.channel,
      lastEventAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function recordInboundEventMetricSafe(
  input: Parameters<typeof recordInboundEventMetric>[0]
) {
  try {
    await recordInboundEventMetric(input);
    return true;
  } catch (error) {
    console.warn("[inbound-observability] metric write failed", {
      tenantId: input.tenantId,
      channel: input.channel,
      outcome: input.outcome,
      reason: error instanceof Error ? error.message.slice(0, 180) : "unknown_error",
    });
    return false;
  }
}
