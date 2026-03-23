import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";
import { listTenantOperators } from "@/lib/server/tenant-routing";
import {
  assertTenantAccess,
  getTenantSettings,
  hasTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";

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

function getInboxRoutingPolicy(settings: Record<string, unknown> | null) {
  const rules =
    settings?.rules && typeof settings.rules === "object"
      ? (settings.rules as Record<string, unknown>)
      : {};
  const inbox =
    rules.inbox && typeof rules.inbox === "object"
      ? (rules.inbox as Record<string, unknown>)
      : {};

  return {
    preferOnlineAgents: inbox.preferOnlineAgents !== false,
    strictChannelRouting: inbox.strictChannelRouting === true,
    fallbackToAnyAgent: inbox.fallbackToAnyAgent !== false,
  };
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

function filterEligibleAssignees(input: {
  assignees: Awaited<ReturnType<typeof listTenantOperators>>;
  activeAssignedCounts: Map<string, number>;
  channel?: string;
  policy: ReturnType<typeof getInboxRoutingPolicy>;
}) {
  const channel = clean(input.channel, 40).toLowerCase();
  let eligible = [...input.assignees];

  if (input.policy.preferOnlineAgents) {
    const online = eligible.filter((item) => item.availability === "online");
    if (online.length > 0) {
      eligible = online;
    }
  } else {
    eligible = eligible.filter((item) => item.availability !== "offline");
  }

  if (channel) {
    const channelMatched = eligible.filter(
      (item) => item.allowedChannels.length === 0 || item.allowedChannels.includes(channel)
    );

    if (input.policy.strictChannelRouting) {
      if (channelMatched.length > 0) {
        eligible = channelMatched;
      } else if (!input.policy.fallbackToAnyAgent) {
        eligible = [];
      }
    } else if (channelMatched.length > 0) {
      eligible = channelMatched;
    }
  }

  eligible = eligible.filter((item) => {
    const maxOpenChats = Number(item.maxOpenChats || 0);
    if (!maxOpenChats) return true;
    return (input.activeAssignedCounts.get(item.userId) || 0) < maxOpenChats;
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
    if (!hasTenantCapability(membership, "manage_settings") && !hasTenantCapability(membership, "manage_users")) {
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
    const routingPolicy = getInboxRoutingPolicy((settings || null) as Record<string, unknown> | null);
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
      if (status === "resolved" || status === "archived") continue;
      activeAssignedCounts.set(assignedTo, (activeAssignedCounts.get(assignedTo) || 0) + 1);
    }

    const candidates = chats
      .filter((chat) => {
        const status = clean(chat.status || "open", 40).toLowerCase();
        if (status === "resolved" || status === "archived") return false;
        return !clean(chat.assignedTo || chat.ownerId, 140);
      })
      .slice(0, 40);

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, tenantId, assigned: 0, message: "Nenhuma conversa sem responsavel." });
    }

    const assignments: Array<{ chatId: string; userId: string; userName: string }> = [];
    let currentRoundRobinUserId = lastAssignedUserId;

    for (const chat of candidates) {
      const eligibleAssignees = filterEligibleAssignees({
        assignees,
        activeAssignedCounts,
        channel: clean(chat.channel, 40).toLowerCase(),
        policy: routingPolicy,
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

    const batch = adminDb.batch();
    for (const assignment of assignments) {
      const chat = chats.find((item) => item.id === assignment.chatId);
      if (!chat) continue;

      const chatRef = adminDb.collection("chats").doc(assignment.chatId);
      batch.set(
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

      const leadId = clean(chat.leadId, 140);
      if (leadId) {
        batch.set(
          adminDb.collection("leads").doc(leadId),
          {
            ownerId: assignment.userId,
            owner: assignment.userName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    if (assignments.length > 0) {
      const lastAssigned = assignments[assignments.length - 1];
      batch.set(
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

    await batch.commit();

    return NextResponse.json({
      ok: true,
      tenantId,
      mode: assignmentMode,
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

    console.error("Erro ao distribuir fila do tenant:", error);
    return NextResponse.json({ error: "Falha ao distribuir fila." }, { status: 500 });
  }
}
