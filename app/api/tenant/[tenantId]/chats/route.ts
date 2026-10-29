import { NextResponse } from "next/server";
import { listRecentChats } from "@/lib/server/conversation-queries";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { recoverRecentMetaInbox } from "@/lib/server/meta-inbox-recovery";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import { decodeConversationCursor, encodeConversationCursor } from "@/lib/server/conversation-pagination";
import { hydrateWhatsAppGroupNames } from "@/lib/server/messaging/whatsapp-group-name";

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
  contacts: { byPhone: Map<string, ContactProfileItem>; byLeadId: Map<string, ContactProfileItem> };
  leadSignals: { byLeadId: Map<string, LeadSignalItem>; byPhone: Map<string, LeadSignalItem> };
};

function emptyChatEnrichment(): ChatEnrichment {
  return {
    contacts: { byPhone: new Map(), byLeadId: new Map() },
    leadSignals: { byLeadId: new Map(), byPhone: new Map() },
  };
}

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

type ChatFilters = {
  search: string;
  status: string;
  priority: string;
  queue: string;
  ai: string;
  conversationType: string;
  channel: string;
  channelId: string;
  assignedUserId: string;
  temperature: string;
  leadId: string;
};

function readChatFilters(url: URL): ChatFilters {
  const allowed = (name: string, values: string[]) => {
    const value = cleanString(url.searchParams.get(name), 80).toLowerCase();
    return values.includes(value) ? value : "all";
  };
  return {
    search: cleanString(url.searchParams.get("q"), 120).toLowerCase(),
    status: allowed("status", ["all", "open", "pending", "resolved", "archived"]),
    priority: allowed("priority", ["all", "low", "medium", "high"]),
    queue: allowed("queue", ["all", "sla_breached", "unassigned", "assigned_waiting", "assigned", "triage"]),
    ai: allowed("ai", ["all", "ai_active", "ai_paused", "human_owned"]),
    conversationType: allowed("conversationType", ["all", "groups", "contacts"]),
    channel: cleanString(url.searchParams.get("channel"), 60).toLowerCase() || "all",
    channelId: cleanString(url.searchParams.get("channelId"), 180) || "all",
    assignedUserId: cleanString(url.searchParams.get("assignedUserId"), 180) || "all",
    temperature: allowed("temperature", ["all", "hot", "warm", "cold"]),
    leadId: cleanString(url.searchParams.get("leadId"), 180),
  };
}

function hasActiveChatFilters(filters: ChatFilters) {
  return Boolean(filters.search || filters.leadId || Object.entries(filters).some(([key, value]) =>
    key !== "search" && key !== "leadId" && value !== "all"
  ));
}

function normalizedTemperature(value: unknown) {
  const temperature = cleanString(value, 40).toLowerCase();
  if (["hot", "quente", "alta", "high"].includes(temperature)) return "hot";
  if (["warm", "morno", "media", "medium"].includes(temperature)) return "warm";
  if (["cold", "frio", "baixa", "low"].includes(temperature)) return "cold";
  return "";
}

