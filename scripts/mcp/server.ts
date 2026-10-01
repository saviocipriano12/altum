import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { tools, instructions, type ToolName } from "../../lib/mcp/contracts.ts";

type Execute = (tool: ToolName, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
type OAuthRuntime = {
  grantedScopes: readonly string[];
  resourceMetadataUrl: string;
};

function oauthSecuritySchemes(requiredScopes: readonly string[]) {
  return [{ type: "oauth2" as const, scopes: [...requiredScopes] }];
}

function oauthChallenge(resourceMetadataUrl: string, requiredScopes: readonly string[]) {
  const scope = requiredScopes.join(" ");
  return `Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", error_description="Autorize as permissoes necessarias para usar esta ferramenta", scope="${scope}"`;
}

export function createServer(execute: Execute, demo = false, autonomous = false, oauth?: OAuthRuntime) {
  const server = new McpServer({ name: demo ? "altum-demo-synthetic" : "altum-commercial-operations", version: "0.3.0" },
    { instructions: demo ? `DEMONSTRAÃ‡ÃƒO FICTÃCIA; nÃ£o sÃ£o dados reais. ${instructions}` : autonomous ? `${instructions} MODO AUTONOMO autorizado pelo cliente: ferramentas de acao executam imediatamente e retornam auditoria.` : instructions });
  for (const [name, def] of Object.entries(tools)) {
    const isRead = def.risk === "READ";
    const executes = autonomous && !isRead;
    const reachesExternalSystem = name === "list_whatsapp_templates" || executes && [
      "send_or_reply_conversation",
      "start_whatsapp_conversation",
      "draft_campaign_pause",
      "draft_campaign_budget_change",
      "draft_google_negative_keyword",
      "draft_google_keyword_pause",
      "draft_google_ad_group_create",
      "draft_google_responsive_search_ad",
      "draft_google_campaign_create",
      "draft_google_bidding_strategy",
      "draft_meta_campaign_create",
      "draft_meta_ad_set_create",
      "draft_meta_ad_set_status",
      "draft_meta_creative_create",
      "draft_meta_ad_create",
    ].includes(name);
    const securitySchemes = oauthSecuritySchemes(def.requiredScopes);
    server.registerTool(name, { description: executes ? `Modo autonomo: esta acao sera executada imediatamente; a politica autonoma substitui referencias abaixo a revisao posterior. ${def.description}` : def.description, inputSchema: def.schema,
      annotations: { readOnlyHint: isRead, destructiveHint: false, idempotentHint: isRead, openWorldHint: reachesExternalSystem },
      // The current MCP SDK exposes arbitrary tool metadata through `_meta`.
      // ChatGPT reads this documented compatibility mirror to determine which
      // OAuth scopes must be requested for each individual tool.
      _meta: { securitySchemes } },
    async (args: unknown) => {
      const missingScopes = oauth ? def.requiredScopes.filter(scope => !oauth.grantedScopes.includes(scope)) : [];
      if (oauth && missingScopes.length) {
        const challenge = oauthChallenge(oauth.resourceMetadataUrl, def.requiredScopes);
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "INSUFFICIENT_SCOPE", missingScopes } }) }],
          _meta: { "mcp/www_authenticate": [challenge] },
        };
      }
      try {
        const result = await execute(name as ToolName, args as Record<string, unknown>);
        const output = demo ? { ...result, environment: "synthetic_demo" } : result;
        return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (error) {
        const allowed = ["FORBIDDEN", "UNAUTHENTICATED", "INVALID_INPUT", "INVALID_CURSOR", "EXPIRED_CONTEXT", "RATE_LIMITED", "DRAFTS_DISABLED", "NOT_FOUND", "AUTONOMOUS_APPLY_FAILED", "WHATSAPP_TEMPLATE_REQUIRED", "LEAD_PHONE_INVALID", "WHATSAPP_CHANNEL_UNAVAILABLE", "WHATSAPP_PROVIDER_ERROR"];
        const code = error instanceof Error && allowed.includes(error.message) ? error.message : "UNAVAILABLE";
        const instructionsByCode: Record<string, string> = {
          WHATSAPP_TEMPLATE_REQUIRED: "Conversa nova na API oficial: consulte list_whatsapp_templates e tente novamente com templateName, templateLanguage e os parametros exigidos.",
          LEAD_PHONE_INVALID: "Atualize o telefone do lead para um numero valido antes de iniciar o WhatsApp.",
          WHATSAPP_CHANNEL_UNAVAILABLE: "Selecione ou configure um canal WhatsApp ativo para esta empresa.",
          WHATSAPP_PROVIDER_ERROR: "O provedor recusou ou nao concluiu o envio. Nao repita automaticamente; revise canal, template e parametros para evitar duplicidade.",
        };
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code }, instructions: instructionsByCode[code] || "Nao solicite credenciais pelo chat; confira a configuracao local e as permissoes." }) }] };
      }
    });
  }
  return server;
}

export function liveExecutor(): Execute {
  const base = new URL(process.env.ALTUM_MCP_BASE_URL || "http://127.0.0.1:3000");
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
      (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)))) throw new Error("Invalid MCP origin");
  const tokenFile = process.env.ALTUM_MCP_TOKEN_FILE;
  if (!tokenFile) throw new Error("ALTUM_MCP_TOKEN_FILE is required. Never paste tokens in the chat.");
  return async (tool, args) => {
    // Re-read each time: an authenticated local session may refresh this short-lived token.
    const token = (await readFile(tokenFile, "utf8")).trim();
    if (!token || token.length > 8192 || /\s/.test(token)) throw new Error("UNAUTHENTICATED");
    const response = await fetch(new URL("/api/mcp/read", base), { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ tool, arguments: args }) });
    if (!response.ok) throw new Error(({ 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 400: "INVALID_INPUT", 429: "RATE_LIMITED" } as Record<number, string>)[response.status] || "UNAVAILABLE");
    return await response.json() as Record<string, unknown>;
  };
}

async function main() {
  const demo = process.argv.includes("--demo");
  let execute: Execute;
  if (demo) {
    const { createDemo } = await import("./demo-fixture.ts");
    const fixture = createDemo();
    execute = (tool, args) => fixture.service.execute(fixture.userId, { tool, arguments: args });
  } else execute = liveExecutor();
  await createServer(execute, demo).connect(new StdioServerTransport());
}
// Separate entry point keeps imports side-effect-free for tests.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mcp/server.ts")) {
  main().catch(() => { console.error("Altum MCP could not start. Check local configuration; credentials are never printed."); process.exitCode = 1; });
}
