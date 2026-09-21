import "server-only";
import { asaasRequest, AsaasApiError } from "./asaas-api";

// The Altum operator supplies a template validated by their accountant.
// No tax rate, service code or municipal configuration is guessed here.
export async function ensureSubscriptionFiscalSettings(subscriptionId: string) {
  const raw = process.env.ASAAS_INVOICE_SETTINGS_JSON;
  if (!raw) return { status: "not_configured" };
  const settings = JSON.parse(raw) as Record<string, unknown>;
  if (!settings.taxes || typeof settings.taxes !== "object" ||
    (!settings.municipalServiceId && !settings.municipalServiceCode) ||
    typeof settings.effectiveDatePeriod !== "string") {
    throw new Error("Modelo fiscal incompleto. Configure servico, periodo e impostos com o contador.");
  }
  try {
    await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}/invoiceSettings`);
    return { status: "configured" };
  } catch (error) {
    if (!(error instanceof AsaasApiError && error.status === 404)) throw error;
  }
  await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}/invoiceSettings`, {
    method: "POST", body: settings,
  });
  return { status: "configured" };
}
