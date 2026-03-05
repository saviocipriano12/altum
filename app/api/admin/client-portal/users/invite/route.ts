import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  clientId?: string;
  email?: string;
  name?: string;
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 120);
    const email = clean(body.email, 180).toLowerCase();
    const name = clean(body.name, 120);
    if (!clientId || !email) {
      return NextResponse.json(
        { error: "Campos obrigatorios: clientId e email." },
        { status: 400 }
      );
    }

    const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }
    const clientData = clientSnap.data() as { name?: string };
    const clientName = clientData.name || "Cliente";

    let authUser;
    try {
      authUser = await adminAuth.getUserByEmail(email);
    } catch {
      authUser = await adminAuth.createUser({
        email,
        displayName: name || clientName,
        emailVerified: true,
      });
    }

    const uid = authUser.uid;
    await Promise.all([
      adminDb.collection("users").doc(uid).set(
        {
          uid,
          email,
          name: name || authUser.displayName || clientName,
          role: "client",
          status: "active",
          commissionRate: 0,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("client_portal_users").doc(uid).set(
        {
          uid,
          email,
          name: name || authUser.displayName || clientName,
          clientId,
          clientName,
          status: "active",
          invitedBy: user.uid,
          invitedByName: user.name,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("audit_logs").add({
        type: "client_portal_user_invited",
        actorId: user.uid,
        actorName: user.name,
        clientId,
        clientName,
        portalUid: uid,
        portalEmail: email,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const inviteLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${siteUrl}/cliente/login`,
    });

    return NextResponse.json({
      ok: true,
      uid,
      email,
      clientId,
      inviteLink,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao convidar usuario do portal:", error);
    return NextResponse.json({ error: "Falha ao convidar usuario do portal." }, { status: 500 });
  }
}
