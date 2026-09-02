import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { getPlatformPlanEntitlements } from "@/lib/platform-plan-entitlements";
import { ensureActiveTrialFullAccess } from "@/lib/server/platform-plan-entitlements";

const TRIAL_DAYS = 7;

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export class SelfServiceAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function getBearerToken(req: Request) {
  const [scheme, token] = (req.headers.get("authorization") || "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

export async function requireFreshFirebaseUser(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new SelfServiceAuthError(401, "missing_token", "Sessao ausente.");

  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(decoded.auth_time || 0);
    if (ageSeconds > 10 * 60) {
      throw new SelfServiceAuthError(
        401,
        "recent_login_required",
        "Entre novamente para concluir esta operacao."
      );
    }
    return decoded;
  } catch (error) {
    if (error instanceof SelfServiceAuthError) throw error;
    throw new SelfServiceAuthError(401, "invalid_token", "Sessao invalida ou expirada.");
  }
}

export async function requireFirebaseUser(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new SelfServiceAuthError(401, "missing_token", "Sessao ausente.");
  try {
    return await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new SelfServiceAuthError(401, "invalid_token", "Sessao invalida ou expirada.");
  }
}

export async function provisionSelfServiceAccount(input: {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  companyName: string;
  provider: string;
}) {
  const uid = clean(input.uid, 140);
  const email = clean(input.email, 180).toLowerCase();
  const name = clean(input.name, 140);
  const companyName = clean(input.companyName, 180);
  if (!uid || !email || !name || !companyName) {
    throw new SelfServiceAuthError(400, "invalid_profile", "Nome, empresa e e-mail sao obrigatorios.");
  }

  const tenantId = `saas_${uid}`;
  const membershipId = `${tenantId}_${uid}`;
  const trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const trialEntitlements = getPlatformPlanEntitlements("operacao");
  const now = FieldValue.serverTimestamp();

  const existing = await adminDb.collection("tenant_users").doc(membershipId).get();
  if (existing.exists) {
    await Promise.all([
      adminDb.collection("users").doc(uid).set({
        emailVerified: Boolean(input.emailVerified),
        updatedAt: now,
      }, { merge: true }),
      ensureActiveTrialFullAccess({ tenantId, actorId: uid }),
    ]);
    return { tenantId, trialEndsAt: null, existing: true };
  }

  const batch = adminDb.batch();
  batch.set(adminDb.collection("users").doc(uid), {
    uid,
    email,
    name,
    role: "client_owner",
    status: "active",
    commissionRate: 0,
    signupSource: "self_service",
    authProvider: clean(input.provider, 80) || "password",
    emailVerified: Boolean(input.emailVerified),
    termsAcceptedAt: now,
    termsVersion: "2026-08-27",
    privacyNoticeVersion: "2026-08-27",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  batch.set(adminDb.collection("tenants").doc(tenantId), {
    name: companyName,
    responsibleName: name,
    responsibleEmail: email,
    status: "active",
    billingStatus: "trial",
    billingProvider: "asaas",
    platformAccessMode: "asaas_subscription",
    platformPlan: "essencial",
    trialStartedAt: now,
    trialEndsAt,
    signupSource: "self_service",
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  batch.set(adminDb.collection("tenant_users").doc(membershipId), {
    tenantId,
    userId: uid,
    role: "client_owner",
    status: "active",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(adminDb.collection("tenant_settings").doc(tenantId), {
    tenantId,
    name: companyName,
    responsibleName: name,
    responsibleEmail: email,
    timezone: "America/Sao_Paulo",
    businessHours: "Seg-Sex 09:00-18:00",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  batch.set(adminDb.collection("tenant_entitlements").doc(tenantId), {
    version: 1,
    tenantId,
    mode: "custom",
    modules: trialEntitlements.modules,
    limits: trialEntitlements.limits,
    entitlementSource: "trial",
    platformPlan: "operacao",
    createdAt: now,
    createdBy: uid,
    createdByName: name,
    updatedAt: now,
    updatedBy: uid,
    updatedByName: name,
  }, { merge: true });
  batch.set(adminDb.collection("client_contracts").doc(tenantId), {
    clientId: tenantId,
    clientName: companyName,
    tenantId,
    title: "Assinatura ALTUM",
    status: "active",
    accessStatus: "trial",
    platformAccessMode: "asaas_subscription",
    billingProvider: "asaas",
    platformPlan: "essencial",
    monthlyValue: 0,
    trialEndsAt,
    autoBillingEnabled: false,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  batch.set(adminDb.collection("audit_logs").doc(), {
    type: "self_service_account_created",
    actorId: uid,
    actorName: name,
    tenantId,
    tenantName: companyName,
    createdAt: now,
  });

  await batch.commit();
  return { tenantId, trialEndsAt: trialEndsAt.toDate().toISOString(), existing: false };
}

export function timestampToMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value) {
    const fn = (value as { toMillis?: unknown }).toMillis;
    if (typeof fn === "function") return Number(fn.call(value));
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
