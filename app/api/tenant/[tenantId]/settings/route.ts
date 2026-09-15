import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import { normalizeBusinessProfileId } from "@/lib/business-profiles";

type Body = {
  name?: string;
  niche?: string;
  businessProfileId?: string;
  responsibleName?: string;
  responsibleEmail?: string;
  phone?: string;
  website?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  timezone?: string;
  businessHours?: string;
  dailyReport?: {
    enabled?: boolean;
    ownerName?: string;
    ownerPhone?: string;
    sendHour?: string;
    templateName?: string;
    templateLanguage?: string;
  };
  rules?: {
    inbox?: {
      firstResponseSlaMinutes?: number;
      assignmentMode?: string;
      autoAssignOnInbound?: boolean;
      prioritizeHighPriority?: boolean;
      preferOnlineAgents?: boolean;
      strictChannelRouting?: boolean;
      fallbackToAnyAgent?: boolean;
      businessHoursOnly?: boolean;
      defaultTeam?: string;
      teams?: Array<{
        id?: string;
        name?: string;
        description?: string;
        channels?: string[] | string;
        isDefault?: boolean;
      }>;
    };
  };
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseRules(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const inbox = raw.inbox && typeof raw.inbox === "object" ? (raw.inbox as Record<string, unknown>) : {};
  const assignmentMode = clean(inbox.assignmentMode || "manual", 40).toLowerCase();

  const teamsSource = Array.isArray(inbox.teams) ? inbox.teams : [];
  const teams = teamsSource
    .map((item, index) => {
      const team = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const channels = Array.isArray(team.channels)
        ? team.channels.map((channel) => clean(channel, 40).toLowerCase()).filter(Boolean).slice(0, 8)
        : typeof team.channels === "string"
          ? team.channels.split(",").map((channel) => clean(channel, 40).toLowerCase()).filter(Boolean).slice(0, 8)
          : [];
      const id = clean(team.id, 80) || clean(team.name, 80).toLowerCase().replace(/\s+/g, "_") || `team_${index + 1}`;
      const name = clean(team.name, 80) || "Time";
      return {
        id: id.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80) || `team_${index + 1}`,
        name,
        description: clean(team.description, 180),
        channels,
        isDefault: team.isDefault === true,
      };
    })
    .slice(0, 20);

  const parsedInbox: Record<string, unknown> = {
      firstResponseSlaMinutes: clampNumber(inbox.firstResponseSlaMinutes, 15, 5, 24 * 60),
      assignmentMode:
        assignmentMode === "round_robin" || assignmentMode === "least_loaded"
          ? assignmentMode
          : "manual",
      autoAssignOnInbound: inbox.autoAssignOnInbound === true,
      prioritizeHighPriority: inbox.prioritizeHighPriority !== false,
      preferOnlineAgents: parseBoolean(inbox.preferOnlineAgents, true),
      strictChannelRouting: parseBoolean(inbox.strictChannelRouting, false),
      fallbackToAnyAgent: parseBoolean(inbox.fallbackToAnyAgent, true),
      businessHoursOnly: parseBoolean(inbox.businessHoursOnly, false),
      defaultTeam: clean(inbox.defaultTeam, 80) || "comercial",
      teams,
      lastAssignedUserId: clean(inbox.lastAssignedUserId, 140),
  };
  // Firestore rejects undefined values. This field only exists after the
  // first automatic distribution, so new workspaces must omit it entirely.
  if (inbox.lastAssignedAt !== undefined && inbox.lastAssignedAt !== null) {
    parsedInbox.lastAssignedAt = inbox.lastAssignedAt;
  }

  return {
    inbox: parsedInbox,
  };
}

