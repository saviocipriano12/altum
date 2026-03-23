import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { sendTenantChatText, type ChatDispatchActor } from "@/lib/server/chat-dispatch";

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
  messageTemplate: string;
  maxRecipients: number;
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

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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
  return {
    id: input.id,
    tenantId: clean(input.data.tenantId, 140),
    name: clean(input.data.name, 160) || "Campanha outbound",
    status: status === "active" || status === "paused" ? status : "draft",
    channel: "whatsapp",
    messageTemplate: clean(input.data.messageTemplate, 4000),
    maxRecipients: Math.max(1, Math.min(500, Number(input.data.maxRecipients || 50))),
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
  messageTemplate?: unknown;
  maxRecipients?: unknown;
  filters?: unknown;
  actor: { id: string; name: string };
}) {
  const status = clean(input.status, 20);
  return {
    tenantId: clean(input.tenantId, 140),
    name: clean(input.name, 160) || "Campanha outbound",
    status: status === "active" || status === "paused" ? status : "draft",
    channel: "whatsapp",
    messageTemplate: clean(input.messageTemplate, 4000),
    maxRecipients: Math.max(1, Math.min(500, Number(input.maxRecipients || 50))),
    filters: normalizeOutboundCampaignFilters(input.filters),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.actor.id,
    updatedByName: input.actor.name,
  };
}

function interpolateTemplate(template: string, lead: Record<string, unknown>) {
  const replacements: Record<string, string> = {
    nome: clean(lead.nome, 160) || "Contato",
    empresa: clean(lead.empresa, 160),
    telefone: clean(lead.telefone, 40),
    email: clean(lead.email, 180),
    stage: clean(lead.stage, 80),
    origem: clean(lead.source, 80),
  };

  return template.replace(/\{(\w+)\}/g, (_, key: string) => replacements[key] || "");
}

function matchLeadFilters(lead: Record<string, unknown>, filters: OutboundCampaignFilters) {
  const stage = clean(lead.stage, 80).toLowerCase();
  const ownerId = clean(lead.ownerId, 140).toLowerCase();
  const source = clean(lead.source, 80).toLowerCase();
  const heat = clean(lead.heat, 40).toLowerCase();
  const tags = cleanList(lead.tags, 40, 50);

  if (filters.stageIds.length > 0 && !filters.stageIds.includes(stage)) return false;
  if (filters.ownerIds.length > 0 && !filters.ownerIds.includes(ownerId)) return false;
  if (filters.sources.length > 0 && !filters.sources.includes(source)) return false;
  if (filters.heat.length > 0 && !filters.heat.includes(heat)) return false;
  if (filters.tags.length > 0 && !filters.tags.some((tag) => tags.includes(tag))) return false;
  return true;
}

async function findOrCreateLeadChat(input: {
  tenantId: string;
  leadId: string;
  lead: Record<string, unknown>;
  actor: ChatDispatchActor;
}) {
  const phone = normalizePhone(clean(input.lead.telefone, 40));
  if (!phone) return null;

  const existing = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("leadId", "==", input.leadId)
    .limit(1)
    .get();

  if (!existing.empty) return existing.docs[0].id;

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
    source: "outbound_campaign",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageTime: FieldValue.serverTimestamp(),
    lastMessage: "",
  });

  return chatRef.id;
}

export async function dispatchOutboundCampaign(input: {
  tenantId: string;
  campaignId: string;
  actor: ChatDispatchActor;
}) {
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
  if (!campaign.messageTemplate.trim()) {
    throw new Error("A campanha precisa de uma mensagem para ser enviada.");
  }

  const leadsSnap = await adminDb.collection("leads").where("tenantId", "==", input.tenantId).limit(600).get();
  const matchedLeads = leadsSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .filter((item) => matchLeadFilters(item.data, campaign.filters))
    .slice(0, campaign.maxRecipients);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ leadId: string; leadName: string; message: string }> = [];

  for (const item of matchedLeads) {
    try {
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
      });

      if (!chatId) {
        skipped += 1;
        continue;
      }

      await sendTenantChatText({
        tenantId: input.tenantId,
        chatId,
        text: interpolateTemplate(campaign.messageTemplate, item.data),
        actor: input.actor,
        pauseAi: true,
        pauseMinutes: 180,
      });

      await adminDb.collection("lead_events").add({
        tenantId: input.tenantId,
        leadId: item.id,
        type: "outbound_campaign_sent",
        title: `Campanha outbound: ${campaign.name}`,
        detail: "Mensagem enviada em lote via WhatsApp.",
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

  const runRef = adminDb.collection("outbound_campaign_runs").doc();
  const summary = {
    sent,
    skipped,
    failed,
    totalMatched: matchedLeads.length,
  };

  await Promise.all([
    runRef.set({
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      campaignName: campaign.name,
      channel: "whatsapp",
      summary,
      errors: errors.slice(0, 50),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: input.actor.id,
      createdByName: input.actor.name,
    }),
    campaignRef.set(
      {
        lastRunAt: FieldValue.serverTimestamp(),
        lastRunSummary: summary,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.actor.id,
        updatedByName: input.actor.name,
      },
      { merge: true }
    ),
  ]);

  return { campaign, summary, runId: runRef.id, errors };
}
