import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export type AgentMemoryKind = "revenue_priority" | "creative_direction" | "mission_outcome" | "approved_fact";

export async function recordAgentMemory(input: { tenantId: string; missionId?: string; projectId?: string; kind: AgentMemoryKind; summary: string; evidence: Array<Record<string, unknown>>; confidence: number; sourceRunId?: string; createdBy: string }) {
  const ref = adminDb.collection("agent_memories").doc();
  await ref.set({ tenantId: input.tenantId, missionId: input.missionId || null, projectId: input.projectId || null, kind: input.kind, summary: input.summary.slice(0, 2_400), evidence: input.evidence.slice(0, 30), confidence: Math.max(0, Math.min(1, input.confidence)), sourceRunId: input.sourceRunId || null, status: "candidate", createdBy: input.createdBy, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return ref.id;
}
