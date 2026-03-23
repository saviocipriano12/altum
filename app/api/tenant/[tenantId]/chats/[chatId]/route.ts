import { NextResponse } from "next/server";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  getTenantSettings,
  TenantAccessError,
} from "@/lib/server/tenant";
import { getChatState } from "@/lib/server/ai/agent";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";

type ChatDoc = Record<string, unknown> & {
  tenantId?: string;
  leadId?: string;
  contactPhone?: string;
  ownerId?: string;
  ownerName?: string;
  assignedTo?: string;
  assignedUserName?: string;
  status?: string;
  priority?: string;
  tags?: string[] | string;
};

type Body = {
  status?: string;
  priority?: string;
  tags?: string[] | string;
  assignedUserId?: string | null;
};

type LeadTaskItem = Record<string, unknown> & {
  id: string;
  status?: string;
  dueAt?: unknown;
  createdAt?: unknown;
};

type LeadNoteItem = Record<string, unknown> & {
  id: string;
  createdAt?: unknown;
};

type BudgetItem = Record<string, unknown> & {
  id: string;
  leadId?: string;
  status?: string;
  valorTotal?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

type FinanceItem = Record<string, unknown> & {
  id: string;
  leadId?: string;
  tipo?: string;
  status?: string;
  valor?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

const CHAT_STATUSES = new Set(["open", "pending", "resolved", "archived"]);
const CHAT_PRIORITIES = new Set(["low", "medium", "high"]);

function cleanString(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const unique = new Set<string>();
  for (const item of source) {
    const normalized = cleanString(item, 32).toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= 8) break;
  }

  return Array.from(unique);
}

function toSeconds(value: unknown) {
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return Math.floor((value as { toDate: () => Date }).toDate().getTime() / 1000);
  }
  return 0;
}

function toMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function serializeAiState(state: Awaited<ReturnType<typeof getChatState>>) {
  return {
    tenantId: state.tenantId,
    chatId: state.chatId,
    aiEnabled: state.aiEnabled,
    pausedUntil: state.pausedUntil ? state.pausedUntil.toISOString() : null,
    humanOwnerUserId: state.humanOwnerUserId,
  };
}

async function getChatSnapshot(chatId: string, tenantId: string) {
  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new RouteAuthError(404, "chat_not_found", "Chat nao encontrado.");
  }

  const chat = chatSnap.data() as ChatDoc;
  if ((chat.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Chat fora do tenant informado.");
  }

  return { chatRef, chatSnap, chat };
}

async function resolveLead(chat: ChatDoc, tenantId: string) {
  let leadSnap: DocumentSnapshot | null = null;

  if (typeof chat.leadId === "string" && chat.leadId.trim()) {
    const direct = await adminDb.collection("leads").doc(chat.leadId).get();
    if (direct.exists && (direct.data() as { tenantId?: string }).tenantId === tenantId) {
      leadSnap = direct;
    }
  }

  if (!leadSnap && typeof chat.contactPhone === "string" && chat.contactPhone.trim()) {
    const byPhone = await adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .where("telefone", "==", chat.contactPhone.trim())
      .limit(1)
      .get();

    if (!byPhone.empty) {
      leadSnap = byPhone.docs[0];
    }
  }

  if (!leadSnap) return null;

  const leadData = leadSnap.data() as Record<string, unknown>;
  const timelineSnap = await leadSnap.ref
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(8)
    .get();

  return {
    id: leadSnap.id,
    nome: typeof leadData.nome === "string" ? leadData.nome : "Lead",
    email: typeof leadData.email === "string" ? leadData.email : "",
    telefone: typeof leadData.telefone === "string" ? leadData.telefone : "",
    empresa: typeof leadData.empresa === "string" ? leadData.empresa : "",
    origem: typeof leadData.origem === "string" ? leadData.origem : "",
    channel: typeof leadData.channel === "string" ? leadData.channel : "",
    status: typeof leadData.status === "string" ? leadData.status : "novo",
    stage: typeof leadData.stage === "string" ? leadData.stage : "",
    pipelineStage: typeof leadData.pipelineStage === "string" ? leadData.pipelineStage : "captado",
    owner: typeof leadData.owner === "string" ? leadData.owner : "",
    ownerId: typeof leadData.ownerId === "string" ? leadData.ownerId : "",
    score: typeof leadData.score === "number" ? leadData.score : null,
    priority: typeof leadData.priority === "string" ? leadData.priority : "",
    heat: typeof leadData.heat === "string" ? leadData.heat : "",
    potentialValue:
      typeof leadData.potentialValue === "number"
        ? leadData.potentialValue
        : typeof leadData.valorPotencial === "number"
          ? leadData.valorPotencial
          : null,
    tags: parseTags(leadData.tags),
    updatedAt: leadData.updatedAt || null,
    createdAt: leadData.createdAt || null,
    timeline: timelineSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    })),
  };
}

