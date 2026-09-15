import test from "node:test";
import assert from "node:assert/strict";
import { CLIENT_ACCESS_PROFILES, getClientAccessProfile, inferClientAccessProfile } from "../lib/client-access-profiles.ts";
import { getClientRouteAccessRule } from "../lib/client-route-access.ts";

test("perfis operacionais separam gestor, vendedor e atendimento", () => {
  const manager = getClientAccessProfile("manager");
  const seller = getClientAccessProfile("seller");
  const support = getClientAccessProfile("support");

  assert.equal(manager.capabilities.includes("view_team_records"), true);
  assert.equal(seller.capabilities.includes("view_team_records"), false);
  assert.equal(support.capabilities.includes("respond_inbox"), true);
  assert.equal(support.capabilities.includes("manage_commercial"), false);
  assert.equal(new Set(CLIENT_ACCESS_PROFILES.map((profile) => profile.id)).size, CLIENT_ACCESS_PROFILES.length);
});

test("perfil legado e inferido sem migracao obrigatoria", () => {
  assert.equal(inferClientAccessProfile({ role: "client_admin" }).id, "admin");
  assert.equal(inferClientAccessProfile({ role: "client_agent", capabilities: ["view_team_records"] }).id, "manager");
  assert.equal(inferClientAccessProfile({ role: "client_agent", capabilities: ["respond_inbox"] }).id, "support");
  assert.equal(inferClientAccessProfile({ role: "client_viewer", capabilities: ["view_metrics"] }).id, "analyst");
});

test("rotas administrativas exigem capacidade explicita", () => {
  assert.equal(getClientRouteAccessRule("/cliente/painel/configuracoes/usuarios")?.capability, "manage_users");
  assert.equal(getClientRouteAccessRule("/cliente/painel/configuracoes/canais")?.capability, "manage_channels");
  assert.equal(getClientRouteAccessRule("/cliente/painel/ia")?.capability, "manage_ai");
  assert.equal(getClientRouteAccessRule("/cliente/painel/inbox"), null);
});
