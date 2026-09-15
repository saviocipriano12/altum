import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { tools, instructions, type ToolName } from "../../lib/mcp/contracts.ts";

type Execute = (tool: ToolName, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
export function createServer(execute: Execute, demo = false) {
  const server = new McpServer({ name: demo ? "altum-demo-synthetic" : "altum-readonly", version: "0.1.0" },
    { instructions: demo ? `DEMONSTRAÃ‡ÃƒO FICTÃCIA; nÃ£o sÃ£o dados reais. ${instructions}` : instructions });
  for (const [name, def] of Object.entries(tools)) {
    const isRead = def.risk === "READ";
    server.registerTool(name, { description: def.description, inputSchema: def.schema,
      annotations: { readOnlyHint: isRead, destructiveHint: false, idempotentHint: isRead, openWorldHint: false } },
    async (args: unknown) => {
      try {
        const result = await execute(name as ToolName, args as Record<string, unknown>);
        const output = demo ? { ...result, environment: "synthetic_demo" } : result;
        return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (error) {
        const allowed = ["FORBIDDEN", "UNAUTHENTICATED", "INVALID_INPUT", "INVALID_CURSOR", "EXPIRED_CONTEXT", "RATE_LIMITED", "DRAFTS_DISABLED"];
        const code = error instanceof Error && allowed.includes(error.message) ? error.message : "UNAVAILABLE";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code }, instructions: "NÃ£o solicite credenciais pelo chat; confira a configuraÃ§Ã£o local e as permissÃµes." }) }] };
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
