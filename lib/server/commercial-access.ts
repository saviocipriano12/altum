import { TenantAccessError, type TenantMembership } from "@/lib/server/tenant";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { canAccessAssignedCommercialRecord } from "@/lib/commercial-record-access";

export { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/commercial-record-access";

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function assertAssignedCommercialRecordAccess(
  membership: TenantMembership,
  userId: string,
  record: Record<string, unknown>
) {
  if (!canAccessAssignedCommercialRecord(membership, userId, record)) {
    throw new TenantAccessError(
      "commercial_record_access_denied",
      "Esta conversa ou oportunidade pertence a outro vendedor."
    );
  }
}

export async function assertChatCommercialAccess(input: {
  membership: TenantMembership;
  userId: string;
  tenantId: string;
  chatId: string;
}) {
  const snap = await adminDb.collection("chats").doc(clean(input.chatId, 180)).get();
  if (!snap.exists) {
    throw new TenantAccessError("chat_not_found", "Conversa nao encontrada.");
  }
  const chat = snap.data() as Record<string, unknown>;
  if (clean(chat.tenantId, 140) !== clean(input.tenantId, 140)) {
    throw new TenantAccessError("chat_tenant_mismatch", "Conversa fora desta empresa.");
  }
  assertAssignedCommercialRecordAccess(input.membership, input.userId, chat);
  return chat;
}

export async function assertLeadCommercialAccess(input: {
  membership: TenantMembership;
  userId: string;
  tenantId: string;
  leadId: string;
}) {
  const snap = await adminDb.collection("leads").doc(clean(input.leadId, 180)).get();
  if (!snap.exists) {
    throw new TenantAccessError("lead_not_found", "Oportunidade nao encontrada.");
  }
  const lead = snap.data() as Record<string, unknown>;
  if (clean(lead.tenantId, 140) !== clean(input.tenantId, 140)) {
    throw new TenantAccessError("lead_tenant_mismatch", "Oportunidade fora desta empresa.");
  }
  assertAssignedCommercialRecordAccess(input.membership, input.userId, lead);
  return lead;
}
