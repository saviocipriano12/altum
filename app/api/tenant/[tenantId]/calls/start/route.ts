import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { normalizePhone } from "@/app/lib/server/phone";
import { callWhatsAppGateway, getWhatsAppChannelForTenant } from "@/app/lib/server/whatsapp-channel";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = {
  leadId?: string;
  chatId?: string;
  phone?: string;
  channelId?: string;
  title?: string;
};

function clean(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function buildTelUrl(phone: string) {
  return phone ? `tel:+${phone}` : "";
}

function buildWhatsAppUrl(phone: string) {
  return phone ? `https://wa.me/${phone}` : "";
}

async function resolveCallContext(tenantId: string, body: Body) {
  const chatId = clean(body.chatId, 180);
  const leadId = clean(body.leadId, 180);
  const directPhone = normalizePhone(clean(body.phone, 80));
  let phone = directPhone;
  let resolvedLeadId = leadId;
  const resolvedChatId = chatId;
  let contactName = "";
  let channelId = clean(body.channelId, 180);
  let channelPhoneNumberId = "";

  if (chatId) {
    const chatSnap = await adminDb.collection("chats").doc(chatId).get();
    if (!chatSnap.exists) throw new RouteAuthError(404, "chat_not_found", "Conversa nao encontrada.");
    const chat = chatSnap.data() as Record<string, unknown>;
    if (clean(chat.tenantId, 180) !== tenantId) {
      throw new RouteAuthError(403, "forbidden_tenant", "Conversa fora do tenant informado.");
    }
    phone = phone || normalizePhone(clean(chat.contactPhone, 80));
    contactName = clean(chat.contactName, 180);
    resolvedLeadId = resolvedLeadId || clean(chat.leadId, 180);
    channelId = channelId || clean(chat.channelId, 180);
    channelPhoneNumberId = clean(chat.channelPhoneNumberId, 180);
  }

  if (resolvedLeadId) {
    const leadSnap = await adminDb.collection("leads").doc(resolvedLeadId).get();
    if (!leadSnap.exists) throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
    const lead = leadSnap.data() as Record<string, unknown>;
    if (clean(lead.tenantId, 180) !== tenantId) {
      throw new RouteAuthError(403, "forbidden_tenant", "Lead fora do tenant informado.");
    }
    phone = phone || normalizePhone(clean(lead.telefone, 80));
    contactName = contactName || clean(lead.nome, 180);
  }

  if (!phone) {
    throw new RouteAuthError(400, "phone_missing", "Telefone valido nao encontrado para ligar.");
  }

  return {
    phone,
    telUrl: buildTelUrl(phone),
    whatsappUrl: buildWhatsAppUrl(phone),
    leadId: resolvedLeadId,
    chatId: resolvedChatId,
    contactName: contactName || phone,
    channelId,
    channelPhoneNumberId,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "calls");
    if (!hasTenantCapability(membership, "respond_inbox") && !hasTenantCapability(membership, "edit_leads")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem permissao para iniciar ligacoes.");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const contextData = await resolveCallContext(tenantId, body);
    const title = clean(body.title, 180) || `Ligar para ${contextData.contactName}`;
    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: false,
      channelId: contextData.channelId || null,
      phoneNumberId: contextData.channelPhoneNumberId || null,
    });

    let gatewayResult: Record<string, unknown> | null = null;
    let mode: "gateway" | "tel" = "tel";
    // wa.me abre uma conversa e nao inicia uma chamada. Sem um gateway de
    // Calling API configurado, use a telefonia do dispositivo com clareza.
    let callUrl = contextData.telUrl;
    let callStatus = "ready_to_call";

    if (channel?.callEndpoint) {
      gatewayResult = await callWhatsAppGateway({
        channel,
        endpoint: channel.callEndpoint,
        payload: {
          action: "start_call",
          to: contextData.phone,
          leadId: contextData.leadId || null,
          chatId: contextData.chatId || null,
          contactName: contextData.contactName,
        },
      });
      mode = "gateway";
      callUrl = clean(gatewayResult.callUrl, 1200) || clean(gatewayResult.url, 1200) || callUrl;
      callStatus = clean(gatewayResult.status, 80) || "requested";
    }

    const dueAt = new Date(Date.now() + 30 * 60 * 1000);
    const writes: Promise<unknown>[] = [
      adminDb.collection("call_logs").add({
        tenantId,
        leadId: contextData.leadId || null,
        chatId: contextData.chatId || null,
        phone: contextData.phone,
        contactName: contextData.contactName,
        channelId: channel?.id || contextData.channelId || null,
        provider: channel?.provider || "device_tel",
        mode,
        status: callStatus,
        callUrl,
        gatewayResult: gatewayResult || null,
        startedBy: user.uid,
        startedByName: user.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    ];

    if (contextData.leadId) {
      writes.push(
        adminDb.collection("lead_tasks").add({
          tenantId,
          leadId: contextData.leadId,
          title,
          type: "ligacao",
          priority: "high",
          dueAt,
          status: "pending",
          source: "call_start",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          createdByName: user.name,
        }),
        adminDb.collection("leads").doc(contextData.leadId).collection("events").add({
          type: "call_started",
          title: "Ligacao iniciada",
          detail: mode === "gateway" ? "Ligacao solicitada pelo gateway." : "Ligacao iniciada pelo dispositivo.",
          actorId: user.uid,
          actorName: user.name,
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }

    await Promise.all(writes);

    return NextResponse.json({
      ok: true,
      tenantId,
      mode,
      status: callStatus,
      phone: contextData.phone,
      callUrl,
      telUrl: contextData.telUrl,
      whatsappUrl: contextData.whatsappUrl,
      gatewayResult,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao iniciar ligacao:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao iniciar ligacao." },
      { status: 500 }
    );
  }
}
