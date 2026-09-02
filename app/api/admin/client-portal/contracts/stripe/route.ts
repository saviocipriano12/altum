import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  createStripeCustomerPortalSession,
  createStripeSubscriptionCheckout,
} from "@/lib/server/stripe-billing";

type Body = {
  clientId?: string;
  tenantId?: string;
  action?: "create_checkout" | "open_portal" | string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function resolveTenantId(clientId: string, tenantId?: string) {
  const explicit = clean(tenantId, 140);
  if (explicit) return explicit;

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
    if (!clientId) {
      return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    }
    if (action !== "create_checkout" && action !== "open_portal") {
      return NextResponse.json({ error: "Acao Stripe invalida." }, { status: 400 });
    }

    const contractSnap = await adminDb.collection("client_contracts").doc(clientId).get();
    if (!contractSnap.exists) {
      return NextResponse.json({ error: "Contrato do cliente nao encontrado." }, { status: 404 });
    }

    const contract = contractSnap.data() as Record<string, unknown>;
    const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
    const client = clientSnap.exists ? (clientSnap.data() as Record<string, unknown>) : {};
    const tenantId = await resolveTenantId(clientId, body.tenantId);

    if (action === "create_checkout") {
      const checkout = await createStripeSubscriptionCheckout({
        req,
        clientId,
        tenantId: tenantId || null,
        clientName:
          clean(contract.clientName, 180) ||
          clean(client.name, 180) ||
          clean(client.nome, 180) ||
          "Cliente Altum",
        email: clean(client.email, 180) || null,
        phone: clean(client.phone || client.telefone || client.whatsapp, 40) || null,
        platformPlan: clean(contract.platformPlan, 120) || null,
        stripePriceId: clean(contract.stripePriceId, 180) || null,
        stripeCustomerId: clean(contract.stripeCustomerId, 180) || null,
        monthlyValue: Number(contract.monthlyValue || 0) || null,
        actorId: user.uid,
        actorName: user.name,
      });

      return NextResponse.json({
        ok: true,
        action,
        ...checkout,
      });
    }

    const portal = await createStripeCustomerPortalSession({
      req,
      clientId,
      tenantId: tenantId || null,
      stripeCustomerId: clean(contract.stripeCustomerId, 180) || null,
      actorId: user.uid,
      actorName: user.name,
    });

    return NextResponse.json({
      ok: true,
      action,
      ...portal,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro no trilho admin Stripe:", error);
    return NextResponse.json({ error: "Falha ao executar acao Stripe." }, { status: 500 });
  }
}
