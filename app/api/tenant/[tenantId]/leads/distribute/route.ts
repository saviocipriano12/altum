import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  getTenantSettings,
  hasTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import { listTenantOperators } from "@/lib/server/tenant-routing";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = {
  leadIds?: unknown;
  onlyUnassigned?: boolean;
};

type LeadRow = {
  id: string;
  owner?: unknown;
  ownerId?: unknown;
  channel?: unknown;
  sourceType?: unknown;
  origem?: unknown;
  utmSource?: unknown;
  pipelineStage?: unknown;
  stage?: unknown;
  status?: unknown;
  priority?: unknown;
};

const CLOSED_STAGES = new Set(["ganho", "perdido", "won", "lost", "closed_won", "closed_lost"]);

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function getInboxRules(settings: Record<string, unknown> | null) {
  const rules =
    settings?.rules && typeof settings.rules === "object"
      ? (settings.rules as Record<string, unknown>)
      : {};
  const inbox =
    rules.inbox && typeof rules.inbox === "object"
      ? (rules.inbox as Record<string, unknown>)
      : {};
  const mode = clean(inbox.assignmentMode || "least_loaded", 40).toLowerCase();

  return {
    assignmentMode: mode === "round_robin" ? "round_robin" : "least_loaded",
    preferOnlineAgents: inbox.preferOnlineAgents !== false,
    strictChannelRouting: inbox.strictChannelRouting === true,
    fallbackToAnyAgent: inbox.fallbackToAnyAgent !== false,
    prioritizeHighPriority: inbox.prioritizeHighPriority !== false,
    lastAssignedUserId: clean(inbox.lastAssignedUserId, 140),
  };
}

function leadChannel(lead: LeadRow) {
  return (
    clean(lead.channel, 40) ||
    clean(lead.sourceType, 40) ||
    clean(lead.utmSource, 40) ||
    clean(lead.origem, 40)
  ).toLowerCase();
}

function isClosedLead(lead: LeadRow) {
  const stage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "");
  const status = clean(lead.status, 40).toLowerCase();
  return CLOSED_STAGES.has(stage) || status === "archived" || status === "deleted";
}

