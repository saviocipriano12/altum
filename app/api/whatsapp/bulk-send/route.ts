import { NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhone } from "@/app/lib/server/phone";
import { getTenantForCurrentUser } from "@/lib/server/tenant";
import {
  AGENCY_TENANT_ID,
  getWhatsAppChannelForTenant,
  sendMetaTemplateMessage,
  sendMetaTextMessage,
  type WhatsAppTemplateHeaderMedia,
} from "@/app/lib/server/whatsapp-channel";
import {
  evaluateWhatsAppBulkCompliance,
  WHATSAPP_BULK_MIN_INTERVAL_HOURS,
} from "@/lib/server/whatsapp-compliance";

type Body = {
  leadIds?: string[];
  text?: string;
  tenantId?: string;
  campaignName?: string;
  dryRun?: boolean;
  mode?: "text" | "template";
  templateName?: string;
  languageCode?: string;
  bodyParams?: string[];
  headerMedia?: {
    type?: string;
    link?: string;
    id?: string;
    filename?: string;
  } | null;
};

type LeadDoc = Record<string, unknown> & {
  nome?: string;
  telefone?: string;
  email?: string;
  origem?: string;
  categoria?: string;
  endereco?: string;
  ownerId?: string;
  owner?: string;
  tenantId?: string;
};

type LeadResult = {
  leadId: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  chatId?: string;
  phone?: string;
};

const MAX_LEADS_PER_BATCH = 50;

function renderTemplate(template: string, lead: LeadDoc) {
  const values: Record<string, string> = {
    nome: lead.nome || "",
    empresa: lead.nome || "",
    categoria: lead.categoria || "",
    origem: lead.origem || "",
    cidade: extractCity(lead.endereco || ""),
  };

  return template.replace(/\{(nome|empresa|categoria|origem|cidade)\}/gi, (_, key: string) => {
    return values[key.toLowerCase()] || "";
  }).trim();
}

function normalizeMode(value: unknown) {
  return value === "template" ? "template" : "text";
}

function normalizeTemplateName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase()
    .slice(0, 512);
}

function normalizeLanguageCode(value: unknown) {
  return String(value || "pt_BR").trim().slice(0, 24) || "pt_BR";
}

function normalizeBodyParamTemplates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
}

function normalizeHeaderMedia(value: Body["headerMedia"]): WhatsAppTemplateHeaderMedia | null {
  if (!value || typeof value !== "object") return null;
  const type = String(value.type || "").trim().toLowerCase();
  if (type !== "image" && type !== "video" && type !== "document") return null;
  const link = String(value.link || "").trim();
  const id = String(value.id || "").trim();
  if (!link && !id) return null;
  return {
    type,
    ...(link ? { link } : {}),
    ...(id ? { id } : {}),
    ...(value.filename ? { filename: String(value.filename).trim().slice(0, 180) } : {}),
  };
}

