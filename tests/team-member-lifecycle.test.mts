import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnershipTransferPatch, buildPersonalChannelTransferPatch, recordBelongsToUser } from "../lib/team-member-lifecycle.ts";

test("desligamento reconhece todos os campos legados de responsável", () => {
  assert.equal(recordBelongsToUser({ assignedTo: "seller-a" }, "seller-a"), true);
  assert.equal(recordBelongsToUser({ responsavelId: "seller-a" }, "seller-a"), true);
  assert.equal(recordBelongsToUser({ ownerId: "seller-b" }, "seller-a"), false);
});

test("transferência troca somente os campos que pertenciam ao vendedor desligado", () => {
  assert.deepEqual(
    buildOwnershipTransferPatch({ ownerId: "seller-a", assignedTo: "seller-b", ownerName: "Ana" }, "seller-a", { userId: "seller-c", name: "Carla" }),
    { ownerId: "seller-c", ownerName: "Carla" }
  );
});

test("WhatsApp pessoal pode ser transferido ou convertido em canal compartilhado", () => {
  const channel = { channelScope: "personal", ownerUserId: "seller-a" };
  assert.deepEqual(buildPersonalChannelTransferPatch(channel, "seller-a", { userId: "seller-b", name: "Bruno" }), {
    channelScope: "personal", ownerUserId: "seller-b", ownerUserName: "Bruno", distributionEnabled: false,
  });
  assert.deepEqual(buildPersonalChannelTransferPatch(channel, "seller-a", null), {
    channelScope: "shared", ownerUserId: null, ownerUserName: null, distributionEnabled: true,
  });
});
