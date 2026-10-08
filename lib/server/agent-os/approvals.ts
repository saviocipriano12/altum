import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export type AgentApprovalRisk = "low" | "medium" | "high" | "critical";

export async function createAgentApproval(input: {
  tenantId: string;
  missionId: string;
  taskId?: string;
  title: string;
  summary: string;
  actionType: string;
  risk: AgentApprovalRisk;
  proposedPayload?: Record<string, unknown>;
  createdBy: string;
}) {
  const ref = adminDb.collection("agent_approvals").doc();
  await ref.set({ ...input, taskId: input.taskId || null, proposedPayload: input.proposedPayload || {}, status: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return ref.id;
}
