import { CommandError } from "@/lib/server/command-center/security";

function messageFrom(payload: Record<string, unknown>) {
  const value = typeof payload.error === "string"
    ? payload.error
    : payload.error && typeof payload.error === "object" && typeof (payload.error as Record<string, unknown>).message === "string"
      ? String((payload.error as Record<string, unknown>).message)
      : "";
  return value.toLocaleLowerCase("pt-BR");
}

/** Maps an internal apply response to a stable, non-sensitive MCP error code. */
export function autonomousApplyError(status: number, payload: Record<string, unknown>) {
  const explicitCode = typeof payload.code === "string" ? payload.code : "";
  const message = messageFrom(payload);

  if (explicitCode === "WHATSAPP_PROVIDER_ERROR") return new CommandError("WHATSAPP_PROVIDER_ERROR", 502);
  if (message.includes("templatename aprovado") || message.includes("api oficial exige")) return new CommandError("WHATSAPP_TEMPLATE_REQUIRED", 409);
  if (message.includes("telefone valido") || message.includes("telefone válido")) return new CommandError("LEAD_PHONE_INVALID", 409);
  if (message.includes("canal whatsapp ativo") || message.includes("whatsapp ativo nao configurado")) return new CommandError("WHATSAPP_CHANNEL_UNAVAILABLE", 409);
  if (status === 401) return new CommandError("UNAUTHENTICATED", 401);
  if (status === 403) return new CommandError("FORBIDDEN", 403);
  if (status === 404) return new CommandError("NOT_FOUND", 404);
  return new CommandError("AUTONOMOUS_APPLY_FAILED", status >= 400 && status <= 599 ? status : 500);
}
