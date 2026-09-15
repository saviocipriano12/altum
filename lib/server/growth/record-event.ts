import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { eventDocumentId, normalizeGrowthEvent, type GrowthEventName } from "./tracking";

type NativeGrowthEventInput = {
  tenantId: string;
  eventId: string;
  name: GrowthEventName;
  externalId: string;
  url?: string;
  path?: string;
  value?: number;
  currency?: string;
  properties?: Record<string, string | number | boolean | null>;
  attribution?: Record<string, unknown>;
};

export async function recordNativeGrowthEvent(input: NativeGrowthEventInput) {
  const event = normalizeGrowthEvent({
    eventId: input.eventId,
    name: input.name,
    occurredAt: new Date().toISOString(),
    anonymousId: `lead:${input.externalId}`,
    sessionId: `native:${input.eventId}`,
    externalId: input.externalId,
    url: input.url || "",
    path: input.path || "",
    value: input.value || 0,
    currency: input.currency || "BRL",
    properties: input.properties || {},
    attribution: input.attribution || {},
  });
  if (!event) throw new Error("INVALID_NATIVE_GROWTH_EVENT");
  await adminDb.collection("growth_events").doc(eventDocumentId(input.tenantId, input.eventId)).set({
    ...event,
    tenantId: input.tenantId,
    occurredAt: Timestamp.fromDate(new Date(event.occurredAt)),
    receivedAt: FieldValue.serverTimestamp(),
    origin: "altum_native",
    schemaVersion: 1,
  }, { merge: false });
}
