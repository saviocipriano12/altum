import "server-only";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";

export async function deliverSubscriptionReceipts(tenantId?: string) {
  if (!process.env.RESEND_API_KEY) return { sent: 0, configured: false };
  const pending = await adminDb.collection("billing_operations").where(tenantId ? "tenantId" : "emailStatus", "==", tenantId || "pending").limit(30).get();
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  for (const doc of pending.docs) {
    const operation = doc.data();
    if (operation.emailStatus !== "pending") continue;
    try {
      const user = await adminAuth.getUser(String(operation.actorId));
      if (!user.email) { await doc.ref.set({ emailStatus: "no_email" }, { merge: true }); continue; }
      const result = operation.result || {};
      const text = `Recebemos o cancelamento da sua assinatura Altum.\nProtocolo: ${String(result.protocol || "")}\n${result.action === "refund_pending" ? "O estorno foi solicitado e depende da confirmacao do Asaas." : result.accessEndsAt ? `Seu periodo pago termina em ${String(result.accessEndsAt)}.` : "Seu acesso operacional foi encerrado."}\nA recorrencia foi encerrada no Asaas.\nConsulte sua assinatura em https://altumia.com.br/cliente/assinatura\nDuvidas: suporte.altum@gmail.com`;
      // Resend guarantees idempotency for 24h; stop after that if a previous
      // attempt is ambiguous rather than silently sending a second receipt.
      const started = Number(operation.emailAttemptedAt || 0);
      if (started && Date.now() - started > 23 * 60 * 60 * 1000) {
        await doc.ref.set({ emailStatus: "needs_review" }, { merge: true }); continue;
      }
      if (!started) await doc.ref.set({ emailAttemptedAt: Date.now() }, { merge: true });
      const response = await resend.emails.send({ from: process.env.AUTH_EMAIL_FROM || "Altum <conta@altumia.com.br>",
        to: user.email, replyTo: "suporte.altum@gmail.com", subject: "Cancelamento da assinatura Altum", text },
        { idempotencyKey: `altum-billing-${doc.id}` });
      if (response.error) throw new Error("email_provider_failure");
      await doc.ref.set({ emailStatus: "sent", emailSentAt: FieldValue.serverTimestamp() }, { merge: true });
      sent++;
    } catch { await doc.ref.set({ emailLastErrorAt: FieldValue.serverTimestamp() }, { merge: true }); }
  }
  return { sent, configured: true };
}
