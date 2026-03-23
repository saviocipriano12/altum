import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeAutomationDoc } from "@/lib/server/automations";
import {
  getBusinessProfileStarterKit,
  type BusinessProfileStarterAutomationDraft,
} from "@/lib/business-profile-starter-kit";
import { normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";

type ApplyBusinessProfileStarterKitInput = {
  tenantId: string;
  businessProfileId?: BusinessProfileId | string;
  actorId?: string | null;
  actorName?: string | null;
  overwriteExisting?: boolean;
};

type StarterKitApplyResult = {
  profileId: BusinessProfileId;
  pipelineApplied: boolean;
  automationsCreated: number;
  automationsUpdated: number;
  automationCount: number;
};

function cleanText(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function buildStarterAutomationDocId(tenantId: string, key: string) {
  const safeTenantId = cleanText(tenantId, 120).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeKey = cleanText(key, 60).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `starter_${safeTenantId}_${safeKey}`;
}

function toAutomationWriteShape(
  tenantId: string,
  automation: BusinessProfileStarterAutomationDraft,
  docId: string
) {
  const normalized = normalizeAutomationDoc(
    docId,
    {
      tenantId,
      name: automation.name,
      description: automation.description,
      trigger: automation.trigger,
      enabled: automation.enabled,
      status: automation.status,
      conditions: automation.conditions,
      actions: automation.actions,
    },
    tenantId
  );

  return {
    tenantId,
    name: normalized.name,
    description: normalized.description,
    trigger: normalized.trigger,
    enabled: normalized.enabled,
    status: normalized.status,
    conditions: normalized.conditions,
    actions: normalized.actions,
  };
}

export async function applyBusinessProfileStarterKit(
  input: ApplyBusinessProfileStarterKitInput
): Promise<StarterKitApplyResult> {
  const tenantId = cleanText(input.tenantId, 160);
  if (!tenantId) {
    throw new Error("Tenant invalido para aplicar starter kit.");
  }

  const profileId = normalizeBusinessProfileId(input.businessProfileId);
  const starterKit = getBusinessProfileStarterKit(profileId);
  const overwriteExisting = input.overwriteExisting === true;

  const pipelineDirectRef = adminDb.collection("pipeline").doc(tenantId);
  const automationRefs = starterKit.automations.map((automation) =>
    adminDb.collection("automations").doc(buildStarterAutomationDocId(tenantId, automation.key))
  );

  const [pipelineDirectSnap, pipelineQuerySnap, ...automationSnaps] = await Promise.all([
    pipelineDirectRef.get(),
    adminDb.collection("pipeline").where("tenantId", "==", tenantId).limit(1).get(),
    ...automationRefs.map((ref) => ref.get()),
  ]);

  const batch = adminDb.batch();
  let pipelineApplied = false;
  let automationsCreated = 0;
  let automationsUpdated = 0;

  if (overwriteExisting || (!pipelineDirectSnap.exists && pipelineQuerySnap.empty)) {
    batch.set(
      pipelineDirectRef,
      {
        tenantId,
        stages: starterKit.pipelineStages,
        starterKitManaged: true,
        starterKitProfileId: profileId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: cleanText(input.actorId, 120) || "system",
        updatedByName: cleanText(input.actorName, 120) || "Starter Kit",
      },
      { merge: true }
    );
    pipelineApplied = true;
  }

  starterKit.automations.forEach((automation, index) => {
    const ref = automationRefs[index];
    const currentSnap = automationSnaps[index];
    if (currentSnap.exists && !overwriteExisting) {
      return;
    }

    const writeShape = toAutomationWriteShape(tenantId, automation, ref.id);
    batch.set(
      ref,
      {
        ...writeShape,
        starterKitManaged: true,
        starterKitProfileId: profileId,
        starterKitKey: automation.key,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: cleanText(input.actorId, 120) || "system",
        updatedByName: cleanText(input.actorName, 120) || "Starter Kit",
        ...(currentSnap.exists
          ? {}
          : {
              createdAt: FieldValue.serverTimestamp(),
            }),
      },
      { merge: true }
    );

    if (currentSnap.exists) {
      automationsUpdated += 1;
    } else {
      automationsCreated += 1;
    }
  });

  batch.set(
    adminDb.collection("tenant_settings").doc(tenantId),
    {
      tenantId,
      starterKit: {
        profileId,
        version: "2026-03",
        appliedAt: FieldValue.serverTimestamp(),
        appliedBy: cleanText(input.actorId, 120) || "system",
        appliedByName: cleanText(input.actorName, 120) || "Starter Kit",
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    adminDb.collection("tenants").doc(tenantId),
    {
      businessProfileId: profileId,
      starterKitProfileId: profileId,
      starterKitVersion: "2026-03",
      starterKitUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return {
    profileId,
    pipelineApplied,
    automationsCreated,
    automationsUpdated,
    automationCount: starterKit.automations.length,
  };
}