async function listChatNotes(tenantId: string, chatId: string) {
  const snap = await adminDb
    .collection("chat_notes")
    .where("tenantId", "==", tenantId)
    .where("chatId", "==", chatId)
    .limit(100)
    .get();

  return snap.docs
    .map(
      (doc): Record<string, unknown> & { id: string; createdAt?: unknown } => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .sort((a, b) => {
      const aTime = Number((a.createdAt as { _seconds?: number } | undefined)?._seconds || 0);
      const bTime = Number((b.createdAt as { _seconds?: number } | undefined)?._seconds || 0);
      return bTime - aTime;
    });
}

async function listTeamMembers(tenantId: string) {
  const membershipsSnap = await adminDb
    .collection("tenant_users")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "active")
    .limit(50)
    .get();

  const memberships = membershipsSnap.docs.map(
    (doc): Record<string, unknown> & {
      id: string;
      userId?: string;
      name?: string;
      role?: string;
      isDefault?: boolean;
    } => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    })
  );

  const users = await Promise.all(
    memberships.map(async (membership) => {
      const userId = typeof membership.userId === "string" ? membership.userId : "";
      if (!userId) return null;
      const userSnap = await adminDb.collection("users").doc(userId).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
      return {
        userId,
        name:
          (typeof userData.name === "string" ? userData.name : "") ||
          (typeof membership.name === "string" ? membership.name : "") ||
          "Usuario",
        email: typeof userData.email === "string" ? userData.email : "",
        role: typeof membership.role === "string" ? membership.role : "client_viewer",
        isDefault: Boolean(membership.isDefault),
      };
    })
  );

  return users.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function listLeadTasks(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("lead_tasks")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .limit(16)
    .get();

  return snap.docs
    .map(
      (doc): LeadTaskItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .sort((a, b) => {
      const statusA = String(a.status || "pending");
      const statusB = String(b.status || "pending");
      if (statusA !== statusB) return statusA === "done" ? 1 : -1;
      return toSeconds(a.dueAt || a.createdAt) - toSeconds(b.dueAt || b.createdAt);
    });
}

async function listLeadNotes(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("lead_notes")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .limit(16)
    .get();

  return snap.docs
    .map(
      (doc): LeadNoteItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .sort((a, b) => toSeconds(b.createdAt) - toSeconds(a.createdAt));
}

async function listLeadBudgets(tenantId: string, leadId: string) {
  const snap = await adminDb.collection("orcamentos").where("leadId", "==", leadId).limit(24).get();

  return snap.docs
    .map(
      (doc): BudgetItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .filter((item) => String(item.tenantId || "") === tenantId)
    .sort((a, b) => toSeconds(b.updatedAt || b.createdAt) - toSeconds(a.updatedAt || a.createdAt));
}

async function listLeadFinance(tenantId: string, leadId: string) {
  const snap = await adminDb.collection("financeiro").where("leadId", "==", leadId).limit(24).get();

  return snap.docs
    .map(
      (doc): FinanceItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .filter((item) => String(item.tenantId || "") === tenantId)
    .sort((a, b) => toSeconds(b.updatedAt || b.createdAt) - toSeconds(a.updatedAt || a.createdAt));
}

function buildCommercialSummary(budgets: BudgetItem[], finance: FinanceItem[]) {
  const approvedBudgets = budgets.filter((item) => String(item.status || "") === "Aprovado");
  const paidRevenue = finance
    .filter((item) => String(item.tipo || "") === "Receita" && String(item.status || "").toLowerCase() === "pago")
    .reduce((sum, item) => sum + toMoney(item.valor), 0);
  const pendingRevenue = finance
    .filter((item) => String(item.tipo || "") === "Receita" && String(item.status || "").toLowerCase() !== "pago")
    .reduce((sum, item) => sum + toMoney(item.valor), 0);

  return {
    budgets: budgets.length,
    approvedBudgets: approvedBudgets.length,
    approvedValue: approvedBudgets.reduce((sum, item) => sum + toMoney(item.valorTotal), 0),
    financeItems: finance.length,
    paidRevenue,
    pendingRevenue,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const { chat } = await getChatSnapshot(chatId, tenantId);
    const [lead, aiState, notes, teamMembers, settings] = await Promise.all([
      resolveLead(chat, tenantId),
      getChatState(tenantId, chatId),
      listChatNotes(tenantId, chatId),
      listTeamMembers(tenantId),
      getTenantSettings(tenantId),
    ]);
    const [leadTasks, leadNotes, leadBudgets, leadFinance] = lead
      ? await Promise.all([
          listLeadTasks(tenantId, lead.id),
          listLeadNotes(tenantId, lead.id),
          listLeadBudgets(tenantId, lead.id),
          listLeadFinance(tenantId, lead.id),
        ])
      : [[], [], [], []];
    const commercialSummary = buildCommercialSummary(leadBudgets, leadFinance);

    return NextResponse.json({
      ok: true,
      tenantId,
      chat: {
        id: chatId,
        ...chat,
        tags: parseTags(chat.tags),
      },
      lead,
      leadTasks,
      leadNotes,
      leadBudgets: leadBudgets.slice(0, 6),
      leadFinance: leadFinance.slice(0, 6),
      commercialSummary,
      aiState: serializeAiState(aiState),
      notes,
      teamMembers,
      company: {
        tenantId,
        name: typeof settings?.name === "string" ? settings.name : "Cliente",
        niche: typeof settings?.niche === "string" ? settings.niche : "",
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar detalhe do chat:", error);
    return NextResponse.json({ error: "Falha ao carregar detalhe da conversa." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");

    const { chatRef, chat } = await getChatSnapshot(chatId, tenantId);
    const body = (await req.json()) as Body;

    const nextStatus = cleanString(body.status, 40).toLowerCase();
    const nextPriority = cleanString(body.priority, 40).toLowerCase();
    const nextTags = parseTags(body.tags);
    const assignedUserId = cleanString(body.assignedUserId, 120);

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    const changes: string[] = [];

    if (nextStatus && CHAT_STATUSES.has(nextStatus) && nextStatus !== cleanString(chat.status, 40).toLowerCase()) {
      patch.status = nextStatus;
      changes.push(`status: ${nextStatus}`);
    }

    if (
      nextPriority &&
      CHAT_PRIORITIES.has(nextPriority) &&
      nextPriority !== cleanString(chat.priority, 40).toLowerCase()
    ) {
      patch.priority = nextPriority;
      changes.push(`prioridade: ${nextPriority}`);
    }

    const currentTags = parseTags(chat.tags);
    if (JSON.stringify(currentTags) !== JSON.stringify(nextTags)) {
      patch.tags = nextTags;
      changes.push(`tags: ${nextTags.length ? nextTags.join(", ") : "sem tags"}`);
    }

    let assignedUserName: string | null = null;
    const currentAssignedUserId = cleanString(chat.assignedTo || chat.ownerId, 120);
    if (body.assignedUserId !== undefined && assignedUserId !== currentAssignedUserId) {
      if (assignedUserId) {
        const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${assignedUserId}`).get();
        if (!membershipSnap.exists) {
          return NextResponse.json({ error: "Usuario informado nao pertence a este tenant." }, { status: 400 });
        }

        const userSnap = await adminDb.collection("users").doc(assignedUserId).get();
        assignedUserName = userSnap.exists
          ? String((userSnap.data() as { name?: string }).name || "Usuario")
          : "Usuario";

        patch.assignedTo = assignedUserId;
        patch.ownerId = assignedUserId;
        patch.ownerName = assignedUserName;
        patch.assignedUserName = assignedUserName;
        changes.push(`responsavel: ${assignedUserName}`);
      } else {
        patch.assignedTo = null;
        patch.assignedUserName = null;
        changes.push("responsavel: sem atribuicao");
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, tenantId, chatId, unchanged: true });
    }

    Object.assign(
      patch,
      buildManualQueuePatch({
        status: String(patch.status || chat.status || "open"),
        assignedTo:
          body.assignedUserId !== undefined
            ? assignedUserId || null
            : cleanString(chat.assignedTo || chat.ownerId, 120) || null,
        lastClientMessageAt: chat.lastClientMessageAt,
        lastAgentMessageAt: chat.lastAgentMessageAt,
        slaDueAt: chat.slaDueAt,
      })
    );

    const writes: Promise<unknown>[] = [chatRef.set(patch, { merge: true })];

    writes.push(
      adminDb.collection("messages").add({
        chatId,
        tenantId,
        sender: "system",
        type: "text",
        text: `Atualizacao operacional por ${user.name}: ${changes.join(" | ")}`,
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    const leadId = typeof chat.leadId === "string" ? chat.leadId : "";
    if (leadId) {
      const leadRef = adminDb.collection("leads").doc(leadId);
      writes.push(
        leadRef.collection("events").add({
          type: "chat_operational_update",
          title: "Inbox atualizado",
          detail: changes.join(" | "),
          actorId: user.uid,
          actorName: user.name,
          chatId,
          createdAt: FieldValue.serverTimestamp(),
        })
      );

      if (assignedUserId) {
        writes.push(
          leadRef.set(
            {
              ownerId: assignedUserId,
              owner: assignedUserName || user.name,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        );
      }
    }

    await Promise.all(writes);

    return NextResponse.json({ ok: true, tenantId, chatId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar metadata do chat:", error);
    return NextResponse.json({ error: "Falha ao atualizar conversa." }, { status: 500 });
  }
}
