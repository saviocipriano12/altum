import { hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";
import { filterEligibleOperators, getInboxRules, listTenantOperators } from "@/lib/server/tenant-routing";
import {
  assertTenantAccess,
  getTenantSettings,
  hasTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type ChatRow = Record<string, unknown> & {
  id: string;
  assignedTo?: string;
  ownerId?: string;
  leadId?: string;
  status?: string;
};

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function getAssignmentMode(settings: Record<string, unknown> | null) {
  const rules =
    settings?.rules && typeof settings.rules === "object"
      ? (settings.rules as Record<string, unknown>)
      : {};
  const inbox =
    rules.inbox && typeof rules.inbox === "object"
      ? (rules.inbox as Record<string, unknown>)
      : {};
  const mode = clean(inbox.assignmentMode || "least_loaded", 40).toLowerCase();
  return mode === "round_robin" ? "round_robin" : "least_loaded";
}

function getLastAssignedUserId(settings: Record<string, unknown> | null) {
  const rules =
    settings?.rules && typeof settings.rules === "object"
      ? (settings.rules as Record<string, unknown>)
      : {};
  const inbox =
    rules.inbox && typeof rules.inbox === "object"
      ? (rules.inbox as Record<string, unknown>)
      : {};
  return clean(inbox.lastAssignedUserId, 140);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    if (!hasTenantCapability(membership, "manage_settings") && !hasTenantCapability(membership, "manage_users") && !(hasTeamWideCommercialAccess(membership) && hasTenantCapability(membership, "respond_inbox"))) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para distribuir a fila.");
    }

    const [assignees, settings] = await Promise.all([
      listTenantOperators(tenantId),
      getTenantSettings(tenantId),
    ]);
    if (assignees.length === 0) {
      return NextResponse.json({ error: "Nenhum usuario operacional ativo para distribuicao." }, { status: 400 });
    }
    const assignmentMode = getAssignmentMode((settings || null) as Record<string, unknown> | null);
    const routingPolicy = getInboxRules((settings || null) as Record<string, unknown> | null);
    const lastAssignedUserId = getLastAssignedUserId((settings || null) as Record<string, unknown> | null);

    const chatsSnap = await adminDb
      .collection("chats")
      .where("tenantId", "==", tenantId)
      .limit(250)
      .get();

    const chats = chatsSnap.docs.map(
      (doc): ChatRow => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    );

    const activeAssignedCounts = new Map<string, number>();
    for (const assignee of assignees) {
      activeAssignedCounts.set(assignee.userId, 0);
    }

    for (const chat of chats) {
      const status = clean(chat.status || "open", 40).toLowerCase();
      const assignedTo = clean(chat.assignedTo || chat.ownerId, 140);
      if (!assignedTo) continue;
      if (["resolved", "archived", "closed", "merged"].includes(status)) continue;
      activeAssignedCounts.set(assignedTo, (activeAssignedCounts.get(assignedTo) || 0) + 1);
    }

    const candidates = chats
      .filter((chat) => {
        const status = clean(chat.status || "open", 40).toLowerCase();
        if (["resolved", "archived", "closed", "merged"].includes(status)) return false;
        return !clean(chat.assignedTo || chat.ownerId, 140);
      })
      .slice(0, 40);

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, tenantId, assigned: 0, message: "Nenhuma conversa sem responsavel." });
    }

    const channelIds = [...new Set(candidates.map((chat) => clean(chat.channelId, 180)).filter(Boolean))];
    const channelSnapshots = await Promise.all(channelIds.map((id) => adminDb.collection("tenant_channels").doc(id).get()));
    const channels = new Map(channelSnapshots.map((snap) => [snap.id, snap.exists ? snap.data() as Record<string, unknown> : null]));

    const assignments: Array<{ chatId: string; userId: string; userName: string }> = [];
    let currentRoundRobinUserId = lastAssignedUserId;

    for (const chat of candidates) {
      const channelId = clean(chat.channelId, 180);
      const channel = channels.get(channelId);
      if (channelId && (!channel || clean(channel.tenantId) !== tenantId)) continue;
      const personalOwner = channel?.channelScope === "personal" ? clean(channel.ownerUserId) : "";
      if (channel?.channelScope === "personal" && !personalOwner) continue;
      const eligibleAssignees = filterEligibleOperators({
        operators: personalOwner ? assignees.filter((item) => item.userId === personalOwner) : assignees,
        activeLoads: activeAssignedCounts,
        channel: clean(chat.channel, 40).toLowerCase(),
        rules: personalOwner ? { ...routingPolicy, teams: [], defaultTeam: "", fallbackToAnyAgent: true } : routingPolicy,
      });
      if (eligibleAssignees.length === 0) continue;

      const nextAssignee =
        assignmentMode === "round_robin"
          ? (() => {
              const ordered = [...eligibleAssignees].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
              const currentIndex = ordered.findIndex((item) => item.userId === currentRoundRobinUserId);
              const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % ordered.length;
              currentRoundRobinUserId = ordered[nextIndex]?.userId || currentRoundRobinUserId;
              return ordered[nextIndex];
            })()
          : [...eligibleAssignees].sort((a, b) => {
              const aCount = activeAssignedCounts.get(a.userId) || 0;
              const bCount = activeAssignedCounts.get(b.userId) || 0;
              if (aCount !== bCount) return aCount - bCount;
              if (a.availability !== b.availability) {
                if (a.availability === "online") return -1;
                if (b.availability === "online") return 1;
              }
              return a.name.localeCompare(b.name, "pt-BR");
            })[0];

      assignments.push({
        chatId: chat.id,
        userId: nextAssignee.userId,
        userName: nextAssignee.name,
      });
      activeAssignedCounts.set(nextAssignee.userId, (activeAssignedCounts.get(nextAssignee.userId) || 0) + 1);
    }

    const committedAssignments: typeof assignments = [];
    for (const assignment of assignments) {
      const chat = chats.find((item) => item.id === assignment.chatId);
      if (!chat) continue;

      const chatRef = adminDb.collection("chats").doc(assignment.chatId);
      const committed = await adminDb.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(chatRef);
        const current = currentSnap.data();
        if (!current || clean(current.tenantId) !== tenantId || clean(current.assignedTo || current.ownerId) || ["resolved", "archived", "closed", "merged"].includes(clean(current.status).toLowerCase())) return false;
        const leadId = clean(current.leadId, 140);
        const leadRef = leadId ? adminDb.collection("leads").doc(leadId) : null;
        const leadSnap = leadRef ? await transaction.get(leadRef) : null;
        transaction.set(
        chatRef,
        {
          assignedTo: assignment.userId,
          assignedUserName: assignment.userName,
          ownerId: assignment.userId,
          ownerName: assignment.userName,
          distributedAt: FieldValue.serverTimestamp(),
          distributedBy: user.uid,
          distributedByName: user.name,
          updatedAt: FieldValue.serverTimestamp(),
          ...buildManualQueuePatch({
            status: clean(chat.status || "open", 40).toLowerCase(),
            assignedTo: assignment.userId,
            lastClientMessageAt: chat.lastClientMessageAt,
            lastAgentMessageAt: chat.lastAgentMessageAt,
            slaDueAt: chat.slaDueAt,
          }),
        },
        { merge: true }
      );

        if (leadRef && leadSnap?.exists && clean(leadSnap.data()?.tenantId) === tenantId) {
          transaction.set(leadRef, {
            ownerId: assignment.userId,
            owner: assignment.userName,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        return true;
      });
      if (committed) committedAssignments.push(assignment);
    }

    if (committedAssignments.length > 0) {
      const lastAssigned = committedAssignments[committedAssignments.length - 1];
      await adminDb.collection("tenant_settings").doc(tenantId).set(
        {
          tenantId,
          rules: {
            inbox: {
              lastAssignedUserId: lastAssigned.userId,
              lastAssignedAt: FieldValue.serverTimestamp(),
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      mode: assignmentMode,
      assigned: committedAssignments.length,
      items: committedAssignments,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao distribuir fila do tenant:", error);
    return NextResponse.json({ error: "Falha ao distribuir fila." }, { status: 500 });
  }
}
