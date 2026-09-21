import test from "node:test";
import assert from "node:assert/strict";
import { adminConsentSchema, strictAdminScopes, isChatGptMetadataUrl, isChatGptRedirect, adminMcpMetadata } from "../lib/admin-mcp.ts";
import { createDemo } from "../scripts/mcp/demo-fixture.ts";
test("admin MCP scope parser fails closed instead of granting all scopes", () => {
  for (const value of [undefined, "", "unknown", "context:read admin:write", "offline_access", "marketing:read"]) assert.throws(() => strictAdminScopes(value));
  assert.deepEqual(strictAdminScopes("context:read marketing:read context:read offline_access"), { scopes: ["context:read", "marketing:read"], offline: true });
});
test("admin MCP consent has explicit, unique and bounded company grants", () => {
  const good = { tenantIds: ["t1", "t2"], scopes: ["context:read"] };
  assert.equal(adminConsentSchema.safeParse(good).success, true);
  for (const tenantIds of [[], ["t1", "t1"], ["../../other"], Array.from({ length: 21 }, (_, index) => `t${index}`)]) assert.equal(adminConsentSchema.safeParse({ ...good, tenantIds }).success, false);
  assert.equal(adminConsentSchema.safeParse({ ...good, scopes: ["marketing:read"] }).success, false);
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
