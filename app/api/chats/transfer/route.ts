import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type TransferBody = {
  chatId?: string;
  toUid?: string;
  reason?: string;
};

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as TransferBody;

    const chatId = (body.chatId || "").trim();
    const toUid = (body.toUid || "").trim();
    const reason = (body.reason || "").trim();

    if (!chatId || !toUid || !reason) {
      return NextResponse.json(
        { error: "Campos obrigatorios: chatId, toUid e reason." },
        { status: 400 }
      );
    }

    const chatRef = adminDb.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const toUserSnap = await adminDb.collection("users").doc(toUid).get();
    if (!toUserSnap.exists) {
      return NextResponse.json({ error: "Usuario destino nao encontrado." }, { status: 404 });
    }

    const toUser = toUserSnap.data() as { name?: string; status?: string };
    if (toUser.status === "blocked") {
      return NextResponse.json(
        { error: "Nao e permitido transferir para usuario bloqueado." },
        { status: 400 }
      );
    }

    const fromData = chatSnap.data() as { ownerId?: string; ownerName?: string; tenantId?: string };
    await chatRef.set(
      {
        ownerId: toUid,
        ownerName: toUser.name || "Time",
        tenantId: fromData.tenantId || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await adminDb.collection("audit_logs").add({
      type: "chat_transfer",
      actorId: actor.uid,
      actorName: actor.name,
      chatId,
      fromUid: fromData.ownerId || null,
      toUid,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("messages").add({
      chatId,
      sender: "system",
      text: `Transferencia de atendimento para ${toUser.name || "time"}: ${reason}`,
      type: "text",
      createdAt: FieldValue.serverTimestamp(),
      ownerId: toUid,
      tenantId: fromData.tenantId || null,
    });

    return NextResponse.json({ ok: true, chatId, toUid });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro ao transferir chat:", error);
    return NextResponse.json(
      { error: "Falha ao transferir chat." },
      { status: 500 }
    );
  }
}

