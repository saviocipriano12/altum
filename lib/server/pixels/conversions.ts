import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import {
  extractLeadAttributionSummary,
  isMeetingStatusCountable,
  isQualifiedLeadStage,
  isWonLeadStage,
  readLeadTouch,
  resolveLeadPotentialValue,
} from "@/lib/server/attribution";

type DispatchReason =
  | "lead_created"
  | "lead_qualified"
  | "meeting_scheduled"
  | "meeting_completed"
  | "sale_won";

type DispatchInput = {
  tenantId: string;
  leadId: string;
  reason: DispatchReason;
  appointmentId?: string | null;
  force?: boolean;
  /** A provider-owned key (for example a Shopify order id) makes each sale idempotent. */
  conversionKey?: string;
  conversionValue?: number;
  currency?: string;
  occurredAt?: string | Date;
  orderId?: string;
};

type MetaChannel = {
  id: string;
  accessToken: string;
  pixelId: string;
  testEventCode: string;
  pageId: string;
};

type GoogleChannel = {
  id: string;
  customerId: string;
  accessToken: string;
  refreshToken: string;
  loginCustomerId: string;
  conversionActionId: string;
};

type ConversionDefinition = {
  reason: DispatchReason;
  metaEventName: string;
  googleActionKey: string;
  statusGuard?: (lead: Record<string, unknown>, appointment: Record<string, unknown> | null) => boolean;
};

function clean(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanLower(value: unknown, max = 4000) {
  return clean(value, max).toLowerCase();
}

function moneyValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : fallback;
}

function currencyCode(value: unknown) {
  const normalized = clean(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "BRL";
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  ) as Partial<T>;
}

function firestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeId(value: string, max = 240) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, max);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmailForHash(value: unknown) {
  return cleanLower(value, 320);
}

function normalizePhoneForHash(value: unknown) {
  return normalizePhoneBR(clean(value, 40));
}

function normalizeNameForHash(value: unknown) {
  return cleanLower(value, 120).replace(/\s+/g, "");
}

function toUnixSeconds(value: unknown) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return Math.floor((value as { toDate: () => Date }).toDate().getTime() / 1000);
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds;
  }
  if (typeof value === "number") return Math.floor(value / 1000);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function toGoogleDateTime(value: unknown) {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : new Date(toUnixSeconds(value) * 1000);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().replace("T", " ").replace("Z", "+00:00")
    : parsed.toISOString().replace("T", " ").replace("Z", "+00:00");
}

function buildFbc(fbclid: string, occurredAt: unknown) {
  const clickId = clean(fbclid, 240);
  if (!clickId) return "";
  return `fb.1.${toUnixSeconds(occurredAt) * 1000}.${clickId}`;
}

async function fetchLead(tenantId: string, leadId: string) {
  const snap = await adminDb.collection("leads").doc(leadId).get();
  if (!snap.exists) {
    throw new Error("Lead nao encontrado para dispatch de conversao.");
  }
  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId, 140) !== tenantId) {
    throw new Error("Lead fora do tenant informado para dispatch de conversao.");
  }
  return { ref: snap.ref, data };
}

async function fetchAppointment(tenantId: string, appointmentId: string | null | undefined) {
  const resolvedId = clean(appointmentId, 180);
  if (!resolvedId) return null;
  const snap = await adminDb.collection("appointments").doc(resolvedId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId, 140) !== tenantId) return null;
  return { ref: snap.ref, data, id: snap.id };
}

async function fetchTenantChannels(tenantId: string) {
  const snap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", tenantId)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
}

function resolveMetaChannels(channels: Array<Record<string, unknown>>) {
  return channels
    .filter((channel) => cleanLower(channel.type, 40) === "meta_ads")
    .map((channel): MetaChannel | null => {
      const metadata =
        channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
          ? (channel.metadata as Record<string, unknown>)
          : {};

      const pixelId =
        clean(metadata.pixelId, 180) ||
        clean(metadata.metaPixelId, 180) ||
        clean(process.env.META_PIXEL_ID, 180) ||
        clean(process.env.NEXT_PUBLIC_META_PIXEL_ID, 180);

      const accessToken =
        clean(decryptSecret(channel.accessToken), 4000) ||
        clean(metadata.accessToken, 4000) ||
        clean(process.env.META_CONVERSIONS_ACCESS_TOKEN, 4000) ||
        clean(process.env.META_ADS_ACCESS_TOKEN, 4000);

      if (!pixelId || !accessToken) return null;

      return {
        id: String(channel.id || "meta_ads"),
        pixelId,
        accessToken,
        testEventCode: clean(metadata.testEventCode, 120) || clean(process.env.META_TEST_EVENT_CODE, 120),
        pageId: clean(metadata.pageId || channel.pageId, 180),
      };
    })
    .filter((item): item is MetaChannel => Boolean(item));
}

