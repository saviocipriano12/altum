import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { sendManualContractReminderByClientId } from "@/lib/server/contract-billing";
import {
  getStripeServer,
  syncContractFromStripeSubscription,
  upsertStripeFinanceFromInvoice,
} from "@/lib/server/stripe-billing";

export const runtime = "nodejs";

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function resolveInvoiceSubscriptionId(invoice: {
  parent?: {
    type?: string | null;
    subscription_details?: {
      subscription?: string | { id?: string | null } | null;
    } | null;
  } | null;
}) {
  const subscription =
    invoice.parent?.type === "subscription_details"
      ? invoice.parent.subscription_details?.subscription
      : null;
  if (typeof subscription === "string") return subscription;
  if (subscription && typeof subscription === "object" && typeof subscription.id === "string") {
    return subscription.id;
  }
  return "";
}

async function alreadyProcessed(eventId: string) {
  const ref = adminDb.collection("stripe_webhook_events").doc(eventId);
  const snap = await ref.get();
  if (snap.exists) return true;
  await ref.set({
    eventId,
    createdAt: FieldValue.serverTimestamp(),
  });
  return false;
}

export async function POST(req: Request) {
  const webhookSecret = clean(process.env.STRIPE_WEBHOOK_SECRET, 400);
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET nao configurada." }, { status: 503 });
  }

  const signature = clean(req.headers.get("stripe-signature"), 2000);
  if (!signature) {
    return NextResponse.json({ error: "Assinatura Stripe ausente." }, { status: 400 });
  }

  try {
    const stripe = getStripeServer();
    const payload = await req.text();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    if (await alreadyProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : "";
        const customerId =
          typeof session.customer === "string" ? session.customer : "";

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncContractFromStripeSubscription({
            subscription,
            customerId,
            eventType: event.type,
            checkoutSessionId: clean(session.id, 180) || null,
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : "";
        await syncContractFromStripeSubscription({
          subscription,
          customerId,
          eventType: event.type,
        });
        break;
      }

      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const financeSync = await upsertStripeFinanceFromInvoice({
          invoice,
          eventType: event.type,
        });

        if (
          event.type === "invoice.payment_failed" &&
          financeSync.found &&
          financeSync.clientId
        ) {
          await sendManualContractReminderByClientId({
            clientId: financeSync.clientId,
            tenantId: financeSync.tenantId || null,
            actorId: "stripe_webhook",
            actorName: "Stripe Webhook",
            reminderKind: "overdue_blocked",
          }).catch((reminderError) => {
            console.error("[Webhook Stripe] falha ao enviar lembrete de cobranca:", {
              clientId: financeSync.clientId,
              error: reminderError,
            });
          });
        }

        const subscriptionId = resolveInvoiceSubscriptionId(invoice);
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : "";

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncContractFromStripeSubscription({
            subscription,
            customerId,
            eventType: event.type,
          });
        }
        break;
      }

      default:
        break;
    }

    await adminDb.collection("stripe_webhook_events").doc(event.id).set(
      {
        type: event.type,
        livemode: event.livemode === true,
        processedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[Webhook Stripe] erro:", error);
    return NextResponse.json({ error: "Falha ao processar webhook Stripe." }, { status: 400 });
  }
}
