import "server-only";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export class AsaasApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
  }
}

export async function asaasRequest<T = Record<string, unknown>>(
  path: string,
  init?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: Record<string, unknown> }
) {
  const apiKey = clean(process.env.ASAAS_API_KEY);
  const apiUrl = clean(process.env.ASAAS_API_URL, 300) || "https://api.asaas.com/v3";
  if (!apiKey) throw new AsaasApiError("Asaas nao configurado.", 503, null);

  const response = await fetch(`${apiUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    method: init?.method || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "ALTUM/1.0 (Next.js; SaaS billing)",
      access_token: apiKey,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new AsaasApiError("O Asaas recusou a operacao.", response.status, payload);
  }
  return payload;
}
