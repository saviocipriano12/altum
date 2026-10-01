import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";

type StoredAssignment = { leadId?: unknown; userId?: unknown; userName?: unknown };

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function ownerId(record: Record<string, unknown>) {
  return clean(record.ownerId || record.ownerUserId || record.assignedTo || record.assignedUserId, 140);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; auditId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, auditId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    if (!hasTenantCapability(membership, "view_team_records") && !hasTenantCapability(membership, "manage_users") && !hasTenantCapability(membership, "manage_settings")) {
      throw new TenantAccessError("tenant_capability_denied", "Somente dono ou gestor pode desfazer uma distribuicao.");
    }

    const auditRef = adminDb.collection("audit_logs").doc(auditId);
    const auditSnap = await auditRef.get();
    const audit = auditSnap.data() as Record<string, unknown> | undefined;
    if (!auditSnap.exists || clean(audit?.tenantId) !== tenantId || clean(audit?.action) !== "lead_assignment") {
      return NextResponse.json({ error: "Distribuicao nao encontrada." }, { status: 404 });
    }
    if (audit?.undoneAt) return NextResponse.json({ error: "Esta distribuicao ja foi desfeita." }, { status: 409 });
    const createdAt = (audit?.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
    if (!createdAt || Date.now() - createdAt > 15 * 60_000) {
      return NextResponse.json({ error: "O prazo seguro de 15 minutos para desfazer terminou." }, { status: 409 });
    }

    const assigned = Array.isArray(audit?.assignments) ? audit.assignments as StoredAssignment[] : [];
    const previous = Array.isArray(audit?.previousAssignments) ? audit.previousAssignments as StoredAssignment[] : [];
    const assignedByLead = new Map(assigned.map((item) => [clean(item.leadId, 140), clean(item.userId, 140) || null]));
    const previousByLead = new Map(previous.map((item) => [clean(item.leadId, 140), {
      userId: clean(item.userId, 140) || null,
      userName: clean(item.userName, 140) || null,
    }]));
    const leadIds = [...previousByLead.keys()].filter(Boolean).slice(0, 100);
    if (!leadIds.length) return NextResponse.json({ error: "Esta distribuicao nao possui estado anterior recuperavel." }, { status: 409 });

    const restored = await adminDb.runTransaction(async (transaction) => {
      const freshAudit = await transaction.get(auditRef);
      if (freshAudit.data()?.undoneAt) throw new TenantAccessError("assignment_already_undone", "Esta distribuicao ja foi desfeita.");
      const rows = await Promise.all(leadIds.map(async (leadId) => {
        const ref = adminDb.collection("leads").doc(leadId);
        return { leadId, ref, snap: await transaction.get(ref) };
      }));
      const safeRows = rows.filter(({ leadId, snap }) => {
        const data = snap.data() as Record<string, unknown> | undefined;
        return snap.exists && clean(data?.tenantId) === tenantId && ownerId(data || {}) === (assignedByLead.get(leadId) || "");
      });
      if (!safeRows.length) throw new TenantAccessError("assignment_changed_after_distribution", "Os responsaveis ja foram alterados depois desta distribuicao.");

      for (const { leadId, ref } of safeRows) {
        const prior = previousByLead.get(leadId) || { userId: null, userName: null };
        transaction.set(ref, {
          ownerId: prior.userId,
          ownerUserId: prior.userId,
          assignedTo: prior.userId,
          owner: prior.userName,
          ownerName: prior.userName,
          assignedUserName: prior.userName,
          assignmentMode: "undo",
          assignedBy: user.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(ref.collection("events").doc(), {
          type: "lead_assignment_undo",
          title: "Distribuicao desfeita",
          detail: prior.userName ? `Responsavel restaurado: ${prior.userName}` : "Oportunidade restaurada sem responsavel",
          ownerUserId: prior.userId,
          actorId: user.uid,
          actorName: user.name,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(auditRef, {
        undoneAt: FieldValue.serverTimestamp(),
        undoneBy: user.uid,
        undoneByName: user.name,
        restoredLeadIds: safeRows.map((row) => row.leadId),
      }, { merge: true });
      return safeRows.map((row) => row.leadId);
    });

    const restoredSet = new Set(restored);
    const [chatsSnap, appointmentsSnap, budgetsSnap, financeSnap] = await Promise.all([
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(800).get(),
      adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(1000).get(),
      adminDb.collection("orcamentos").where("tenantId", "==", tenantId).limit(1000).get(),
      adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(1000).get(),
    ]);
    const writer = adminDb.bulkWriter();
    let relatedRecordsUpdated = 0;
    for (const snap of [chatsSnap, appointmentsSnap, budgetsSnap, financeSnap]) {
      for (const doc of snap.docs) {
        const leadId = clean(doc.data().leadId, 140);
        if (!restoredSet.has(leadId)) continue;
        const prior = previousByLead.get(leadId) || { userId: null, userName: null };
        writer.set(doc.ref, {
          ownerId: prior.userId,
          ownerUserId: prior.userId,
          assignedTo: prior.userId,
          ownerName: prior.userName,
          assignedUserName: prior.userName,
          assignmentMode: "undo",
          assignedBy: user.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        relatedRecordsUpdated += 1;
      }
    }
    await writer.close();
    return NextResponse.json({ ok: true, restored: restored.length, relatedRecordsUpdated });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao desfazer distribuicao:", error);
    return NextResponse.json({ error: "Falha ao desfazer distribuicao." }, { status: 500 });
  }
}
