import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type UnblockBody = {
  uid?: string;
};

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as UnblockBody;
    const uid = (body.uid || "").trim();

    if (!uid) {
      return NextResponse.json({ error: "Campo obrigatorio: uid." }, { status: 400 });
    }

    await adminDb.collection("users").doc(uid).set(
      {
        status: "active",
        blockedReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await adminAuth.updateUser(uid, { disabled: false });
    } catch (error) {
      console.warn("Nao foi possivel habilitar o usuario no Auth:", error);
    }

    await adminDb.collection("audit_logs").add({
      type: "user_unblock",
      actorId: actor.uid,
      actorName: actor.name,
      targetUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, uid });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro ao desbloquear usuario:", error);
    return NextResponse.json({ error: "Falha ao desbloquear usuario." }, { status: 500 });
  }
}

