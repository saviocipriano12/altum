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
};

type MetaChannel = {
  id: string;
  accessToken: string;
  pixelId: string;
  testEventCode: string;
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

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  ) as Partial<T>;
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
  return `fb.1.${toUnixSeconds(occurredAt)}.${clickId}`;
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
    .limit(20)
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

async function claimDispatch(dedupeKey: string, force = false) {
  const docId = sanitizeId(dedupeKey, 240);
  const ref = adminDb.collection("conversion_dispatches").doc(docId);

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        status: "claimed",
        attempts: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { proceed: true, ref, eventId: docId };
    }

    const data = snap.data() as { status?: string };
    if (data.status === "processed" && !force) {
      return { proceed: false, ref, eventId: docId };
    }

    tx.set(
      ref,
      {
        status: "claimed",
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { proceed: true, ref, eventId: docId };
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
}) {
  const attribution = extractLeadAttributionSummary(input.lead);
  const lastTouch = attribution.lastTouch;
  const lastTouchRecord = lastTouch as Record<string, unknown>;
  const value = resolveLeadPotentialValue(input.lead);
  const email = normalizeEmailForHash(input.lead.email);
  const phone = normalizePhoneForHash(input.lead.telefone);
  const firstName = normalizeNameForHash(input.lead.nome);
  const referrer = clean(lastTouch.referrer || input.lead.referrer, 500);
  const landingPage = clean(lastTouch.landingPage || input.lead.landingPage, 500);

  const userData: Record<string, unknown> = {
    em: email ? [sha256(email)] : undefined,
    ph: phone ? [sha256(phone)] : undefined,
    fn: firstName ? [sha256(firstName)] : undefined,
    external_id: input.leadId ? [sha256(`${input.tenantId}:${input.leadId}`)] : undefined,
    fbp: clean(lastTouchRecord.fbp || input.lead.fbp, 240) || undefined,
    fbc: buildFbc(lastTouch.fbclid || clean(input.lead.fbclid, 240), lastTouch.occurredAt || input.lead.updatedAt),
  };
  const qualification =
    input.lead.qualification && typeof input.lead.qualification === "object"
      ? (input.lead.qualification as Record<string, unknown>)
      : {};
  const customData = compactObject({
    currency: "BRL",
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
  });

  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: toUnixSeconds(input.appointment?.updatedAt || input.lead.updatedAt || input.lead.createdAt),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: landingPage || undefined,
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
      cache: "no-store",
    }
  );

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(clean(result.error && typeof result.error === "object" ? (result.error as Record<string, unknown>).message : "", 500) || "Falha ao enviar Meta CAPI.");
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

  const value = resolveLeadPotentialValue(input.lead);
  const email = normalizeEmailForHash(input.lead.email);
  const phone = normalizePhoneForHash(input.lead.telefone);
  const payload = {
    conversions: [
      {
        conversionAction: `customers/${input.channel.customerId}/conversionActions/${input.channel.conversionActionId}`,
        gclid,
        conversionDateTime: toGoogleDateTime(input.appointment?.updatedAt || input.lead.updatedAt || input.lead.createdAt),
        conversionValue:
          input.reason === "sale_won" ? Math.max(0, Number(value.toFixed(2))) : 1,
        currencyCode: "BRL",
        orderId: input.eventId,
        userIdentifiers: [
          email ? { hashedEmail: sha256(email) } : null,
          phone ? { hashedPhoneNumber: sha256(phone) } : null,
        ].filter(Boolean),
      },
    ],
    partialFailure: true,
    validateOnly: false,
  };

  const response = await fetch(
    `https://googleads.googleapis.com/v22/customers/${input.channel.customerId}:uploadClickConversions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "developer-token": clean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 200),
        ...(input.channel.loginCustomerId ? { "login-customer-id": input.channel.loginCustomerId.replace(/[^\d]/g, "") } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(clean(result.error && typeof result.error === "object" ? (result.error as Record<string, unknown>).message : "", 500) || "Falha ao enviar conversion para Google Ads.");
  }

  return {
    request: payload,
    response: result,
  };
}

export async function dispatchLeadConversionEvents(input: DispatchInput) {
  const definition = getConversionDefinition(input.reason);
  const { data: lead } = await fetchLead(input.tenantId, input.leadId);
  const appointmentRecord = await fetchAppointment(input.tenantId, input.appointmentId);
  const appointment = appointmentRecord?.data || null;

  if (definition.statusGuard && !definition.statusGuard(lead, appointment)) {
    return {
      ok: true,
      skipped: true,
      reason: "status_guard",
      results: [],
    };
  }

  const channels = await fetchTenantChannels(input.tenantId);
  const metaChannels = resolveMetaChannels(channels);
  const googleChannels = resolveGoogleChannels(channels, input.reason);
  const results: Array<Record<string, unknown>> = [];

  for (const channel of metaChannels) {
    const dedupeKey = `${input.tenantId}:${input.leadId}:${appointmentRecord?.id || "lead"}:meta:${channel.id}:${definition.reason}`;
    const claim = await claimDispatch(dedupeKey, Boolean(input.force));
    if (!claim.proceed) {
      results.push({ provider: "meta", channelId: channel.id, skipped: true, eventId: claim.eventId });
      continue;
    }

    try {
      const sent = await sendMetaConversion({
        channel,
        tenantId: input.tenantId,
        leadId: input.leadId,
        eventId: claim.eventId,
        eventName: definition.metaEventName,
        lead,
        appointment,
      });

      await claim.ref.set(
        {
          tenantId: input.tenantId,
          leadId: input.leadId,
          appointmentId: appointmentRecord?.id || null,
          provider: "meta",
          channelId: channel.id,
          eventName: definition.metaEventName,
          reason: definition.reason,
          eventId: claim.eventId,
          status: "processed",
          request: sent.request,
          response: sent.response,
          processedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      results.push({ provider: "meta", channelId: channel.id, eventId: claim.eventId, ok: true });
    } catch (error) {
      await claim.ref.set(
        {
          tenantId: input.tenantId,
          leadId: input.leadId,
          appointmentId: appointmentRecord?.id || null,
          provider: "meta",
          channelId: channel.id,
          eventName: definition.metaEventName,
          reason: definition.reason,
          eventId: claim.eventId,
          status: "failed",
          error: error instanceof Error ? error.message : "Falha Meta CAPI.",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      results.push({
        provider: "meta",
        channelId: channel.id,
        eventId: claim.eventId,
        ok: false,
        error: error instanceof Error ? error.message : "Falha Meta CAPI.",
      });
    }
  }

  for (const channel of googleChannels) {
    const dedupeKey = `${input.tenantId}:${input.leadId}:${appointmentRecord?.id || "lead"}:google:${channel.id}:${definition.reason}`;
    const claim = await claimDispatch(dedupeKey, Boolean(input.force));
    if (!claim.proceed) {
      results.push({ provider: "google", channelId: channel.id, skipped: true, eventId: claim.eventId });
      continue;
    }

    try {
      const sent = await sendGoogleConversion({
        channel,
        tenantId: input.tenantId,
        leadId: input.leadId,
        eventId: claim.eventId,
        reason: definition.reason,
        lead,
        appointment,
      });

      await claim.ref.set(
        {
          tenantId: input.tenantId,
          leadId: input.leadId,
          appointmentId: appointmentRecord?.id || null,
          provider: "google",
          channelId: channel.id,
          eventName: definition.reason,
          reason: definition.reason,
          eventId: claim.eventId,
          status: "processed",
          request: sent.request,
          response: sent.response,
          processedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      results.push({ provider: "google", channelId: channel.id, eventId: claim.eventId, ok: true });
    } catch (error) {
      await claim.ref.set(
        {
          tenantId: input.tenantId,
          leadId: input.leadId,
          appointmentId: appointmentRecord?.id || null,
          provider: "google",
          channelId: channel.id,
          eventName: definition.reason,
          reason: definition.reason,
          eventId: claim.eventId,
          status: "failed",
          error: error instanceof Error ? error.message : "Falha Google conversion.",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      results.push({
        provider: "google",
        channelId: channel.id,
        eventId: claim.eventId,
        ok: false,
        error: error instanceof Error ? error.message : "Falha Google conversion.",
      });
    }
  }

  return {
    ok: true,
    skipped: false,
    results,
  };
}
