import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAiConfig } from "../lib/server/ai/agent.ts";

test("AI settings route persists every customer-facing runtime control", async () => {
  const routeSource = await readFile(new URL("../app/api/tenant/[tenantId]/settings/ai/route.ts", import.meta.url), "utf8");

  for (const field of [
    "enabled",
    "responsePaused",
    "commercialBrain",
    "responsiblePhone",
    "handoffNotifyEnabled",
    "handoffNotifyPhones",
    "voiceReplyEnabled",
    "voiceReplyMode",
    "whatsappTemplateFollowUpEnabled",
    "operatingProfile",
    "rollout",
  ]) {
    assert.match(routeSource, new RegExp(`\\b${field}\\s*:`));
  }
});

test("runtime receives settings that govern safety, voice, provider, limits and rollout", () => {
  const config = parseAiConfig({
    businessProfileId: "generic",
    ai: {
      enabled: true,
      responsePaused: false,
      agentName: "Lia",
      assistantRole: "consultant",
      businessSummary: "Consultoria comercial.",
      objective: "Qualificar com responsabilidade.",
      commercialBrain: {
        handoffCriteria: "Escalar proposta, desconto e contrato.",
        forbiddenSalesMoves: "Nunca prometer desconto sem aprovacao.",
      },
      responsiblePhone: "5511999999999",
      handoffNotifyEnabled: true,
      handoffNotifyPhones: ["5511888888888"],
      voiceReplyEnabled: true,
      voiceReplyVoice: "marin",
      voiceReplyMode: "audio_only",
      voiceReplyMaxChars: 700,
      guardrails: ["Nunca inventar preco."],
      mandatoryQuestions: ["Qual e seu objetivo?"],
      escalationTopics: ["cancelamento"],
      whatsappTemplateFollowUpEnabled: true,
      whatsappTemplateFollowUpName: "follow_up_geral",
      whatsappTemplateFollowUpLanguage: "pt_BR",
      operatingProfile: {
        tier: "premium",
        autonomyMode: "hybrid",
        reasoningLevel: "deep",
        responseStyle: "consultative",
        allowPremiumModels: false,
        preferredProviders: ["openai", "altum_rules"],
        conversationModelOverride: "gpt-5.4",
        monthlyBudgetUsd: 250,
        monthlyUsageCap: 1800,
      },
      rollout: { mode: "shadow", rolloutPercent: 30, agentVersion: "conversation-v3" },
    },
  } as Parameters<typeof parseAiConfig>[0]);

  assert.equal(config.agentName, "Lia");
  assert.equal(config.responsiblePhone, "5511999999999");
  assert.deepEqual(config.handoffNotifyPhones, ["5511888888888"]);
  assert.equal(config.voiceReplyMode, "audio_only");
  assert.equal(config.voiceReplyMaxChars, 700);
  assert.ok(config.guardrails.includes("Nunca inventar preco."));
  assert.ok(config.escalationTopics.includes("proposta"));
  assert.equal(config.runtimePolicy.conversationModel, "gpt-4.1-mini");
  assert.equal(config.runtimePolicy.modelGuardrailReason, "premium_models_disabled");
  assert.equal(config.monthlyBudgetUsd, 250);
  assert.equal(config.monthlyUsageCap, 1800);
  assert.deepEqual(config.rollout, { mode: "shadow", rolloutPercent: 30, agentVersion: "conversation-v3" });
});
