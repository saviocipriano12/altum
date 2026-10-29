import { createHash } from "node:crypto";

export const RELATIONSHIP_STATE_VERSION = 1 as const;

export type RelationshipFactStatus = "confirmed" | "hypothesis";
export type RelationshipFactSource =
  | "lead_explicit"
  | "lead_correction"
  | "model_extraction"
  | "campaign"
  | "human"
  | "system";

export type RelationshipFact = {
  key: string;
  value: string;
  status: RelationshipFactStatus;
  confidence: number;
  source: RelationshipFactSource;
  sourceMessageId: string;
  observedAtMs: number;
  expiresAtMs: number | null;
  previousValues?: Array<{ value: string; replacedAtMs: number; sourceMessageId: string }>;
};

export type RelationshipCommitment = {
  text: string;
  sourceMessageId: string;
  observedAtMs: number;
  expiresAtMs: number;
};

export type RelationshipOpenQuestion = {
  text: string;
  sourceMessageId: string;
  observedAtMs: number;
  expiresAtMs: number;
};

export type RelationshipState = {
  schemaVersion: typeof RELATIONSHIP_STATE_VERSION;
  tenantId: string;
  leadId: string;
  revision: number;
  identityKeys: string[];
  lastEventAtMs: number;
  lastSourceMessageId: string;
  facts: Record<string, RelationshipFact>;
  commitments: RelationshipCommitment[];
  openQuestions: RelationshipOpenQuestion[];
  ignoredUpdates: Array<{
    reason: "out_of_order" | "lower_confidence" | "identity_mismatch";
    key?: string;
    sourceMessageId: string;
    occurredAtMs: number;
  }>;
};

const MAX_FACTS = 36;
const STABLE_KEYS = new Set(["preferredName", "businessType", "city", "decisionMaker"]);
const MEDIUM_KEYS = new Set(["primaryGoal", "budgetBand", "digitalMaturity", "currentChannels", "teamSize", "recommendedOffer"]);
const PREFERENCE_KEYS = new Set(["preferredName", "leadTone", "responseFormatPreference", "currentChannels"]);
const ALLOWED_KEYS = new Set([
  ...STABLE_KEYS,
  ...MEDIUM_KEYS,
  ...PREFERENCE_KEYS,
  "urgency",
  "dominantIntent",
  "dominantObjection",
  "activeTopic",
  "conversationMaturity",
  "serviceInterest",
]);

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalized(value: string) {
  return clean(value, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ttlMsFor(key: string) {
  const day = 24 * 60 * 60 * 1000;
  if (STABLE_KEYS.has(key)) return 365 * day;
  if (MEDIUM_KEYS.has(key)) return 90 * day;
  return 30 * day;
}

function boundedTime(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}

function asFact(value: unknown): RelationshipFact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const key = clean(raw.key, 60);
  const factValue = clean(raw.value, 320);
  if (!key || !factValue || !ALLOWED_KEYS.has(key)) return null;
  const observedAtMs = boundedTime(raw.observedAtMs, 0);
  const expiresAtNumeric = Number(raw.expiresAtMs);
  const previousValues = Array.isArray(raw.previousValues)
    ? raw.previousValues
        .flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const previous = item as Record<string, unknown>;
          const previousValue = clean(previous.value, 320);
          return previousValue
            ? [{
                value: previousValue,
                replacedAtMs: boundedTime(previous.replacedAtMs, observedAtMs),
                sourceMessageId: clean(previous.sourceMessageId, 240),
              }]
            : [];
        })
        .slice(-3)
    : [];
  return {
    key,
    value: factValue,
    status: raw.status === "confirmed" ? "confirmed" : "hypothesis",
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    source: ["lead_explicit", "lead_correction", "model_extraction", "campaign", "human", "system"].includes(String(raw.source))
      ? raw.source as RelationshipFactSource
      : "model_extraction",
    sourceMessageId: clean(raw.sourceMessageId, 240),
    observedAtMs,
    expiresAtMs: Number.isFinite(expiresAtNumeric) && expiresAtNumeric > 0 ? expiresAtNumeric : null,
    ...(previousValues.length ? { previousValues } : {}),
  };
}

