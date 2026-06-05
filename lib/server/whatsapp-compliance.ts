export const WHATSAPP_BULK_MIN_INTERVAL_HOURS = 72;
export const WHATSAPP_BULK_MIN_INTERVAL_MS = WHATSAPP_BULK_MIN_INTERVAL_HOURS * 60 * 60 * 1000;

const OPT_OUT_TAGS = new Set([
  "opt_out",
  "optout",
  "whatsapp_opt_out",
  "marketing_opt_out",
  "nao_contatar",
  "nao_entrar_em_contato",
  "do_not_contact",
  "blocked",
  "bloqueado",
]);

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeToken(value: unknown) {
  return clean(value, 120)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isTruthyFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  const token = normalizeToken(value);
  return ["1", "true", "sim", "yes", "y", "opt_out", "blocked", "bloqueado"].includes(token);
}

function isFalseConsent(value: unknown) {
  if (typeof value === "boolean") return value === false;
  const token = normalizeToken(value);
  return ["0", "false", "nao", "no", "n", "recusado", "optout", "opt_out"].includes(token);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readTags(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return source.map((item) => normalizeToken(item)).filter(Boolean);
}

export function hasWhatsAppOptOut(record: Record<string, unknown>) {
  if (
    isTruthyFlag(record.whatsappOptOut) ||
    isTruthyFlag(record.marketingOptOut) ||
    isTruthyFlag(record.doNotContact) ||
    isTruthyFlag(record.optOut) ||
    isTruthyFlag(record.blocked) ||
    isTruthyFlag(record.contactBlocked)
  ) {
    return true;
  }

  const consent = readObject(record.consent);
  const customFields = readObject(record.customFields);

  if (
    isFalseConsent(consent.whatsapp) ||
    isFalseConsent(consent.marketing) ||
    isFalseConsent(customFields.consent_whatsapp) ||
    isFalseConsent(customFields.whatsapp_consent) ||
    isFalseConsent(customFields.marketing_consent)
  ) {
    return true;
  }

  return readTags(record.tags).some((tag) => OPT_OUT_TAGS.has(tag));
}

export function readTimestampMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "object") {
    const raw = value as {
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
      milliseconds?: number;
      _milliseconds?: number;
    };
    if (typeof raw.toMillis === "function") {
      const time = raw.toMillis();
      return Number.isFinite(time) ? time : null;
    }
    const seconds = typeof raw.seconds === "number" ? raw.seconds : raw._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
    const millis = typeof raw.milliseconds === "number" ? raw.milliseconds : raw._milliseconds;
    if (typeof millis === "number" && Number.isFinite(millis)) return millis;
  }
  return null;
}

export function evaluateWhatsAppBulkCompliance(
  record: Record<string, unknown>,
  options: { nowMs?: number; minIntervalMs?: number } = {}
) {
  if (hasWhatsAppOptOut(record)) {
    return {
      allowed: false,
      reason: "Contato bloqueado por opt-out ou lista de nao contato.",
      code: "opt_out",
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  const minIntervalMs = options.minIntervalMs ?? WHATSAPP_BULK_MIN_INTERVAL_MS;
  const lastContactMs = Math.max(
    readTimestampMs(record.lastBulkContactAt) || 0,
    readTimestampMs(record.lastOutboundCampaignAt) || 0
  );

  if (lastContactMs > 0) {
    const elapsedMs = nowMs - lastContactMs;
    if (elapsedMs >= 0 && elapsedMs < minIntervalMs) {
      const waitHours = Math.ceil((minIntervalMs - elapsedMs) / (60 * 60 * 1000));
      return {
        allowed: false,
        reason: `Lead recebeu campanha recente. Tente novamente em ${waitHours}h.`,
        code: "frequency_cap",
      };
    }
  }

  return { allowed: true, reason: "", code: "allowed" };
}
