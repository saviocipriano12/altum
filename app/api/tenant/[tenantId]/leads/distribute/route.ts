import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { balanceLeadAssignments, eligibleLeadSellers, randomLeadAssignments, type LeadAssignmentMember } from "@/lib/lead-assignment";

type AssignmentMode = "balanced" | "random" | "specific" | "unassign";
type Body = { leadIds?: unknown; onlyUnassigned?: boolean; mode?: AssignmentMode; assigneeUserId?: unknown; teamId?: unknown };
type LeadRow = Record<string, unknown> & { id: string };
type Assignment = { leadId: string; userId: string | null; userName: string | null };
const CLOSED_STAGES = new Set(["ganho", "perdido", "won", "lost", "closed_won", "closed_lost"]);

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isClosedLead(lead: LeadRow) {
  const stage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "");
  const status = clean(lead.status, 40).toLowerCase();
  return CLOSED_STAGES.has(stage) || ["archived", "deleted"].includes(status);
}

function currentOwnerId(lead: LeadRow) {
  return clean(lead.ownerId || lead.ownerUserId || lead.assignedTo || lead.assignedUserId, 140);
}

async function listEligibleSellers(tenantId: string) {
  const membershipSnap = await adminDb.collection("tenant_users").where("tenantId", "==", tenantId).limit(100).get();
  const members = await Promise.all(membershipSnap.docs.map(async (doc): Promise<LeadAssignmentMember | null> => {
    const data = doc.data() as Record<string, unknown>;
    const userId = clean(data.userId, 140);
    if (!userId) return null;
    const userSnap = await adminDb.collection("users").doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() as Record<string, unknown> : {};
    const inactive = ["blocked", "inactive"].includes(clean(data.status, 40).toLowerCase()) ||
      ["blocked", "inactive"].includes(clean(userData.status, 40).toLowerCase());
    return {
      userId,
      name: clean(userData.name || data.name || data.email, 140) || "Vendedor",
      role: clean(data.role, 40),
      status: inactive ? "blocked" : "active",
      accessProfile: clean(data.accessProfile, 40),
      capabilities: Array.isArray(data.capabilities) ? data.capabilities.map((item) => clean(item, 60)).filter(Boolean) : [],
      availability: clean(data.availability, 40),
      presenceState: clean(data.presenceState, 40),
      teamId: clean(data.teamId || data.team, 140),
      maxOpenChats: typeof data.maxOpenChats === "number" ? data.maxOpenChats : null,
    };
  }));
  return eligibleLeadSellers(members.filter((item): item is LeadAssignmentMember => Boolean(item)));
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    const canManageAssignments = hasTenantCapability(membership, "view_team_records") || hasTenantCapability(membership, "manage_users") || hasTenantCapability(membership, "manage_settings");
    if (!canManageAssignments) throw new TenantAccessError("tenant_capability_denied", "Somente dono ou gestor pode distribuir oportunidades.");

    const body = await req.json().catch(() => ({})) as Body;
    const requestedLeadIds = Array.isArray(body.leadIds)
      ? Array.from(new Set(body.leadIds.map((id) => clean(id, 140)).filter(Boolean))).slice(0, 100)
      : [];
    const mode: AssignmentMode = ["random", "specific", "unassign"].includes(String(body.mode))
      ? body.mode as AssignmentMode
      : "balanced";
    const assigneeUserId = clean(body.assigneeUserId, 140);
    const teamId = clean(body.teamId, 140);
    const onlyUnassigned = mode === "unassign" ? false : body.onlyUnassigned !== false;
    if (mode === "unassign" && requestedLeadIds.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos uma oportunidade para remover o responsavel." }, { status: 400 });
    }

    const [sellers, leadsSnap] = await Promise.all([
      listEligibleSellers(tenantId),
      adminDb.collection("leads").where("tenantId", "==", tenantId).limit(500).get(),
    ]);
    if (mode !== "unassign" && !sellers.length) {
      return NextResponse.json({ error: "Nenhum vendedor ativo esta disponivel para receber oportunidades." }, { status: 400 });
    }
    const selectedSeller = mode === "specific" ? sellers.find((seller) => seller.userId === assigneeUserId) : null;
    if (mode === "specific" && !selectedSeller) {
      return NextResponse.json({ error: "Escolha um vendedor ativo. Gestores e administradores nao recebem leads." }, { status: 400 });
    }

    const requestedSet = new Set(requestedLeadIds);
    const leads = leadsSnap.docs.map((doc): LeadRow => ({ id: doc.id, ...doc.data() }));
    const candidates = leads.filter((lead) => {
      if (requestedSet.size && !requestedSet.has(lead.id)) return false;
      if (isClosedLead(lead)) return false;
      if (onlyUnassigned && currentOwnerId(lead)) return false;
      return true;
    }).slice(0, 100);
    if (!candidates.length) {
      return NextResponse.json({ ok: true, tenantId, assigned: 0, message: requestedSet.size ? "Nenhuma oportunidade selecionada esta elegivel." : "Nenhuma oportunidade sem responsavel." });
    }

    const candidateIds = new Set(candidates.map((lead) => lead.id));
    const currentLoads = new Map(sellers.map((seller) => [seller.userId, 0]));
    for (const lead of leads) {
      if (isClosedLead(lead) || candidateIds.has(lead.id)) continue;
      const ownerId = currentOwnerId(lead);
      if (currentLoads.has(ownerId)) currentLoads.set(ownerId, (currentLoads.get(ownerId) || 0) + 1);
    }
    const assignments: Assignment[] = mode === "unassign"
      ? candidates.map((lead) => ({ leadId: lead.id, userId: null, userName: null }))
      : selectedSeller
        ? candidates.map((lead) => ({ leadId: lead.id, userId: selectedSeller.userId, userName: selectedSeller.name }))
        : mode === "random"
          ? randomLeadAssignments({ leadIds: candidates.map((lead) => lead.id), sellers, currentLoads, teamId })
          : balanceLeadAssignments({ leadIds: candidates.map((lead) => lead.id), sellers, currentLoads, teamId });
    const previousAssignments = candidates.map((lead) => ({
      leadId: lead.id,
      userId: currentOwnerId(lead) || null,
      userName: clean(lead.ownerName || lead.owner || lead.assignedUserName, 140) || null,
    }));

    const assignedByLead = new Map(assignments.map((item) => [item.leadId, item]));
    const [chatsSnap, appointmentsSnap, budgetsSnap, financeSnap] = await Promise.all([
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(800).get(),
      adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(1000).get(),
      adminDb.collection("orcamentos").where("tenantId", "==", tenantId).limit(1000).get(),
      adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(1000).get(),
    ]);
    const writer = adminDb.bulkWriter();
    for (const assignment of assignments) {
      const leadRef = adminDb.collection("leads").doc(assignment.leadId);
      writer.set(leadRef, {
        ownerId: assignment.userId,
        ownerUserId: assignment.userId,
        assignedTo: assignment.userId,
        owner: assignment.userName,
        ownerName: assignment.userName,
        assignedUserName: assignment.userName,
        assignedAt: assignment.userId ? FieldValue.serverTimestamp() : null,
        assignedBy: user.uid,
        assignedByName: user.name,
        assignmentMode: mode,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      writer.set(leadRef.collection("events").doc(), {
        type: "lead_assignment",
        title: mode === "unassign" ? "Responsavel removido" : mode === "specific" ? "Responsavel alterado" : "Lead distribuido",
        detail: assignment.userName ? `Responsavel: ${assignment.userName}` : "Oportunidade deixada sem responsavel",
        ownerUserId: assignment.userId,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    for (const doc of chatsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const assignment = assignedByLead.get(clean(data.leadId, 140));
      if (!assignment || ["resolved", "archived", "closed", "merged"].includes(clean(data.status, 40).toLowerCase())) continue;
      writer.set(doc.ref, {
        assignedTo: assignment.userId,
        assignedUserName: assignment.userName,
        ownerId: assignment.userId,
        ownerName: assignment.userName,
        assignedAt: assignment.userId ? FieldValue.serverTimestamp() : null,
        assignedBy: user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    let relatedRecordsUpdated = 0;
    for (const snap of [appointmentsSnap, budgetsSnap, financeSnap]) {
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const assignment = assignedByLead.get(clean(data.leadId, 140));
        if (!assignment) continue;
        writer.set(doc.ref, {
          ownerId: assignment.userId,
          ownerUserId: assignment.userId,
          ownerName: assignment.userName,
          assignedTo: assignment.userId,
          assignedUserName: assignment.userName,
          assignmentMode: mode,
          assignedBy: user.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        relatedRecordsUpdated += 1;
      }
    }
    const auditRef = adminDb.collection("audit_logs").doc();
    writer.set(auditRef, {
      tenantId,
      action: "lead_assignment",
      mode,
      leadIds: assignments.map((item) => item.leadId),
      assignments,
      previousAssignments,
      assigneeUserId: selectedSeller?.userId || null,
      assigneeName: selectedSeller?.name || null,
      relatedRecordsUpdated,
      actorId: user.uid,
      actorName: user.name,
      createdAt: FieldValue.serverTimestamp(),
    });
    await writer.close();

    return NextResponse.json({ ok: true, tenantId, mode, assigned: assignments.length, relatedRecordsUpdated, auditId: auditRef.id, undoAvailable: assignments.length > 0, items: assignments });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao distribuir oportunidades do tenant:", error);
    return NextResponse.json({ error: "Falha ao distribuir oportunidades." }, { status: 500 });
  }
}
