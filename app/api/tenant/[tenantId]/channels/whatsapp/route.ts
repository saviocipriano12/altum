import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { countTenantWhatsAppChannels } from "@/lib/server/tenant-usage";
import { encryptSecret, hasStoredSecret, maskStoredSecret } from "@/app/lib/server/secret-crypto";
import { ensureDefaultWhatsAppFollowUpTemplates } from "@/app/lib/server/whatsapp-channel";

type Body = {
  displayName?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  wabaId?: string;
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
    await assertTenantModule(tenantId, "whatsapp");
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
        provider: String(channelData.provider || "meta_whatsapp"),
        displayName: String(channelData.displayName || "WhatsApp"),
        phoneNumber: String(channelData.phoneNumber || ""),
        phoneNumberId: String(channelData.phoneNumberId || ""),
        wabaId:
          String(channelData.wabaId || "") ||
          String((channelData.metadata as Record<string, unknown> | undefined)?.wabaId || "") ||
          String((channelData.metadata as Record<string, unknown> | undefined)?.whatsappBusinessAccountId || ""),
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
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantCapability(membership, "manage_channels");

    const body = (await req.json()) as Body;

    const phoneNumberId = clean(body.phoneNumberId, 120);
    const wabaId = clean(body.wabaId, 180);
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

    let channelRef = preferredId
      ? adminDb.collection("tenant_channels").doc(preferredId)
      : null;
    if (!channelRef) {
      const sameNumberSnap = await adminDb
        .collection("tenant_channels")
        .where("tenantId", "==", tenantId)
        .where("type", "==", "whatsapp")
        .where("phoneNumberId", "==", phoneNumberId)
        .limit(1)
        .get();
      channelRef = sameNumberSnap.empty ? adminDb.collection("tenant_channels").doc() : sameNumberSnap.docs[0].ref;
    }
    const currentChannelSnap = await channelRef.get();
    if (!currentChannelSnap.exists) {
      await assertTenantLimitAvailable({
        tenantId,
        limitId: "whatsappChannels",
        currentUsage: await countTenantWhatsAppChannels(tenantId),
        increment: 1,
      });
    }

    const channelId = channelRef.id;
    const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
    const aiData =
      settingsData.ai && typeof settingsData.ai === "object"
        ? (settingsData.ai as Record<string, unknown>)
        : {};
    const aiDefaultsPatch: Record<string, unknown> = {};

    if (typeof aiData.whatsappTemplateFollowUpEnabled !== "boolean") {
      aiDefaultsPatch.whatsappTemplateFollowUpEnabled = true;
    }
    if (!clean(aiData.whatsappTemplateFollowUpName, 120)) {
      aiDefaultsPatch.whatsappTemplateFollowUpName = "follow_up_geral";
    }
    if (!clean(aiData.whatsappTemplateFollowUpLanguage, 24)) {
      aiDefaultsPatch.whatsappTemplateFollowUpLanguage = "pt_BR";
    }
    if (!Array.isArray(aiData.whatsappTemplateFollowUpParams) && typeof aiData.whatsappTemplateFollowUpParams !== "string") {
      aiDefaultsPatch.whatsappTemplateFollowUpParams = [];
    }

    const settingsPatch: Record<string, unknown> = {
      tenantId,
      defaultWhatsAppChannelId: channelId,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (Object.keys(aiDefaultsPatch).length > 0) {
      settingsPatch.ai = aiDefaultsPatch;
    }

    await Promise.all([
      channelRef.set(
        {
          tenantId,
          type: "whatsapp",
          provider: "meta_whatsapp",
          displayName: clean(body.displayName, 120) || "WhatsApp",
          phoneNumber: clean(body.phoneNumber, 60),
          phoneNumberId,
          ...(wabaId ? { wabaId } : {}),
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
        settingsPatch,
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

    let templateSeedSummary:
      | { created: string[]; alreadyPresent: string[]; failed: Array<{ name: string; error: string }> }
      | null = null;
    try {
      const seedResult = await ensureDefaultWhatsAppFollowUpTemplates({
        id: channelId,
        tenantId,
        source: "tenant_channel",
        provider: "meta_whatsapp",
        displayName: clean(body.displayName, 120) || "WhatsApp",
        phoneNumber: clean(body.phoneNumber, 60),
        phoneNumberId,
        wabaId: wabaId || undefined,
        accessToken,
        verifyToken: verifyToken || undefined,
        appSecret: appSecret || undefined,
      });
      templateSeedSummary = {
        created: seedResult.created,
        alreadyPresent: seedResult.alreadyPresent,
        failed: seedResult.failed,
      };
    } catch (error) {
      templateSeedSummary = {
        created: [],
        alreadyPresent: [],
        failed: [
          {
            name: "template_seed",
            error: error instanceof Error ? error.message : "template_seed_failed",
          },
        ],
      };
    }

    return NextResponse.json({ ok: true, tenantId, channelId, templateSeedSummary });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "tenant_limit_exceeded" ? 409 : 403 }
      );
    }

    console.error("Erro ao salvar canal WhatsApp do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar canal." }, { status: 500 });
  }
}
