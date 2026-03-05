import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, UserRole } from "@/app/lib/server/route-auth";

type UpdateBody = {
  uid?: string;
  name?: string;
  role?: UserRole;
  commissionRate?: number;
  asaasWalletId?: string | null;
};

function normalizeRole(role: unknown): UserRole {
  if (role === "admin" || role === "closer" || role === "sdr") return role;
  return "sdr";
}

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as UpdateBody;

    const uid = (body.uid || "").trim();
    const name = (body.name || "").trim();
    const role = normalizeRole(body.role);
    const commissionRate = Number(body.commissionRate || 0);
    const asaasWalletId = (body.asaasWalletId || "").trim() || null;

    if (!uid || !name) {
      return NextResponse.json(
        { error: "Campos obrigatorios: uid e name." },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    await userRef.set(
      {
        name,
        role,
        commissionRate,
        asaasWalletId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await adminAuth.updateUser(uid, { displayName: name });
    } catch (error) {
      console.warn("Nao foi possivel atualizar displayName no Auth:", error);
    }

    await adminDb.collection("audit_logs").add({
      type: "user_update",
      actorId: actor.uid,
      actorName: actor.name,
      targetUid: uid,
      changes: {
        name,
        role,
        commissionRate,
        asaasWalletId,
      },
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

    console.error("Erro ao atualizar usuario:", error);
    return NextResponse.json(
      { error: "Falha ao atualizar usuario." },
      { status: 500 }
    );
  }
}