export function normalizeRelationshipState(
  value: unknown,
  identity: { tenantId: string; leadId: string },
  nowMs = Date.now()
): RelationshipState {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawFacts = raw.facts && typeof raw.facts === "object" && !Array.isArray(raw.facts)
    ? raw.facts as Record<string, unknown>
    : {};
  const facts = Object.fromEntries(
    Object.values(rawFacts)
      .map(asFact)
      .filter((fact): fact is RelationshipFact => Boolean(fact))
      .filter((fact) => fact.expiresAtMs === null || fact.expiresAtMs > nowMs)
      .sort((a, b) => b.observedAtMs - a.observedAtMs)
      .slice(0, MAX_FACTS)
      .map((fact) => [fact.key, fact])
  );
  const normalizeTimedList = <T extends "commitments" | "openQuestions">(key: T) => {
    const source = Array.isArray(raw[key]) ? raw[key] as Array<Record<string, unknown>> : [];
    return source
      .flatMap((item) => {
        const text = clean(item?.text, 280);
        const expiresAtMs = boundedTime(item?.expiresAtMs, 0);
        if (!text || expiresAtMs <= nowMs) return [];
        return [{
          text,
          sourceMessageId: clean(item?.sourceMessageId, 240),
          observedAtMs: boundedTime(item?.observedAtMs, 0),
          expiresAtMs,
        }];
      })
      .sort((a, b) => b.observedAtMs - a.observedAtMs)
      .slice(0, key === "commitments" ? 8 : 5);
  };

  return {
    schemaVersion: RELATIONSHIP_STATE_VERSION,
    tenantId: identity.tenantId,
    leadId: identity.leadId,
    revision: Math.max(0, Math.round(Number(raw.revision) || 0)),
    identityKeys: Array.isArray(raw.identityKeys)
      ? Array.from(new Set(raw.identityKeys.map((item) => clean(item, 96)).filter(Boolean))).slice(0, 8)
      : [],
    lastEventAtMs: boundedTime(raw.lastEventAtMs, 0),
    lastSourceMessageId: clean(raw.lastSourceMessageId, 180),
    facts,
    commitments: normalizeTimedList("commitments") as RelationshipCommitment[],
    openQuestions: normalizeTimedList("openQuestions") as RelationshipOpenQuestion[],
    ignoredUpdates: Array.isArray(raw.ignoredUpdates)
      ? raw.ignoredUpdates
          .flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return [];
            const entry = item as Record<string, unknown>;
            const reason = String(entry.reason);
            if (!(["out_of_order", "lower_confidence", "identity_mismatch"] as const).includes(reason as "out_of_order")) return [];
            const optionalKey = clean(entry.key, 60);
            return [{
              reason: reason as RelationshipState["ignoredUpdates"][number]["reason"],
              ...(optionalKey ? { key: optionalKey } : {}),
              sourceMessageId: clean(entry.sourceMessageId, 240),
              occurredAtMs: boundedTime(entry.occurredAtMs, 0),
            }];
          })
          .slice(-12)
      : [],
  };
}

export function buildRelationshipIdentityKey(input: {
  tenantId: string;
  kind: "phone" | "email" | "provider";
  value: string;
}) {
  const value = normalized(input.value);
  if (!clean(input.tenantId, 160) || !value) return null;
  return createHash("sha256")
    .update(`${clean(input.tenantId, 160)}:${input.kind}:${value}`)
    .digest("hex")
    .slice(0, 32);
}

function valueAppearsExplicitly(inboundText: string, value: string) {
  const source = normalized(inboundText);
  const target = normalized(value);
  if (!source || target.length < 3) return false;
  return source.includes(target) || target.split(" ").filter((token) => token.length >= 4).every((token) => source.includes(token));
}

function correctionSignal(inboundText: string) {
  return /\b(corrigindo|correcao|correção|na verdade|nao somos|não somos|eu disse errado|mudei de ideia|pode atualizar)\b/i.test(inboundText);
}

function detectCommitment(inboundText: string) {
  const text = clean(inboundText, 280);
  if (!/\b(combinado|fechado|pode marcar|pode agendar|vou enviar|vou pagar|vamos comecar|vamos começar|confirmo)\b/i.test(text)) return "";
  return text;
}

