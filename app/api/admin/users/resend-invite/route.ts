import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type ResendInviteBody = {
  uid?: string;
};

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as ResendInviteBody;
    const uid = (body.uid || "").trim();

    if (!uid) {
      return NextResponse.json({ error: "Campo obrigatorio: uid." }, { status: 400 });
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    const userData = userSnap.data() as { email?: string; name?: string };
    const email = (userData.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Usuario sem email cadastrado." }, { status: 400 });
    }

    // Ensure user exists in Auth.
    try {
      await adminAuth.getUser(uid);
    } catch {
      await adminAuth.createUser({
        uid,
        email,
        displayName: userData.name || "Colaborador",
      });
    }

    const actionCodeSettings = {
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/login`,
    };
    const inviteLink = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);

    await adminDb.collection("audit_logs").add({
      type: "user_invite_resend",
      actorId: actor.uid,
      actorName: actor.name,
      targetUid: uid,
      targetEmail: email,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      uid,
      inviteSentAt: new Date().toISOString(),
      inviteLink,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro ao reenviar convite:", error);
    return NextResponse.json(
      { error: "Falha ao reenviar convite." },
      { status: 500 }
    );
  }
}