function filterEligibleOperators(input: {
  operators: Awaited<ReturnType<typeof listTenantOperators>>;
  activeLoads: Map<string, number>;
  channel: string;
  rules: ReturnType<typeof getInboxRules>;
}) {
  let eligible = [...input.operators];

  if (input.rules.preferOnlineAgents) {
    const online = eligible.filter((item) => item.availability === "online");
    if (online.length > 0) eligible = online;
  } else {
    eligible = eligible.filter((item) => item.availability !== "offline");
  }

  if (input.channel) {
    const channelMatched = eligible.filter(
      (item) => item.allowedChannels.length === 0 || item.allowedChannels.includes(input.channel)
    );

    if (input.rules.strictChannelRouting) {
      if (channelMatched.length > 0) eligible = channelMatched;
      else if (!input.rules.fallbackToAnyAgent) eligible = [];
    } else if (channelMatched.length > 0) {
      eligible = channelMatched;
    }
  }

  eligible = eligible.filter((item) => {
    const maxOpenChats = Number(item.maxOpenChats || 0);
    if (!maxOpenChats) return true;
    return (input.activeLoads.get(item.userId) || 0) < maxOpenChats;
  });

  return eligible;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    if (
      !hasTenantCapability(membership, "edit_leads") &&
      !hasTenantCapability(membership, "manage_users") &&
      !hasTenantCapability(membership, "manage_settings")
    ) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para distribuir oportunidades.");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const requestedLeadIds = Array.isArray(body.leadIds)
      ? Array.from(new Set(body.leadIds.map((id) => clean(id, 140)).filter(Boolean))).slice(0, 80)
      : [];
    const onlyUnassigned = body.onlyUnassigned !== false;

    const [operators, settings, leadsSnap] = await Promise.all([
      listTenantOperators(tenantId),
      getTenantSettings(tenantId),
      adminDb.collection("leads").where("tenantId", "==", tenantId).limit(300).get(),
    ]);

    if (operators.length === 0) {
      return NextResponse.json({ error: "Nenhum vendedor ativo para receber oportunidades." }, { status: 400 });
    }

    const rules = getInboxRules((settings || null) as Record<string, unknown> | null);
    const requestedSet = new Set(requestedLeadIds);
    const leads = leadsSnap.docs.map(
      (doc): LeadRow => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    );

    const activeLoads = new Map<string, number>();
    for (const operator of operators) activeLoads.set(operator.userId, 0);

    for (const lead of leads) {
      if (isClosedLead(lead)) continue;
      const ownerId = clean(lead.ownerId, 140);
      if (!ownerId || !activeLoads.has(ownerId)) continue;
      activeLoads.set(ownerId, (activeLoads.get(ownerId) || 0) + 1);
    }

    const candidates = leads
      .filter((lead) => {
        if (requestedSet.size > 0 && !requestedSet.has(lead.id)) return false;
        if (isClosedLead(lead)) return false;
        if (onlyUnassigned && (clean(lead.ownerId, 140) || clean(lead.owner, 140))) return false;
        return true;
      })
      .slice(0, 80);

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        tenantId,
        assigned: 0,
        message: requestedSet.size ? "Nenhuma oportunidade selecionada elegivel." : "Nenhuma oportunidade sem responsavel.",
      });
    }

    const assignments: Array<{ leadId: string; userId: string; userName: string }> = [];
    let currentRoundRobinUserId = rules.lastAssignedUserId;

    for (const lead of candidates) {
      const eligible = filterEligibleOperators({
        operators,
        activeLoads,
        channel: leadChannel(lead),
        rules,
      });
      if (!eligible.length) continue;

      const nextAssignee =
        rules.assignmentMode === "round_robin"
          ? (() => {
              const ordered = [...eligible].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
              const currentIndex = ordered.findIndex((item) => item.userId === currentRoundRobinUserId);
              const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % ordered.length;
              currentRoundRobinUserId = ordered[nextIndex]?.userId || currentRoundRobinUserId;
              return ordered[nextIndex];
            })()
          : [...eligible].sort((a, b) => {
              const aLoad = activeLoads.get(a.userId) || 0;
              const bLoad = activeLoads.get(b.userId) || 0;
              if (aLoad !== bLoad) return aLoad - bLoad;
              if (rules.prioritizeHighPriority && clean(lead.priority, 20).toLowerCase() === "high") {
                if (a.availability !== b.availability) {
                  if (a.availability === "online") return -1;
                  if (b.availability === "online") return 1;
                }
              }
              return a.name.localeCompare(b.name, "pt-BR");
            })[0];

      if (!nextAssignee) continue;

      assignments.push({
        leadId: lead.id,
        userId: nextAssignee.userId,
        userName: nextAssignee.name,
      });
      activeLoads.set(nextAssignee.userId, (activeLoads.get(nextAssignee.userId) || 0) + 1);
    }

    // Uma distribuicao pode atualizar o lead e varias conversas vinculadas.
    // WriteBatch aceita no maximo 500 operacoes; BulkWriter fragmenta o
    // trabalho com seguranca e evita que uma equipe maior fique sem fila.
    const writer = adminDb.bulkWriter();
    for (const assignment of assignments) {
      writer.set(
        adminDb.collection("leads").doc(assignment.leadId),
        {
          ownerId: assignment.userId,
          owner: assignment.userName,
          distributedAt: FieldValue.serverTimestamp(),
          distributedBy: user.uid,
          distributedByName: user.name,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (assignments.length > 0) {
      const assignedByLead = new Map(assignments.map((item) => [item.leadId, item]));
      const chatsSnap = await adminDb
        .collection("chats")
        .where("tenantId", "==", tenantId)
        .limit(500)
        .get();

      for (const doc of chatsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const leadId = clean(data.leadId, 140);
        const assignment = assignedByLead.get(leadId);
        if (!assignment) continue;
        const status = clean(data.status || "open", 40).toLowerCase();
        if (status === "resolved" || status === "archived") continue;
        writer.set(
          doc.ref,
          {
            assignedTo: assignment.userId,
            assignedUserName: assignment.userName,
            ownerId: assignment.userId,
            ownerName: assignment.userName,
            distributedAt: FieldValue.serverTimestamp(),
            distributedBy: user.uid,
            distributedByName: user.name,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const lastAssigned = assignments[assignments.length - 1];
      writer.set(
        adminDb.collection("tenant_settings").doc(tenantId),
        {
          tenantId,
          "rules.inbox.lastAssignedUserId": lastAssigned.userId,
          "rules.inbox.lastAssignedAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await writer.close();

    return NextResponse.json({
      ok: true,
      tenantId,
      mode: rules.assignmentMode,
      assigned: assignments.length,
      items: assignments,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao distribuir oportunidades do tenant:", error);
    return NextResponse.json({ error: "Falha ao distribuir oportunidades." }, { status: 500 });
  }
}