export function mergeRelationshipState(input: {
  current?: unknown;
  tenantId: string;
  leadId: string;
  identityKey?: string | null;
  occurredAtMs: number;
  sourceMessageId: string;
  inboundText: string;
  extractedFields?: Record<string, string> | null;
  derivedFacts?: Record<string, string | null | undefined>;
  openQuestion?: string | null;
  nowMs?: number;
}) {
  const nowMs = input.nowMs || Date.now();
  const state = normalizeRelationshipState(input.current, { tenantId: input.tenantId, leadId: input.leadId }, nowMs);
  const occurredAtMs = boundedTime(input.occurredAtMs, nowMs);
  const sourceMessageId = clean(input.sourceMessageId, 240);
  const identityKey = clean(input.identityKey, 96);
  const identities = identityKey
    ? Array.from(new Set([...state.identityKeys, identityKey])).slice(-8)
    : state.identityKeys;
  const ignoredUpdates = [...state.ignoredUpdates];

  if (state.identityKeys.length && identityKey && !state.identityKeys.includes(identityKey)) {
    ignoredUpdates.push({ reason: "identity_mismatch", sourceMessageId, occurredAtMs });
    return {
      state: { ...state, ignoredUpdates: ignoredUpdates.slice(-12) },
      applied: false,
      reason: "identity_mismatch" as const,
      appliedKeys: [] as string[],
      ignoredKeys: [] as string[],
    };
  }
  if (state.lastEventAtMs > occurredAtMs) {
    ignoredUpdates.push({ reason: "out_of_order", sourceMessageId, occurredAtMs });
    return {
      state: { ...state, ignoredUpdates: ignoredUpdates.slice(-12) },
      applied: false,
      reason: "out_of_order" as const,
      appliedKeys: [] as string[],
      ignoredKeys: [] as string[],
    };
  }

  const candidates = {
    ...(input.extractedFields || {}),
    ...(input.derivedFacts || {}),
  };
  const facts = { ...state.facts };
  const appliedKeys: string[] = [];
  const ignoredKeys: string[] = [];
  const isCorrection = correctionSignal(input.inboundText);

  for (const [rawKey, rawValue] of Object.entries(candidates)) {
    const key = clean(rawKey, 60);
    const value = clean(rawValue, 320);
    if (!ALLOWED_KEYS.has(key) || !value) continue;
    const previous = facts[key];
    const explicit = valueAppearsExplicitly(input.inboundText, value);
    const source: RelationshipFactSource = isCorrection && explicit
      ? "lead_correction"
      : explicit
        ? "lead_explicit"
        : "model_extraction";
    const confidence = source === "lead_correction" ? 0.99 : source === "lead_explicit" ? 0.94 : 0.72;
    const status: RelationshipFactStatus = confidence >= 0.9 ? "confirmed" : "hypothesis";
    const sameValue = previous && normalized(previous.value) === normalized(value);
    if (sameValue) {
      facts[key] = {
        ...previous,
        confidence: Math.max(previous.confidence, confidence),
        status: previous.status === "confirmed" || status === "confirmed" ? "confirmed" : "hypothesis",
        observedAtMs: Math.max(previous.observedAtMs, occurredAtMs),
        expiresAtMs: occurredAtMs + ttlMsFor(key),
        source: confidence >= previous.confidence ? source : previous.source,
        sourceMessageId: confidence >= previous.confidence ? sourceMessageId : previous.sourceMessageId,
      };
      appliedKeys.push(key);
      continue;
    }
    if (previous?.status === "confirmed" && status === "hypothesis") {
      ignoredKeys.push(key);
      ignoredUpdates.push({ reason: "lower_confidence", key, sourceMessageId, occurredAtMs });
      continue;
    }
    const previousValues = previous
      ? [
          ...(previous.previousValues || []),
          { value: previous.value, replacedAtMs: occurredAtMs, sourceMessageId: previous.sourceMessageId },
        ].slice(-3)
      : [];
    facts[key] = {
      key,
      value,
      status,
      confidence,
      source,
      sourceMessageId,
      observedAtMs: occurredAtMs,
      expiresAtMs: occurredAtMs + ttlMsFor(key),
      ...(previousValues.length ? { previousValues } : {}),
    };
    appliedKeys.push(key);
  }

  const commitmentText = detectCommitment(input.inboundText);
  const commitments = commitmentText
    ? [
        { text: commitmentText, sourceMessageId, observedAtMs: occurredAtMs, expiresAtMs: occurredAtMs + 30 * 24 * 60 * 60 * 1000 },
        ...state.commitments.filter((item) => normalized(item.text) !== normalized(commitmentText)),
      ].slice(0, 8)
    : state.commitments;
  const openQuestion = clean(input.openQuestion, 280);
  const openQuestions = openQuestion
    ? [
        { text: openQuestion, sourceMessageId, observedAtMs: occurredAtMs, expiresAtMs: occurredAtMs + 14 * 24 * 60 * 60 * 1000 },
        ...state.openQuestions.filter((item) => normalized(item.text) !== normalized(openQuestion)),
      ].slice(0, 5)
    : state.openQuestions;

  return {
    state: {
      ...state,
      revision: state.revision + 1,
      identityKeys: identities,
      lastEventAtMs: occurredAtMs,
      lastSourceMessageId: sourceMessageId,
      facts,
      commitments,
      openQuestions,
      ignoredUpdates: ignoredUpdates.slice(-12),
    },
    applied: true,
    reason: "applied" as const,
    appliedKeys,
    ignoredKeys,
  };
}