function buildTemplateDisplayText(input: {
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  headerMedia: WhatsAppTemplateHeaderMedia | null;
}) {
  const parts = [
    `Template Meta: ${input.templateName}`,
    `Idioma: ${input.languageCode}`,
    input.bodyParams.length ? `Variaveis: ${input.bodyParams.join(" | ")}` : "",
    input.headerMedia ? `Midia: ${input.headerMedia.type}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function extractCity(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

async function resolveChat(params: {
  phone: string;
  contactName: string;
  ownerId: string;
  tenantId: string | null;
  userName: string;
  leadId: string;
  campaignName: string;
}) {
  const { phone, contactName, ownerId, tenantId, userName, leadId, campaignName } = params;

  const chatQuery = tenantId
    ? await adminDb
        .collection("chats")
        .where("contactPhone", "==", phone)
        .where("tenantId", "==", tenantId)
        .limit(1)
        .get()
    : await adminDb.collection("chats").where("contactPhone", "==", phone).limit(1).get();

  if (!chatQuery.empty) {
    const found = chatQuery.docs[0];
    const data = found.data() as { ownerId?: string; assignedTo?: string; tenantId?: string };
    return {
      chatId: found.id,
      chatRef: found.ref,
      ownerId: data.ownerId || data.assignedTo || ownerId,
      tenantId: data.tenantId || tenantId,
    };
  }

  const created = await adminDb.collection("chats").add({
    contactName,
    contactPhone: phone,
    contactPhoneNormalized: phone,
    status: "open",
    ownerId,
    ownerName: userName,
    tenantId,
    leadId,
    sourceType: "admin_bulk_whatsapp",
    sourceLabel: "Prospeccao ativa",
    campaignName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageTime: FieldValue.serverTimestamp(),
    lastMessage: "",
  });

  return {
    chatId: created.id,
    chatRef: created as DocumentReference,
    ownerId,
    tenantId,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;
    const mode = normalizeMode(body.mode);
    const text = (body.text || "").trim();
    const campaignName = (body.campaignName || "Prospeccao ativa").trim().slice(0, 180);
    const leadIds = Array.from(new Set((body.leadIds || []).filter(Boolean)));
    const templateName = normalizeTemplateName(body.templateName);
    const languageCode = normalizeLanguageCode(body.languageCode);
    const bodyParamTemplates = normalizeBodyParamTemplates(body.bodyParams);
    const headerMedia = normalizeHeaderMedia(body.headerMedia);

    if (mode === "text" && !text) {
      throw new RouteAuthError(400, "invalid_payload", "Campo obrigatorio: text.");
    }

    if (mode === "template" && !templateName) {
      throw new RouteAuthError(400, "invalid_payload", "Campo obrigatorio no modo template: templateName.");
    }

    if (!leadIds.length) {
      throw new RouteAuthError(400, "invalid_payload", "Selecione pelo menos um lead.");
    }

    if (leadIds.length > MAX_LEADS_PER_BATCH) {
      throw new RouteAuthError(
        400,
        "batch_too_large",
        `Envie no maximo ${MAX_LEADS_PER_BATCH} leads por lote.`
      );
    }

    const batchRef = await adminDb.collection("whatsappBulkBatches").add({
      leadIds,
      text,
      campaignName,
      mode,
      templateName: templateName || null,
      languageCode,
      bodyParamTemplates,
      headerMedia,
      dryRun: Boolean(body.dryRun),
      requestedBy: user.uid,
      requestedByName: user.name,
      status: "processing",
      compliance: {
        optOutRequired: true,
        frequencyCapHours: WHATSAPP_BULK_MIN_INTERVAL_HOURS,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const channelCache = new Map<string, Awaited<ReturnType<typeof getWhatsAppChannelForTenant>>>();
    const results: LeadResult[] = [];

    for (const leadId of leadIds) {
      try {
        const leadRef = adminDb.collection("leads").doc(leadId);
        const leadSnap = await leadRef.get();

        if (!leadSnap.exists) {
          results.push({ leadId, status: "skipped", reason: "Lead nao encontrado." });
          continue;
        }

        const lead = leadSnap.data() as LeadDoc;
        const ownerId = lead.ownerId || user.uid;

        if (!isAdmin(user) && ownerId !== user.uid) {
          results.push({ leadId, status: "skipped", reason: "Lead pertence a outro usuario." });
          continue;
        }

        const phone = normalizePhone(lead.telefone);
        if (!phone) {
          results.push({ leadId, status: "skipped", reason: "Lead sem telefone valido." });
          continue;
        }

        const compliance = evaluateWhatsAppBulkCompliance(lead);
        if (!compliance.allowed) {
          results.push({ leadId, phone, status: "skipped", reason: compliance.reason });
          continue;
        }

        const renderedBodyParams = bodyParamTemplates.map((param) => renderTemplate(param, lead)).filter(Boolean);
        const messageText =
          mode === "template"
            ? buildTemplateDisplayText({
                templateName,
                languageCode,
                bodyParams: renderedBodyParams,
                headerMedia,
              })
            : renderTemplate(text, lead);
        if (!messageText) {
          results.push({ leadId, status: "skipped", reason: "Mensagem vazia apos preencher variaveis." });
          continue;
        }

        const tenantId =
          lead.tenantId ||
          (body.tenantId || "").trim() ||
          (await getTenantForCurrentUser(ownerId || user.uid)) ||
          null;

        const chat = await resolveChat({
          phone,
          contactName: lead.nome || phone,
          ownerId,
          tenantId,
          userName: user.name,
          leadId,
          campaignName,
        });

        const channelTenantId = chat.tenantId || tenantId || AGENCY_TENANT_ID;
        let channel = channelCache.get(channelTenantId);
        if (!channelCache.has(channelTenantId)) {
          channel = await getWhatsAppChannelForTenant(channelTenantId, {
            allowAgencyFallback: channelTenantId === AGENCY_TENANT_ID,
          });
          channelCache.set(channelTenantId, channel);
        }

        if (!channel) {
          results.push({
            leadId,
            phone,
            chatId: chat.chatId,
            status: "failed",
            reason: `Canal WhatsApp ativo nao encontrado para tenant ${channelTenantId}.`,
          });
          continue;
        }

        if (!body.dryRun) {
          const payload =
            mode === "template"
              ? await sendMetaTemplateMessage({
                  channel,
                  to: phone,
                  templateName,
                  languageCode,
                  bodyParams: renderedBodyParams,
                  headerMedia,
                })
              : await sendMetaTextMessage({
                  channel,
                  to: phone,
                  text: messageText,
                });
          const metaMessageId = payload?.messages?.[0]?.id || null;
          const deliveryRef = adminDb.collection("outbound_campaign_deliveries").doc();
          const campaignContext = {
            campaignId: batchRef.id,
            campaignName,
            runId: batchRef.id,
            deliveryId: deliveryRef.id,
            sourceType: "admin_bulk_whatsapp",
            channel: "whatsapp",
            leadId,
            chatId: chat.chatId,
            phone,
            intendedText: mode === "text" ? messageText : text,
            persistedText: messageText,
            outboundType: mode,
            templateName: mode === "template" ? templateName : null,
            templateLanguage: mode === "template" ? languageCode : null,
            templateParams: mode === "template" ? renderedBodyParams : [],
            templateHeaderMedia: mode === "template" && headerMedia ? headerMedia : null,
            metaMessageId,
            status: "sent",
            compliance: {
              optOutChecked: true,
              frequencyCapHours: WHATSAPP_BULK_MIN_INTERVAL_HOURS,
            },
            sentAt: FieldValue.serverTimestamp(),
            sentBy: user.uid,
            sentByName: user.name,
          };

          await Promise.all([
            chat.chatRef.update({
              ownerId: chat.ownerId,
              ownerName: user.name,
              tenantId: chat.tenantId || channel.tenantId,
              leadId,
              sourceType: "admin_bulk_whatsapp",
              sourceLabel: "Prospeccao ativa",
              campaignName,
              channelPhoneNumberId: channel.phoneNumberId,
              lastMessage: messageText,
              lastMessageTime: FieldValue.serverTimestamp(),
              lastOutboundCampaignContext: campaignContext,
              lastOutboundCampaignId: batchRef.id,
              lastOutboundCampaignName: campaignName,
              lastOutboundCampaignAt: FieldValue.serverTimestamp(),
              aiCampaignFollowupMode: true,
              status: "open",
              updatedAt: FieldValue.serverTimestamp(),
            }),
            adminDb.collection("messages").add({
              chatId: chat.chatId,
              text: messageText,
              sender: "agent",
              senderId: user.uid,
              senderName: user.name,
              type: mode === "template" ? "template" : "text",
              status: "sent",
              deliveryStatus: "sent",
              tenantId: chat.tenantId || channel.tenantId,
              channelPhoneNumberId: channel.phoneNumberId,
              ...(metaMessageId ? { metaMessageId } : {}),
              ...(mode === "template"
                ? {
                    templateName,
                    templateLanguage: languageCode,
                    templateParams: renderedBodyParams,
                    ...(headerMedia ? { templateHeaderMedia: headerMedia } : {}),
                  }
                : {}),
              bulkBatchId: batchRef.id,
              leadId,
              createdAt: FieldValue.serverTimestamp(),
            }),
            deliveryRef.set({
              tenantId: chat.tenantId || channel.tenantId,
              ...campaignContext,
              bulkBatchId: batchRef.id,
              leadName: lead.nome || "Lead",
              leadSource: lead.origem || "",
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            }),
            leadRef.set(
              {
                status: "contatado",
                sourceType: "admin_bulk_whatsapp",
                sourceLabel: "Prospeccao ativa",
                campaignName,
                utmCampaign: campaignName,
                lastOutboundCampaign: {
                  name: campaignName,
                  sourceType: "admin_bulk_whatsapp",
                  bulkBatchId: batchRef.id,
                  sentAt: FieldValue.serverTimestamp(),
                },
                lastOutboundCampaignContext: campaignContext,
                lastOutboundCampaignId: batchRef.id,
                lastOutboundCampaignName: campaignName,
                lastOutboundCampaignAt: FieldValue.serverTimestamp(),
                lastContactAt: FieldValue.serverTimestamp(),
                lastBulkContactAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            ),
            leadRef.collection("events").add({
              type: "whatsapp_bulk_send",
              title: "Mensagem em massa enviada",
              message: messageText.slice(0, 600),
              chatId: chat.chatId,
              bulkBatchId: batchRef.id,
              userId: user.uid,
              userName: user.name,
              tenantId: chat.tenantId || channel.tenantId,
              createdAt: FieldValue.serverTimestamp(),
            }),
          ]);
        }

        results.push({
          leadId,
          phone,
          chatId: chat.chatId,
          status: body.dryRun ? "skipped" : "sent",
          reason: body.dryRun ? "Simulacao concluida." : undefined,
        });
      } catch (error) {
        console.error("Falha no envio em massa para lead:", leadId, error);
        results.push({
          leadId,
          status: "failed",
          reason: error instanceof Error ? error.message : "Falha no envio.",
        });
      }
    }

    const sent = results.filter((item) => item.status === "sent").length;
    const skipped = results.filter((item) => item.status === "skipped").length;
    const failed = results.filter((item) => item.status === "failed").length;

    await batchRef.update({
      status: failed > 0 ? "finished_with_errors" : "finished",
      sent,
      skipped,
      failed,
      results,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      batchId: batchRef.id,
      sent,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro interno no envio em massa WhatsApp:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno no envio em massa WhatsApp." },
      { status: 500 }
    );
  }
}
