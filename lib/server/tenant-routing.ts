import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getTenantSettings } from "@/lib/server/tenant";

type TenantOperator = {
  userId: string;
  name: string;
  team: string;
  availability: "online" | "busy" | "offline";
  allowedChannels: string[];
  maxOpenChats: number | null;
};

function clean(value: unknown, max = 180) {
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

  return {
    assignmentMode: clean(inbox.assignmentMode || "manual", 40).toLowerCase(),
    autoAssignOnInbound: inbox.autoAssignOnInbound === true,
    prioritizeHighPriority: inbox.prioritizeHighPriority !== false,
    preferOnlineAgents: inbox.preferOnlineAgents !== false,
    strictChannelRouting: inbox.strictChannelRouting === true,
    fallbackToAnyAgent: inbox.fallbackToAnyAgent !== false,
    lastAssignedUserId: clean(inbox.lastAssignedUserId, 140),
  };
}

function parseStringList(value: unknown, maxItems = 8, maxItemLen = 40) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => clean(item, maxItemLen).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function normalizeAvailability(value: unknown): TenantOperator["availability"] {
  const availability = clean(value, 20).toLowerCase();
  if (availability === "busy") return "busy";
  if (availability === "offline") return "offline";
  return "online";
}

function isClosedChatStatus(value: unknown) {
  const status = clean(value, 40).toLowerCase();
  return status === "resolved" || status === "archived";
}

export async function listTenantOperators(tenantId: string) {
  const snap = await adminDb
    .collection("tenant_users")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "active")
    .limit(80)
    .get();

  const items = await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>;
      const role = clean(data.role, 40).toLowerCase();
      if (!["client_owner", "client_admin", "client_agent"].includes(role)) return null;

      const userId = clean(data.userId, 140);
      if (!userId) return null;

      const userSnap = await adminDb.collection("users").doc(userId).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

      return {
        userId,
        name: clean(userData.name, 140) || clean(data.name, 140) || "Usuario",
        team: clean(data.team, 80) || "operacao",
        availability: normalizeAvailability(data.availability),
        allowedChannels: parseStringList(data.allowedChannels),
        maxOpenChats: (() => {
          const parsed = Number(data.maxOpenChats);
          return Number.isFinite(parsed) && parsed > 0 ? Math.min(200, Math.round(parsed)) : null;
        })(),
      } satisfies TenantOperator;
    })
  );

  return items
    .filter((item): item is TenantOperator => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function getActiveLoadMap(tenantId: string, operators: TenantOperator[]) {
  const chatsSnap = await adminDb
    .collection("chats")
    .where("tenantId", "==", tenantId)
    .limit(600)
    .get();

  const activeLoads = new Map<string, number>();
  for (const operator of operators) {
    activeLoads.set(operator.userId, 0);
  }

  for (const doc of chatsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (isClosedChatStatus(data.status)) continue;

    const ownerId = clean(data.assignedTo || data.ownerId, 140);
    if (!ownerId || !activeLoads.has(ownerId)) continue;
    activeLoads.set(ownerId, (activeLoads.get(ownerId) || 0) + 1);
  }

  return activeLoads;
}

function filterEligibleOperators(input: {
  operators: TenantOperator[];
  activeLoads: Map<string, number>;
  channel?: string | null;
  rules: ReturnType<typeof getInboxRules>;
}) {
  const channel = clean(input.channel, 40).toLowerCase();
  let eligible = [...input.operators];

  if (input.rules.preferOnlineAgents) {
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

    if (input.rules.strictChannelRouting) {
      if (channelMatched.length > 0) {
        eligible = channelMatched;
      } else if (!input.rules.fallbackToAnyAgent) {
        eligible = [];
      }
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

export async function resolveInboundAssignment(
  tenantId: string,
  input?: { channel?: string | null; priority?: string | null }
) {
  const settings = await getTenantSettings(tenantId);
  const rules = getInboxRules((settings || null) as Record<string, unknown> | null);

  if (!rules.autoAssignOnInbound) {
    return null;
  }

  const operators = await listTenantOperators(tenantId);
  if (operators.length === 0) return null;
  const activeLoads = await getActiveLoadMap(tenantId, operators);
  const eligibleOperators = filterEligibleOperators({
    operators,
    activeLoads,
    channel: input?.channel || null,
    rules,
  });
  if (eligibleOperators.length === 0) return null;

  let next: TenantOperator | null = null;

  if (rules.assignmentMode === "round_robin") {
    const ordered = [...eligibleOperators].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const currentIndex = ordered.findIndex((item) => item.userId === rules.lastAssignedUserId);
    next = ordered[(currentIndex + 1) % ordered.length] || ordered[0];
  } else if (rules.assignmentMode === "least_loaded") {
    next = [...eligibleOperators].sort((a, b) => {
      const aLoad = activeLoads.get(a.userId) || 0;
      const bLoad = activeLoads.get(b.userId) || 0;
      if (aLoad !== bLoad) return aLoad - bLoad;
      if (rules.prioritizeHighPriority && clean(input?.priority, 20).toLowerCase() === "high") {
        if (a.availability !== b.availability) {
          if (a.availability === "online") return -1;
          if (b.availability === "online") return 1;
        }
      }
      return a.name.localeCompare(b.name, "pt-BR");
    })[0];
  } else {
    return null;
  }

  if (!next) return null;

  await adminDb.collection("tenant_settings").doc(tenantId).set(
    {
      tenantId,
      "rules.inbox.assignmentMode": rules.assignmentMode,
      "rules.inbox.autoAssignOnInbound": true,
      "rules.inbox.lastAssignedUserId": next.userId,
      "rules.inbox.lastAssignedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return next;
}
