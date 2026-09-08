import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getDefaultTenantMembershipForUser } from "@/lib/server/tenant";
import { getPlatformPlan } from "@/lib/server/platform-plans";
import { requireFirebaseUser, SelfServiceAuthError, timestampToMillis } from "@/lib/server/self-service-auth";
import { buildAsaasRecurringCheckoutPayload } from "@/lib/asaas-checkout";
import { isValidBrazilianDocument, normalizeBrazilianDocument } from "@/lib/brazilian-document";
import { PLATFORM_CATALOG_VERSION } from "@/lib/platform-plans";
import { canReuseAsaasCheckout, hasManagedAsaasSubscription } from "@/lib/asaas-checkout-state";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  try {
    const actor = await requireFirebaseUser(req);
    const membership = await getDefaultTenantMembershipForUser(actor.uid);
    if (!membership || membership.status !== "active") {
      return NextResponse.json({ error: "Conta da empresa nao encontrada." }, { status: 403 });
    }
    if (membership.role !== "client_owner" && membership.role !== "client_admin") {
      return NextResponse.json({ error: "Apenas o responsavel pela conta pode contratar um plano." }, { status: 403 });
    }

    const body = (await req.json()) as { planId?: unknown; cpfCnpj?: unknown };
    const cpfCnpj = normalizeBrazilianDocument(body.cpfCnpj);
    if (!isValidBrazilianDocument(cpfCnpj)) {
      return NextResponse.json({ error: "Informe um CPF ou CNPJ valido para o checkout seguro." }, { status: 400 });
    }
    const plan = await getPlatformPlan(body.planId);
    if (
      !plan ||
      !plan.active ||
      !plan.checkoutEnabled ||
      typeof plan.monthlyPrice !== "number" ||
      plan.monthlyPrice <= 0
    ) {
      return NextResponse.json({ error: "Este plano nao esta disponivel para checkout." }, { status: 400 });
    }
    const monthlyPrice = plan.monthlyPrice;

    const apiKey = clean(process.env.ASAAS_API_KEY, 500);
    const apiUrl = clean(process.env.ASAAS_API_URL, 300) || "https://api.asaas.com/v3";
    const siteUrl = (clean(process.env.NEXT_PUBLIC_SITE_URL, 300) || "https://www.altumia.com.br").replace(/\/$/, "");
    if (!apiKey) return NextResponse.json({ error: "Checkout temporariamente indisponivel." }, { status: 503 });

    const tenantRef = adminDb.collection("tenants").doc(membership.tenantId);
    const tenantSnap = await tenantRef.get();
    const tenant = (tenantSnap.data() || {}) as Record<string, unknown>;
    if (hasManagedAsaasSubscription({
      subscriptionId: tenant.asaasSubscriptionId,
      billingStatus: tenant.billingStatus,
    })) {
      return NextResponse.json(
        { error: "Esta empresa ja possui uma assinatura gerenciada. Use a central de faturamento para alterar o plano.", code: "subscription_already_exists" },
        { status: 409 }
      );
    }
    const reusableCheckoutUrl = clean(tenant.asaasCheckoutUrl, 800);
    const reusableCheckoutAt = timestampToMillis(tenant.asaasCheckoutCreatedAt) || 0;
    if (canReuseAsaasCheckout({
      checkoutUrl: reusableCheckoutUrl,
      checkoutCreatedAt: reusableCheckoutAt,
      pendingPlan: tenant.pendingPlan,
      pendingMonthlyPrice: tenant.pendingMonthlyPrice,
      catalogVersion: tenant.platformCatalogVersion,
      planId: plan.id,
      monthlyPrice,
      expectedCatalogVersion: PLATFORM_CATALOG_VERSION,
    })) {
      return NextResponse.json({ ok: true, checkoutUrl: reusableCheckoutUrl, reused: true });
    }
    const checkoutRef = randomUUID();
    const externalReference = `altum:${membership.tenantId}:${plan.id}:${checkoutRef}`;
    const checkoutPayload = buildAsaasRecurringCheckoutPayload({
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
      },
      siteUrl,
      externalReference,
      customerData: {
        name: clean(actor.name, 120) || clean(tenant.responsibleName, 120) || "Cliente Altum",
        email: clean(actor.email, 180) || clean(tenant.responsibleEmail, 180),
        cpfCnpj,
      },
    });

    const response = await fetch(`${apiUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ALTUM/1.0 (Next.js; SaaS checkout)",
        access_token: apiKey,
      },
      body: JSON.stringify(checkoutPayload),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      console.error("Asaas recusou checkout:", {
        status: response.status,
        errors: payload.errors,
        tenantId: membership.tenantId,
        planId: plan.id,
        externalReference,
      });
      const errorMessage = response.status === 401 || response.status === 403
        ? "O Asaas recusou a credencial de pagamento. A equipe Altum ja pode identificar esta falha."
        : "O Asaas recusou os dados do checkout. Tente novamente ou fale com a Altum.";
      return NextResponse.json({ error: errorMessage, code: "asaas_checkout_rejected" }, { status: 502 });
    }
    const checkoutUrl = clean(payload.link, 800) || clean(payload.url, 800);
    const checkoutId = clean(payload.id, 180) || checkoutRef;
    if (!checkoutUrl) {
      console.error("Checkout Asaas sem URL:", { checkoutId, keys: Object.keys(payload) });
      return NextResponse.json({ error: "O provedor nao retornou o link de pagamento." }, { status: 502 });
    }

    await Promise.all([
      adminDb.collection("asaas_checkouts").doc(checkoutId).set({
        checkoutId, externalReference, checkoutUrl, tenantId: membership.tenantId,
        userId: actor.uid, planId: plan.id, monthlyPrice: plan.monthlyPrice,
        setupFee: plan.setupFee, setupMode: plan.setupMode,
        catalogVersion: PLATFORM_CATALOG_VERSION,
        billingDocumentLast4: cpfCnpj.slice(-4),
        status: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      tenantRef.set({
        billingProvider: "asaas", billingStatus: "pending", pendingPlan: plan.id,
        pendingMonthlyPrice: plan.monthlyPrice,
        pendingSetupFee: plan.setupFee,
        platformCatalogVersion: PLATFORM_CATALOG_VERSION,
        asaasCheckoutId: checkoutId, asaasCheckoutUrl: checkoutUrl,
        asaasCheckoutCreatedAt: FieldValue.serverTimestamp(),
        billingDocumentLast4: cpfCnpj.slice(-4),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (error) {
    if (error instanceof SelfServiceAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Falha ao criar checkout Asaas:", error);
    return NextResponse.json({ error: "Falha ao iniciar pagamento." }, { status: 500 });
  }
}
