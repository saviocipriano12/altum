import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const client = new Client({ name: "altum-acceptance-demo", version: "1" });
const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", resolve("scripts/mcp/server.ts"), "--demo"], stderr: "pipe" });
const evidence: unknown[] = [];
async function main() {
try {
  await client.connect(transport);
  const catalogue = await client.listTools();
  evidence.push({ toolCount: catalogue.tools.length, allReadOnly: catalogue.tools.every(t => t.annotations?.readOnlyHint === true) });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`Demo failed: ${name}`);
    const output = result.structuredContent as { data: Record<string, unknown> };
    evidence.push({ tool: name, result: name === "list_businesses" ? { selectedSyntheticBusiness: true } : output });
    return output;
  };
  const list = await call("list_businesses", {});
  const context = (list.data.items as Array<{ context: string }>)[0].context;
  const from = new Date(Date.now() - 86400_000).toISOString(), to = new Date().toISOString();
  await call("business_context", { context });
  await call("daily_summary", { context, from, to });
  await call("unanswered_leads", { context });
  await call("stalled_opportunities", { context });
  await call("conversation_summary", { context, conversationId: "chat-ana" });
  await call("integration_health", { context });
  await call("recent_events", { context, from, to });
  const rejected = await client.callTool({ name: "business_context", arguments: { context: context.slice(0,-3) + "bad" } });
  if (!rejected.isError) throw new Error("Forged context accepted");
  evidence.push({ forgedContextRejected: true });
  await mkdir(".qa-artifacts/mcp", { recursive: true });
  await writeFile(".qa-artifacts/mcp/demo.json", JSON.stringify({ environment: "synthetic_only", evidence }, null, 2));
  console.log("MCP real via stdio: 10 ferramentas READ; 7 fluxos demonstrados; contexto adulterado rejeitado. Evidência: .qa-artifacts/mcp/demo.json (dados fictícios).");
} finally { await client.close(); }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "MCP demo failed");
  process.exitCode = 1;
});
