import test from "node:test";
import assert from "node:assert/strict";
import { CLIENT_ACCESS_PROFILES, getClientAccessProfile, inferClientAccessProfile } from "../lib/client-access-profiles.ts";
import { getClientRouteAccessRule } from "../lib/client-route-access.ts";
import { canAccessAssignedCommercialRecord, canManagePersonalChannel } from "../lib/commercial-record-access.ts";
import type { TenantMembership } from "../lib/server/tenant.ts";

test("vendedor acessa seu número pessoal e somente contatos atribuídos no número compartilhado", () => {
  const seller = { role: "client_agent", capabilities: getClientAccessProfile("seller").capabilities } as TenantMembership;
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", { channelScope: "personal", channelOwnerUserId: "seller-a" }), true);
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", { channelScope: "personal", channelOwnerUserId: "seller-b", assignedTo: "seller-b" }), false);
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", { channelScope: "shared", assignedTo: "seller-a" }), true);
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", { channelScope: "shared", assignedTo: "seller-b" }), false);
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", { channelScope: "shared" }), false);
});

test("gestor vê a equipe e uma transferência revoga o acesso do antigo vendedor", () => {
  const manager = { role: "client_agent", capabilities: getClientAccessProfile("manager").capabilities } as TenantMembership;
  const seller = { role: "client_agent", capabilities: getClientAccessProfile("seller").capabilities } as TenantMembership;
  const chat = { channelScope: "shared", assignedTo: "seller-a" };
  assert.equal(canAccessAssignedCommercialRecord(manager, "manager", chat), true);
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", chat), true);
  chat.assignedTo = "seller-b";
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-a", chat), false);
  assert.equal(canAccessAssignedCommercialRecord(seller, "seller-b", chat), true);
});

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

test("vendedor pode administrar somente seu canal pessoal", () => {
  const seller = { role: "client_agent", capabilities: getClientAccessProfile("seller").capabilities } as TenantMembership;
  assert.equal(canManagePersonalChannel(seller, "seller-a", { channelScope: "personal", ownerUserId: "seller-a" }), true);
  assert.equal(canManagePersonalChannel(seller, "seller-a", { channelScope: "personal", ownerUserId: "seller-b" }), false);
  assert.equal(canManagePersonalChannel(seller, "seller-a", { channelScope: "shared", ownerUserId: "seller-a" }), false);
  assert.equal(getClientRouteAccessRule("/cliente/painel/configuracoes/meu-whatsapp")?.capability, "manage_personal_channel");
});