function resolveGoogleChannels(channels: Array<Record<string, unknown>>, reason: DispatchReason) {
  const actionKeyMap: Record<DispatchReason, string> = {
    lead_created: "leadConversionActionId",
    lead_qualified: "qualifiedConversionActionId",
    meeting_scheduled: "meetingConversionActionId",
    meeting_completed: "meetingCompletedConversionActionId",
    sale_won: "saleConversionActionId",
  };

  return channels
    .filter((channel) => cleanLower(channel.type, 40) === "google_ads")
    .map((channel): GoogleChannel | null => {
      const metadata =
        channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
          ? (channel.metadata as Record<string, unknown>)
          : {};

      const conversionActionId =
        clean(metadata[actionKeyMap[reason]], 180) ||
        clean(metadata.conversionActionId, 180) ||
        clean(process.env[`GOOGLE_ADS_${actionKeyMap[reason].replace(/[A-Z]/g, (item) => `_${item}`).toUpperCase()}`], 180);
      const customerId = clean(channel.externalAccountId, 180);
      const accessToken = clean(decryptSecret(channel.accessToken), 4000);
      const refreshToken = clean(decryptSecret(channel.refreshToken), 4000);
      const loginCustomerId = clean(metadata.loginCustomerId, 180) || clean(channel.pageId, 180);

      if (!conversionActionId || !customerId || (!accessToken && !refreshToken)) {
        return null;
      }

      return {
        id: String(channel.id || "google_ads"),
        customerId,
        accessToken,
        refreshToken,
        loginCustomerId,
        conversionActionId,
      };
    })
    .filter((item): item is GoogleChannel => Boolean(item));
}

async function getGoogleAdsAccessToken(input: { accessToken?: string; refreshToken?: string }) {
  const direct = clean(input.accessToken, 4000);
  if (direct) return direct;

  const clientId = clean(process.env.GOOGLE_ADS_CLIENT_ID, 400);
  const clientSecret = clean(process.env.GOOGLE_ADS_CLIENT_SECRET, 400);
  const refreshToken = clean(input.refreshToken, 4000);
  if (!clientId || !clientSecret || !refreshToken) return "";

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: unknown;
  };
  return clean(payload.access_token, 4000);
}

function getConversionDefinition(reason: DispatchReason): ConversionDefinition {
  const map: Record<DispatchReason, ConversionDefinition> = {
    lead_created: {
      reason,
      metaEventName: "Lead",
      googleActionKey: "leadConversionActionId",
    },
    lead_qualified: {
      reason,
      metaEventName: "QualifiedLead",
      googleActionKey: "qualifiedConversionActionId",
      statusGuard: (lead) => isQualifiedLeadStage(lead.pipelineStage || lead.stage),
    },
    meeting_scheduled: {
      reason,
      metaEventName: "Schedule",
      googleActionKey: "meetingConversionActionId",
      statusGuard: (_lead, appointment) => isMeetingStatusCountable(appointment?.status),
    },
    meeting_completed: {
      reason,
      metaEventName: "ScheduleCompleted",
      googleActionKey: "meetingCompletedConversionActionId",
      statusGuard: (_lead, appointment) => cleanLower(appointment?.status, 40) === "completed",
    },
    sale_won: {
      reason,
      metaEventName: "Purchase",
      googleActionKey: "saleConversionActionId",
      statusGuard: (lead) => isWonLeadStage(lead.pipelineStage || lead.stage),
    },
  };

  return map[reason];
}

const CONVERSION_LEASE_MS = 5 * 60_000;
const CONVERSION_MAX_ATTEMPTS = 8;

