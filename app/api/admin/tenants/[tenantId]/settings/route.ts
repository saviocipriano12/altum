import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getBusinessProfile, normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";
import { applyBusinessProfileStarterKit } from "@/lib/server/business-profile-provisioning";

type Params = {
  params: Promise<{
    tenantId: string;
  }>;
};

type Body = {
  businessProfileId?: BusinessProfileId | string;
  niche?: string;
  applyStarterKit?: boolean;
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function PATCH(req: Request, context: Params) {
  try {
    const actor = await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { tenantId } = await context.params;
    const normalizedTenantId = clean(tenantId, 160);
    if (!normalizedTenantId) {
      return NextResponse.json({ error: "Tenant invalido." }, { status: 400 });
    }

    const tenantRef = adminDb.collection("tenants").doc(normalizedTenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    const body = (await req.json()) as Body;
    const businessProfileId = normalizeBusinessProfileId(body.businessProfileId);
    const businessProfile = getBusinessProfile(businessProfileId);
    const niche = clean(body.niche, 120) || clean(tenantSnap.data()?.niche, 120) || "Nao informado";

    const batch = adminDb.batch();

    batch.set(
      tenantRef,
      {
        niche,
        businessProfileId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      adminDb.collection("tenant_settings").doc(normalizedTenantId),
      {
        tenantId: normalizedTenantId,
        niche,
        businessProfileId,
        ai: {
          toneOfVoice: businessProfile.ai.toneOfVoice,
          objective: businessProfile.ai.objective,
          mandatoryQuestions: businessProfile.ai.mandatoryQuestions,
          escalationTopics: businessProfile.ai.escalationTopics,
          guardrails: businessProfile.ai.guardrails,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    let starterKit: Awaited<ReturnType<typeof applyBusinessProfileStarterKit>> | null = null;
    let starterKitError = "";
    if (body.applyStarterKit === true) {
      try {
        starterKit = await applyBusinessProfileStarterKit({
          tenantId: normalizedTenantId,
          businessProfileId,
          actorId: actor.uid,
          actorName: actor.name,
          overwriteExisting: true,
        });
      } catch (starterError) {
        starterKitError =
          starterError instanceof Error ? starterError.message : "Falha ao aplicar starter kit.";
        console.error("Starter kit aplicado com falha apos atualizar tenant:", {
          tenantId: normalizedTenantId,
          businessProfileId,
          error: starterError,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      tenantId: normalizedTenantId,
      starterKit,
      starterKitError,
      settings: {
        businessProfileId,
        niche,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao atualizar settings do tenant no admin:", error);
    return NextResponse.json({ error: "Falha ao atualizar settings do tenant." }, { status: 500 });
  }
}
