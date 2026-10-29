import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import type { TenantMembership } from "@/lib/server/tenant";
import { ActivityPageError, activityPageScope, assertActivityPageKey, decodeActivityPageCursor, encodeActivityPageCursor } from "./activity-page-cursor";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
/** Customer choices are independent of tasks: a first return must remain possible. */
export async function readActivityLeadPage(input: { tenantId: string; userId: string; membership: TenantMembership; pageSize: number; q: string; cursor?: string }) {
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50 || input.q.length > 120)
    throw new ActivityPageError(400, "invalid_activity_lead_page", "Busca de cliente inválida.");
  assertActivityPageKey();
  const term = input.q.trim(), scope = activityPageScope(["activity-lead-picker", input.tenantId, input.userId,
    input.membership.role, [...input.membership.capabilities].sort(), input.pageSize, term, "id:asc"]);
  const now = Date.now(), previous = input.cursor ? decodeActivityPageCursor(input.cursor, scope, now) : null;
  let query: FirebaseFirestore.Query = adminDb.collection("leads").where("tenantId", "==", input.tenantId).orderBy(FieldPath.documentId());
  if (previous) query = query.startAfter(previous.after[2]);
  const page = await query.limit(201).get(), options = [];
  let consumed = 0, last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const needle = normalized(term);
  for (const snapshot of page.docs.slice(0, 200)) {
    consumed++; last = snapshot;
    const row = snapshot.data();
    if (!canAccessAssignedCommercialRecord(input.membership, input.userId, row)) continue;
    if (needle && !normalized([row.nome, row.empresa, row.telefone, row.email, row.title, row.opportunityTitle].map(text).join(" ")).includes(needle)) continue;
    options.push({ id: snapshot.id, nome: text(row.nome), empresa: text(row.empresa),
      opportunityTitle: text(row.opportunityTitle || row.title), ownerId: text(row.assignedTo || row.ownerId || row.ownerUserId || row.assignedUserId || row.responsavelId), owner: text(row.owner) });
    if (options.length >= input.pageSize) break;
  }
  const hasMore = consumed < page.size;
  const startedAt = previous?.startedAt ?? now, expiresAt = previous?.expiresAt ?? now + 600000;
  return { contractVersion: 1, options, hasMore, coverage: hasMore ? "partial" : "end_reached", consistency: "live_keyset",
    nextCursor: hasMore && last ? encodeActivityPageCursor({ version: 1, scope, startedAt, expiresAt, reviewSeen: false, after: [0, 0, last.id] }) : null,
    refreshBefore: new Date(expiresAt).toISOString(),
  };
}
