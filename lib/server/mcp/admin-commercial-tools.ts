import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CommandCenter } from "@/lib/server/command-center/service";
import { commandPorts } from "@/lib/server/command-center/repository";
import { CommandError } from "@/lib/server/command-center/security";
import { tools, type Grant, type ToolName } from "@/lib/mcp/contracts";

type CommercialActor = { userId: string; scopes: readonly string[]; grants: Grant[] };

function mcpResponse(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

/**
 * Reuses the established commercial CommandCenter contracts. Every tool still
 * validates its tenant context and produces reviewable drafts for writes.
 */
export function registerAdminCommercialTools(server: McpServer, actor: CommercialActor) {
  const secret = process.env.MCP_CONTEXT_SECRET || "";
  const center = secret.length >= 32 ? new CommandCenter(commandPorts, actor.grants, secret) : null;
  for (const [name, definition] of Object.entries(tools)) {
    const toolName = name as ToolName;
    (server.registerTool as (toolName: string, config: Record<string, unknown>, callback: (input: unknown) => Promise<unknown>) => void)(`altum_${toolName}`, {
      description: definition.risk === "READ" ? definition.description : `${definition.description} A Altum prepara um rascunho revisável; não executa ação externa sem a confirmação aplicável.`,
      inputSchema: definition.schema,
      annotations: { readOnlyHint: definition.risk === "READ", destructiveHint: false, idempotentHint: definition.risk === "READ", openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [...definition.requiredScopes] }] },
    }, async (input) => {
      const missing = definition.requiredScopes.filter((scope) => !actor.scopes.includes(scope));
      if (missing.length) return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "INSUFFICIENT_SCOPE", missingScopes: missing } }) }] };
      if (!center) return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "UNAVAILABLE", detail: "O contexto comercial ainda não está configurado no ambiente da Altum." } }) }] };
      try { return mcpResponse(await center.execute(actor.userId, { tool: toolName, arguments: input as Record<string, unknown> })); }
      catch (error) {
        const code = error instanceof CommandError ? error.code : "UNAVAILABLE";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code } }) }] };
      }
    });
  }
}
