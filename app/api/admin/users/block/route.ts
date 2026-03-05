import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type BlockBody = {
  uid?: string;
  reason?: string;
};

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as BlockBody;
    const uid = (body.uid || "").trim();

    if (!uid) {
      return NextResponse.json({ error: "Campo obrigatorio: uid." }, { status: 400 });
    }

    await adminDb.collection("users").doc(uid).set(
      {
        status: "blocked",
        blockedReason: body.reason || null,
        blockedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await adminAuth.updateUser(uid, { disabled: true });
    } catch (error) {
      console.warn("Nao foi possivel desabilitar o usuario no Auth:", error);
    }

    await adminDb.collection("audit_logs").add({
      type: "user_block",
      actorId: actor.uid,
      actorName: actor.name,
      targetUid: uid,
      reason: body.reason || null,
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

    console.error("Erro ao bloquear usuario:", error);
    return NextResponse.json({ error: "Falha ao bloquear usuario." }, { status: 500 });
  }
}

