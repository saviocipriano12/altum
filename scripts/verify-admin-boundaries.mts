import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
nextEnv.loadEnvConfig(process.cwd());
// Match Next's server-runtime alias when importing route handlers outside Next.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });

// Read-only checks: no credentials, provider requests or database writes.
const origin = "http://localhost:3000";
const checks = [
  ["/api/admin/marketing/overview", () => import("../app/api/admin/marketing/overview/route.ts")],
  ["/api/admin/marketing/batch", () => import("../app/api/admin/marketing/batch/route.ts")],
  ["/api/admin/portfolio", () => import("../app/api/admin/portfolio/route.ts")],
  ["/api/admin/strategies", () => import("../app/api/admin/strategies/route.ts")],
  ["/api/admin/mcp/connections", () => import("../app/api/admin/mcp/connections/route.ts")],
  ["/api/mcp/admin", () => import("../app/api/mcp/admin/route.ts")],
] as const;
for (const [path, load] of checks) {
  const route = await load();
  const response = await route.GET(new Request(origin + path));
  assert.equal(response.status, 401, path);
  console.log(`OK 401 ${path}`);
}
const token = await import("../app/api/admin/mcp/token/route.ts");
const rejected = await token.POST(new Request(origin + "/api/admin/mcp/token", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "https://invalid.example/api/mcp/admin", grant_type: "authorization_code" }),
}));
assert.equal(rejected.status, 400);
console.log("OK 400 OAuth invalid resource");
const discovery = await import("../app/.well-known/oauth-authorization-server/api/admin/mcp/route.ts");
const metadata = await (await discovery.GET(new Request(origin + "/.well-known/oauth-authorization-server/api/admin/mcp"))).json();
assert.equal(metadata.client_id_metadata_document_supported, true);
assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
assert.ok(metadata.issuer.endsWith("/api/admin/mcp"));
console.log("OK OAuth issuer, CIMD and PKCE discovery");
