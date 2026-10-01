import { scopes, type Scope } from "@/lib/mcp/scope-catalog";

export type McpOAuthScopeRequest = { scopes: Scope[]; offline: boolean };

export function parseMcpOAuthScopes(value: unknown, defaultToAll = false): McpOAuthScopeRequest {
  if ((value === undefined || value === null || value === "") && defaultToAll) {
    return { scopes: [...scopes], offline: true };
  }
  if (typeof value !== "string" || value.length > 2000) throw new Error("invalid_scope");
  const requested = [...new Set(value.split(/\s+/).filter(Boolean))];
  if (!requested.length || requested.some((scope) => scope !== "offline_access" && !(scopes as readonly string[]).includes(scope))) {
    throw new Error("invalid_scope");
  }
  const selected = requested.filter((scope): scope is Scope => (scopes as readonly string[]).includes(scope));
  if (!selected.includes("context:read")) throw new Error("invalid_scope");
  return { scopes: selected, offline: requested.includes("offline_access") };
}

export function isChatGptClientMetadataUrl(value: string) {
  return /^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,180}\/)?client\.json$/.test(value);
}

export function isChatGptOAuthRedirect(value: string) {
  return value === "https://chatgpt.com/connector_platform_oauth_redirect" || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,180}$/.test(value);
}
