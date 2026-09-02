import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  sendManualContractReminderByClientId,
  setTenantBillingAccessByAdmin,
} from "@/lib/server/contract-billing";

type Body = {
  clientId?: string;
  tenantId?: string;
  action?: "release_access" | "block_access" | "send_reminder" | string;
  note?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function resolveTenantId(clientId: string, tenantId?: string) {
  const explicit = clean(tenantId, 140);
  if (explicit) return explicit;

  const directTenant = await adminDb.collection("tenants").doc(clientId).get();
  if (directTenant.exists) return directTenant.id;

  const tenantSnap = await adminDb
    .collection("tenants")
    .where("legacyClientId", "==", clientId)
    .limit(1)
    .get();

  return tenantSnap.empty ? "" : tenantSnap.docs[0].id;
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 140);
    const action = clean(body.action, 80).toLowerCase();
    const note = clean(body.note, 1200) || null;

    if (!clientId) {
      return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    }

    if (action !== "release_access" && action !== "block_access" && action !== "send_reminder") {
      return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    }

    if (action === "send_reminder") {
      const reminder = await sendManualContractReminderByClientId({
        clientId,
        tenantId: clean(body.tenantId, 140) || null,
        actorId: user.uid,
        actorName: user.name,
      });

      return NextResponse.json({
        ok: true,
        action,
        ...reminder,
      });
    }

    const tenantId = await resolveTenantId(clientId, body.tenantId);
    if (!tenantId) {
      return NextResponse.json(
        { error: "Tenant nao encontrado para controlar acesso da plataforma." },
        { status: 404 }
      );
    }

    const accessControl = await setTenantBillingAccessByAdmin({
      tenantId,
      status: action === "block_access" ? "blocked" : "active",
      reason: action === "block_access" ? "manual_admin_block" : null,
      actorId: user.uid,
      actorName: user.name,
      note,
    });

    await adminDb.collection("client_contracts").doc(clientId).set(
      {
        platformAccessStatus: action === "block_access" ? "blocked" : "active",
        accessControlledAt: FieldValue.serverTimestamp(),
        accessControlledBy: user.uid,
        accessControlledByName: user.name,
        accessControlNote: note,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      action,
      tenantId,
      accessControl,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao controlar contrato do portal:", error);
    return NextResponse.json({ error: "Falha ao controlar contrato do portal." }, { status: 500 });
  }
}
