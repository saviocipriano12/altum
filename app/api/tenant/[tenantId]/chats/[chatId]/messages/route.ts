import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
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

    const chatRef = adminDb.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const chat = chatSnap.data() as { tenantId?: string };
    if ((chat.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Chat fora do tenant informado." }, { status: 403 });
    }

    const messagesSnap = await adminDb
      .collection("messages")
      .where("chatId", "==", chatId)
      .limit(500)
      .get();

    const items = messagesSnap.docs
      .map(
        (doc): Record<string, unknown> & { id: string; createdAt?: unknown } => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        })
      )
      .sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));

    return NextResponse.json({ ok: true, tenantId, chatId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar mensagens do chat:", error);
    return NextResponse.json({ error: "Falha ao listar mensagens." }, { status: 500 });
  }
}
