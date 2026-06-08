import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

const ALLOWED_REACTIONS = new Set([
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F62E}",
  "\u{1F622}",
  "\u{1F64F}",
]);

type Body = {
  emoji?: string;
};

function normalizeReactionUsers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string; messageId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId, messageId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");

    const body = (await req.json()) as Body;
    const emoji = String(body.emoji || "").trim();
    if (!ALLOWED_REACTIONS.has(emoji)) {
      return NextResponse.json({ error: "Reacao invalida." }, { status: 400 });
    }

    const chatSnap = await adminDb.collection("chats").doc(chatId).get();
    const chat = chatSnap.data() as { tenantId?: string } | undefined;
    if (!chatSnap.exists || chat?.tenantId !== tenantId) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const messageRef = adminDb.collection("messages").doc(messageId);
    const messageSnap = await messageRef.get();
    const message = messageSnap.data() as { chatId?: string; tenantId?: string; reactions?: Record<string, unknown> } | undefined;
    if (!messageSnap.exists || message?.chatId !== chatId || message?.tenantId !== tenantId) {
      return NextResponse.json({ error: "Mensagem nao encontrada." }, { status: 404 });
    }

    const currentUsers = normalizeReactionUsers(message?.reactions?.[emoji]);
    const alreadyReacted = currentUsers.includes(user.uid);
    await messageRef.update(
      new FieldPath("reactions", emoji),
      alreadyReacted ? FieldValue.arrayRemove(user.uid) : FieldValue.arrayUnion(user.uid),
      "updatedAt",
      FieldValue.serverTimestamp()
    );

    return NextResponse.json({
      ok: true,
      action: alreadyReacted ? "removed" : "added",
      emoji,
      messageId,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao reagir a mensagem do tenant:", error);
    return NextResponse.json({ error: "Falha ao reagir a mensagem." }, { status: 500 });
  }
}
