import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { encryptSecret, hasStoredSecret, maskStoredSecret } from "@/app/lib/server/secret-crypto";

type Body = {
  displayName?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  status?: "active" | "inactive";
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const settingsSnap = await adminDb.collection("tenant_settings").doc(tenantId).get();
    const preferredId = settingsSnap.exists
      ? String((settingsSnap.data() as { defaultWhatsAppChannelId?: string }).defaultWhatsAppChannelId || "").trim()
      : "";

    let channelSnap = preferredId
      ? await adminDb.collection("tenant_channels").doc(preferredId).get()
      : null;

    if (!channelSnap || !channelSnap.exists) {
      const listSnap = await adminDb
        .collection("tenant_channels")
        .where("tenantId", "==", tenantId)
        .where("type", "==", "whatsapp")
        .limit(1)
        .get();
      channelSnap = listSnap.empty ? null : listSnap.docs[0];
    }

    if (!channelSnap || !channelSnap.exists) {
      return NextResponse.json({ ok: true, tenantId, channel: null });
    }

    const channelData = channelSnap.data() as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      tenantId,
      channel: {
        id: channelSnap.id,
        tenantId: String(channelData.tenantId || tenantId),
        type: String(channelData.type || "whatsapp"),
        displayName: String(channelData.displayName || "WhatsApp"),
        phoneNumber: String(channelData.phoneNumber || ""),
        phoneNumberId: String(channelData.phoneNumberId || ""),
        status: String(channelData.status || "active"),
        hasAccessToken: hasStoredSecret(channelData.accessToken),
        hasVerifyToken: Boolean(String(channelData.verifyToken || "")),
        hasAppSecret: hasStoredSecret(channelData.appSecret),
        accessTokenMasked: maskStoredSecret(channelData.accessToken),
        verifyTokenMasked: maskStoredSecret(String(channelData.verifyToken || "")),
        appSecretMasked: maskStoredSecret(channelData.appSecret),
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao carregar canal WhatsApp do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar canal." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const body = (await req.json()) as Body;

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

    const settingsRef = adminDb.collection("tenant_settings").doc(tenantId);
    const settingsSnap = await settingsRef.get();

    const preferredId = settingsSnap.exists
      ? String((settingsSnap.data() as { defaultWhatsAppChannelId?: string }).defaultWhatsAppChannelId || "").trim()
      : "";

    const channelRef = preferredId
      ? adminDb.collection("tenant_channels").doc(preferredId)
      : adminDb.collection("tenant_channels").doc();

    const channelId = channelRef.id;

    await Promise.all([
      channelRef.set(
        {
          tenantId,
          type: "whatsapp",
          provider: "meta_whatsapp",
          displayName: clean(body.displayName, 120) || "WhatsApp",
          phoneNumber: clean(body.phoneNumber, 60),
          phoneNumberId,
          accessToken: encryptSecret(accessToken),
          verifyToken,
          appSecret: encryptSecret(appSecret),
          status: body.status === "inactive" ? "inactive" : "active",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: user.name,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      settingsRef.set(
        {
          tenantId,
          defaultWhatsAppChannelId: channelId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("audit_logs").add({
        type: "tenant_whatsapp_channel_upsert",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        channelId,
        phoneNumberId,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, channelId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao salvar canal WhatsApp do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar canal." }, { status: 500 });
  }
}
