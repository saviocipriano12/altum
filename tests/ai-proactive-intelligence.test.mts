import assert from "node:assert/strict";
import test from "node:test";
import { generateAiProactiveRecommendation, resolveAiProactiveTransition, summarizeAiProactiveRecommendations } from "../lib/ai-proactive-intelligence.ts";
import { isAiProactiveQuietHours } from "../lib/server/ai/proactive-processor.ts";

const now = Date.UTC(2026, 9, 12, 12);
const base = { tenantId: "tenant-a", leadId: "lead-1", nowMs: now, lastInteractionAtMs: now - 48 * 3_600_000, score: 80 };

test("prioriza handoff, compromisso, retencao e oportunidade com regras explicaveis", () => {
  const handoff = generateAiProactiveRecommendation({ ...base, pendingHandoff: true, overdueTasks: 2 });
  assert.equal(handoff?.kind, "human_takeover");
  assert.equal(handoff?.priority, "urgent");
  assert.equal(handoff?.actionMode, "human_review");
  const overdue = generateAiProactiveRecommendation({ ...base, overdueTasks: 2 });
  assert.equal(overdue?.kind, "overdue_commitment");
  const incident = generateAiProactiveRecommendation({ ...base, unresolvedIncident: true });
  assert.equal(incident?.kind, "retention_recovery");
  const hot = generateAiProactiveRecommendation(base);
  assert.equal(hot?.kind, "hot_lead_recovery");
  assert.ok(hot?.evidence.some((item) => item.key === "lead_score"));
});

test("proposta e agenda geram recomendacao, nunca envio automatico", () => {
  const appointment = generateAiProactiveRecommendation({ ...base, score: 10, lastInteractionAtMs: now, appointmentAtMs: now + 8 * 3_600_000 });
  assert.equal(appointment?.suggestedAction, "confirm_appointment");
  assert.equal(appointment?.actionMode, "human_review");
  const proposal = generateAiProactiveRecommendation({ ...base, score: 10, proposalPending: true });
  assert.equal(proposal?.kind, "proposal_followup");
});

test("consentimento, opt-out, fadiga, duplicidade e horario silencioso suprimem acao", () => {
  const item = generateAiProactiveRecommendation({ ...base, consentAllowed: false, doNotContact: true, recentOutboundCount72h: 3, openRecommendationCount: 1, quietHours: true });
  assert.equal(item?.status, "suppressed");
  assert.deepEqual(item?.suppressions, ["do_not_contact", "consent_denied", "contact_fatigue", "open_recommendation_exists", "quiet_hours"]);
});

test("lead encerrado ou sem sinal relevante nao produz recomendacao", () => {
  assert.equal(generateAiProactiveRecommendation({ ...base, leadStatus: "won" }), null);
  assert.equal(generateAiProactiveRecommendation({ ...base, score: 20, lastInteractionAtMs: now }), null);
});

test("fingerprint e deterministico, isolado por tenant e resumo oculta suprimidos", () => {
  const first = generateAiProactiveRecommendation(base)!;
  const replay = generateAiProactiveRecommendation(base)!;
  const other = generateAiProactiveRecommendation({ ...base, tenantId: "tenant-b" })!;
  const suppressed = generateAiProactiveRecommendation({ ...base, quietHours: true })!;
  assert.equal(first.fingerprint, replay.fingerprint);
  assert.notEqual(first.fingerprint, other.fingerprint);
  const summary = summarizeAiProactiveRecommendations([suppressed, first]);
  assert.equal(summary.actionable, 1);
  assert.equal(summary.suppressed, 1);
  assert.deepEqual(summary.items.map((item) => item.fingerprint), [first.fingerprint]);
});

test("ciclo de revisao impede pular aceite ou reabrir item terminal", () => {
  assert.deepEqual(resolveAiProactiveTransition("suggested", "accept"), { allowed: true, nextStatus: "accepted" });
  assert.deepEqual(resolveAiProactiveTransition("accepted", "complete"), { allowed: true, nextStatus: "completed" });
  assert.equal(resolveAiProactiveTransition("suggested", "complete").allowed, false);
  assert.equal(resolveAiProactiveTransition("suppressed", "accept").allowed, false);
  assert.equal(resolveAiProactiveTransition("completed", "accept").allowed, false);
});

test("horario silencioso respeita timezone do tenant e janela que cruza meia-noite", () => {
  assert.equal(isAiProactiveQuietHours({ nowMs: Date.UTC(2026, 9, 12, 2), timeZone: "America/Sao_Paulo", startHour: 20, endHour: 8 }), true);
  assert.equal(isAiProactiveQuietHours({ nowMs: Date.UTC(2026, 9, 12, 15), timeZone: "America/Sao_Paulo", startHour: 20, endHour: 8 }), false);
  assert.equal(isAiProactiveQuietHours({ nowMs: Date.UTC(2026, 9, 12, 15), timeZone: "timezone-invalido", startHour: 20, endHour: 8 }), false);
});
