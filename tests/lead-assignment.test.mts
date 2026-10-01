import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { balanceLeadAssignments, eligibleLeadSellers, randomLeadAssignments } from "../lib/lead-assignment.ts";

test("lead assignment accepts only active seller profiles", () => {
  const sellers = eligibleLeadSellers([
    { userId: "owner", name: "Dono", role: "client_owner", status: "active" },
    { userId: "manager", name: "Gestor", role: "client_agent", accessProfile: "manager", status: "active" },
    { userId: "seller-a", name: "Ana", role: "client_agent", accessProfile: "seller", status: "active" },
    { userId: "seller-b", name: "Bia", role: "client_agent", accessProfile: "seller", status: "blocked" },
    { userId: "support", name: "Atendimento", role: "client_agent", accessProfile: "support", status: "active" },
  ]);

  assert.deepEqual(sellers.map(({ userId, name }) => ({ userId, name })), [{ userId: "seller-a", name: "Ana" }]);
});

test("balanced assignment fills the smallest seller portfolio first", () => {
  const result = balanceLeadAssignments({
    leadIds: ["lead-1", "lead-2", "lead-3", "lead-4"],
    sellers: [
      { userId: "seller-a", name: "Ana" },
      { userId: "seller-b", name: "Bia" },
    ],
    currentLoads: new Map([["seller-a", 3], ["seller-b", 1]]),
  });

  assert.deepEqual(result.map((item) => item.userId), ["seller-b", "seller-b", "seller-a", "seller-b"]);
});

test("automatic assignment respects schedule, capacity, team and online preference", () => {
  const result = balanceLeadAssignments({
    leadIds: ["lead-1", "lead-2", "lead-3"],
    sellers: [
      { userId: "offline", name: "Offline", availability: "offline", teamId: "a" },
      { userId: "full", name: "Lotado", maxOpenChats: 1, teamId: "a" },
      { userId: "away", name: "Ausente", presenceState: "away", teamId: "a" },
      { userId: "online", name: "Online", presenceState: "online", teamId: "a", maxOpenChats: 2 },
      { userId: "other-team", name: "Outro time", presenceState: "online", teamId: "b" },
    ],
    currentLoads: new Map([["full", 1]]),
    teamId: "a",
  });

  assert.deepEqual(result.map((item) => item.userId), ["online", "away", "online"]);
});

test("random assignment remains optional and never bypasses eligibility", () => {
  const result = randomLeadAssignments({
    leadIds: ["lead-1", "lead-2"],
    sellers: [
      { userId: "offline", name: "Offline", availability: "offline" },
      { userId: "seller-a", name: "Ana", maxOpenChats: 1 },
      { userId: "seller-b", name: "Bia" },
    ],
    currentLoads: new Map(),
    random: () => 0,
  });

  assert.deepEqual(result.map((item) => item.userId), ["seller-a", "seller-b"]);
});

test("lead distribution supports explicit assignment and keeps linked records aligned", () => {
  const route = readFileSync(
    resolve(process.cwd(), "app/api/tenant/[tenantId]/leads/distribute/route.ts"),
    "utf8"
  );
  assert.match(route, /mode === "specific"/);
  assert.match(route, /Escolha um vendedor ativo/);
  assert.match(route, /collection\("appointments"\)/);
  assert.match(route, /collection\("orcamentos"\)/);
  assert.match(route, /collection\("financeiro"\)/);
  assert.match(route, /relatedRecordsUpdated/);
  assert.match(route, /type: "lead_assignment"/);
  assert.match(route, /previousAssignments/);

  const undoRoute = readFileSync(
    resolve(process.cwd(), "app/api/tenant/[tenantId]/leads/distribute/[auditId]/undo/route.ts"),
    "utf8"
  );
  assert.match(undoRoute, /15 \* 60_000/);
  assert.match(undoRoute, /assignment_changed_after_distribution/);
  assert.match(undoRoute, /lead_assignment_undo/);
  assert.match(undoRoute, /restoredLeadIds/);
});
