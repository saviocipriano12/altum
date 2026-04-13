import type { TenantSettings } from "@/lib/server/tenant";

export type SocialActiveHours = {
  timezone: string;
  start: string;
  end: string;
  days: number[];
};

export type TenantSocialAutomationConfig = {
  tenantId: string;
  enabled: boolean;
  dmAutoReply: boolean;
  commentAutoReply: boolean;
  newFollowerMessageEnabled: boolean;
  newFollowerMessageTemplate: string;
  dmPrompt: string;
  commentPrompt: string;
  optOutKeywords: string[];
  activeHours: SocialActiveHours;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
};

type TimeParts = {
  dayOfWeek: number;
  minutes: number;
};

function cleanText(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function cleanDays(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const normalized = Array.from(
    new Set(
      source
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    )
  ).sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : [1, 2, 3, 4, 5, 6, 0];
}

function cleanTime(value: unknown, fallback: string) {
  const candidate = cleanText(value, 5);
  return /^\d{2}:\d{2}$/.test(candidate) ? candidate : fallback;
}

function cleanTimezone(value: unknown, fallback: string) {
  const candidate = cleanText(value, 80);
  return candidate || fallback;
}

export function parseKeywordList(value: unknown, fallback: string[] = ["parar", "stop", "sair"]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = Array.from(
    new Set(
      source
        .map((item) =>
          cleanText(item, 40)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
        )
        .filter(Boolean)
    )
  );

  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeTenantSocialAutomationConfig(
  tenantId: string,
  data: Record<string, unknown> | null | undefined,
  tenantSettings?: TenantSettings | null
): TenantSocialAutomationConfig {
  const normalizedTenantId = cleanText(tenantId, 180);
  const timezone =
    cleanTimezone(data?.activeHours && typeof data.activeHours === "object" ? (data.activeHours as Record<string, unknown>).timezone : "", "") ||
    cleanTimezone(tenantSettings?.timezone, "America/Sao_Paulo");
  const hours =
    data?.activeHours && typeof data.activeHours === "object"
      ? (data.activeHours as Record<string, unknown>)
      : {};

  return {
    tenantId: normalizedTenantId,
    enabled: cleanBoolean(data?.enabled, true),
    dmAutoReply: cleanBoolean(data?.dmAutoReply, true),
    commentAutoReply: cleanBoolean(data?.commentAutoReply, false),
    newFollowerMessageEnabled: cleanBoolean(data?.newFollowerMessageEnabled, false),
    newFollowerMessageTemplate:
      cleanText(data?.newFollowerMessageTemplate, 600) ||
      "Oi, {{nome}}! Obrigado por seguir a gente. Se quiser, me conta aqui o que voce esta buscando e eu continuo com voce por mensagem.",
    dmPrompt:
      cleanText(data?.dmPrompt, 800) ||
      "Responda em portugues do Brasil, de forma acolhedora, objetiva e comercialmente util.",
    commentPrompt:
      cleanText(data?.commentPrompt, 800) ||
      "Responda em portugues do Brasil, com tom publico, curto e convidando a conversa continuar no direct quando fizer sentido.",
    optOutKeywords: parseKeywordList(data?.optOutKeywords),
    activeHours: {
      timezone,
      start: cleanTime(hours.start, "08:00"),
      end: cleanTime(hours.end, "20:00"),
      days: cleanDays(hours.days),
    },
    updatedAt: data?.updatedAt,
    updatedBy: cleanText(data?.updatedBy, 180),
    updatedByName: cleanText(data?.updatedByName, 180),
  };
}

function extractTimeParts(date: Date, timezone: string): TimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, item) => {
    if (item.type !== "literal") {
      acc[item.type] = item.value;
    }
    return acc;
  }, {});

  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);

  return {
    dayOfWeek: weekdays[parts.weekday || "Sun"] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((item) => Number(item));
  return hours * 60 + minutes;
}

export function isWithinSocialActiveHours(
  activeHours: SocialActiveHours,
  now = new Date()
) {
  const { dayOfWeek, minutes } = extractTimeParts(now, activeHours.timezone);
  if (!activeHours.days.includes(dayOfWeek)) {
    return false;
  }

  const startMinutes = toMinutes(activeHours.start);
  const endMinutes = toMinutes(activeHours.end);

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes <= endMinutes;
  }

  return minutes >= startMinutes || minutes <= endMinutes;
}

export function normalizeOptOutText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textTriggersSocialOptOut(text: string, keywords: string[]) {
  const normalizedText = normalizeOptOutText(text);
  if (!normalizedText) return false;
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeOptOutText(keyword);
    return normalizedKeyword && normalizedText.includes(normalizedKeyword);
  });
}
