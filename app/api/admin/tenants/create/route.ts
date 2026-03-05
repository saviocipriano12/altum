import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  name?: string;
  niche?: string;
  responsibleName?: string;
  responsibleEmail?: string;
  timezone?: string;
  businessHours?: string;
  rules?: Record<string, unknown>;
  legacyClientId?: string;
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const body = (await req.json()) as Body;
    const name = clean(body.name, 180);
    if (!name) {
      return NextResponse.json({ error: "Campo obrigatorio: name." }, { status: 400 });
    }

    const tenantRef = adminDb.collection("tenants").doc();
    const tenantId = tenantRef.id;

    const payload = {
      name,
      niche: clean(body.niche, 120) || "Nao informado",
      responsibleName: clean(body.responsibleName, 140) || actor.name,
      responsibleEmail: clean(body.responsibleEmail, 180).toLowerCase() || actor.email || "",
      status: "active",
      legacyClientId: clean(body.legacyClientId, 120) || tenantId,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const batch = adminDb.batch();

    batch.set(tenantRef, payload, { merge: true });

    batch.set(
      adminDb.collection("tenant_settings").doc(tenantId),
      {
        tenantId,
        name,
        niche: payload.niche,
        responsibleName: payload.responsibleName,
        responsibleEmail: payload.responsibleEmail,
        timezone: clean(body.timezone, 80) || "America/Sao_Paulo",
        businessHours: clean(body.businessHours, 240) || "Seg-Sex 09:00-18:00",
        rules: body.rules || {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      adminDb.collection("tenant_users").doc(`${tenantId}_${actor.uid}`),
      {
        tenantId,
        userId: actor.uid,
        role: "agency_admin",
        status: "active",
        isDefault: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(adminDb.collection("audit_logs").doc(), {
      type: "tenant_created",
      actorId: actor.uid,
      actorName: actor.name,
      tenantId,
      tenantName: name,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      tenantId,
      tenant: {
        id: tenantId,
        ...payload,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao criar tenant:", error);
    return NextResponse.json({ error: "Falha ao criar tenant." }, { status: 500 });
  }
}
