import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  text?: string;
};

function cleanString(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function assertChatInTenant(chatId: string, tenantId: string) {
  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new RouteAuthError(404, "chat_not_found", "Chat nao encontrado.");
  }

  const chat = chatSnap.data() as { tenantId?: string; leadId?: string };
  if ((chat.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Chat fora do tenant informado.");
  }

  return { chatRef, chat };
}

function toSeconds(value: unknown) {
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return Math.floor((value as { toDate: () => Date }).toDate().getTime() / 1000);
  }
  return 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    await assertChatInTenant(chatId, tenantId);

    const snap = await adminDb
      .collection("chat_notes")
      .where("tenantId", "==", tenantId)
      .where("chatId", "==", chatId)
      .limit(100)
      .get();

    const items = snap.docs
      .map(
        (doc): Record<string, unknown> & { id: string; createdAt?: unknown } => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        })
      )
      .sort((a, b) => toSeconds(b.createdAt) - toSeconds(a.createdAt));

    return NextResponse.json({ ok: true, tenantId, chatId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar notas internas do chat:", error);
    return NextResponse.json({ error: "Falha ao listar notas internas." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");

    const { chat } = await assertChatInTenant(chatId, tenantId);
    const body = (await req.json()) as Body;
    const text = cleanString(body.text, 1200);

    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    const writes: Promise<unknown>[] = [
      adminDb.collection("chat_notes").add({
        tenantId,
        chatId,
        text,
        authorId: user.uid,
        authorName: user.name,
        visibility: "internal",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    ];

    if (chat.leadId) {
      writes.push(
        adminDb
          .collection("leads")
          .doc(chat.leadId)
          .collection("events")
          .add({
            type: "internal_note",
            title: "Nota interna adicionada",
            detail: text.slice(0, 240),
            actorId: user.uid,
            actorName: user.name,
            chatId,
            createdAt: FieldValue.serverTimestamp(),
          })
      );
    }

    await Promise.all(writes);

    return NextResponse.json({ ok: true, tenantId, chatId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar nota interna do chat:", error);
    return NextResponse.json({ error: "Falha ao criar nota interna." }, { status: 500 });
  }
}
