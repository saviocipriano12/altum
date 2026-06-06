import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import {
  sendTenantChatTemplate,
  sendTenantChatMediaLink,
  sendTenantChatText,
  type ChatDispatchActor,
} from "@/lib/server/chat-dispatch";
import type { WhatsAppTemplateHeaderMedia } from "@/app/lib/server/whatsapp-channel";
import { hasWhatsAppOptOut } from "@/lib/server/whatsapp-compliance";
import { buildOutboundJobSchedule } from "@/lib/server/outbound-scheduling";

export type OutboundCampaignFilters = {
  stageIds: string[];
  ownerIds: string[];
  sources: string[];
  tags: string[];
  heat: string[];
};

export type OutboundCampaignRecord = {
  id: string;
  tenantId: string;
  name: string;
  status: "draft" | "active" | "paused";
  channel: "whatsapp";
  channelId: string;
  deliveryMode: "text" | "template";
  messageTemplate: string;
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  headerMedia: WhatsAppTemplateHeaderMedia | null;
  maxRecipients: number;
  scheduledAt: string | null;
  sendRatePerMinute: number;
  executionStatus: "idle" | "scheduled" | "queued" | "running" | "paused" | "completed" | "failed";
  activeRunId: string | null;
  filters: OutboundCampaignFilters;
  lastRunAt: string | null;
  lastRunSummary: {
    sent: number;
    skipped: number;
    failed: number;
    totalMatched: number;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OutboundLeadRow = {
  id: string;
  data: Record<string, unknown>;
};

type OutboundAudienceSummary = {
  totalLeads: number;
  matchedFilters: number;
  selectedByLimit: number;
  maxRecipients: number;
  estimatedSend: number;
  blockedByConsent: number;
  missingPhone: number;
  truncatedByLimit: boolean;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeComparableToken(value: string) {
  return clean(value, 240)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanList(value: unknown, maxItem = 80, max = 20) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      source
        .map((item) => clean(item, maxItem).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, max);
}

function normalizeDeliveryMode(value: unknown) {
  return clean(value, 40).toLowerCase() === "template" ? "template" : "text";
}

function normalizeTemplateName(value: unknown) {
  return clean(value, 512)
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function normalizeLanguageCode(value: unknown) {
  return clean(value, 24) || "pt_BR";
}

function normalizeBodyParams(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(item, 500))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeHeaderMedia(value: unknown): WhatsAppTemplateHeaderMedia | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = clean(raw.type, 40).toLowerCase();
  if (type !== "image" && type !== "video" && type !== "document") return null;
  const link = clean(raw.link, 1000);
  const id = clean(raw.id, 180);
  if (!link && !id) return null;
  return {
    type,
    ...(link ? { link } : {}),
    ...(id ? { id } : {}),
    ...(clean(raw.filename, 180) ? { filename: clean(raw.filename, 180) } : {}),
  };
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  return null;
}

export function normalizeOutboundCampaignFilters(value: unknown): OutboundCampaignFilters {
  const filters = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    stageIds: cleanList(filters.stageIds, 80, 20),
    ownerIds: cleanList(filters.ownerIds, 140, 20),
    sources: cleanList(filters.sources, 80, 20),
    tags: cleanList(filters.tags, 40, 30),
    heat: cleanList(filters.heat, 40, 10),
  };
}

export function normalizeOutboundCampaign(input: { id: string; data: Record<string, unknown> }): OutboundCampaignRecord {
  const status = clean(input.data.status, 20);
  const deliveryMode = normalizeDeliveryMode(input.data.deliveryMode);
  return {
    id: input.id,
    tenantId: clean(input.data.tenantId, 140),
    name: clean(input.data.name, 160) || "Campanha outbound",
    status: status === "active" || status === "paused" ? status : "draft",
    channel: "whatsapp",
    channelId: clean(input.data.channelId, 180),
    deliveryMode,
    messageTemplate: clean(input.data.messageTemplate, 4000),
    templateName: normalizeTemplateName(input.data.templateName),
    languageCode: normalizeLanguageCode(input.data.languageCode),
    bodyParams: normalizeBodyParams(input.data.bodyParams),
    headerMedia: normalizeHeaderMedia(input.data.headerMedia),
    maxRecipients: Math.max(1, Math.min(500, Number(input.data.maxRecipients || 50))),
    scheduledAt: toIso(input.data.scheduledAt),
    sendRatePerMinute: Math.max(1, Math.min(120, Number(input.data.sendRatePerMinute || 20))),
    executionStatus: (["scheduled", "queued", "running", "paused", "completed", "failed"].includes(clean(input.data.executionStatus, 20))
      ? clean(input.data.executionStatus, 20)
      : "idle") as OutboundCampaignRecord["executionStatus"],
    activeRunId: clean(input.data.activeRunId, 180) || null,
    filters: normalizeOutboundCampaignFilters(input.data.filters),
    lastRunAt: toIso(input.data.lastRunAt),
    lastRunSummary:
      input.data.lastRunSummary && typeof input.data.lastRunSummary === "object"
        ? {
            sent: Number((input.data.lastRunSummary as Record<string, unknown>).sent || 0),
            skipped: Number((input.data.lastRunSummary as Record<string, unknown>).skipped || 0),
            failed: Number((input.data.lastRunSummary as Record<string, unknown>).failed || 0),
            totalMatched: Number((input.data.lastRunSummary as Record<string, unknown>).totalMatched || 0),
          }
        : null,
    createdAt: toIso(input.data.createdAt),
    updatedAt: toIso(input.data.updatedAt),
  };
}

export function buildOutboundCampaignPatch(input: {
  tenantId: string;
  name?: unknown;
  status?: unknown;
  channelId?: unknown;
  deliveryMode?: unknown;
  messageTemplate?: unknown;
  templateName?: unknown;
  languageCode?: unknown;
  bodyParams?: unknown;
  headerMedia?: unknown;
  maxRecipients?: unknown;
  scheduledAt?: unknown;
  sendRatePerMinute?: unknown;
  filters?: unknown;
  actor: { id: string; name: string };
}) {
  const status = clean(input.status, 20);
  const deliveryMode = normalizeDeliveryMode(input.deliveryMode);
  const requestedSchedule =
    typeof input.scheduledAt === "string" && input.scheduledAt.trim()
      ? new Date(input.scheduledAt)
      : null;
  const scheduledAt =
    requestedSchedule && !Number.isNaN(requestedSchedule.getTime())
      ? requestedSchedule
      : null;
  return {
    tenantId: clean(input.tenantId, 140),
    name: clean(input.name, 160) || "Campanha outbound",
    status: status === "active" || status === "paused" ? status : "draft",
    channel: "whatsapp",
    channelId: clean(input.channelId, 180),
    deliveryMode,
    messageTemplate: clean(input.messageTemplate, 4000),
    templateName: normalizeTemplateName(input.templateName),
    languageCode: normalizeLanguageCode(input.languageCode),
    bodyParams: normalizeBodyParams(input.bodyParams),
    headerMedia: normalizeHeaderMedia(input.headerMedia),
    maxRecipients: Math.max(1, Math.min(500, Number(input.maxRecipients || 50))),
    scheduledAt,
    sendRatePerMinute: Math.max(1, Math.min(120, Number(input.sendRatePerMinute || 20))),
    filters: normalizeOutboundCampaignFilters(input.filters),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.actor.id,
    updatedByName: input.actor.name,
  };
}

function interpolateTemplate(template: string, lead: Record<string, unknown>) {
  const stage = clean(lead.pipelineStage, 80) || clean(lead.stage, 80);
  const origin =
    clean(lead.origem, 120) ||
    clean(lead.sourceLabel, 120) ||
    clean(lead.source, 80) ||
    clean(lead.utmSource, 120);

  const replacements: Record<string, string> = {
    nome: clean(lead.nome, 160) || "Contato",
    empresa: clean(lead.empresa, 160),
    telefone: clean(lead.telefone, 40),
    email: clean(lead.email, 180),
    stage,
    origem: origin,
  };

  return template.replace(/\{(\w+)\}/g, (_, key: string) => replacements[key] || "");
}

function buildTemplateDisplayText(input: {
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  headerMedia: WhatsAppTemplateHeaderMedia | null;
}) {
  return [
    `Template Meta: ${input.templateName}`,
    `Idioma: ${input.languageCode}`,
    input.bodyParams.length ? `Variaveis: ${input.bodyParams.join(" | ")}` : "",
    input.headerMedia ? `Midia: ${input.headerMedia.type}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function interpolateBodyParams(params: string[], lead: Record<string, unknown>) {
  return params.map((param) => interpolateTemplate(param, lead)).filter(Boolean).slice(0, 20);
}

function normalizeHeatToken(value: string) {
  const token = clean(value, 40).toLowerCase();
  if (!token) return "";
  if (token === "quente" || token === "hot") return "quente";
  if (token === "morno" || token === "warm") return "morno";
  if (token === "frio" || token === "cold") return "frio";
  return token;
}

function readLeadSource(lead: Record<string, unknown>) {
  return (
    clean(lead.origem, 120) ||
    clean(lead.sourceLabel, 120) ||
    clean(lead.source, 80) ||
    clean(lead.utmSource, 120)
  )
    .toLowerCase()
    .trim();
}

function matchLeadFilters(lead: Record<string, unknown>, filters: OutboundCampaignFilters) {
  const stage = normalizeComparableToken(clean(lead.pipelineStage, 80) || clean(lead.stage, 80));
  const ownerId = normalizeComparableToken(clean(lead.ownerId, 140));
  const source = normalizeComparableToken(readLeadSource(lead));
  const heat = normalizeComparableToken(normalizeHeatToken(clean(lead.heat, 40)));
  const filterStages = filters.stageIds.map((item) => normalizeComparableToken(item)).filter(Boolean);
  const filterOwnerIds = filters.ownerIds.map((item) => normalizeComparableToken(item)).filter(Boolean);
  const filterSources = filters.sources.map((item) => normalizeComparableToken(item)).filter(Boolean);
  const filterHeats = filters.heat.map((item) => normalizeComparableToken(normalizeHeatToken(item))).filter(Boolean);
  const tags = cleanList(lead.tags, 40, 50).map((tag) => normalizeComparableToken(tag));
  const filterTags = filters.tags.map((item) => normalizeComparableToken(item)).filter(Boolean);

  if (filterStages.length > 0 && !filterStages.includes(stage)) return false;
  if (filterOwnerIds.length > 0 && !filterOwnerIds.includes(ownerId)) return false;
  if (filterSources.length > 0 && !filterSources.includes(source)) return false;
  if (filterHeats.length > 0 && !filterHeats.includes(heat)) return false;
  if (filterTags.length > 0 && !filterTags.some((tag) => tags.includes(tag))) return false;
  return true;
}

async function loadCampaignContext(input: { tenantId: string; campaignId: string }) {
  const campaignRef = adminDb.collection("outbound_campaigns").doc(input.campaignId);
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists) {
    throw new Error("Campanha outbound nao encontrada.");
  }

  const campaign = normalizeOutboundCampaign({
    id: campaignSnap.id,
    data: campaignSnap.data() as Record<string, unknown>,
  });

  if (campaign.tenantId !== input.tenantId) {
    throw new Error("Campanha fora do tenant informado.");
  }

  return { campaignRef, campaign };
}

function buildAudienceSelection(input: {
  leads: OutboundLeadRow[];
  filters: OutboundCampaignFilters;
  maxRecipients: number;
}) {
  const filtered = input.leads.filter((item) => matchLeadFilters(item.data, input.filters));
  return {
    filtered,
    selected: filtered.slice(0, input.maxRecipients),
  };
}

function summarizeAudience(input: {
  totalLeads: number;
  matchedFilters: number;
  maxRecipients: number;
  selected: OutboundLeadRow[];
}) {
  let estimatedSend = 0;
  let blockedByConsent = 0;
  let missingPhone = 0;

  for (const lead of input.selected) {
    if (hasWhatsAppOptOut(lead.data)) {
      blockedByConsent += 1;
      continue;
    }

    const phone = normalizePhone(clean(lead.data.telefone, 40));
    if (!phone) {
      missingPhone += 1;
      continue;
    }

    estimatedSend += 1;
  }

  const summary: OutboundAudienceSummary = {
    totalLeads: input.totalLeads,
    matchedFilters: input.matchedFilters,
    selectedByLimit: input.selected.length,
    maxRecipients: input.maxRecipients,
    estimatedSend,
    blockedByConsent,
    missingPhone,
    truncatedByLimit: input.matchedFilters > input.selected.length,
  };

  return summary;
}

async function findOrCreateLeadChat(input: {
  tenantId: string;
  leadId: string;
  lead: Record<string, unknown>;
  actor: ChatDispatchActor;
  channelId?: string;
}) {
  const phone = normalizePhone(clean(input.lead.telefone, 40));
  if (!phone) return null;

  const existing = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("leadId", "==", input.leadId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const existingChat = existing.docs[0];
    if (input.channelId) {
      await existingChat.ref.set(
        {
          channel: "whatsapp",
          channelId: input.channelId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    return existingChat.id;
  }

  const chatRef = await adminDb.collection("chats").add({
    tenantId: input.tenantId,
    leadId: input.leadId,
    contactName: clean(input.lead.nome, 160) || phone,
    contactPhone: phone,
    contactPhoneNormalized: phone,
    status: "open",
    ownerId: clean(input.lead.ownerId, 140) || input.actor.id,
    ownerName: clean(input.lead.ownerName, 160) || input.actor.name,
    channel: "whatsapp",
    ...(input.channelId ? { channelId: input.channelId } : {}),
    source: "outbound_campaign",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageTime: FieldValue.serverTimestamp(),
    lastMessage: "",
  });

  return chatRef.id;
}

export async function previewOutboundCampaign(input: { tenantId: string; campaignId: string }) {
  const { campaign } = await loadCampaignContext(input);

  const leadsSnap = await adminDb.collection("leads").where("tenantId", "==", input.tenantId).limit(600).get();
  const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
  const audience = buildAudienceSelection({
    leads,
    filters: campaign.filters,
    maxRecipients: campaign.maxRecipients,
  });
  const summary = summarizeAudience({
    totalLeads: leads.length,
    matchedFilters: audience.filtered.length,
    maxRecipients: campaign.maxRecipients,
    selected: audience.selected,
  });

  const sample = audience.selected.slice(0, 12).map((item) => ({
    leadId: item.id,
    nome: clean(item.data.nome, 160) || "Lead",
    telefone: normalizePhone(clean(item.data.telefone, 40)),
    stage: clean(item.data.pipelineStage, 80) || clean(item.data.stage, 80),
    origem: readLeadSource(item.data),
    blockedByConsent: hasWhatsAppOptOut(item.data),
  }));

  return {
    campaign,
    summary,
    sample,
  };
}

export async function dispatchOutboundCampaign(input: {
  tenantId: string;
  campaignId: string;
  actor: ChatDispatchActor;
  leadIds?: string[];
  runId?: string;
  accumulate?: boolean;
}) {
  const { campaignRef, campaign } = await loadCampaignContext(input);
  if (campaign.deliveryMode === "template" && !campaign.templateName.trim()) {
    throw new Error("A campanha precisa de um template Meta aprovado para ser enviada.");
  }

  if (campaign.deliveryMode === "text" && !campaign.messageTemplate.trim()) {
    throw new Error("A campanha precisa de uma mensagem para ser enviada.");
  }

  const leadsSnap = await adminDb.collection("leads").where("tenantId", "==", input.tenantId).limit(600).get();
  const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
  const audience = buildAudienceSelection({
    leads,
    filters: campaign.filters,
    maxRecipients: campaign.maxRecipients,
  });
  const selectedLeadIds = new Set((input.leadIds || []).map((item) => clean(item, 180)).filter(Boolean));
  const matchedLeads = selectedLeadIds.size
    ? audience.selected.filter((item) => selectedLeadIds.has(item.id))
    : audience.selected;
  const runRef = input.runId
    ? adminDb.collection("outbound_campaign_runs").doc(input.runId)
    : adminDb.collection("outbound_campaign_runs").doc();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ leadId: string; leadName: string; message: string }> = [];

  for (const item of matchedLeads) {
    try {
      if (hasWhatsAppOptOut(item.data)) {
        skipped += 1;
        continue;
      }

      const phone = normalizePhone(clean(item.data.telefone, 40));
      if (!phone) {
        skipped += 1;
        continue;
      }

      const chatId = await findOrCreateLeadChat({
        tenantId: input.tenantId,
        leadId: item.id,
        lead: item.data,
        actor: input.actor,
        channelId: campaign.channelId,
      });

      if (!chatId) {
        skipped += 1;
        continue;
      }

      const renderedBodyParams = interpolateBodyParams(campaign.bodyParams, item.data);
      const renderedMessage =
        campaign.deliveryMode === "template"
          ? buildTemplateDisplayText({
              templateName: campaign.templateName,
              languageCode: campaign.languageCode,
              bodyParams: renderedBodyParams,
              headerMedia: campaign.headerMedia,
            })
          : interpolateTemplate(campaign.messageTemplate, item.data);
      if (campaign.deliveryMode === "text" && campaign.headerMedia?.link) {
        await sendTenantChatMediaLink({
          tenantId: input.tenantId,
          chatId,
          mediaType: campaign.headerMedia.type,
          mediaUrl: campaign.headerMedia.link,
          filename: campaign.headerMedia.filename,
          caption: renderedMessage,
          actor: input.actor,
        });
      }
      const dispatchResult =
        campaign.deliveryMode === "template"
          ? await sendTenantChatTemplate({
              tenantId: input.tenantId,
              chatId,
              templateName: campaign.templateName,
              languageCode: campaign.languageCode,
              bodyParams: renderedBodyParams,
              headerMedia: campaign.headerMedia,
              actor: input.actor,
              pauseAi: false,
            })
          : campaign.headerMedia?.link
            ? {
                metaMessageId: null,
                persistedText: renderedMessage,
              }
            : await sendTenantChatText({
              tenantId: input.tenantId,
              chatId,
              text: renderedMessage,
              actor: input.actor,
              pauseAi: false,
              });

      const deliveryRef = adminDb.collection("outbound_campaign_deliveries").doc();
      const campaignContext = {
        campaignId: input.campaignId,
        campaignName: campaign.name,
        runId: runRef.id,
        deliveryId: deliveryRef.id,
        channel: "whatsapp",
        channelId: campaign.channelId || null,
        leadId: item.id,
        chatId,
        phone,
        intendedText: renderedMessage,
        persistedText:
          "persistedText" in dispatchResult && dispatchResult.persistedText
            ? dispatchResult.persistedText
            : renderedMessage,
        outboundType: campaign.deliveryMode,
        templateName: campaign.deliveryMode === "template" ? campaign.templateName : ("templateName" in dispatchResult ? dispatchResult.templateName || null : null),
        templateLanguage:
          campaign.deliveryMode === "template"
            ? campaign.languageCode
            : "templateLanguage" in dispatchResult
              ? dispatchResult.templateLanguage || null
              : null,
        templateParams:
          campaign.deliveryMode === "template"
            ? renderedBodyParams
            : "templateParams" in dispatchResult
              ? dispatchResult.templateParams || []
              : [],
        templateHeaderMedia: campaign.deliveryMode === "template" ? campaign.headerMedia : null,
        metaMessageId: dispatchResult.metaMessageId || null,
        status: "sent",
        sentAt: FieldValue.serverTimestamp(),
        sentBy: input.actor.id,
        sentByName: input.actor.name,
      };

      await Promise.all([
        deliveryRef.set({
          tenantId: input.tenantId,
          ...campaignContext,
          leadName: clean(item.data.nome, 160) || "Lead",
          leadSource: readLeadSource(item.data),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        adminDb.collection("leads").doc(item.id).set(
          {
            lastOutboundCampaignContext: campaignContext,
            lastOutboundCampaignId: input.campaignId,
            lastOutboundCampaignName: campaign.name,
            lastOutboundCampaignAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        adminDb.collection("chats").doc(chatId).set(
          {
            lastOutboundCampaignContext: campaignContext,
            lastOutboundCampaignId: input.campaignId,
            lastOutboundCampaignName: campaign.name,
            lastOutboundCampaignAt: FieldValue.serverTimestamp(),
            aiCampaignFollowupMode: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      await adminDb.collection("lead_events").add({
        tenantId: input.tenantId,
        leadId: item.id,
        type: "outbound_campaign_sent",
        title: `Campanha outbound: ${campaign.name}`,
        detail: "Mensagem enviada em lote via WhatsApp com contexto salvo para a IA.",
        createdAt: FieldValue.serverTimestamp(),
        actorId: input.actor.id,
        actorName: input.actor.name,
      });

      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        leadId: item.id,
        leadName: clean(item.data.nome, 160) || "Lead",
        message: error instanceof Error ? error.message : "Falha ao enviar campanha.",
      });
    }
  }

  const summary = {
    sent,
    skipped,
    failed,
    totalMatched: audience.filtered.length,
    selectedByLimit: matchedLeads.length,
  };

  if (input.accumulate) {
    const runUpdate: Record<string, unknown> = {
      status: "running",
      "summary.sent": FieldValue.increment(sent),
      "summary.skipped": FieldValue.increment(skipped),
      "summary.failed": FieldValue.increment(failed),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (errors.length) {
      runUpdate.errors = FieldValue.arrayUnion(...errors.slice(0, 20));
    }
    await Promise.all([
      runRef.update(runUpdate),
      campaignRef.update({
        executionStatus: "running",
        lastRunAt: FieldValue.serverTimestamp(),
        "lastRunSummary.sent": FieldValue.increment(sent),
        "lastRunSummary.skipped": FieldValue.increment(skipped),
        "lastRunSummary.failed": FieldValue.increment(failed),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.actor.id,
        updatedByName: input.actor.name,
      }),
    ]);
  } else {
    await Promise.all([
      runRef.set({
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        campaignName: campaign.name,
        channel: "whatsapp",
        status: "completed",
        summary,
        errors: errors.slice(0, 50),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: input.actor.id,
        createdByName: input.actor.name,
      }),
      campaignRef.set(
        {
          executionStatus: failed > 0 && sent === 0 ? "failed" : "completed",
          lastRunAt: FieldValue.serverTimestamp(),
          lastRunSummary: summary,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: input.actor.id,
          updatedByName: input.actor.name,
        },
        { merge: true }
      ),
    ]);
  }

  return { campaign, summary, runId: runRef.id, errors };
}

export async function enqueueOutboundCampaign(input: {
  tenantId: string;
  campaignId: string;
  actor: ChatDispatchActor;
  scheduledAt?: Date | null;
}) {
  const { campaignRef, campaign } = await loadCampaignContext(input);
  if (
    campaign.activeRunId &&
    ["scheduled", "queued", "running", "paused"].includes(campaign.executionStatus)
  ) {
    throw new Error("Este disparo ja possui uma execucao em andamento.");
  }
  if (!campaign.channelId) throw new Error("Escolha o numero remetente antes de agendar.");
  if (campaign.deliveryMode === "template" && !campaign.templateName.trim()) {
    throw new Error("Escolha um template Meta aprovado.");
  }
  if (campaign.deliveryMode === "text" && !campaign.messageTemplate.trim()) {
    throw new Error("Escreva a mensagem do disparo.");
  }

  const leadsSnap = await adminDb.collection("leads").where("tenantId", "==", input.tenantId).limit(600).get();
  const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
  const audience = buildAudienceSelection({
    leads,
    filters: campaign.filters,
    maxRecipients: campaign.maxRecipients,
  });
  const eligible = audience.selected.filter(
    (item) => !hasWhatsAppOptOut(item.data) && Boolean(normalizePhone(clean(item.data.telefone, 40)))
  );
  if (!eligible.length) throw new Error("Nenhum contato apto para receber este disparo.");

  const runRef = adminDb.collection("outbound_campaign_runs").doc();
  const baseDate =
    input.scheduledAt ||
    (campaign.scheduledAt ? new Date(campaign.scheduledAt) : null) ||
    new Date();
  const safeBaseDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const jobs = buildOutboundJobSchedule({
    leadIds: eligible.map((item) => item.id),
    sendRatePerMinute: campaign.sendRatePerMinute,
    startsAt: safeBaseDate,
  });

  const jobRefs = jobs.map((job) => ({
    ref: adminDb.collection("outbound_campaign_jobs").doc(),
    job,
  }));
  for (let offset = 0; offset < jobRefs.length; offset += 400) {
    const preparationBatch = adminDb.batch();
    jobRefs.slice(offset, offset + 400).forEach(({ ref, job }) => {
      preparationBatch.set(ref, {
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        campaignName: campaign.name,
        runId: runRef.id,
        leadIds: job.leadIds,
        status: "staging",
        attempts: 0,
        dueAt: job.dueAt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: input.actor.id,
        createdByName: input.actor.name,
      });
    });
    await preparationBatch.commit();
  }

  const batch = adminDb.batch();
  batch.set(runRef, {
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    campaignName: campaign.name,
    channel: "whatsapp",
    status: safeBaseDate.getTime() > Date.now() + 15_000 ? "scheduled" : "queued",
    scheduledAt: safeBaseDate,
    totalJobs: jobs.length,
    completedJobs: 0,
    summary: {
      sent: 0,
      skipped: audience.selected.length - eligible.length,
      failed: 0,
      totalMatched: audience.filtered.length,
      selectedByLimit: audience.selected.length,
    },
    errors: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: input.actor.id,
    createdByName: input.actor.name,
  });
  batch.set(
    campaignRef,
    {
      executionStatus: safeBaseDate.getTime() > Date.now() + 15_000 ? "scheduled" : "queued",
      status: "active",
      scheduledAt: safeBaseDate,
      activeRunId: runRef.id,
      lastRunSummary: {
        sent: 0,
        skipped: audience.selected.length - eligible.length,
        failed: 0,
        totalMatched: audience.filtered.length,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actor.id,
      updatedByName: input.actor.name,
    },
    { merge: true }
  );
  await batch.commit();

  const activationWriter = adminDb.bulkWriter();
  jobRefs.forEach(({ ref }) => {
    activationWriter.update(ref, {
      status: "ready",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await activationWriter.close();

  return {
    campaign,
    runId: runRef.id,
    queued: eligible.length,
    jobs: jobs.length,
    scheduledAt: safeBaseDate.toISOString(),
    summary: {
      sent: 0,
      skipped: audience.selected.length - eligible.length,
      failed: 0,
      totalMatched: audience.filtered.length,
    },
  };
}

export async function processOutboundCampaignJobs(input?: { limit?: number }) {
  const limit = Math.max(1, Math.min(100, Number(input?.limit || 40)));
  const snap = await adminDb.collection("outbound_campaign_jobs").where("status", "==", "ready").limit(1000).get();
  const now = Date.now();
  const dueJobs = snap.docs
    .filter((doc) => {
      const dueAt = toIso(doc.data().dueAt);
      return !dueAt || new Date(dueAt).getTime() <= now;
    })
    .slice(0, limit);
  const results: Array<{ jobId: string; status: string; error?: string }> = [];

  async function finalizeRunIfDone(runId: string, campaignId: string) {
    const jobs = await adminDb
      .collection("outbound_campaign_jobs")
      .where("runId", "==", runId)
      .limit(1000)
      .get();
    const pending = jobs.docs.some((doc) => ["ready", "processing"].includes(clean(doc.data().status, 20)));
    if (pending) return;

    const runRef = adminDb.collection("outbound_campaign_runs").doc(runId);
    const runSnap = await runRef.get();
    const summary = (runSnap.data()?.summary || {}) as Record<string, unknown>;
    const finalStatus = Number(summary.failed || 0) > 0 && Number(summary.sent || 0) === 0 ? "failed" : "completed";
    await Promise.all([
      runRef.set(
        { status: finalStatus, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
      adminDb.collection("outbound_campaigns").doc(campaignId).set(
        { executionStatus: finalStatus, lastRunAt: FieldValue.serverTimestamp(), activeRunId: null, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
    ]);
  }

  for (const jobDoc of dueJobs) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(jobDoc.ref);
      if (!fresh.exists || String(fresh.data()?.status || "") !== "ready") return null;
      transaction.set(
        jobDoc.ref,
        {
          status: "processing",
          attempts: FieldValue.increment(1),
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return fresh.data() as Record<string, unknown>;
    });
    if (!claimed) continue;

    const tenantId = clean(claimed.tenantId, 180);
    const campaignId = clean(claimed.campaignId, 180);
    const runId = clean(claimed.runId, 180);
    const campaignSnap = await adminDb.collection("outbound_campaigns").doc(campaignId).get();
    const campaignData = campaignSnap.data() as Record<string, unknown> | undefined;
    if (!campaignSnap.exists || clean(campaignData?.tenantId, 180) !== tenantId) {
      await jobDoc.ref.set({ status: "failed", error: "campaign_not_found", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      results.push({ jobId: jobDoc.id, status: "failed", error: "campaign_not_found" });
      continue;
    }
    if (clean(campaignData?.status, 20) === "paused") {
      await jobDoc.ref.set({ status: "paused", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      results.push({ jobId: jobDoc.id, status: "paused" });
      continue;
    }

    try {
      await dispatchOutboundCampaign({
        tenantId,
        campaignId,
        runId,
        leadIds: Array.isArray(claimed.leadIds) ? claimed.leadIds.map((item) => clean(item, 180)).filter(Boolean) : [],
        actor: {
          id: clean(claimed.createdBy, 180) || "outbound_worker",
          name: clean(claimed.createdByName, 180) || "Motor de disparos",
        },
        accumulate: true,
      });
      await jobDoc.ref.set({ status: "completed", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminDb.collection("outbound_campaign_runs").doc(runId).set(
        { completedJobs: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      await finalizeRunIfDone(runId, campaignId);
      results.push({ jobId: jobDoc.id, status: "completed" });
    } catch (error) {
      const attempts = Number(claimed.attempts || 0) + 1;
      const terminal = attempts >= 3;
      await jobDoc.ref.set(
        {
          status: terminal ? "failed" : "ready",
          error: error instanceof Error ? error.message : "outbound_job_failed",
          dueAt: terminal ? claimed.dueAt || new Date() : new Date(Date.now() + attempts * 60_000),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (terminal) {
        await adminDb.collection("outbound_campaign_runs").doc(runId).update({
          completedJobs: FieldValue.increment(1),
          "summary.failed": FieldValue.increment(
            Array.isArray(claimed.leadIds) ? claimed.leadIds.length : 1
          ),
          errors: FieldValue.arrayUnion({
            jobId: jobDoc.id,
            message: error instanceof Error ? error.message : "outbound_job_failed",
          }),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await adminDb.collection("outbound_campaigns").doc(campaignId).update({
          "lastRunSummary.failed": FieldValue.increment(
            Array.isArray(claimed.leadIds) ? claimed.leadIds.length : 1
          ),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await finalizeRunIfDone(runId, campaignId);
      }
      results.push({ jobId: jobDoc.id, status: terminal ? "failed" : "retry", error: error instanceof Error ? error.message : "outbound_job_failed" });
    }
  }

  return { processed: results.length, results };
}
