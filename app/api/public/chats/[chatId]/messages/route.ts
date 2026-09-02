import { after, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { enqueueIncomingMessageJob, kickAiQueueNow, processAiJobNow, triggerAiQueueWorker } from "@/lib/server/ai/queue";
import { runLeadAutomations } from "@/lib/server/automations";
import { buildIncomingChatOperationalPatch, resolveFirstResponseSlaMinutes } from "@/lib/server/chat-operations";
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";

type Body = {
  token?: string;
  text?: string;
};

function clean(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function getChat(chatId: string, token: string) {
  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) return null;

  const data = chatSnap.data() as Record<string, unknown>;
  if (String(data.publicAccessToken || "") !== token.trim()) return null;

  return { chatRef, data };
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

export async function GET(
  req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await context.params;
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!token.trim()) {
      return NextResponse.json({ error: "Token obrigatorio." }, { status: 400 });
    }

    const chat = await getChat(chatId, token);
    if (!chat) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const messagesSnap = await adminDb
      .collection("messages")
      .where("chatId", "==", chatId)
      .limit(120)
      .get();

    const items = messagesSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          sender: String(data.sender || "system"),
          text: String(data.text || ""),
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    return NextResponse.json({ ok: true, chatId, items });
  } catch (error) {
    console.error("Erro ao listar mensagens publicas:", error);
    return NextResponse.json({ error: "Falha ao carregar mensagens." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await context.params;
    const body = (await req.json()) as Body;
    const token = clean(body.token, 240);
    const text = clean(body.text, 4000);

    await assertPublicRateLimit(req, { scope: "public_chat_message", subject: `${chatId}:${token}`, limit: 30, windowMs: 10 * 60 * 1000 });

    if (!token) {
      return NextResponse.json({ error: "Token obrigatorio." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    const chat = await getChat(chatId, token);
    if (!chat) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }
    const tenantId = String(chat.data.tenantId || "");
    const tenantSettings = await getTenantSettings(tenantId);
    const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
    let assignedUserId = String(chat.data.assignedTo || chat.data.ownerId || "") || null;
    let assignedUserName = String(chat.data.assignedUserName || chat.data.ownerName || "") || null;

    if (!assignedUserId) {
      const inboundAssignee = await resolveInboundAssignment(tenantId, { channel: "site_chat" });
      assignedUserId = inboundAssignee?.userId || null;
      assignedUserName = inboundAssignee?.name || null;
    }

    const messageRef = adminDb.collection("messages").doc();

    const writes: Promise<unknown>[] = [
      messageRef.set({
        chatId,
        tenantId,
        leadId: String(chat.data.leadId || ""),
        sender: "client",
        text,
        type: "text",
        status: "received",
        channel: "site_chat",
        createdAt: FieldValue.serverTimestamp(),
      }),
      chat.chatRef.set(
        {
          lastMessage: text,
          lastMessageTime: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ownerId: assignedUserId,
          ownerName: assignedUserName,
          assignedUserName,
          ...buildIncomingChatOperationalPatch({
            status: "open",
            assignedTo: assignedUserId,
            slaMinutes,
          }),
        },
        { merge: true }
      ),
    ];

    const leadId = String(chat.data.leadId || "");
    if (leadId && assignedUserId) {
      writes.push(
        adminDb.collection("leads").doc(leadId).set(
          {
            ownerId: assignedUserId,
            owner: assignedUserName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      );
    }

    await Promise.all(writes);

    if (leadId) {
      await runLeadAutomations({
        tenantId,
        trigger: "message_received",
        leadId,
        chatId,
        channel: "site_chat",
        messageText: text,
        actorId: "site_chat_widget",
        actorName: "Site Chat Widget",
      });
    }

    const queue = await enqueueIncomingMessageJob({
      tenantId,
      chatId,
      messageId: messageRef.id,
      source: "site_chat_widget",
      dedupeKey: `${tenantId}_${messageRef.id}`,
    });
    await processAiJobNow(queue.jobId);
    await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
    triggerAiQueueWorker({ limit: 8, drain: true });
    after(async () => {
      await processAiJobNow(queue.jobId);
      await kickAiQueueNow({ limit: 8, drain: true, maxBatches: 6, timeoutMs: 18000 });
      triggerAiQueueWorker({ limit: 8, drain: true });
    });

    return NextResponse.json({ ok: true, chatId });
  } catch (error) {
    if (error instanceof PublicRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    console.error("Erro ao criar mensagem publica:", error);
    return NextResponse.json({ error: "Falha ao enviar mensagem." }, { status: 500 });
  }
}

