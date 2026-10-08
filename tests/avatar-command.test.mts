import test from "node:test";
import assert from "node:assert/strict";
import { isAvatarRightsConfirmation, parseAvatarCommand } from "../lib/server/agent-os/avatar-command.ts";

test("avatar pessoal exige confirmação explícita de direitos", () => {
  const pending = parseAvatarCommand("Quero criar um avatar chamado Savio");
  assert.equal(pending?.identityType, "person");
  assert.equal(pending?.rightsConfirmed, false);
  const confirmed = parseAvatarCommand("Crie um avatar chamado Savio, confirmo que tenho direito de imagem e voz");
  assert.equal(confirmed?.rightsConfirmed, true);
});

test("personagem original aceita confirmação de direitos autorais", () => {
  const result = parseAvatarCommand("Crie um personagem chamado Luna, confirmo que tenho direitos e o personagem é meu");
  assert.equal(result?.identityType, "character");
  assert.equal(result?.rightsConfirmed, true);
});

test("confirmação contextual não aceita negativa", () => {
  assert.equal(isAvatarRightsConfirmation("Confirmo, pode continuar."), true);
  assert.equal(isAvatarRightsConfirmation("Tenho os direitos de imagem e voz."), true);
  assert.equal(isAvatarRightsConfirmation("Não confirmo os direitos."), false);
});