export function relationshipFactsForPrompt(state: RelationshipState | null, nowMs = Date.now()) {
  if (!state) return { confirmed: [] as string[], hypotheses: [] as string[], preferences: [] as string[] };
  const active = Object.values(state.facts)
    .filter((fact) => fact.expiresAtMs === null || fact.expiresAtMs > nowMs)
    .sort((a, b) => b.confidence - a.confidence || b.observedAtMs - a.observedAtMs);
  return {
    confirmed: active.filter((fact) => fact.status === "confirmed").map((fact) => `${fact.key}: ${fact.value}`).slice(0, 16),
    hypotheses: active.filter((fact) => fact.status === "hypothesis" && fact.confidence >= 0.65).map((fact) => `${fact.key}: ${fact.value}`).slice(0, 8),
    preferences: active.filter((fact) => PREFERENCE_KEYS.has(fact.key)).map((fact) => `${fact.key}: ${fact.value}`).slice(0, 6),
  };
}

const QUESTION_FACT_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "preferredName", pattern: /\b(como posso te chamar|qual (e )?o seu nome|seu nome)\b/i },
  { key: "businessType", pattern: /\b(qual (e )?(o )?seu negocio|tipo (do|de) seu negocio|tipo de negocio|segmento|o que (a )?empresa faz)\b/i },
  { key: "primaryGoal", pattern: /\b(qual (e )?(o )?seu objetivo|resultado.*quer|o que.*melhorar)\b/i },
  { key: "budgetBand", pattern: /\b(orcamento|budget|investimento.*mente|quanto.*investir)\b/i },
  { key: "urgency", pattern: /\b(qual.*prazo|para quando|urgencia|quando.*precisa)\b/i },
  { key: "decisionMaker", pattern: /\b(quem decide|decisor|responsavel.*decisao)\b/i },
  { key: "currentChannels", pattern: /\b(quais canais|canal.*usa|onde.*atende)\b/i },
  { key: "teamSize", pattern: /\b(tamanho.*equipe|quantas pessoas|numero.*colaboradores)\b/i },
];

export function removeAnsweredRelationshipQuestions(
  responseText: string,
  state: RelationshipState | null
) {
  const text = clean(responseText, 1800);
  if (!text || !state) return { text, removedFactKeys: [] as string[] };
  const confirmedKeys = new Set(
    Object.values(state.facts)
      .filter((fact) => fact.status === "confirmed")
      .map((fact) => fact.key)
  );
  if (!confirmedKeys.size || !text.includes("?")) return { text, removedFactKeys: [] as string[] };
  const removedFactKeys: string[] = [];
  const segments = (text.match(/[^.!?]+[.!?]?/g) || [text])
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => {
      if (!segment.includes("?")) return true;
      const match = QUESTION_FACT_PATTERNS.find(
        (item) => confirmedKeys.has(item.key) && item.pattern.test(normalized(segment))
      );
      if (!match) return true;
      removedFactKeys.push(match.key);
      return false;
    });
  const result = segments.join(" ").replace(/\s+/g, " ").trim();
  return {
    text: result || "Perfeito, essa informacao ja esta registrada. Vou seguir a partir dela.",
    removedFactKeys: Array.from(new Set(removedFactKeys)),
  };
}

export function enforceRelationshipPrivacyBoundary(input: {
  inboundText: string;
  responseText: string;
}) {
  const inbound = normalized(input.inboundText);
  const responseText = clean(input.responseText, 1800);
  const referencesAnotherCustomer =
    /\b(outr[oa]s?)\s+(cliente|empresa|lead|pessoa|paciente|contato)s?\b/.test(inbound) ||
    /\b(cliente|empresa|lead|pessoa|paciente|contato)s?\s+(de terceiros|anterior|anteriores)\b/.test(inbound);
  const requestsProtectedContext =
    /\b(preco|valor|condicao|proposta|desconto|contrato|dados|conversa|mensagem|informacao|oferta|pagamento)\b/.test(inbound);
  if (!referencesAnotherCustomer || !requestsProtectedContext) {
    return { text: responseText, applied: false, reason: null as string | null };
  }
  return {
    text: "Por privacidade, nao tenho acesso nem posso compartilhar dados, precos ou condicoes de outros clientes. Posso explicar as opcoes disponiveis para a sua empresa com base nas informacoes oficiais.",
    applied: true,
    reason: "cross_customer_context_request",
  };
}
