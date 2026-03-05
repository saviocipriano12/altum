import crypto from "crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, UserRole } from "@/app/lib/server/route-auth";

type InviteBody = {
  email?: string;
  name?: string;
  role?: UserRole;
  commissionRate?: number;
  asaasWalletId?: string;
};

function normalizeRole(role?: string): UserRole {
  if (
    role === "admin" ||
    role === "closer" ||
    role === "sdr" ||
    role === "agency_owner" ||
    role === "agency_admin" ||
    role === "agency_agent"
  ) {
    return role;
  }
  return "agency_agent";
}

function randomPassword() {
  return crypto.randomBytes(16).toString("base64url");
}

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as InviteBody;

    const email = (body.email || "").trim().toLowerCase();
    const name = (body.name || "").trim();
    const role = normalizeRole(body.role);
    const commissionRate = Number(body.commissionRate || 0);
    const asaasWalletId = (body.asaasWalletId || "").trim() || null;

    if (!email || !name) {
      return NextResponse.json(
        { error: "Campos obrigatorios: email e name." },
        { status: 400 }
      );
    }

    let uid: string;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
      if (!existing.displayName || existing.displayName !== name) {
        await adminAuth.updateUser(uid, { displayName: name });
      }
    } catch {
      const created = await adminAuth.createUser({
        email,
        displayName: name,
        password: randomPassword(),
        disabled: false,
      });
      uid = created.uid;
    }

    await adminDb.collection("users").doc(uid).set(
      {
        uid,
        email,
        name,
        role,
        status: "active",
        commissionRate,
        asaasWalletId,
        invitedBy: actor.uid,
        invitedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const actionCodeSettings = {
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/login`,
    };
    const inviteLink = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);

    await adminDb.collection("audit_logs").add({
      type: "user_invite",
      actorId: actor.uid,
      actorName: actor.name,
      targetUid: uid,
      targetEmail: email,
      role,
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

    console.error("Erro ao convidar usuario:", error);
    return NextResponse.json(
      { error: "Falha ao convidar usuario." },
      { status: 500 }
    );
  }
}

