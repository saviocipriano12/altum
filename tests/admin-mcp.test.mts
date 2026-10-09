import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminConsentSchema, strictAdminScopes, isChatGptMetadataUrl, isChatGptRedirect, isOpenAiAdminRedirect, isCodexChatGptHostedRedirect, adminMcpMetadata } from "../lib/admin-mcp.ts";
import { scopes } from "../lib/mcp/contracts.ts";
import { createDemo } from "../scripts/mcp/demo-fixture.ts";
test("admin MCP scope parser fails closed instead of granting all scopes", () => {
  for (const value of [undefined, "", "unknown", "context:read admin:write", "offline_access", "marketing:read"]) assert.throws(() => strictAdminScopes(value));
  assert.deepEqual(strictAdminScopes("context:read marketing:read context:read offline_access"), { scopes: ["context:read", "marketing:read"], offline: true });
});
test("admin MCP consent is platform-only and requires an explicit base scope", () => {
  const good = { scopes: ["context:read"] };
  assert.equal(adminConsentSchema.safeParse(good).success, true);
  assert.equal(adminConsentSchema.safeParse({ ...good, tenantIds: ["t1"] }).success, false);
  assert.equal(adminConsentSchema.safeParse({ ...good, scopes: ["marketing:read"] }).success, false);
  assert.deepEqual(adminConsentSchema.parse({ scopes: [...scopes] }).scopes, [...scopes]);
});

test("admin commercial bridge preserves the established CommandCenter boundary", () => {
  const source = readFileSync("lib/server/mcp/admin-commercial-tools.ts", "utf8");
  assert.match(source, /new CommandCenter\(commandPorts, actor\.grants, secret\)/);
  assert.match(source, /A Altum prepara um rascunho revisável/);
  assert.match(source, /definition\.requiredScopes/);
});
test("CIMD metadata lookup accepts only exact ChatGPT host and document paths", () => {
  assert.equal(isChatGptMetadataUrl("https://chatgpt.com/oauth/client.json"), true);
  assert.equal(isChatGptMetadataUrl("https://chatgpt.com/oauth/callback_id/client.json"), true);
  for (const value of ["http://chatgpt.com/oauth/client.json", "https://chatgpt.com.evil.test/oauth/client.json", "https://chatgpt.com@evil.test/oauth/client.json", "https://127.0.0.1/oauth/client.json", "https://chatgpt.com/oauth/client.json?redirect=elsewhere"]) assert.equal(isChatGptMetadataUrl(value), false);
});
test("OAuth callback permits only verified OpenAI connector callback shapes", () => {
  assert.equal(isChatGptRedirect("https://chatgpt.com/connector_platform_oauth_redirect"), true);
  assert.equal(isChatGptRedirect("https://chatgpt.com/connector/oauth/callback_id"), true);
  for (const value of ["https://evil.test/callback", "https://chatgpt.com/connector_platform_oauth_redirect?next=evil", "https://chatgpt.com/other"]) assert.equal(isChatGptRedirect(value), false);
});
test("official Codex metadata may use only its documented loopback callback", () => {
  const codexClient = "https://chatgpt.com/oauth/codex/client.json";
  assert.equal(isOpenAiAdminRedirect(codexClient, "http://127.0.0.1/callback"), true);
  assert.equal(isOpenAiAdminRedirect(codexClient, "http://localhost/callback"), true);
  assert.equal(isOpenAiAdminRedirect(codexClient, "http://127.0.0.1:38421/callback"), true);
  assert.equal(isOpenAiAdminRedirect("https://chatgpt.com/oauth/client.json", "http://127.0.0.1/callback"), false);
  assert.equal(isOpenAiAdminRedirect(codexClient, "https://evil.test/callback"), false);
});
test("official Codex may complete OAuth through the trusted ChatGPT callback", () => {
  const codexClient = "https://chatgpt.com/oauth/codex/client.json";
  assert.equal(isCodexChatGptHostedRedirect(codexClient, "https://chatgpt.com/connector_platform_oauth_redirect"), true);
  assert.equal(isCodexChatGptHostedRedirect(codexClient, "https://evil.test/callback"), false);
  assert.equal(isCodexChatGptHostedRedirect("https://chatgpt.com/oauth/client.json", "https://chatgpt.com/connector_platform_oauth_redirect"), false);
});
test("admin OAuth issuer and endpoints are separate from per-client OAuth and advertise S256", () => {
  const metadata = adminMcpMetadata("https://altum.test"); assert.equal(metadata.issuer, "https://altum.test/api/admin/mcp"); assert.equal(metadata.authorization_response_iss_parameter_supported, true); assert.equal(metadata.client_id_metadata_document_supported, true); assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
});
test("MCP command center can draft a synced operator campaign without legacy daily snapshots", async () => {
  const f = createDemo(); f.data.campaign_snapshots = [];
  const listed = await f.service.execute(f.userId, { tool: "list_businesses", arguments: {} });
  const context = (listed.data.items as Array<{ context: string }>)[0].context;
  const result = await f.service.execute(f.userId, { tool: "draft_campaign_pause", arguments: { context, platform: "meta_ads", campaignId: "101", adAccountId: "act_987654321", reason: "Revisar campanha a partir dos dados sincronizados.", evidence: ["Relatório sincronizado e alvo observado."] } });
  assert.equal(result.data.status, "pending_review"); assert.equal((result.data.target as { channelId: string }).channelId, "channel-meta-demo");
});
