import { filterEligibleOperators, type TenantOperator } from "@/lib/inbox-routing-policy";
export { filterEligibleOperators } from "@/lib/inbox-routing-policy";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getTenantCapabilities, getTenantSettings, type TenantMembership } from "@/lib/server/tenant";

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeTeamId(value: unknown) {
  return clean(value, 80).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function getLocalBusinessDateParts(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    weekday: String(parts.weekday || "").toLowerCase(),
    minutes: Number(parts.hour || 0) * 60 + Number(parts.minute || 0),
  };
}

function parseHourToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function isWithinBusinessHours(settings: Record<string, unknown> | null) {
  const raw = clean(settings?.businessHours, 240) || "Seg-Sex 09:00-18:00";
  const match = raw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  const start = parseHourToMinutes(match?.[1] || "09:00") ?? 9 * 60;
  const end = parseHourToMinutes(match?.[2] || "18:00") ?? 18 * 60;
  const { weekday, minutes } = getLocalBusinessDateParts(clean(settings?.timezone, 80) || "America/Sao_Paulo");
  const isWeekend = weekday === "sat" || weekday === "sun";
  const weekdaysOnly = /seg\s*[-a]\s*sex|mon\s*[-a]\s*fri/i.test(raw) || !/sab|dom|sat|sun/i.test(raw);
  if (weekdaysOnly && isWeekend) return false;
  return minutes >= start && minutes <= end;
}

export function getInboxRules(settings: Record<string, unknown> | null) {
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
    businessHoursOnly: inbox.businessHoursOnly === true,
    defaultTeam: normalizeTeamId(inbox.defaultTeam) || "comercial",
    teams: Array.isArray(inbox.teams)
      ? inbox.teams
          .map((item) => {
            const team = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            return {
              id: normalizeTeamId(team.id || team.name),
              channels: parseStringList(team.channels),
              isDefault: team.isDefault === true,
            };
          })
          .filter((item) => item.id)
          .slice(0, 20)
      : [],
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
  return ["resolved", "archived", "closed", "merged"].includes(status);
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

      const capabilities = getTenantCapabilities({
        role: role as TenantMembership["role"], status: "active",
        capabilities: (Array.isArray(data.capabilities) ? data.capabilities : []) as TenantMembership["capabilities"],
        capabilitiesConfigured: Object.prototype.hasOwnProperty.call(data, "capabilities"),
      });
      if (!capabilities.includes("respond_inbox")) return null;

      const userId = clean(data.userId, 140);
      if (!userId) return null;

      const userSnap = await adminDb.collection("users").doc(userId).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

      if (userData.status === "blocked") return null;

      return {
        userId,
        name: clean(userData.name, 140) || clean(data.name, 140) || "Usuario",
        team: clean(data.team, 80) || "operacao",
        teamId: normalizeTeamId(data.team) || "operacao",
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

export async function resolveInboundAssignment(
  tenantId: string,
  input?: { channel?: string | null; priority?: string | null }
) {
  const settings = await getTenantSettings(tenantId);
  const rules = getInboxRules((settings || null) as Record<string, unknown> | null);

  if (!rules.autoAssignOnInbound) {
    return null;
  }
  if (rules.businessHoursOnly && !isWithinBusinessHours((settings || null) as Record<string, unknown> | null)) {
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
      rules: {
        inbox: {
          assignmentMode: rules.assignmentMode,
          autoAssignOnInbound: true,
          lastAssignedUserId: next.userId,
          lastAssignedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return next;
}
