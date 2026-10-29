/** Shared by the connection form and server; never accepts a custom storefront host. */
export function normalizeShopifyStore(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const raw = value.trim().toLowerCase();
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    if (url.hostname === "admin.shopify.com") {
      const match = /^\/store\/([a-z0-9][a-z0-9-]*)(?:\/|$)/.exec(url.pathname);
      return match ? `${match[1]}.myshopify.com` : "";
    }
    const host = url.hostname;
    const domain = host.includes(".") ? host : `${host}.myshopify.com`;
    return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : "";
  } catch {
    return "";
  }
}

export function missingShopifyScopes(required: string, granted: string): string[] {
  const scopes = new Set(granted.split(",").map((scope) => scope.trim()).filter(Boolean));
  return required.split(",").map((scope) => scope.trim()).filter(Boolean)
    .filter((scope) => !scopes.has(scope) && !(scope.startsWith("read_") && scopes.has(scope.replace(/^read_/, "write_"))));
}

export function commerceConnectionState(connection: {
  status: string; connectionStatus: string; hasApiCredentials?: boolean; lastEventAt?: string | null;
}): { label: string; tone: "success" | "warning" | "danger" | "info" } {
  if (connection.status === "paused") return { label: "Pausada", tone: "warning" };
  if (connection.status === "error" || connection.connectionStatus === "error") return { label: "Precisa de atenção", tone: "danger" };
  if (connection.connectionStatus === "syncing") return { label: "Importando dados", tone: "info" };
  if (connection.status === "active" && (connection.hasApiCredentials || connection.lastEventAt)) return { label: "Conectada", tone: "success" };
  return { label: "Conexão pendente", tone: "warning" };
}
