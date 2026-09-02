import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  action?: "reaction" | "pin" | "star" | "delete_message" | "status" | "priority";
  messageId?: string;
  emoji?: string;
  value?: boolean | string;
};

const STATUS = new Set(["open", "pending", "snoozed", "resolved", "spam"]);
const PRIORITY = new Set(["low", "normal", "high", "urgent"]);

export async function POST(req: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });
    const { chatId } = await context.params;
    const cleanChatId = String(chatId || "").trim();
    const body = (await req.json()) as Body;
    if (!cleanChatId || !body.action) return NextResponse.json({ error: "Acao invalida." }, { status: 400 });

    const chatRef = adminDb.collection("chats").doc(cleanChatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    if (!isAdmin(actor) && chatSnap.get("ownerId") !== actor.uid) {
      return NextResponse.json({ error: "Sem permissao para alterar esta conversa." }, { status: 403 });
    }

    if (body.action === "status") {
      const status = String(body.value || "");
      if (!STATUS.has(status)) return NextResponse.json({ error: "Status invalido." }, { status: 400 });
      await chatRef.set({ status, ...(status === "resolved" ? { resolvedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "priority") {
      const priority = String(body.value || "");
      if (!PRIORITY.has(priority)) return NextResponse.json({ error: "Prioridade invalida." }, { status: 400 });
      await chatRef.set({ priority, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    const messageId = String(body.messageId || "").trim();
    if (!messageId) return NextResponse.json({ error: "Mensagem invalida." }, { status: 400 });
    const messageRef = adminDb.collection("messages").doc(messageId);
    const messageSnap = await messageRef.get();
    if (!messageSnap.exists || messageSnap.get("chatId") !== cleanChatId) {
      return NextResponse.json({ error: "Mensagem nao encontrada nesta conversa." }, { status: 404 });
    }

    if (body.action === "reaction") {
      const emoji = String(body.emoji || "").trim().slice(0, 20);
      if (!emoji) return NextResponse.json({ error: "Reacao invalida." }, { status: 400 });
      const raw = messageSnap.get(`reactions.${emoji}`);
      const users = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
      await messageRef.update({ [`reactions.${emoji}`]: users.includes(actor.uid) ? FieldValue.arrayRemove(actor.uid) : FieldValue.arrayUnion(actor.uid) });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "pin" || body.action === "star") {
      await messageRef.update({ [body.action === "pin" ? "pinned" : "starred"]: body.value === true });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "delete_message") {
      await messageRef.update({ deleted: true, deletedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acao nao suportada." }, { status: 400 });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erro ao executar acao administrativa no chat:", error);
    return NextResponse.json({ error: "Falha ao atualizar conversa." }, { status: 500 });
  }
}
