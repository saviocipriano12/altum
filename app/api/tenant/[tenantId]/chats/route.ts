import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { syncRecentMessengerConversationsForTenant } from "@/lib/server/meta-conversation-sync";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";

type ChatStateItem = {
  aiEnabled: boolean;
  pausedUntil: unknown;
  humanOwnerUserId: string | null;
  updatedByName: string | null;
  pauseReason: string | null;
  updatedAt: unknown;
  lastJobStatus?: string | null;
  lastJobError?: string | null;
  lastJobErrorCode?: string | null;
  lastDecision?: string | null;
  lastDecisionReason?: string | null;
  lastDecisionReasonCode?: string | null;
  lastProcessedAt?: unknown;
  lastJobId?: string | null;
  lastMessageId?: string | null;
  lastHandoffNotifyAt?: unknown;
  lastHandoffNotifyMessageId?: string | null;
  lastHandoffNotifyStatus?: string | null;
  lastHandoffNotifyRecipients?: number | null;
  lastHandoffNotifySuccessCount?: number | null;
  lastHandoffNotifyFailureCount?: number | null;
};

type ChatListItem = Record<string, unknown> & {
  id: string;
  lastMessageTime?: unknown;
  aiState: ChatStateItem | null;
};

type ContactProfileItem = {
  phone?: string;
  leadId?: string;
  name?: string;
  company?: string;
  photoUrl?: string;
};

type LeadSignalItem = {
  id: string;
  phone?: string;
  heat?: string;
  aiCommercialTemperature?: string;
  aiNextAction?: string;
  priority?: string;
  pipelineStage?: string;
  stage?: string;
};

type ChatEnrichment = {
  contacts: Awaited<ReturnType<typeof listContactProfiles>>;
  leadSignals: Awaited<ReturnType<typeof listLeadSignals>>;
};

function emptyChatEnrichment(): ChatEnrichment {
  return {
    contacts: { byPhone: new Map(), byLeadId: new Map() },
    leadSignals: { byLeadId: new Map(), byPhone: new Map() },
  };
}

const ENRICHMENT_CACHE_TTL_MS = 30_000;
const enrichmentCache = new Map<
  string,
  { expiresAt: number; value?: ChatEnrichment; inFlight?: Promise<ChatEnrichment> }
>();

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function isFuture(value: unknown) {
  return toTime(value) > Date.now();
}

function cleanString(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function phoneKey(value: unknown) {
  const digits = cleanString(value, 80).replace(/\D/g, "");
  return digits ? digits.slice(-13) : "";
}

async function listContactProfiles(tenantId: string) {
  const snap = await adminDb
    .collection("contacts")
    .where("tenantId", "==", tenantId)
    .select("phone", "leadId", "name", "company", "photoUrl")
    .limit(500)
    .get();

  const byPhone = new Map<string, ContactProfileItem>();
  const byLeadId = new Map<string, ContactProfileItem>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const item: ContactProfileItem = {
      phone: cleanString(data.phone, 60),
      leadId: cleanString(data.leadId, 180),
      name: cleanString(data.name, 180),
      company: cleanString(data.company, 180),
      photoUrl: cleanString(data.photoUrl, 1000),
    };

    if (item.phone) {
      byPhone.set(item.phone, item);
      const normalizedPhone = phoneKey(item.phone);
      if (normalizedPhone) byPhone.set(normalizedPhone, item);
    }
    if (item.leadId) byLeadId.set(item.leadId, item);
  }

  return { byPhone, byLeadId };
}

async function listLeadSignals(tenantId: string) {
  const snap = await adminDb
    .collection("leads")
    .where("tenantId", "==", tenantId)
    .select("telefone", "heat", "aiCommercialTemperature", "aiNextAction", "priority", "pipelineStage", "stage")
    .limit(500)
    .get();

  const byLeadId = new Map<string, LeadSignalItem>();
  const byPhone = new Map<string, LeadSignalItem>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const item: LeadSignalItem = {
      id: doc.id,
      phone: cleanString(data.telefone, 60),
      heat: cleanString(data.heat, 40),
      aiCommercialTemperature: cleanString(data.aiCommercialTemperature, 40),
      aiNextAction: cleanString(data.aiNextAction, 120),
      priority: cleanString(data.priority, 40),
      pipelineStage: cleanString(data.pipelineStage, 80),
      stage: cleanString(data.stage, 80),
    };

    byLeadId.set(doc.id, item);
    if (item.phone) {
      byPhone.set(item.phone, item);
      const normalizedPhone = phoneKey(item.phone);
      if (normalizedPhone) byPhone.set(normalizedPhone, item);
    }
  }

  return { byLeadId, byPhone };
}