function isValidHour(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function parseDailyReport(value: unknown, current?: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallback = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  const sendHour = clean(raw.sendHour ?? fallback.sendHour, 5);
  const normalizedSendHour = isValidHour(sendHour) ? sendHour : "18:30";

  return {
    enabled:
      typeof raw.enabled === "boolean"
        ? raw.enabled
        : typeof fallback.enabled === "boolean"
          ? fallback.enabled
          : true,
    ownerName: clean(raw.ownerName ?? fallback.ownerName, 140),
    ownerPhone: clean(raw.ownerPhone ?? fallback.ownerPhone, 40),
    sendHour: normalizedSendHour,
    templateName: clean(raw.templateName ?? fallback.templateName, 120) || "fechamento_dia_altum",
    templateLanguage: clean(raw.templateLanguage ?? fallback.templateLanguage, 24) || "pt_BR",
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const settings = await getTenantSettings(tenantId);

    return NextResponse.json({
      ok: true,
      tenantId,
      settings: {
        tenantId,
        name: clean(settings?.name, 180),
        niche: clean(settings?.niche, 120),
        businessProfileId: clean(settings?.businessProfileId, 40)
          ? normalizeBusinessProfileId(settings?.businessProfileId)
          : "",
        responsibleName: clean(settings?.responsibleName || settings?.ownerName, 140),
        responsibleEmail: clean(settings?.responsibleEmail, 180),
        phone: clean(settings?.phone, 40),
        website: clean(settings?.website, 180),
        addressLine: clean(settings?.addressLine, 180),
        city: clean(settings?.city, 80),
        state: clean(settings?.state, 60),
        timezone: clean(settings?.timezone, 80) || "America/Sao_Paulo",
        businessHours: clean(settings?.businessHours, 240) || "Seg-Sex 09:00-18:00",
        dailyReport: parseDailyReport(settings?.dailyReport),
        rules: parseRules(settings?.rules),
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar configuracoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar configuracoes." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const body = (await req.json()) as Body;
    const rawBody = body as Record<string, unknown>;
    const currentSettings = await getTenantSettings(tenantId);
    const currentRules = parseRules(currentSettings?.rules);
    const nextInboxRules = {
      ...currentRules.inbox,
      ...(((body.rules || {}).inbox as Record<string, unknown>) || {}),
    };

    const patch: Record<string, unknown> = {
      tenantId,
      rules: parseRules({ inbox: nextInboxRules }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };
    const tenantPatch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    const copyStringField = (field: keyof Body, max: number, targetField = field) => {
      if (!hasOwn(rawBody, field)) return;
      const value = clean(rawBody[field], max);
      patch[targetField] = field === "responsibleEmail" ? value.toLowerCase() : value;
      if (
        targetField === "name" ||
        targetField === "niche" ||
        targetField === "responsibleName" ||
        targetField === "responsibleEmail" ||
        targetField === "phone" ||
        targetField === "website" ||
        targetField === "city" ||
        targetField === "state"
      ) {
        tenantPatch[targetField] = patch[targetField];
      }
    };

    copyStringField("name", 180);
    copyStringField("niche", 120);
    copyStringField("responsibleName", 140);
    copyStringField("responsibleEmail", 180);
    copyStringField("phone", 40);
    copyStringField("website", 180);
    copyStringField("addressLine", 180);
    copyStringField("city", 80);
    copyStringField("state", 60);

    if (hasOwn(rawBody, "businessProfileId")) {
      patch.businessProfileId = normalizeBusinessProfileId(body.businessProfileId);
      tenantPatch.businessProfileId = patch.businessProfileId;
    }
    if (hasOwn(rawBody, "timezone")) {
      patch.timezone = clean(body.timezone, 80) || "America/Sao_Paulo";
    }
    if (hasOwn(rawBody, "businessHours")) {
      patch.businessHours = clean(body.businessHours, 240) || "Seg-Sex 09:00-18:00";
    }
    if (hasOwn(rawBody, "dailyReport")) {
      patch.dailyReport = parseDailyReport(body.dailyReport, currentSettings?.dailyReport);
    }

    await Promise.all([
      adminDb.collection("tenant_settings").doc(tenantId).set(patch, { merge: true }),
      Object.keys(tenantPatch).length > 1
        ? adminDb.collection("tenants").doc(tenantId).set(tenantPatch, { merge: true })
        : Promise.resolve(),
    ]);

    return NextResponse.json({ ok: true, tenantId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao salvar configuracoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar configuracoes." }, { status: 500 });
  }
}