function dateFromUnknown(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function retryDelayMs(attempt: number) {
  return Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

async function enqueueDispatch(input: {
  dedupeKey: string;
  tenantId: string;
  leadId: string;
  appointmentId: string | null;
  provider: "meta" | "google";
  channelId: string;
  eventName: string;
  reason: DispatchReason;
  conversionKey: string;
  conversionValue?: number;
  currency?: string;
  occurredAt?: string | Date;
  orderId?: string;
  force?: boolean;
  leadSnapshot: Record<string, unknown>;
  appointmentSnapshot: Record<string, unknown> | null;
  destination: Record<string, string>;
}) {
  // Preserve existing short IDs; hash long identities instead of truncating their suffix.
  const docId = input.dedupeKey.length <= 240 && sanitizeId(input.dedupeKey, 240) === input.dedupeKey
    ? input.dedupeKey : `conversion_${sha256(input.dedupeKey)}`;
  const ref = adminDb.collection("conversion_dispatches").doc(docId);

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        tenantId: input.tenantId,
        leadId: input.leadId,
        appointmentId: input.appointmentId,
        provider: input.provider,
        channelId: input.channelId,
        eventName: input.eventName,
        reason: input.reason,
        conversionKey: input.conversionKey || null,
        conversionValue: Number.isFinite(input.conversionValue) ? input.conversionValue : null,
        currency: currencyCode(input.currency),
        occurredAt: dateFromUnknown(input.occurredAt) || new Date(),
        orderId: clean(input.orderId, 180) || null,
        leadSnapshot: firestoreSafe(input.leadSnapshot),
        appointmentSnapshot: firestoreSafe(input.appointmentSnapshot),
        destination: input.destination,
        eventId: docId,
        status: "pending",
        attempts: 0,
        maxAttempts: CONVERSION_MAX_ATTEMPTS,
        nextAttemptAt: new Date(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { enqueued: true, ref, eventId: docId, status: "pending" };
    }

    const data = snap.data() as { status?: string };
    const status = clean(data.status, 60);
    if (status === "processed" || status === "processing" || status === "pending" || status === "retry") {
      return { enqueued: false, ref, eventId: docId, status };
    }
    if (!input.force) return { enqueued: false, ref, eventId: docId, status };

    tx.set(ref, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: FieldValue.serverTimestamp(),
      leaseUntil: FieldValue.delete(),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { enqueued: true, ref, eventId: docId, status: "pending" };
  });

  return result;
}

async function sendMetaConversion(input: {
  channel: MetaChannel;
  tenantId: string;
  leadId: string;
  eventId: string;
  eventName: string;
  lead: Record<string, unknown>;
  appointment: Record<string, unknown> | null;
  conversionValue?: number;
  currency?: string;
  occurredAt?: string | Date;
  orderId?: string;
}) {
  const attribution = extractLeadAttributionSummary(input.lead);
  const lastTouch = attribution.lastTouch;
  const lastTouchRecord = lastTouch as Record<string, unknown>;
  const value = moneyValue(input.conversionValue, resolveLeadPotentialValue(input.lead));
  const currency = currencyCode(input.currency);
  const email = normalizeEmailForHash(input.lead.email);
  const phone = normalizePhoneForHash(input.lead.telefone);
  const firstName = normalizeNameForHash(input.lead.nome);
  const referrer = clean(lastTouch.referrer || input.lead.referrer, 500);
  const landingPage = clean(lastTouch.landingPage || input.lead.landingPage, 500);
  const messagingChannel = clean(attribution.channel || input.lead.channel, 80).toLowerCase();
  const isMessaging = ["whatsapp", "instagram", "messenger", "facebook_messenger"].includes(messagingChannel);
  if (isMessaging && !input.channel.pageId) {
    throw new Error("Page ID Meta nao configurado para conversoes de mensagens.");
  }

  const userData: Record<string, unknown> = {
    em: email ? [sha256(email)] : undefined,
    ph: phone ? [sha256(phone)] : undefined,
    fn: firstName ? [sha256(firstName)] : undefined,
    external_id: input.leadId ? [sha256(`${input.tenantId}:${input.leadId}`)] : undefined,
    fbp: clean(lastTouchRecord.fbp || input.lead.fbp, 240) || undefined,
    fbc: clean(lastTouchRecord.fbc || input.lead.fbc, 300) || buildFbc(lastTouch.fbclid || clean(input.lead.fbclid, 240), lastTouch.occurredAt || input.lead.updatedAt),
    ctwa_clid: clean(lastTouchRecord.ctwaClid || input.lead.ctwaClid, 300) || undefined,
    page_id: isMessaging ? input.channel.pageId || undefined : undefined,
  };
  const qualification =
    input.lead.qualification && typeof input.lead.qualification === "object"
      ? (input.lead.qualification as Record<string, unknown>)
      : {};
  const customData = compactObject({
    currency,
    value,
    tenant_id: input.tenantId,
    lead_id: input.leadId,
    source: attribution.source || clean(input.lead.utmSource, 120),
    medium: attribution.medium || clean(input.lead.utmMedium, 120),
    campaign_name: attribution.campaign || clean(input.lead.campaignName || input.lead.utmCampaign, 180),
    campaign_id: clean(lastTouch.campaignId || input.lead.campaignId, 180),
    ad_id: clean(lastTouch.adId || input.lead.adId, 180),
    adset_id: clean(lastTouch.adsetId || input.lead.adsetId, 180),
    placement: clean(lastTouchRecord.placement || input.lead.placement, 120),
    channel: clean((attribution as Record<string, unknown>).channel || input.lead.channel || input.lead.origem, 80),
    pipeline_stage: clean(input.lead.pipelineStage || input.lead.stage, 80),
    lead_score: typeof input.lead.score === "number" ? input.lead.score : undefined,
    qualification_score: typeof qualification.score === "number" ? qualification.score : undefined,
    qualification_band: clean(qualification.band, 80),
    ai_conversation_stage: clean(input.lead.aiConversationStage, 80),
    ai_next_action: clean(input.lead.aiNextAction, 160),
    ai_recommended_offer: clean(input.lead.aiRecommendedOffer, 180),
    ai_business_type: clean(input.lead.aiBusinessType, 120),
    ai_primary_goal: clean(input.lead.aiPrimaryGoal, 180),
    ai_budget_band: clean(input.lead.aiBudgetBand, 120),
    ai_urgency: clean(input.lead.aiUrgency, 120),
    ai_commercial_temperature: clean(input.lead.aiCommercialTemperature, 60),
    meeting_status: input.appointment ? clean(input.appointment.status, 40) : undefined,
    appointment_type: input.appointment ? clean(input.appointment.type, 80) : undefined,
    referrer: referrer || undefined,
    order_id: clean(input.orderId, 180) || undefined,
  });

  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: toUnixSeconds(input.occurredAt || input.appointment?.updatedAt || input.lead.updatedAt || input.lead.createdAt),
        event_id: input.eventId,
        action_source: isMessaging ? "business_messaging" : "website",
        messaging_channel: isMessaging ? (messagingChannel === "facebook_messenger" ? "messenger" : messagingChannel) : undefined,
        event_source_url: !isMessaging ? landingPage || undefined : undefined,
        user_data: Object.fromEntries(Object.entries(userData).filter(([, value]) => value)),
        custom_data: customData,
      },
    ],
    test_event_code: input.channel.testEventCode || undefined,
  };

  const response = await fetch(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}/${input.channel.pixelId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    }
  );

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(clean(result.error && typeof result.error === "object" ? (result.error as Record<string, unknown>).message : "", 500) || "Falha ao enviar Meta CAPI.");
  }
  if (Number(result.events_received || 0) < 1) {
    throw new Error("Meta nao confirmou o recebimento da conversao.");
  }
  return {
    request: payload,
    response: result,
  };
}

