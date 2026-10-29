import { createHash } from "node:crypto";
import { EVALUATION_CANDIDATE } from "./budget.mts";
import { developmentCorpus, corpusCaseHash } from "./corpus.mts";
import { openMissionSpend } from "./mission-spend.mts";
import type { EvaluationSpendLedger } from "./spend-ledger.mts";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MAX_OUTPUT = 1500;
const MODEL_CONTEXT_LIMIT = 1_047_576;
export const MAX_CALL_RESERVATION_MICROUSD = Math.ceil(MODEL_CONTEXT_LIMIT * EVALUATION_CANDIDATE.inputUsdPerMillion + MAX_OUTPUT * EVALUATION_CANDIDATE.outputUsdPerMillion);
type Message = { role: "system" | "user" | "assistant"; content: string };
export type PaidEvaluationCall = { callId: string; caseId: string; caseHash: string; syntheticData: true; messages: Message[] };
function buildRequest(input: PaidEvaluationCall) {
  const scenario = developmentCorpus().find(item => item.scenario.id === input.caseId);
  if (input.syntheticData !== true || !scenario || corpusCaseHash(scenario) !== input.caseHash) throw new Error("Somente cenario ficticio de desenvolvimento na revisao autorizada.");
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 100 || input.messages.some(message =>
    !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string")) throw new Error("Mensagens de teste invalidas.");
  const body = { model: EVALUATION_CANDIDATE.model, messages: input.messages, temperature: 0.25,
    response_format: { type: "json_object" }, max_completion_tokens: MAX_OUTPUT, n: 1, stream: false,
    service_tier: "default", store: false };
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > 250_000) throw new Error("Contexto do lote excede limite local de teste.");
  return serialized;
}
/** Injectable transport/ledger only for isolated contract tests. No retry path. */
export async function executeBudgetedEvaluationCall(input: PaidEvaluationCall, dependencies: {
  ledger: EvaluationSpendLedger; transport: typeof fetch; apiKey: string;
}) {
  if (!dependencies.apiKey.trim()) throw new Error("Chave de API indisponivel; nenhuma reserva ou chamada feita.");
  const body = buildRequest(input);
  const fingerprint = createHash("sha256").update(JSON.stringify([input.caseId, input.caseHash, body])).digest("hex");
  dependencies.ledger.reserve({ callId: input.callId, fingerprint, maximumMicrousd: MAX_CALL_RESERVATION_MICROUSD });
  try {
    const response = await dependencies.transport(ENDPOINT, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${dependencies.apiKey}`, "Content-Type": "application/json" }, body });
    // Never print provider error bodies: they may contain request/account data.
    if (!response.ok) throw new Error(`Modelo respondeu HTTP ${response.status}; reserva conservada para conciliacao.`);
    const data = await response.json();
    const promptTokens = data.usage?.prompt_tokens, completionTokens = data.usage?.completion_tokens;
    if (typeof data.id !== "string" || !/^[-a-zA-Z0-9_.:]{1,200}$/.test(data.id) ||
      !Number.isSafeInteger(promptTokens) || promptTokens < 1 || promptTokens > MODEL_CONTEXT_LIMIT ||
      !Number.isSafeInteger(completionTokens) || completionTokens < 0 || completionTokens > MAX_OUTPUT ||
      data.model !== EVALUATION_CANDIDATE.model || (data.service_tier && data.service_tier !== "default")) throw new Error("Recibo de modelo/uso invalido; reserva conservada.");
    // Cached tokens are charged at the full uncached rate for conservative
    // accounting. All reported output tokens count, not visible prose length.
    const chargedUpperBoundMicrousd = Math.ceil(promptTokens * EVALUATION_CANDIDATE.inputUsdPerMillion + completionTokens * EVALUATION_CANDIDATE.outputUsdPerMillion);
    const balance = dependencies.ledger.settle({ callId: input.callId, actualMicrousd: chargedUpperBoundMicrousd, receiptId: data.id });
    if (balance.frozenReason) throw new Error("Custo inesperado; chamadas adicionais bloqueadas.");
    return { data, receipt: { callId: input.callId, providerReceiptId: data.id, model: data.model, promptTokens, completionTokens,
      chargedUpperBoundMicrousd, accounting: "uncached_standard_upper_bound_not_invoice" }, balance };
  } catch (error) {
    dependencies.ledger.markUncertain(input.callId);
    throw error;
  }
}
/** Real entry point always uses the ONE mission ledger; no path/cap/model override. */
export async function callMissionEvaluationModel(input: PaidEvaluationCall, apiKey: string, transport: typeof fetch) {
  if (EVALUATION_CANDIDATE.checkedOn !== new Date().toISOString().slice(0, 10)) throw new Error("Rever tarifa e modelo antes de nova chamada paga.");
  const ledger = openMissionSpend();
  try { return await executeBudgetedEvaluationCall(input, { ledger, apiKey, transport }); }
  finally { ledger.close(); }
}
