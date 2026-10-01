import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  sendManualContractReminderByClientId,
  setTenantBillingAccessByAdmin,
} from "@/lib/server/contract-billing";

type Body = {
  clientId?: string;
  tenantId?: string;
  action?: "release_access" | "block_access" | "send_reminder" | "extend_trial" | string;
  note?: string;
  trialDays?: number;
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
    const user = await requireRequestUser(req, { roles: ["agency_admin"] });
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 140);
    const action = clean(body.action, 80).toLowerCase();
    const note = clean(body.note, 1200) || null;

    if (!clientId) {
      return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    }

    if (action !== "release_access" && action !== "block_access" && action !== "send_reminder" && action !== "extend_trial") {
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

    if (action === "extend_trial") {
      const trialDays = Math.min(365, Math.max(1, Math.round(Number(body.trialDays) || 7)));
      const trialEndsAt = Timestamp.fromMillis(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      const batch = adminDb.batch();
      batch.set(adminDb.collection("tenants").doc(tenantId), {
        status: "active",
        billingStatus: "trial",
        trialEndsAt,
        billingBlockAt: FieldValue.delete(),
        blockedReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection("client_contracts").doc(clientId), {
        platformAccessStatus: "trial",
        trialEndsAt,
        trialExtendedAt: FieldValue.serverTimestamp(),
        trialExtendedBy: user.uid,
        trialExtendedByName: user.name,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection("audit_logs").doc(), {
        type: "tenant_trial_extended_by_admin",
        tenantId,
        clientId,
        actorId: user.uid,
        actorName: user.name,
        trialDays,
        note,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return NextResponse.json({ ok: true, action, tenantId, trialDays, trialEndsAt: trialEndsAt.toDate().toISOString() });
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
