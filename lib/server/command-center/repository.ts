import "server-only";
import { FieldPath, Timestamp, type DocumentSnapshot, type Query, type QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantAccess, getTenantCapabilities, getTenantSettings, TenantAccessError } from "@/lib/server/tenant";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import type { CommandPorts, Kind, Page, Row } from "./service";
import { CommandError } from "./security";
import { getWhatsAppChannelForTenant, isOfficialWhatsAppProvider, listWhatsAppMessageTemplates } from "@/app/lib/server/whatsapp-channel";
import { commercialOfferReadiness, normalizeCommercialOffer } from "@/lib/commercial-offer";
import { parseAiConfig } from "@/lib/server/ai/agent";

const collections = { leads: "leads", chats: "chats", channels: "tenant_channels", campaign_snapshots: "campaign_snapshots", ad_creative_snapshots: "ad_creative_snapshots", google_ads_operator_reports: "google_ads_operator_reports", meta_ads_operator_reports: "meta_ads_operator_reports", growth_segments: "growth_segments", growth_events: "growth_events", appointments: "appointments", proposals: "orcamentos", finance: "financeiro" } as const;
const fields: Record<Kind, string[]> = {
  leads: ["tenantId", "nome", "empresa", "pipelineStage", "stage", "ownerId", "assignedTo", "ownerUserId", "assignedUserId", "responsavelId", "heat", "aiCommercialTemperature", "score", "tags", "aiNextAction", "stageUpdatedAt", "createdAt", "updatedAt", "potentialValue", "valorPotencial", "origem", "channel", "sourceLabel", "campaignName", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "gclid", "fbclid", "first_touch", "last_touch", "assisted_touches", "attribution"],
  chats: ["tenantId", "contactName", "name", "leadId", "channel", "channelType", "status", "createdAt", "lastClientMessageAt", "lastAgentMessageAt", "lastMessageTime", "lastMessage", "assignedTo", "ownerId", "ownerUserId", "assignedUserId", "responsavelId"],
  channels: ["tenantId", "type", "status", "connectionStatus", "lastHealthCheckAt"],
  campaign_snapshots: ["tenantId", "clientId", "channelId", "adAccountId", "platform", "accountLabel", "dateRef", "campaignId", "campaignName", "impressions", "clicks", "spend", "leads", "cpl", "roas"],
  ad_creative_snapshots: ["tenantId", "clientId", "channelId", "adAccountId", "platform", "dateRef", "campaignId", "campaignName", "adId", "adName", "impressions", "clicks", "spend", "ctr", "cpc", "frequency"],
  google_ads_operator_reports: ["tenantId", "channelId", "accountId", "report", "generatedAt", "updatedAt", "source"],
  meta_ads_operator_reports: ["tenantId", "channelId", "accountId", "report", "generatedAt", "updatedAt", "source"],
  growth_segments: ["tenantId", "name", "status", "definition", "source", "createdAt", "updatedAt"],
  growth_events: ["tenantId", "name", "occurredAt", "anonymousId", "sessionId", "externalId", "path", "value", "currency", "properties", "attribution"],
  appointments: ["tenantId", "leadId", "status", "startAt", "scheduledAt", "createdAt"],
  proposals: ["tenantId", "leadId", "status", "titulo", "valorTotal", "createdAt", "updatedAt", "ownerId", "assignedTo"],
  finance: ["tenantId", "leadId", "tipo", "status", "valor", "dataPagamento", "createdAt", "updatedAt", "ownerId", "assignedTo"],
};
function rows(snap: QuerySnapshot): Row[] { return snap.docs.map(doc => ({ ...doc.data(), id: doc.id })); }
function page(snap: QuerySnapshot, limit: number, cursor: (row: Row) => string): Page {
  const result = rows(snap);
  const visible = result.slice(0, limit);
  return { rows: visible, next: result.length > limit ? cursor(visible[visible.length - 1]) : null };
}
function position(row: Row) {
  const timestamp = row.createdAt as Timestamp;
  return JSON.stringify([timestamp.seconds, timestamp.nanoseconds, row.id]);
}
function seek(query: Query, after?: string) {
  if (!after) return query;
  const [seconds, nanos, id] = JSON.parse(after) as [number, number, string];
  return query.startAfter(new Timestamp(seconds, nanos), id);
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function safeDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}
const offerFields = [
  "tenantId", "type", "content", "tags", "kind", "serviceKey", "productName", "productCategory", "targetProfile", "sku",
  "priceFrom", "priceTo", "currency", "inventoryQuantity", "availability", "checkoutUrl", "source", "sourceKey", "priority",
  "description", "benefits", "commonQuestions", "objections", "whenRecommend", "whenNotRecommend", "whenHuman", "productSpecs",
  "stockDelivery", "warranty", "serviceScope", "duration", "schedulingRules", "deliverables", "proofAndCases", "demonstration",
  "paymentConditions", "supportAndSla", "mediaItems", "upsellOfferIds", "crossSellOfferIds", "downsellOfferIds",
  "incompatibleOfferIds", "nextOfferId", "momentToOffer", "createdAt", "updatedAt",
] as const;
function projectKnowledge(doc: DocumentSnapshot): Row {
  const data = doc.data() as Record<string, unknown>;
  return { id: doc.id, tenantId: data.tenantId, type: data.type || "faq", content: data.content || "", tags: Array.isArray(data.tags) ? data.tags : [],
    productName: data.productName || null, serviceKey: data.serviceKey || null, source: data.source || "manual", useInAi: data.useInAi !== false,
    createdAt: safeDate(data.createdAt), updatedAt: safeDate(data.updatedAt) };
}
function projectOffer(doc: DocumentSnapshot): Row {
  const data = doc.data() as Record<string, unknown>;
  const normalized = normalizeCommercialOffer(data);
  const readiness = commercialOfferReadiness(data);
  const safe = Object.fromEntries(offerFields.filter((field) => field !== "tenantId" && field !== "createdAt" && field !== "updatedAt").map((field) => [field, data[field] ?? null]));
  return { id: doc.id, tenantId: data.tenantId, type: data.type || "catalog", ...safe, ...normalized,
    createdAt: safeDate(data.createdAt), updatedAt: safeDate(data.updatedAt),
    commercialReadiness: { readyForAi: readiness.readyForAi, issues: readiness.issues, sellable: readiness.sellability.sellable, reason: readiness.sellability.reason } };
}

