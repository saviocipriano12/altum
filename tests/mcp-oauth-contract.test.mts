import assert from "node:assert/strict";
import test from "node:test";
import { isChatGptClientMetadataUrl, isChatGptOAuthRedirect, parseMcpOAuthScopes } from "../lib/mcp/oauth-contract.ts";

test("client MCP OAuth scopes fail closed and keep full access explicit", () => {
  for (const value of ["", "unknown", "offline_access", "crm:write", "context:read root:all"]) {
    assert.throws(() => parseMcpOAuthScopes(value));
  }
  assert.deepEqual(parseMcpOAuthScopes("context:read crm:read crm:write offline_access"), {
    scopes: ["context:read", "crm:read", "crm:write"],
    offline: true,
  });
  const defaults = parseMcpOAuthScopes(undefined, true);
  assert.equal(defaults.offline, true);
  assert.ok(defaults.scopes.includes("context:read"));
  assert.ok(defaults.scopes.includes("settings:write"));
});

test("client MCP accepts only exact ChatGPT metadata and callback URLs", () => {
  assert.equal(isChatGptClientMetadataUrl("https://chatgpt.com/oauth/client.json"), true);
  assert.equal(isChatGptClientMetadataUrl("https://chatgpt.com/oauth/connector_123/client.json"), true);
  assert.equal(isChatGptOAuthRedirect("https://chatgpt.com/connector_platform_oauth_redirect"), true);
  assert.equal(isChatGptOAuthRedirect("https://chatgpt.com/connector/oauth/connector_123"), true);
  for (const value of ["http://chatgpt.com/oauth/client.json", "https://chatgpt.com.evil.test/oauth/client.json", "https://chatgpt.com/oauth/client.json?next=evil"]) {
    assert.equal(isChatGptClientMetadataUrl(value), false);
  }
  for (const value of ["https://evil.test/callback", "https://chatgpt.com/other", "https://chatgpt.com/connector_platform_oauth_redirect?next=evil"]) {
    assert.equal(isChatGptOAuthRedirect(value), false);
  }
});