async function sendGoogleConversion(input: {
  channel: GoogleChannel;
  tenantId: string;
  leadId: string;
  eventId: string;
  reason: DispatchReason;
  lead: Record<string, unknown>;
  appointment: Record<string, unknown> | null;
  conversionValue?: number;
  currency?: string;
  occurredAt?: string | Date;
  orderId?: string;
}) {
  const gclid = clean(readLeadTouch(input.lead, "last_touch").gclid || input.lead.gclid, 240);
  if (!gclid) {
    throw new Error("Lead sem gclid para offline conversion do Google.");
  }

  const accessToken = await getGoogleAdsAccessToken({
    accessToken: input.channel.accessToken,
    refreshToken: input.channel.refreshToken,
  });
  if (!accessToken) {
    throw new Error("Canal Google Ads sem access token valido.");
  }

  const value = moneyValue(input.conversionValue, resolveLeadPotentialValue(input.lead));
  const email = normalizeEmailForHash(input.lead.email);
  const phone = normalizePhoneForHash(input.lead.telefone);
  const payload = {
    conversions: [
      {
        conversionAction: `customers/${input.channel.customerId}/conversionActions/${input.channel.conversionActionId}`,
        gclid,
        conversionDateTime: toGoogleDateTime(input.occurredAt || input.appointment?.updatedAt || input.lead.updatedAt || input.lead.createdAt),
        conversionValue:
          input.reason === "sale_won" ? Math.max(0, Number(value.toFixed(2))) : 1,
        currencyCode: currencyCode(input.currency),
        orderId: clean(input.orderId, 180) || input.eventId,
        userIdentifiers: [
          email ? { hashedEmail: sha256(email) } : null,
          phone ? { hashedPhoneNumber: sha256(phone) } : null,
        ].filter(Boolean),
      },
    ],
    partialFailure: true,
    validateOnly: false,
  };

  const apiVersion = clean(process.env.GOOGLE_ADS_API_VERSION, 20) || "v25";
  const developerToken = clean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 200);
  const response = await fetch(
    `https://googleads.googleapis.com/${apiVersion}/customers/${input.channel.customerId}:uploadClickConversions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(developerToken ? { "developer-token": developerToken } : {}),
        ...(input.channel.loginCustomerId ? { "login-customer-id": input.channel.loginCustomerId.replace(/[^\d]/g, "") } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    }
  );

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(clean(result.error && typeof result.error === "object" ? (result.error as Record<string, unknown>).message : "", 500) || "Falha ao enviar conversion para Google Ads.");
  }
  if (result.partialFailureError) {
    const partial = result.partialFailureError as Record<string, unknown>;
    throw new Error(clean(partial.message, 500) || "Google Ads rejeitou parte da conversao.");
  }
  if (!Array.isArray(result.results) || result.results.length < 1) {
    throw new Error("Google Ads nao confirmou o resultado da conversao.");
  }

  return {
    request: payload,
    response: result,
  };
}

type ConversionJob = {
  tenantId: string;
  leadId: string;
  appointmentId?: string | null;
  provider: "meta" | "google";
  channelId: string;
  eventName: string;
  reason: DispatchReason;
  conversionValue?: number | null;
  currency?: string;
  occurredAt?: unknown;
  orderId?: string | null;
  status?: string;
  attempts?: number;
  maxAttempts?: number;
  nextAttemptAt?: unknown;
  leaseUntil?: unknown;
  leaseToken?: string;
  leadSnapshot?: Record<string, unknown>;
  appointmentSnapshot?: Record<string, unknown> | null;
  destination?: Record<string, string>;
};

async function markCampaignDeliveryConverted(job: ConversionJob, eventId: string) {
  const outboundDeliveries = await adminDb.collection("outbound_campaign_deliveries")
    .where("leadId", "==", job.leadId).limit(20).get();
  const latest = outboundDeliveries.docs
    .filter((doc) => clean(doc.data().tenantId, 140) === job.tenantId)
    .sort((a, b) => Number(b.data().sentAt?._seconds || 0) - Number(a.data().sentAt?._seconds || 0))[0];
  if (!latest) return;
  await latest.ref.set({
    conversionReason: job.reason,
    conversionEventId: eventId,
    conversionProvider: job.provider,
    convertedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function processConversionJob(ref: FirebaseFirestore.DocumentReference, tenantId?: string) {
  const now = new Date();
  const leaseToken = crypto.randomUUID();
  const claimed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as ConversionJob;
    if (tenantId && data.tenantId !== tenantId) return null;
    const status = clean(data.status, 60);
    const leaseExpired = status === "processing" && (!dateFromUnknown(data.leaseUntil) || dateFromUnknown(data.leaseUntil)!.getTime() <= now.getTime());
    const due = !dateFromUnknown(data.nextAttemptAt) || dateFromUnknown(data.nextAttemptAt)!.getTime() <= now.getTime();
    if (!(status === "pending" || status === "retry" || status === "failed" || status === "claimed" || leaseExpired) || !due) return null;
    const attempts = Number(data.attempts || 0) + 1;
    if (attempts > Number(data.maxAttempts || CONVERSION_MAX_ATTEMPTS)) {
      tx.set(ref, { status: "dead_letter", leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return null;
    }
    tx.set(ref, {
      status: "processing",
      attempts,
      leaseToken,
      leaseUntil: new Date(now.getTime() + CONVERSION_LEASE_MS),
      processingStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ...data, attempts, leaseToken, eventId: ref.id };
  });
  if (!claimed) return { eventId: ref.id, skipped: true };

  const finish = async (patch: Record<string, unknown>) => adminDb.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.data()?.leaseToken !== leaseToken || current.data()?.status !== "processing") return false;
    tx.set(ref, { ...patch, leaseToken: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });

  try {
    const definition = getConversionDefinition(claimed.reason);
    const lead = claimed.leadSnapshot && Object.keys(claimed.leadSnapshot).length
      ? claimed.leadSnapshot
      : (await fetchLead(claimed.tenantId, claimed.leadId)).data;
    const appointment = claimed.appointmentSnapshot !== undefined
      ? claimed.appointmentSnapshot
      : (await fetchAppointment(claimed.tenantId, claimed.appointmentId))?.data || null;
    if (definition.statusGuard && !definition.statusGuard(lead, appointment)) {
      await finish({ status: "skipped", skipReason: "status_guard", leaseUntil: FieldValue.delete() });
      return { eventId: ref.id, provider: claimed.provider, skipped: true, reason: "status_guard" };
    }

    const channels = await fetchTenantChannels(claimed.tenantId);
    let sent: { request: unknown; response: unknown };
    if (claimed.provider === "meta") {
      const channel = resolveMetaChannels(channels).find((item) => item.id === claimed.channelId);
      if (!channel) throw new Error("Canal Meta da conversao nao esta mais configurado.");
      sent = await sendMetaConversion({
        channel: claimed.destination ? {
          ...channel,
          pixelId: claimed.destination.pixelId,
          // A missing Page ID can be repaired before the first messaging send.
          // A previously configured Page ID remains pinned to the event.
          pageId: claimed.destination.pageId || channel.pageId,
          testEventCode: claimed.destination.testEventCode,
        } : channel,
        tenantId: claimed.tenantId, leadId: claimed.leadId, eventId: ref.id,
        eventName: claimed.eventName || definition.metaEventName, lead, appointment,
        conversionValue: claimed.conversionValue ?? undefined, currency: claimed.currency,
        occurredAt: dateFromUnknown(claimed.occurredAt) || undefined, orderId: claimed.orderId || undefined,
      });
    } else {
      const channel = resolveGoogleChannels(channels, claimed.reason).find((item) => item.id === claimed.channelId);
      if (!channel) throw new Error("Canal Google Ads da conversao nao esta mais configurado.");
      sent = await sendGoogleConversion({
        channel: claimed.destination ? {
          ...channel,
          customerId: claimed.destination.customerId,
          loginCustomerId: claimed.destination.loginCustomerId,
          conversionActionId: claimed.destination.conversionActionId,
        } : channel,
        tenantId: claimed.tenantId, leadId: claimed.leadId, eventId: ref.id,
        reason: claimed.reason, lead, appointment,
        conversionValue: claimed.conversionValue ?? undefined, currency: claimed.currency,
        occurredAt: dateFromUnknown(claimed.occurredAt) || undefined, orderId: claimed.orderId || undefined,
      });
    }

    const confirmed = await finish({
      status: "processed",
      request: firestoreSafe(sent.request),
      response: firestoreSafe(sent.response),
      processedAt: FieldValue.serverTimestamp(),
      leaseUntil: FieldValue.delete(),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!confirmed) return { eventId: ref.id, skipped: true, reason: "lease_lost" };
    // Projection failure must never roll a provider-confirmed dispatch back to retry.
    await markCampaignDeliveryConverted(claimed, ref.id).catch((error) => {
      console.error("Falha na projecao de conversao da campanha:", error);
    });
    return { eventId: ref.id, provider: claimed.provider, channelId: claimed.channelId, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar conversao.";
    const maxAttempts = Number(claimed.maxAttempts || CONVERSION_MAX_ATTEMPTS);
    const exhausted = claimed.attempts >= maxAttempts;
    await finish({
      status: exhausted ? "dead_letter" : "retry",
      error: clean(message, 1000),
      lastFailedAt: FieldValue.serverTimestamp(),
      nextAttemptAt: exhausted ? FieldValue.delete() : new Date(Date.now() + retryDelayMs(claimed.attempts)),
      leaseUntil: FieldValue.delete(),
      deadLetteredAt: exhausted ? FieldValue.serverTimestamp() : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { eventId: ref.id, provider: claimed.provider, channelId: claimed.channelId, ok: false, retrying: !exhausted, error: message };
  }
}

export async function processConversionDispatchJobs(input: { limit?: number; tenantId?: string; jobIds?: string[] } = {}) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 80)));
  let refs: FirebaseFirestore.DocumentReference[];
  if (input.jobIds?.length) {
    refs = Array.from(new Set(input.jobIds)).slice(0, limit).map((id) => adminDb.collection("conversion_dispatches").doc(id));
  } else {
    const scoped = (query: FirebaseFirestore.Query) => input.tenantId ? query.where("tenantId", "==", input.tenantId) : query;
    const collection = adminDb.collection("conversion_dispatches");
    const [due, expired, legacy] = await Promise.all([
      scoped(collection.where("status", "in", ["pending", "retry"]).where("nextAttemptAt", "<=", new Date()).orderBy("nextAttemptAt")).limit(limit).get(),
      scoped(collection.where("status", "==", "processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil")).limit(limit).get(),
      scoped(collection.where("status", "in", ["failed", "claimed"])).limit(limit).get(),
    ]);
    refs = [...expired.docs, ...due.docs, ...legacy.docs].slice(0, limit).map((doc) => doc.ref);
  }
  const results = [];
  const deadline = Date.now() + 45_000;
  for (const ref of refs) {
    if (Date.now() >= deadline) break;
    results.push(await processConversionJob(ref, input.tenantId));
  }
  return {
    ok: true,
    scanned: refs.length,
    attempted: results.filter((item) => !item.skipped).length,
    processed: results.filter((item) => "ok" in item && item.ok === true).length,
    failed: results.filter((item) => "ok" in item && item.ok === false).length,
    results,
  };
}

export async function dispatchLeadConversionEvents(input: DispatchInput) {
  const definition = getConversionDefinition(input.reason);
  const { data: lead } = await fetchLead(input.tenantId, input.leadId);
  const appointmentRecord = await fetchAppointment(input.tenantId, input.appointmentId);
  const appointment = appointmentRecord?.data || null;
  if (definition.statusGuard && !definition.statusGuard(lead, appointment)) {
    return { ok: true, skipped: true, reason: "status_guard", results: [] };
  }

  const channels = await fetchTenantChannels(input.tenantId);
  const providers = [
    ...resolveMetaChannels(channels).map((channel) => ({ provider: "meta" as const, channel, eventName: definition.metaEventName })),
    ...resolveGoogleChannels(channels, input.reason).map((channel) => ({ provider: "google" as const, channel, eventName: definition.reason })),
  ];
  const conversionKey = clean(input.conversionKey, 240);
  const enqueued = [];
  for (const item of providers) {
    const dedupeKey = [input.tenantId, input.leadId, conversionKey || appointmentRecord?.id || "lead", item.provider, item.channel.id, definition.reason]
      .map((part) => encodeURIComponent(part)).join(":");
    enqueued.push(await enqueueDispatch({
      dedupeKey, tenantId: input.tenantId, leadId: input.leadId,
      appointmentId: appointmentRecord?.id || null, provider: item.provider,
      channelId: item.channel.id, eventName: item.eventName, reason: definition.reason,
      conversionKey, conversionValue: input.conversionValue, currency: input.currency,
      occurredAt: input.occurredAt, orderId: input.orderId, force: input.force,
      leadSnapshot: lead, appointmentSnapshot: appointment,
      destination: item.provider === "meta"
        ? { pixelId: item.channel.pixelId, pageId: item.channel.pageId, testEventCode: item.channel.testEventCode }
        : { customerId: item.channel.customerId, loginCustomerId: item.channel.loginCustomerId, conversionActionId: item.channel.conversionActionId },
    }));
  }
  const processResult = await processConversionDispatchJobs({ jobIds: enqueued.map((item) => item.eventId), limit: 200 });
  return { ok: true, skipped: false, enqueued: enqueued.filter((item) => item.enqueued).length, results: processResult.results };
}