function matchesChatFilters(chat: ChatListItem, filters: ChatFilters) {
  if (filters.conversationType === "groups" && chat.isGroup !== true) return false;
  if (filters.conversationType === "contacts" && chat.isGroup === true) return false;
  if (filters.status !== "all" && (cleanString(chat.status, 40).toLowerCase() || "open") !== filters.status) return false;
  if (filters.priority !== "all" && (cleanString(chat.priority, 40).toLowerCase() || "low") !== filters.priority) return false;
  if (filters.channel !== "all" && (cleanString(chat.channel, 60).toLowerCase() || "whatsapp") !== filters.channel) return false;
  if (filters.channelId !== "all" && cleanString(chat.channelId, 180) !== filters.channelId) return false;
  const assigned = cleanString(chat.assignedTo || chat.ownerId, 180);
  if (filters.assignedUserId !== "all" && assigned !== filters.assignedUserId) return false;
  if (filters.leadId && cleanString(chat.leadId, 180) !== filters.leadId) return false;
  if (filters.temperature !== "all" && normalizedTemperature(chat.leadTemperature || chat.leadHeat) !== filters.temperature) return false;

  const queueStatus = cleanString(chat.queueStatus, 40).toLowerCase() || "open";
  if (filters.queue === "unassigned" && assigned) return false;
  if (filters.queue === "assigned" && !assigned) return false;
  if (filters.queue !== "all" && filters.queue !== "unassigned" && filters.queue !== "assigned" && filters.queue !== "sla_breached" && queueStatus !== filters.queue) return false;
  if (filters.queue === "sla_breached") {
    const status = cleanString(chat.status, 40).toLowerCase() || "open";
    const clientAt = toTime(chat.lastClientMessageAt);
    const agentAt = toTime(chat.lastAgentMessageAt);
    const dueAt = toTime(chat.slaDueAt) || (clientAt ? clientAt + 15 * 60_000 : 0);
    if (["resolved", "archived"].includes(status) || !clientAt || agentAt >= clientAt || !dueAt || dueAt > Date.now()) return false;
  }

  const paused = chat.isGroup === true || Boolean(chat.aiState && (chat.aiState.aiEnabled === false || isFuture(chat.aiState.pausedUntil)));
  if (filters.ai === "ai_active" && paused) return false;
  if (filters.ai === "ai_paused" && !paused) return false;
  if (filters.ai === "human_owned" && !chat.aiState?.humanOwnerUserId) return false;

  if (filters.search) {
    const tags = Array.isArray(chat.tags) ? chat.tags : [];
    const haystack = [chat.contactName, chat.contactPhone, chat.contactCompany, chat.channel, chat.lastMessage, chat.ownerName, chat.assignedUserName, ...tags]
      .map((value) => cleanString(value, 400).toLowerCase())
      .join(" ");
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

async function getChatEnrichmentForPage(
  tenantId: string,
  chatDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<ChatEnrichment> {
  const leadIds = Array.from(new Set(chatDocs
    .map((doc) => cleanString(doc.data().leadId, 180))
    .filter(Boolean)));
  if (!leadIds.length) return emptyChatEnrichment();

  const leadDocs = await adminDb.getAll(...leadIds.map((leadId) => adminDb.collection("leads").doc(leadId)));
  const contacts = { byPhone: new Map<string, ContactProfileItem>(), byLeadId: new Map<string, ContactProfileItem>() };
  const leadSignals = { byLeadId: new Map<string, LeadSignalItem>(), byPhone: new Map<string, LeadSignalItem>() };

  for (const doc of leadDocs) {
    if (!doc.exists) continue;
    const data = doc.data() as Record<string, unknown>;
    if (cleanString(data.tenantId, 180) !== tenantId) continue;
    const phone = cleanString(data.telefone, 60);
    const profile: ContactProfileItem = {
      phone,
      leadId: doc.id,
      name: cleanString(data.nome, 180),
      company: cleanString(data.empresa, 180),
      photoUrl: cleanString(data.profilePhotoUrl || data.photoUrl, 1000),
    };
    const signal: LeadSignalItem = {
      id: doc.id,
      phone,
      heat: cleanString(data.heat, 40),
      aiCommercialTemperature: cleanString(data.aiCommercialTemperature, 40),
      aiNextAction: cleanString(data.aiNextAction, 120),
      priority: cleanString(data.priority, 40),
      pipelineStage: cleanString(data.pipelineStage, 80),
      stage: cleanString(data.stage, 80),
    };
    contacts.byLeadId.set(doc.id, profile);
    leadSignals.byLeadId.set(doc.id, signal);
    if (phone) {
      contacts.byPhone.set(phone, profile);
      leadSignals.byPhone.set(phone, signal);
      const normalizedPhone = phoneKey(phone);
      if (normalizedPhone) {
        contacts.byPhone.set(normalizedPhone, profile);
        leadSignals.byPhone.set(normalizedPhone, signal);
      }
    }
  }
  return { contacts, leadSignals };
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
    const requestedLimit = Number(url.searchParams.get("limit") || (compact ? 50 : 100));
    const boundedLimit = Number.isFinite(requestedLimit)
      ? Math.max(20, Math.min(100, Math.round(requestedLimit)))
      : 50;
    const pageLimit = boundedLimit;
    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor ? decodeConversationCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Cursor de conversas invalido.", code: "invalid_cursor" }, { status: 400 });
    }
    const filters = readChatFilters(url);
    const filteredRequest = hasActiveChatFilters(filters);
    // Scan a wider ordered window so assignment rules and filters do not turn
    // a page into a misleading empty result. The response remains bounded.
    const scanLimit = 200;
    const syncExternal = url.searchParams.get("sync") === "recent";

    if (syncExternal) {
      await recoverRecentMetaInbox(tenantId).catch((error) => {
        console.warn("Falha ao recuperar conversas recentes da Meta:", error);
      });
    }

    const [snap, channelsSnap] = await Promise.all([
      listRecentChats(tenantId, scanLimit, cursor),
      adminDb.collection("tenant_channels")
        .where("tenantId", "==", tenantId)
        .select("displayName", "phoneNumber", "provider", "channelScope", "ownerUserId", "ownerUserName")
        .limit(100)
        .get(),
    ]);
    const scannedDocs = snap.docs.slice(0, scanLimit);
    const [stateSnap, enrichment] = await Promise.all([
      compact && !filteredRequest
        ? Promise.resolve({ docs: [] as FirebaseFirestore.DocumentSnapshot[] })
        : scannedDocs.length
          ? adminDb.getAll(...scannedDocs.map((doc) => adminDb.collection("chat_state").doc(`${tenantId}_${doc.id}`)))
              .then((docs) => ({ docs: docs.filter((doc) => doc.exists) }))
          : Promise.resolve({ docs: [] as FirebaseFirestore.DocumentSnapshot[] }),
      compact && !filteredRequest
        ? Promise.resolve(emptyChatEnrichment())
        : getChatEnrichmentForPage(tenantId, scannedDocs),
    ]);
    const { contacts, leadSignals } = enrichment;
    const channelMap = new Map(channelsSnap.docs.map((doc) => [doc.id, doc.data() as Record<string, unknown>]));

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

    const hasMore = snap.size > scanLimit;
    const items: ChatListItem[] = scannedDocs
      .map((doc) => ({
        id: doc.id,
        ...(() => {
          const chat = doc.data() as Record<string, unknown>;
          const channelId = cleanString(chat.channelId, 180);
          const channelConfig = channelMap.get(channelId) || {};
          const contactPhone = cleanString(chat.contactPhone, 60);
          const leadId = cleanString(chat.leadId, 180);
          const profile = chat.isGroup === true ? undefined : contacts.byPhone.get(contactPhone) || contacts.byPhone.get(phoneKey(contactPhone)) || contacts.byLeadId.get(leadId);
          const leadSignal = chat.isGroup === true ? undefined :
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
            channelDisplayName: cleanString(channelConfig.displayName, 180),
            channelPhoneNumber: cleanString(channelConfig.phoneNumber, 80),
            channelProvider: cleanString(channelConfig.provider, 80),
            channelScope: cleanString(channelConfig.channelScope, 40),
            channelOwnerUserId: cleanString(channelConfig.ownerUserId, 140),
            channelOwnerUserName: cleanString(channelConfig.ownerUserName, 140),
          };
        })(),
        aiState: stateMap.get(doc.id) || null,
      }) as ChatListItem)
      .filter((chat) => !cleanString(chat.mergedIntoChatId, 180))
      .filter((chat) => canAccessAssignedCommercialRecord(membership, user.uid, chat))
      .filter((chat) => matchesChatFilters(chat, filters))
      .sort((a, b) => toTime(b.lastMessageTime) - toTime(a.lastMessageTime));

    const pageItems = items.slice(0, pageLimit);
    await hydrateWhatsAppGroupNames(tenantId, pageItems);
    const pageWasFilledBeforeScanEnded = items.length > pageLimit;
    const lastPageItem = pageItems[pageItems.length - 1];
    const lastScanned = scannedDocs[scannedDocs.length - 1];
    const continuationSource = pageWasFilledBeforeScanEnded ? lastPageItem : lastScanned
      ? {
          id: pageWasFilledBeforeScanEnded ? lastPageItem!.id : lastScanned!.id,
          lastMessageTime: pageWasFilledBeforeScanEnded
            ? lastPageItem!.lastMessageTime
            : lastScanned!.data().lastMessageTime,
        }
      : null;
    const responseHasMore = pageWasFilledBeforeScanEnded || hasMore;
    const nextCursor = responseHasMore && continuationSource
      ? encodeConversationCursor(toTime(continuationSource.lastMessageTime), continuationSource.id)
      : null;

    return NextResponse.json({
      ok: true,
      tenantId,
      items: pageItems,
      limit: pageLimit,
      scanned: scannedDocs.length,
      hasMore: responseHasMore,
      nextCursor,
      coverageComplete: !responseHasMore,
      filtered: filteredRequest,
    });
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