/** Repository boundary: all scans constrain tenant before fetching. No provider synchronization. */
export const commandPorts: CommandPorts = {
  async access(userId, tenantId) {
    try {
      const membership = await assertTenantAccess(userId, tenantId);
      if (membership.tenantId !== tenantId || membership.userId !== userId) throw new CommandError("FORBIDDEN");
      const entitlements = await getTenantEntitlements(tenantId);
      return { userId, tenantId, active: membership.status === "active", capabilities: getTenantCapabilities(membership),
        modules: entitlements.modules, entitlementSource: entitlements.mode, teamWideCommercial: hasTeamWideCommercialAccess(membership),
        canRead: row => canAccessAssignedCommercialRecord(membership, userId, row) };
    } catch (error) {
      if (error instanceof TenantAccessError) throw new CommandError("FORBIDDEN");
      throw error;
    }
  },
  async profile(tenantId) {
    const settings = await getTenantSettings(tenantId);
    if (!settings || settings.tenantId !== tenantId) throw new CommandError("UNAVAILABLE", 503);
    return settings;
  },
  async aiCommercialProfile(tenantId) {
    const settings = await getTenantSettings(tenantId);
    const ai = object(settings?.ai);
    const resolved = parseAiConfig(settings);
    const brain = resolved.commercialBrain;
    return {
      tenantId,
      profile: {
        enabled: resolved.enabled, responsePaused: resolved.responsePaused,
        agentName: resolved.agentName, assistantRole: resolved.assistantRole, toneOfVoice: resolved.toneOfVoice,
        businessSummary: resolved.businessSummary, objective: resolved.objective,
        commercialBrain: {
          businessModel: brain.businessModel || "", idealCustomer: brain.idealCustomer || "", revenuePriorities: brain.revenuePriorities || "",
          diagnosisStyle: brain.diagnosisStyle || "", customSolutionPolicy: brain.customSolutionPolicy || "", handoffCriteria: brain.handoffCriteria || "",
          proposalStyle: brain.proposalStyle || "", followUpStrategy: brain.followUpStrategy || "", forbiddenSalesMoves: brain.forbiddenSalesMoves || "",
        },
        responsiblePhone: resolved.responsiblePhone, handoffNotifyEnabled: resolved.handoffNotifyEnabled,
        handoffNotifyPhones: resolved.handoffNotifyPhones,
        voiceReplyEnabled: resolved.voiceReplyEnabled, voiceReplyVoice: resolved.voiceReplyVoice, voiceReplyMode: resolved.voiceReplyMode,
        voiceReplyMaxChars: resolved.voiceReplyMaxChars,
        guardrails: resolved.guardrails, mandatoryQuestions: resolved.mandatoryQuestions,
        escalationTopics: resolved.escalationTopics,
        whatsappTemplateFollowUpEnabled: resolved.whatsappTemplateFollowUpEnabled,
        whatsappTemplateFollowUpName: resolved.whatsappTemplateFollowUpName,
        whatsappTemplateFollowUpLanguage: resolved.whatsappTemplateFollowUpLanguage,
        whatsappTemplateFollowUpParams: resolved.whatsappTemplateFollowUpParams,
        operatingProfile: {
          tier: resolved.tier, autonomyMode: resolved.autonomyMode, reasoningLevel: resolved.reasoningLevel,
          responseStyle: resolved.responseStyle, allowPremiumModels: resolved.allowPremiumModels,
          preferredProviders: resolved.preferredProviders, conversationModelOverride: resolved.conversationModelOverride || null,
          extractionModelOverride: resolved.extractionModelOverride || null, monthlyBudgetUsd: resolved.monthlyBudgetUsd,
          monthlyUsageCap: resolved.monthlyUsageCap,
        },
        rollout: resolved.rollout,
        runtime: {
          tenantContextConfigured: resolved.tenantContextConfigured, businessProfileId: resolved.businessProfileId,
          businessProfileLabel: resolved.businessProfileLabel, salesMotion: resolved.salesMotion, runtimePolicy: resolved.runtimePolicy,
        },
      },
      updatedAt: safeDate(settings?.updatedAt),
      coverage: "Configuracao resolvida pelo mesmo parser do runtime atual da IA, incluindo fallbacks de Blueprint e perfil de negocio. Chaves de provider, tokens e segredos nao sao expostos.",
    };
  },
  async commercialOffers(tenantId, limit, after) {
    let query = adminDb.collection("kb_docs").where("tenantId", "==", tenantId).where("type", "==", "catalog").orderBy(FieldPath.documentId()).select(...offerFields);
    if (after) query = query.startAfter(after);
    const snap = await query.limit(limit + 1).get();
    const projected = snap.docs.map(projectOffer);
    return { rows: projected.slice(0, limit), next: projected.length > limit ? projected[limit - 1].id : null };
  },
  async commercialOffer(tenantId, id) {
    const snap = await adminDb.collection("kb_docs").doc(id).get();
    if (!snap.exists || snap.data()?.tenantId !== tenantId || snap.data()?.type !== "catalog") return null;
    return projectOffer(snap);
  },
  async knowledgeDocuments(tenantId, limit, after) {
    let query = adminDb.collection("kb_docs").where("tenantId", "==", tenantId).orderBy(FieldPath.documentId()).select("tenantId", "type", "content", "tags", "productName", "serviceKey", "source", "useInAi", "createdAt", "updatedAt");
    if (after) query = query.startAfter(after);
    const snap = await query.limit(limit + 1).get();
    const projected = snap.docs.map(projectKnowledge);
    return { rows: projected.slice(0, limit), next: projected.length > limit ? projected[limit - 1].id : null };
  },
  async knowledgeDocument(tenantId, id) {
    const snap = await adminDb.collection("kb_docs").doc(id).get();
    if (!snap.exists || snap.data()?.tenantId !== tenantId) return null;
    const data = snap.data() as Record<string, unknown>;
    if (data.type === "catalog") return projectOffer(snap);
    return { id: snap.id, tenantId, type: data.type || "faq", content: data.content || "", tags: Array.isArray(data.tags) ? data.tags : [],
      source: data.source || "manual", sourceKey: data.sourceKey || null, useInAi: data.useInAi !== false,
      createdAt: safeDate(data.createdAt), updatedAt: safeDate(data.updatedAt) };
  },
  async automations(tenantId, limit, after) {
    let query = adminDb.collection("automations").where("tenantId", "==", tenantId).orderBy(FieldPath.documentId()).select("tenantId", "name", "description", "trigger", "enabled", "status", "conditions", "actions", "createdAt", "updatedAt");
    if (after) query = query.startAfter(after);
    const snap = await query.limit(limit + 1).get();
    const projected = snap.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, createdAt: safeDate(data.createdAt), updatedAt: safeDate(data.updatedAt) } as Row; });
    return { rows: projected.slice(0, limit), next: projected.length > limit ? projected[limit - 1].id : null };
  },
  async automation(tenantId, id) {
    const snap = await adminDb.collection("automations").doc(id).get();
    if (!snap.exists || snap.data()?.tenantId !== tenantId) return null;
    const data = snap.data() as Record<string, unknown>;
    return { id: snap.id, tenantId, name: data.name || "", description: data.description || "", trigger: data.trigger || "", enabled: data.enabled === true,
      status: data.status || "paused", conditions: data.conditions || {}, actions: Array.isArray(data.actions) ? data.actions : [], createdAt: safeDate(data.createdAt), updatedAt: safeDate(data.updatedAt) };
  },
  async teamOperation(tenantId) {
    const [settings, membersSnap] = await Promise.all([
      getTenantSettings(tenantId),
      adminDb.collection("tenant_users").where("tenantId", "==", tenantId).limit(100).get(),
    ]);
    const rules = settings?.rules && typeof settings.rules === "object" ? settings.rules as Record<string, unknown> : {};
    const inbox = rules.inbox && typeof rules.inbox === "object" ? rules.inbox as Record<string, unknown> : {};
    return {
      teams: Array.isArray(inbox.teams) ? inbox.teams : [],
      distribution: {
        defaultTeam: inbox.defaultTeam || null,
        firstResponseSlaMinutes: inbox.firstResponseSlaMinutes || null,
        assignmentMode: inbox.assignmentMode || "manual",
        autoAssignOnInbound: inbox.autoAssignOnInbound === true,
        businessHoursOnly: inbox.businessHoursOnly === true,
      },
      people: membersSnap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          userId: String(data.userId || doc.id.replace(`${tenantId}_`, "")),
          name: String(data.name || ""),
          email: String(data.email || ""),
          role: String(data.role || ""),
          status: data.status === "blocked" ? "blocked" : "active",
          accessProfile: String(data.accessProfile || ""),
          teamId: String(data.team || ""),
          availability: String(data.availability || "online"),
          maxOpenChats: typeof data.maxOpenChats === "number" ? data.maxOpenChats : null,
          commissionRate: typeof data.commissionRate === "number" ? data.commissionRate : null,
        };
      }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      coverage: "Configuracao atual de equipe e distribuicao. Credenciais, tokens e dados pessoais desnecessarios nao sao expostos.",
    };
  },
  async whatsappTemplates(tenantId, channelId) {
    const channel = await getWhatsAppChannelForTenant(tenantId, { allowAgencyFallback: false, channelId: channelId || null });
    if (!channel) throw new CommandError("WHATSAPP_CHANNEL_UNAVAILABLE", 409);
    if (!isOfficialWhatsAppProvider(channel.provider)) {
      return {
        channel: { id: channel.id, displayName: channel.displayName || "WhatsApp", provider: channel.provider },
        requiresTemplate: false,
        templates: [],
        coverage: "Este canal nao usa a API oficial da Meta e nao exige template para iniciar uma conversa.",
      };
    }
    const result = await listWhatsAppMessageTemplates(channel);
    const templates = result.templates.map((template) => {
      const body = template.components.find((component) => String(component.type || "").toUpperCase() === "BODY");
      const bodyText = typeof body?.text === "string" ? body.text.slice(0, 2000) : "";
      const parameterIndexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])).filter(Number.isFinite);
      return {
        id: template.id || null,
        name: template.name,
        language: template.language,
        status: template.status,
        category: template.category,
        body: bodyText,
        parameterCount: parameterIndexes.length ? Math.max(...parameterIndexes) : 0,
      };
    }).sort((a, b) => Number(a.status !== "approved") - Number(b.status !== "approved") || a.name.localeCompare(b.name));
    return {
      channel: { id: channel.id, displayName: channel.displayName || "WhatsApp", provider: channel.provider },
      requiresTemplate: true,
      templates,
      summary: { total: templates.length, approved: templates.filter((item) => item.status === "approved").length },
      coverage: "Consulta ao vivo na conta WhatsApp Business. Apenas templates approved podem iniciar uma nova conversa; nenhum token ou identificador secreto e retornado.",
    };
  },
  async list(tenantId, kind, limit, after) {
    let query = adminDb.collection(collections[kind]).where("tenantId", "==", tenantId)
      .orderBy(FieldPath.documentId()).select(...fields[kind]);
    if (after) query = query.startAfter(after);
    const hardLimit = kind === "ad_creative_snapshots" || kind === "growth_events" || kind === "campaign_snapshots" ? 1500 : 500;
    const safeLimit = Math.min(hardLimit, limit);
    return page(await query.limit(safeLimit + 1).get(), safeLimit, row => row.id);
  },
  async conversation(tenantId, id) {
    const snap = await adminDb.collection("chats").where("tenantId", "==", tenantId)
      .where(FieldPath.documentId(), "==", id).select(...fields.chats).limit(1).get();
    return rows(snap)[0] || null;
  },
  async messages(tenantId, chatId, limit, after) {
    const query = adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", chatId)
      .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc")
      .select("tenantId", "chatId", "text", "sender", "createdAt");
    return page(await seek(query, after).limit(limit + 1).get(), limit, position);
  },
  async events(tenantId, from, to, limit, after) {
    const query = adminDb.collection("audit_logs").where("tenantId", "==", tenantId)
      .where("createdAt", ">=", Timestamp.fromDate(new Date(from))).where("createdAt", "<", Timestamp.fromDate(new Date(to)))
      .orderBy("createdAt", "asc").orderBy(FieldPath.documentId(), "asc").select("tenantId", "createdAt", "action", "type");
    return page(await seek(query, after).limit(limit + 1).get(), limit, position);
  },
  async createDraft(entry) {
    const ref = await adminDb.collection("mcp_action_drafts").add({ ...entry, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    return { id: ref.id, href: `/cliente/painel/configuracoes/mcp?draft=${encodeURIComponent(ref.id)}` };
  },
  async audit(entry) {
    await adminDb.collection("mcp_access_audit").add({ ...entry, recordedAt: Timestamp.now() });
  },
};
