import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError, type RequestUser } from "@/app/lib/server/route-auth";

function toSerializable(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (Array.isArray(value)) return value.map(toSerializable);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toSerializable(item)]));
}

async function assertChatAccess(chatId: string, actor: RequestUser) {
  const chatSnap = await adminDb.collection("chats").doc(chatId).get();
  if (!chatSnap.exists) return { error: "Chat nao encontrado.", status: 404 } as const;
  if (!isAdmin(actor) && chatSnap.get("ownerId") !== actor.uid) {
    return { error: "Sem permissao para acessar esta conversa.", status: 403 } as const;
  }
  return { chat: chatSnap.data() as Record<string, unknown> } as const;
}

export async function GET(req: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });
    const { chatId } = await context.params;
    const cleanChatId = String(chatId || "").trim();
    if (!cleanChatId) return NextResponse.json({ error: "Chat invalido." }, { status: 400 });

    const access = await assertChatAccess(cleanChatId, actor);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const chat = access.chat;
    const leadId = typeof chat.leadId === "string" ? chat.leadId.trim() : "";
    const contactPhone = typeof chat.contactPhone === "string" ? chat.contactPhone.replace(/\D/g, "") : "";
    const tenantId = typeof chat.tenantId === "string" ? chat.tenantId.trim() : "";

    const [leadSnap, presenceSnap, auditSnap, contactsSnap] = await Promise.all([
      leadId ? adminDb.collection("leads").doc(leadId).get() : Promise.resolve(null),
      contactPhone ? adminDb.collection("presence").doc(contactPhone).get() : Promise.resolve(null),
      adminDb.collection("audit_events").where("chatId", "==", cleanChatId).limit(60).get(),
      contactPhone ? adminDb.collection("contacts").where("phone", "==", contactPhone).limit(20).get() : Promise.resolve(null),
    ]);

    const contactDoc = contactsSnap?.docs.find((doc) => !tenantId || doc.get("tenantId") === tenantId) || null;
    const auditLog: Array<Record<string, unknown> & { id: string; createdAt?: unknown }> = auditSnap.docs
      .map((doc): Record<string, unknown> & { id: string; createdAt?: unknown } => ({ id: doc.id, ...(toSerializable(doc.data()) as Record<string, unknown>) }))
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
      .slice(0, 30);

    return NextResponse.json({
      ok: true,
      lead: leadSnap?.exists ? { id: leadSnap.id, ...(toSerializable(leadSnap.data()) as Record<string, unknown>) } : null,
      contact: contactDoc ? { id: contactDoc.id, ...(toSerializable(contactDoc.data()) as Record<string, unknown>) } : null,
      presence: presenceSnap?.exists ? toSerializable(presenceSnap.data()) : null,
      auditLog,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao carregar contexto administrativo do chat:", error);
    return NextResponse.json({ error: "Falha ao carregar contexto da conversa." }, { status: 500 });
  }
}
