import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  displayName?: string;
  provider?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  businessAccountId?: string;
  status?: "active" | "inactive";
  metadata?: Record<string, unknown>;
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const actor = await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { tenantId: rawTenantId } = await context.params;
    const tenantId = clean(rawTenantId, 140);
    if (!tenantId) {
      return NextResponse.json({ error: "Parametro obrigatorio: tenantId." }, { status: 400 });
    }

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    const body = (await req.json()) as Body;

    const channelRef = adminDb.collection("tenant_channels").doc();
    const channelId = channelRef.id;
    const provider = clean(body.provider, 40) || "meta_whatsapp";
    const displayName = clean(body.displayName, 140) || "WhatsApp";
    const phoneNumberId = clean(body.phoneNumberId, 120);
    const accessToken = clean(body.accessToken, 4000);
    const verifyToken = clean(body.verifyToken, 400);
    const appSecret = clean(body.appSecret, 400);

    if (!phoneNumberId || !accessToken || !verifyToken || !appSecret) {
      return NextResponse.json(
        { error: "Campos obrigatorios: phoneNumberId, accessToken, verifyToken, appSecret." },
        { status: 400 }
      );
    }

    await Promise.all([
      channelRef.set(
        {
          tenantId,
          type: "whatsapp",
          provider,
          displayName,
          phoneNumber: clean(body.phoneNumber, 60),
          phoneNumberId,
          accessToken,
          verifyToken,
          appSecret,
          businessAccountId: clean(body.businessAccountId, 120),
          status: body.status === "inactive" ? "inactive" : "active",
          metadata: body.metadata || {},
          createdBy: actor.uid,
          createdByName: actor.name,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("tenant_settings").doc(tenantId).set(
        {
          tenantId,
          defaultWhatsAppChannelId: channelId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("audit_logs").add({
        type: "tenant_whatsapp_channel_created",
        actorId: actor.uid,
        actorName: actor.name,
        tenantId,
        channelId,
        provider,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId,
      channelId,
      channel: {
        id: channelId,
        tenantId,
        type: "whatsapp",
        provider,
        displayName,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao cadastrar canal WhatsApp do tenant:", error);
    return NextResponse.json({ error: "Falha ao cadastrar canal WhatsApp." }, { status: 500 });
  }
}
