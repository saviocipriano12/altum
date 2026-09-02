import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireFirebaseUser,
  SelfServiceAuthError,
} from "@/lib/server/self-service-auth";

export async function POST(req: Request) {
  try {
    const actor = await requireFirebaseUser(req);
    if (!actor.email_verified) {
      return NextResponse.json(
        { error: "O e-mail ainda nao foi confirmado.", code: "email_not_verified" },
        { status: 409 }
      );
    }

    await Promise.all([
      adminDb.collection("users").doc(actor.uid).set({
        emailVerified: true,
        emailVerifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "self_service_email_verified",
        actorId: actor.uid,
        actorEmail: actor.email || null,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SelfServiceAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Falha ao sincronizar verificacao de e-mail:", error);
    return NextResponse.json({ error: "Nao foi possivel confirmar o e-mail agora." }, { status: 500 });
  }
}
