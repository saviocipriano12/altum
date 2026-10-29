import { z } from "zod";
import { scopes, type Scope } from "@/lib/mcp/contracts";
export const ADMIN_MCP_PATH = "/api/mcp/admin";
export const ADMIN_MCP_ISSUER_PATH = "/api/admin/mcp";
export const adminConsentSchema = z.object({
  scopes: z.array(z.enum(scopes)).min(1).max(scopes.length),
}).strict().superRefine((data, context) => {
  if (!data.scopes.includes("context:read")) context.addIssue({ code: "custom", message: "A leitura do contexto é necessária." });
});
export function strictAdminScopes(value: unknown): { scopes: Scope[]; offline: boolean } {
  if (typeof value !== "string" || value.length > 2000) throw new Error("invalid_scope");
  const requested = [...new Set(value.split(/\s+/).filter(Boolean))];
  if (!requested.length || requested.some(scope => scope !== "offline_access" && !(scopes as readonly string[]).includes(scope))) throw new Error("invalid_scope");
  const valid = requested.filter((scope): scope is Scope => (scopes as readonly string[]).includes(scope));
  if (!valid.includes("context:read")) throw new Error("invalid_scope");
  return { scopes: valid, offline: requested.includes("offline_access") };
}
export function isChatGptMetadataUrl(value: string) {
  return /^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,180}\/)?client\.json$/.test(value);
}
export function isChatGptRedirect(value: string) {
  return value === "https://chatgpt.com/connector_platform_oauth_redirect" || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,180}$/.test(value);
}
/**
 * The ChatGPT connector returns to chatgpt.com. Codex Desktop is also an
 * official OpenAI MCP client, but it completes OAuth through its loopback
 * callback. Keep that exception tied to Codex's exact metadata document;
 * verifyClientMetadata still verifies the redirect URI against that document.
 */
export function isOpenAiAdminRedirect(clientId: string, value: string) {
  if (isChatGptRedirect(value)) return true;
  if (clientId !== "https://chatgpt.com/oauth/codex/client.json") return false;
  try {
    const url = new URL(value);
    // Codex may bind a per-session loopback port. The exact URI is still
    // checked against the immutable OpenAI client metadata before a code is
    // issued, so this is only a syntactic pre-check, never a trust decision.
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch { return false; }
}
/** Codex Desktop may hand its OAuth completion back to the ChatGPT host. */
export function isCodexChatGptHostedRedirect(clientId: string, value: string) {
  return clientId === "https://chatgpt.com/oauth/codex/client.json" && isChatGptRedirect(value);
}
export function adminMcpMetadata(origin: string) {
  return { issuer: origin + ADMIN_MCP_ISSUER_PATH, authorization_endpoint: origin + ADMIN_MCP_ISSUER_PATH + "/authorize", token_endpoint: origin + ADMIN_MCP_ISSUER_PATH + "/token", response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: [...scopes, "offline_access"], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true };
}