async function listRecentChats(tenantId: string, pageLimit: number) {
  try {
    return await adminDb
      .collection("chats")
      .where("tenantId", "==", tenantId)
      .orderBy("lastMessageTime", "desc")
      .limit(pageLimit)
      .get();
  } catch (error) {
    // Uma instalacao antiga pode ainda estar sem o indice composto. A inbox
    // continua funcional durante essa propagacao, sem bloquear a operacao.
    console.warn("Indice de ordenacao da inbox indisponivel; usando fallback:", error);
    return adminDb.collection("chats").where("tenantId", "==", tenantId).limit(pageLimit).get();
  }
}

async function getChatEnrichment(tenantId: string) {
  const cached = enrichmentCache.get(tenantId);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.inFlight) return cached.inFlight;

  const inFlight = Promise.all([listContactProfiles(tenantId), listLeadSignals(tenantId)]).then(
    ([contacts, leadSignals]) => ({ contacts, leadSignals })
  );
  enrichmentCache.set(tenantId, { expiresAt: 0, inFlight });

  try {
    const value = await inFlight;
    if (enrichmentCache.size >= 100) {
      const oldestTenantId = enrichmentCache.keys().next().value;
      if (oldestTenantId && oldestTenantId !== tenantId) enrichmentCache.delete(oldestTenantId);
    }
    enrichmentCache.set(tenantId, { value, expiresAt: Date.now() + ENRICHMENT_CACHE_TTL_MS });
    return value;
  } catch (error) {
    enrichmentCache.delete(tenantId);
    throw error;
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    assertTenantRole(membership, "client_viewer");

    const url = new URL(req.url);
    const compact = url.searchParams.get("view") === "compact";
    const requestedLimit = Number(url.searchParams.get("limit") || (compact ? 100 : 200));
    const boundedLimit = Number.isFinite(requestedLimit)
      ? Math.max(25, Math.min(200, Math.round(requestedLimit)))
      : 200;
    const pageLimit = compact ? Math.min(100, boundedLimit) : boundedLimit;
    const syncExternal = url.searchParams.get("sync") === "recent";

    if (syncExternal) {
      await syncRecentMessengerConversationsForTenant(tenantId).catch((error) => {
        console.warn("Falha ao sincronizar conversas recentes do Messenger:", error);
      });
    }

    const [snap, stateSnap, enrichment] = await Promise.all([
      listRecentChats(tenantId, pageLimit),
      compact
        ? Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })
        : adminDb.collection("chat_state")
            .where("tenantId", "==", tenantId)
            .select(
              "chatId", "aiEnabled", "pausedUntil", "humanOwnerUserId", "updatedByName", "pauseReason", "updatedAt",
              "lastJobStatus", "lastJobError", "lastJobErrorCode", "lastDecision", "lastDecisionReason", "lastDecisionReasonCode",
              "lastProcessedAt", "lastJobId", "lastMessageId", "lastHandoffNotifyAt", "lastHandoffNotifyMessageId",
              "lastHandoffNotifyStatus", "lastHandoffNotifyRecipients", "lastHandoffNotifySuccessCount", "lastHandoffNotifyFailureCount"
            )
            .limit(500)
            .get(),
      compact ? Promise.resolve(emptyChatEnrichment()) : getChatEnrichment(tenantId),
    ]);
    const { contacts, leadSignals } = enrichment;

    const stateMap = new Map<string, ChatStateItem>(
      stateSnap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return [
          String(data.chatId || ""),
          {
            aiEnabled: isFuture(data.pausedUntil) ? data.aiEnabled !== false : true,
            pausedUntil: isFuture(data.pausedUntil) ? data.pausedUntil || null : null,
            humanOwnerUserId:
              isFuture(data.pausedUntil) && typeof data.humanOwnerUserId === "string"
                ? data.humanOwnerUserId
                : null,
            updatedByName:
              typeof data.updatedByName === "string" ? data.updatedByName : null,
            pauseReason:
              isFuture(data.pausedUntil) && typeof data.pauseReason === "string" ? data.pauseReason : null,
            updatedAt: data.updatedAt || null,
            lastJobStatus: typeof data.lastJobStatus === "string" ? data.lastJobStatus : null,
            lastJobError: typeof data.lastJobError === "string" ? data.lastJobError : null,
            lastJobErrorCode: typeof data.lastJobErrorCode === "string" ? data.lastJobErrorCode : null,
            lastDecision: typeof data.lastDecision === "string" ? data.lastDecision : null,
            lastDecisionReason: typeof data.lastDecisionReason === "string" ? data.lastDecisionReason : null,
            lastDecisionReasonCode:
              typeof data.lastDecisionReasonCode === "string" ? data.lastDecisionReasonCode : null,
            lastProcessedAt: data.lastProcessedAt || null,
            lastJobId: typeof data.lastJobId === "string" ? data.lastJobId : null,
            lastMessageId: typeof data.lastMessageId === "string" ? data.lastMessageId : null,
            lastHandoffNotifyAt: data.lastHandoffNotifyAt || null,
            lastHandoffNotifyMessageId:
              typeof data.lastHandoffNotifyMessageId === "string" ? data.lastHandoffNotifyMessageId : null,
            lastHandoffNotifyStatus:
              typeof data.lastHandoffNotifyStatus === "string" ? data.lastHandoffNotifyStatus : null,
            lastHandoffNotifyRecipients:
              typeof data.lastHandoffNotifyRecipients === "number" ? data.lastHandoffNotifyRecipients : null,
            lastHandoffNotifySuccessCount:
              typeof data.lastHandoffNotifySuccessCount === "number" ? data.lastHandoffNotifySuccessCount : null,
            lastHandoffNotifyFailureCount:
              typeof data.lastHandoffNotifyFailureCount === "number" ? data.lastHandoffNotifyFailureCount : null,
          },
        ];
      })
    );

    const items: ChatListItem[] = snap.docs
      .map((doc) => ({
        id: doc.id,
        ...(() => {
          const chat = doc.data() as Record<string, unknown>;
          const contactPhone = cleanString(chat.contactPhone, 60);
          const leadId = cleanString(chat.leadId, 180);
          const profile = contacts.byPhone.get(contactPhone) || contacts.byPhone.get(phoneKey(contactPhone)) || contacts.byLeadId.get(leadId);
          const leadSignal =
            leadSignals.byLeadId.get(leadId) ||
            leadSignals.byPhone.get(contactPhone) ||
            leadSignals.byPhone.get(phoneKey(contactPhone));
          return {
            ...chat,
            contactName:
              cleanString(chat.contactName, 180) ||
              profile?.name ||
              cleanString(chat.contactPhone, 60) ||
              "",
            contactCompany:
              cleanString(chat.contactCompany, 180) ||
              profile?.company ||
              "",
            contactPhotoUrl:
              cleanString(chat.contactPhotoUrl, 1000) ||
              profile?.photoUrl ||
              "",
            leadHeat: leadSignal?.heat || "",
            leadTemperature: leadSignal?.aiCommercialTemperature || "",
            leadNextAction: leadSignal?.aiNextAction || "",
            leadPriority: leadSignal?.priority || "",
            leadStage: leadSignal?.pipelineStage || leadSignal?.stage || "",
          };
        })(),
        aiState: stateMap.get(doc.id) || null,
      }) as ChatListItem)
      .filter((chat) => !cleanString(chat.mergedIntoChatId, 180))
      .filter((chat) => canAccessAssignedCommercialRecord(membership, user.uid, chat))
      .sort((a, b) => toTime(b.lastMessageTime) - toTime(a.lastMessageTime));

    return NextResponse.json({ ok: true, tenantId, items, limit: pageLimit });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar chats do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar chats." }, { status: 500 });
  }
}
