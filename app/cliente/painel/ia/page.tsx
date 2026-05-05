"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, PencilLine, RefreshCw, Save, Search, ShieldCheck, Sparkles, Trash2, UploadCloud, Waypoints } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";
import { getBusinessProfile, getBusinessProfilePlaybookPreset, type BusinessProfileId } from "@/lib/business-profiles";
import { DEFAULT_AI_PROVIDERS } from "@/lib/server/ai/operating-layer";

type AiSettings = {
  enabled: boolean;
  agentName?: string;
  toneOfVoice: string;
  businessSummary: string;
  objective?: string;
  responsiblePhone: string;
  handoffNotifyEnabled?: boolean;
  handoffNotifyPhones?: string[];
  voiceReplyEnabled?: boolean;
  voiceReplyVoice?: string;
  guardrails: string[];
  mandatoryQuestions?: string[];
  escalationTopics?: string[];
  whatsappTemplateFollowUpEnabled?: boolean;
  whatsappTemplateFollowUpName?: string;
  whatsappTemplateFollowUpLanguage?: string;
  whatsappTemplateFollowUpParams?: string[];
  tier?: "essential" | "growth" | "premium" | "elite" | "enterprise";
  autonomyMode?: "copilot" | "hybrid" | "autonomous";
  reasoningLevel?: "fast" | "balanced" | "deep";
  responseStyle?: "concise" | "consultative" | "premium_sales" | "closer";
  allowPremiumModels?: boolean;
  preferredProviders?: Array<"altum_rules" | "openai" | "anthropic" | "gemini" | "mistral">;
  conversationModelOverride?: string;
  extractionModelOverride?: string;
  monthlyBudgetUsd?: number;
  monthlyUsageCap?: number;
  runtimePolicy?: {
    primaryProvider?: string;
    fallbackProviders?: string[];
    conversationModel?: string;
    extractionModel?: string;
    retrievalMode?: string;
    supportsToolCalling?: boolean;
    supportsDeepReasoning?: boolean;
    budgetMode?: string;
    modelGuardrailApplied?: boolean;
    modelGuardrailReason?: string | null;
  };
  providerStatus?: Partial<Record<"altum_rules" | "openai" | "anthropic" | "gemini" | "mistral", { ready: boolean; label: string }>>;
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "document" | null;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  serviceKey?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  upsellKeys?: string[];
  crossSellKeys?: string[];
  priority?: number | null;
  availability?: "active" | "seasonal" | "paused";
  createdAt?: unknown;
  updatedAt?: unknown;
};

type AiLog = {
  id: string;
  chatId?: string;
  messageId?: string;
  input?: string;
  output?: string;
  toolCalls?: string[];
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  reason?: string;
  confidence?: number | null;
  matchedKbDocIds?: string[];
  extractedFields?: Record<string, string> | null;
  nextAction?: string | null;
  plannerIntent?: string | null;
  stateBefore?: string | null;
  stateAfter?: string | null;
  responseGoal?: string | null;
  recommendedOffer?: string | null;
  objectionType?: string | null;
  commercialTemperature?: string | null;
  qualityScore?: number | null;
  latencyMs?: number | null;
  createdAt?: unknown;
};

type AiUsageSummary = {
  total: number;
  estimatedCostUsd: number;
  rulesLane: number;
  premiumLane: number;
  conversationRuns: number;
  fallbackRuns: number;
};

type ActionSignal = {
  id: string;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  badge: string;
  action: () => void;
};

type PreviewScenario = {
  id: string;
  label: string;
  message: string;
  messageType?: string;
  history?: Array<{ sender: "agent" | "client" | "system"; text: string; type?: string }>;
  leadMemory?: Record<string, unknown>;
  expected?: {
    decisions?: string[];
    responseGoals?: string[];
    stateAfter?: string[];
    extractedFields?: string[];
    minQuality?: number;
    forbiddenNotes?: string[];
  };
};

type PreviewResult = {
  plannerDecision?: {
    decision?: string;
    reason?: string;
    confidence?: number;
    stateBefore?: string;
    stateAfter?: string;
    responseGoal?: string;
    intent?: string;
    objectionType?: string | null;
    commercialTemperature?: string | null;
    nextQuestion?: string | null;
    nextAction?: string | null;
    recommendedOffer?: string | null;
  };
  extractedFields?: Record<string, string> | null;
  responseText?: string;
  quality?: { score?: number; notes?: string[] };
  matchedKbDocs?: Array<{ id: string; type: string; score: number; preview: string }>;
};

type PreviewBatchRun = {
  scenarioId: string;
  label: string;
  preview: PreviewResult | null;
  error?: string | null;
  verdict?: {
    passed: boolean;
    issues: string[];
  };
};

const PREVIEW_SCENARIOS: PreviewScenario[] = [
  {
    id: "greeting",
    label: "Saudacao fria",
    message: "Oi",
    expected: {
      decisions: ["respond"],
      responseGoals: ["welcome"],
      stateAfter: ["discovery"],
      minQuality: 0.7,
      forbiddenNotes: ["vazou_jargao_interno", "resposta_longa"],
    },
  },
  {
    id: "price_early",
    label: "Preco cedo demais",
    message: "Quanto custa?",
    expected: {
      decisions: ["ask_more"],
      responseGoals: ["handle_objection"],
      stateAfter: ["qualification"],
      minQuality: 0.7,
      forbiddenNotes: ["vazou_jargao_interno"],
    },
  },
  {
    id: "ask_services",
    label: "O que voces fazem",
    message: "O que voces fazem?",
    expected: {
      decisions: ["respond"],
      responseGoals: ["clarify"],
      minQuality: 0.68,
      forbiddenNotes: ["vazou_jargao_interno", "resposta_longa"],
    },
  },
  {
    id: "imobiliaria",
    label: "Imobiliaria + dor",
    message: "Sou uma imobiliaria e quero vender mais pelo WhatsApp",
    expected: {
      decisions: ["respond"],
      responseGoals: ["recommend"],
      stateAfter: ["recommendation"],
      extractedFields: ["businessType", "primaryGoal"],
      minQuality: 0.72,
    },
  },
  {
    id: "price_with_context",
    label: "Preco com contexto",
    message: "Sou uma clinica e quero organizar atendimento e vendas. Quanto custa?",
    expected: {
      decisions: ["respond"],
      responseGoals: ["handle_objection"],
      stateAfter: ["recommendation"],
      extractedFields: ["businessType", "primaryGoal"],
      minQuality: 0.72,
    },
  },
  {
    id: "soft_objection",
    label: "Objecao suave",
    message: "Entendi, mas vou pensar",
    history: [
      { sender: "agent", text: "Pelo seu contexto, o caminho mais aderente aqui tende a ser implantacao de IA para atendimento e comercial. Se fizer sentido, eu te mostro o proximo passo." },
    ],
    leadMemory: {
      businessType: "imobiliaria",
      primaryGoal: "aumentar vendas",
      currentChannels: "whatsapp, instagram",
      recommendedOffer: "implantacao de IA para atendimento e comercial",
    },
    expected: {
      decisions: ["respond"],
      responseGoals: ["handle_objection"],
      stateAfter: ["objection_handling"],
      minQuality: 0.7,
    },
  },
  {
    id: "proposal_too_early",
    label: "Proposta cedo demais",
    message: "Me manda uma proposta",
    expected: {
      decisions: ["ask_more"],
      responseGoals: ["qualify"],
      stateAfter: ["qualification"],
      minQuality: 0.7,
    },
  },
  {
    id: "audio_context",
    label: "Audio com contexto",
    message: "Tenho uma loja, anuncio no Instagram e perco lead no atendimento",
    messageType: "audio",
    expected: {
      decisions: ["ask_more", "respond"],
      extractedFields: ["currentChannels"],
      minQuality: 0.68,
    },
  },
  {
    id: "audio_unclear",
    label: "Audio pouco claro",
    message: "[Audio com fala pouco clara]",
    messageType: "audio",
    expected: {
      decisions: ["ask_more"],
      responseGoals: ["qualify"],
      minQuality: 0.68,
      forbiddenNotes: ["vazou_jargao_interno"],
    },
  },
];

type TenantSettingsPayload = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

const EMPTY_SETTINGS: AiSettings = {
  enabled: true,
  agentName: "",
  toneOfVoice: "consultivo e objetivo",
  businessSummary: "",
  objective: "",
  responsiblePhone: "",
  handoffNotifyEnabled: true,
  handoffNotifyPhones: [],
  voiceReplyEnabled: false,
  voiceReplyVoice: "alloy",
  guardrails: [],
  mandatoryQuestions: [],
  escalationTopics: [],
  whatsappTemplateFollowUpEnabled: true,
  whatsappTemplateFollowUpName: "follow_up_geral",
  whatsappTemplateFollowUpLanguage: "pt_BR",
  whatsappTemplateFollowUpParams: [],
  tier: "growth",
  autonomyMode: "hybrid",
  reasoningLevel: "balanced",
  responseStyle: "consultative",
  allowPremiumModels: false,
  preferredProviders: [...DEFAULT_AI_PROVIDERS],
  conversationModelOverride: "",
  extractionModelOverride: "",
  monthlyBudgetUsd: 100,
  monthlyUsageCap: 1500,
};

const PROVIDER_OPTIONS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "mistral", label: "Mistral" },
  { id: "altum_rules", label: "ALTUM Rules" },
] as const;

const CONVERSATION_MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "", label: "Padrao economico (gpt-4.1-mini)" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    { value: "gpt-5-mini", label: "gpt-5-mini" },
    { value: "gpt-5.4", label: "gpt-5.4" },
  ],
  anthropic: [
    { value: "", label: "Padrao automatico" },
    { value: "claude-sonnet-4", label: "claude-sonnet-4" },
    { value: "claude-opus-4", label: "claude-opus-4" },
  ],
  gemini: [
    { value: "", label: "Padrao automatico" },
    { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
  ],
  mistral: [
    { value: "", label: "Padrao automatico" },
    { value: "mistral-small", label: "mistral-small" },
    { value: "mistral-large", label: "mistral-large" },
  ],
  altum_rules: [{ value: "", label: "ALTUM Rules" }],
};

const EXTRACTION_MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "", label: "Padrao economico (gpt-4.1-mini)" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    { value: "gpt-5-mini", label: "gpt-5-mini" },
    { value: "gpt-5.4", label: "gpt-5.4" },
  ],
  anthropic: [
    { value: "", label: "Padrao automatico" },
    { value: "claude-sonnet-4", label: "claude-sonnet-4" },
    { value: "claude-opus-4", label: "claude-opus-4" },
  ],
  gemini: [
    { value: "", label: "Padrao automatico" },
    { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  ],
  mistral: [
    { value: "", label: "Padrao automatico" },
    { value: "mistral-small", label: "mistral-small" },
    { value: "mistral-large", label: "mistral-large" },
  ],
  altum_rules: [{ value: "", label: "ALTUM Rules" }],
};

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function decisionTone(decision?: string) {
  if (decision === "handoff") return "warning" as const;
  if (decision === "ask_more") return "info" as const;
  if (decision === "skip") return "neutral" as const;
  return "success" as const;
}

function decisionLabel(decision?: string) {
  if (decision === "handoff") return "handoff";
  if (decision === "ask_more") return "perguntar mais";
  if (decision === "skip") return "skip";
  return "responder";
}

function confidenceLabel(value?: number | null) {
  if (typeof value !== "number") return "--";
  return `${Math.round(value * 100)}%`;
}

function latencyLabel(value?: number | null) {
  if (typeof value !== "number") return "--";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function tierLabel(value?: string) {
  if (value === "essential") return "Essencial";
  if (value === "premium") return "Premium";
  if (value === "elite") return "Elite";
  if (value === "enterprise") return "Enterprise";
  return "Crescimento";
}

function responseStyleLabel(value?: string) {
  if (value === "concise") return "Direto";
  if (value === "premium_sales") return "Premium Sales";
  if (value === "closer") return "Closer";
  return "Consultivo";
}

function evaluatePreviewScenario(preview: PreviewResult | null, scenario: PreviewScenario) {
  const issues: string[] = [];
  const expected = scenario.expected;
  if (!preview || !expected) {
    return { passed: Boolean(preview), issues };
  }

  const decision = String(preview.plannerDecision?.decision || "");
  const responseGoal = String(preview.plannerDecision?.responseGoal || "");
  const stateAfter = String(preview.plannerDecision?.stateAfter || "");
  const extractedFieldKeys = new Set(Object.keys(preview.extractedFields || {}));
  const qualityScore = typeof preview.quality?.score === "number" ? preview.quality.score : 0;
  const qualityNotes = new Set(preview.quality?.notes || []);

  if (expected.decisions?.length && !expected.decisions.includes(decision)) {
    issues.push(`decisao fora do esperado: ${decision || "sem decisao"}`);
  }
  if (expected.responseGoals?.length && !expected.responseGoals.includes(responseGoal)) {
    issues.push(`objetivo fora do esperado: ${responseGoal || "sem objetivo"}`);
  }
  if (expected.stateAfter?.length && !expected.stateAfter.includes(stateAfter)) {
    issues.push(`estado final fora do esperado: ${stateAfter || "sem estado"}`);
  }
  if (expected.extractedFields?.length) {
    const missing = expected.extractedFields.filter((field) => !extractedFieldKeys.has(field));
    if (missing.length) {
      issues.push(`faltou CRM: ${missing.join(", ")}`);
    }
  }
  if (typeof expected.minQuality === "number" && qualityScore < expected.minQuality) {
    issues.push(`qualidade baixa: ${Math.round(qualityScore * 100)}%`);
  }
  if (expected.forbiddenNotes?.length) {
    const forbiddenFound = expected.forbiddenNotes.filter((note) => qualityNotes.has(note));
    if (forbiddenFound.length) {
      issues.push(`sinais ruins: ${forbiddenFound.join(", ")}`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

function reorderProviders(
  currentProviders: NonNullable<AiSettings["preferredProviders"]>,
  providerId: NonNullable<AiSettings["preferredProviders"]>[number],
  active: boolean
): NonNullable<AiSettings["preferredProviders"]> {
  const current = currentProviders.filter(Boolean);
  const without = current.filter((item) => item !== providerId);

  if (!active) {
    return without.length ? without : [...DEFAULT_AI_PROVIDERS];
  }

  if (providerId === "altum_rules") {
    return [...without.filter((item) => item !== "altum_rules"), "altum_rules"];
  }

  const primary = providerId;
  const fallback = without.filter((item) => item !== primary && item !== "altum_rules");
  const rules = without.includes("altum_rules") ? ["altum_rules" as const] : [];
  return [primary, ...fallback, ...rules];
}

function getPrimaryProvider(settings: AiSettings) {
  return settings.preferredProviders?.[0] || "openai";
}

export default function ClienteIaPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");

  const [settings, setSettings] = useState<AiSettings>(EMPTY_SETTINGS);
  const [guardrailsText, setGuardrailsText] = useState("");
  const [mandatoryQuestionsText, setMandatoryQuestionsText] = useState("");
  const [escalationTopicsText, setEscalationTopicsText] = useState("");
  const [handoffNotifyPhonesText, setHandoffNotifyPhonesText] = useState("");
  const [followUpTemplateParamsText, setFollowUpTemplateParamsText] = useState("");
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary>({
    total: 0,
    estimatedCostUsd: 0,
    rulesLane: 0,
    premiumLane: 0,
    conversationRuns: 0,
    fallbackRuns: 0,
  });
  const [docType, setDocType] = useState<KbDoc["type"]>("faq");
  const [docContent, setDocContent] = useState("");
  const [docTags, setDocTags] = useState("");
  const [docMediaUrl, setDocMediaUrl] = useState("");
  const [docMediaType, setDocMediaType] = useState<"" | "image" | "video" | "document">("");
  const [docMediaTitle, setDocMediaTitle] = useState("");
  const [docMediaStoragePath, setDocMediaStoragePath] = useState("");
  const [docMediaMimeType, setDocMediaMimeType] = useState("");
  const [docMediaSize, setDocMediaSize] = useState<number | null>(null);
  const [docServiceKey, setDocServiceKey] = useState("");
  const [docProductName, setDocProductName] = useState("");
  const [docProductCategory, setDocProductCategory] = useState("");
  const [docTargetProfile, setDocTargetProfile] = useState("");
  const [docPriceFrom, setDocPriceFrom] = useState("");
  const [docPriceTo, setDocPriceTo] = useState("");
  const [docUpsellKeys, setDocUpsellKeys] = useState("");
  const [docCrossSellKeys, setDocCrossSellKeys] = useState("");
  const [docPriority, setDocPriority] = useState("");
  const [docAvailability, setDocAvailability] = useState<"active" | "seasonal" | "paused">("active");
  const [uploadingKbMedia, setUploadingKbMedia] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [kbSearch, setKbSearch] = useState("");
  const [kbTypeFilter, setKbTypeFilter] = useState<"all" | KbDoc["type"]>("all");
  const [kbUsageFilter, setKbUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [logSearch, setLogSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "respond" | "ask_more" | "handoff" | "skip">("all");
  const [logRiskFilter, setLogRiskFilter] = useState<"all" | "low_confidence" | "handoff_only">("all");
  const [previewScenarioId, setPreviewScenarioId] = useState(PREVIEW_SCENARIOS[0].id);
  const [previewMessage, setPreviewMessage] = useState(PREVIEW_SCENARIOS[0].message);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [runningPreview, setRunningPreview] = useState(false);
  const [runningPreviewBatch, setRunningPreviewBatch] = useState(false);
  const [previewBatchResults, setPreviewBatchResults] = useState<PreviewBatchRun[]>([]);

  const canManage = hasCapability("manage_ai");
  const canEditKb = hasCapability("manage_ai");

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [settingsRes, kbRes, logsRes, usageRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`),
        authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-usage`),
      ]);
      const tenantSettingsRes = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`);

      const settingsPayload = (await settingsRes.json()) as { ai?: AiSettings; error?: string };
      const kbPayload = (await kbRes.json()) as { items?: KbDoc[]; error?: string };
      const logsPayload = (await logsRes.json()) as { items?: AiLog[]; error?: string };
      const usagePayload = (await usageRes.json()) as { summary?: AiUsageSummary; error?: string };
      const tenantSettingsPayload = (await tenantSettingsRes.json().catch(() => ({}))) as TenantSettingsPayload;
      setBusinessProfileId((tenantSettingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");

      if (settingsRes.ok) {
        const rawSettings = { ...EMPTY_SETTINGS, ...(settingsPayload.ai || {}) };
        const normalizedPreferredProviders = rawSettings.preferredProviders?.length
          ? rawSettings.preferredProviders
          : [...DEFAULT_AI_PROVIDERS];
        const nextSettings = {
          ...rawSettings,
          preferredProviders: normalizedPreferredProviders,
        };
        setSettings(nextSettings);
        setGuardrailsText((nextSettings.guardrails || []).join("\n"));
        setMandatoryQuestionsText((nextSettings.mandatoryQuestions || []).join("\n"));
        setEscalationTopicsText((nextSettings.escalationTopics || []).join("\n"));
        setHandoffNotifyPhonesText((nextSettings.handoffNotifyPhones || []).join("\n"));
        setFollowUpTemplateParamsText((nextSettings.whatsappTemplateFollowUpParams || []).join("\n"));
      } else {
        setError(settingsPayload.error || "Falha ao carregar configuracoes da IA.");
      }

      if (kbRes.ok) {
        setKbDocs(kbPayload.items || []);
      } else {
        setError(kbPayload.error || "Falha ao carregar base de conhecimento.");
      }

      if (logsRes.ok) {
        setLogs(logsPayload.items || []);
      } else {
        setError(logsPayload.error || "Falha ao carregar logs de IA.");
      }

      if (usageRes.ok) {
        setUsageSummary(usagePayload.summary || {
          total: 0,
          estimatedCostUsd: 0,
          rulesLane: 0,
          premiumLane: 0,
          conversationRuns: 0,
          fallbackRuns: 0,
        });
      }
    } catch {
      setError("Falha ao carregar modulo IA.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const playbookPreset = useMemo(() => getBusinessProfilePlaybookPreset(businessProfileId), [businessProfileId]);

  const logSummary = useMemo(() => {
    const lowConfidence = logs.filter((log) => typeof log.confidence === "number" && log.confidence < 0.55).length;
    const avgLatency = logs.length
      ? Math.round(logs.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0) / Math.max(1, logs.length))
      : 0;

    return {
      responded: logs.filter((log) => log.decision === "respond").length,
      handoff: logs.filter((log) => log.decision === "handoff").length,
      askMore: logs.filter((log) => log.decision === "ask_more").length,
      recommendationReady: logs.filter((log) => ["recommend", "move_to_next_step"].includes(String(log.responseGoal || ""))).length,
      objectionHandling: logs.filter((log) => String(log.stateAfter || "") === "objection_handling").length,
      lowConfidence,
      avgLatency,
      avgQuality:
        logs.filter((log) => typeof log.qualityScore === "number").length > 0
          ? Number(
              (
                logs.reduce((sum, item) => sum + (typeof item.qualityScore === "number" ? item.qualityScore : 0), 0) /
                Math.max(1, logs.filter((log) => typeof log.qualityScore === "number").length)
              ).toFixed(3)
            )
          : 0,
    };
  }, [logs]);

  const handoffReasons = useMemo(() => {
    return Array.from(
      logs
        .filter((log) => log.decision === "handoff")
        .reduce((acc, log) => {
          const key = String(log.reason || "sem motivo").trim() || "sem motivo";
          acc.set(key, (acc.get(key) || 0) + 1);
          return acc;
        }, new Map<string, number>())
    )
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [logs]);

  const kbUsage = useMemo(() => {
    const usageMap = new Map<string, number>();
    logs.forEach((log) => {
      (log.matchedKbDocIds || []).forEach((docId) => {
        usageMap.set(docId, (usageMap.get(docId) || 0) + 1);
      });
    });

    return kbDocs
      .map((doc) => ({
        id: doc.id,
        type: doc.type,
        preview: doc.content.slice(0, 88),
        total: usageMap.get(doc.id) || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [kbDocs, logs]);

  const aiCoverage = useMemo(() => {
    const used = kbUsage.filter((item) => item.total > 0).length;
    return {
      used,
      unused: Math.max(0, kbDocs.length - used),
      topReason: handoffReasons[0]?.reason || "sem handoff dominante",
    };
  }, [handoffReasons, kbDocs.length, kbUsage]);

  const filteredDocs = useMemo(() => {
    const term = kbSearch.trim().toLowerCase();
    const usedDocIds = new Set(kbUsage.filter((item) => item.total > 0).map((item) => item.id));

    return kbDocs.filter((doc) => {
      if (kbTypeFilter !== "all" && doc.type !== kbTypeFilter) return false;
      if (kbUsageFilter === "used" && !usedDocIds.has(doc.id)) return false;
      if (kbUsageFilter === "unused" && usedDocIds.has(doc.id)) return false;
      if (!term) return true;
      return [
        doc.type,
        doc.content,
        ...(doc.tags || []),
        doc.serviceKey,
        doc.productName,
        doc.productCategory,
        doc.targetProfile,
        ...(doc.upsellKeys || []),
        ...(doc.crossSellKeys || []),
        doc.availability,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [kbDocs, kbSearch, kbTypeFilter, kbUsage, kbUsageFilter]);

  const filteredDocsByType = useMemo(
    () => ({
      faq: filteredDocs.filter((doc) => doc.type === "faq"),
      catalog: filteredDocs.filter((doc) => doc.type === "catalog"),
      policy: filteredDocs.filter((doc) => doc.type === "policy"),
    }),
    [filteredDocs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (decisionFilter !== "all" && log.decision !== decisionFilter) return false;
      if (logRiskFilter === "low_confidence" && !(typeof log.confidence === "number" && log.confidence < 0.55)) {
        return false;
      }
      if (logRiskFilter === "handoff_only" && log.decision !== "handoff") return false;
      if (!logSearch.trim()) return true;
      const term = logSearch.trim().toLowerCase();
      return [
        log.chatId,
        log.input,
        log.output,
        log.reason,
        ...(log.toolCalls || []),
        ...(log.matchedKbDocIds || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [decisionFilter, logRiskFilter, logSearch, logs]);

  const docsSummary = useMemo(
    () => ({
      faq: kbDocs.filter((doc) => doc.type === "faq").length,
      catalog: kbDocs.filter((doc) => doc.type === "catalog").length,
      policy: kbDocs.filter((doc) => doc.type === "policy").length,
    }),
    [kbDocs]
  );

  const actionSignals = useMemo<ActionSignal[]>(() => {
    const items: ActionSignal[] = [];

    if (!settings.enabled) {
      items.push({
        id: "paused",
        title: "Autopilot pausado",
        detail: "Reative a IA para voltar a cobrir atendimentos automaticos do tenant.",
        tone: "warning",
        badge: "pausado",
        action: () => setDecisionFilter("all"),
      });
    }

    if (!settings.responsiblePhone) {
      items.push({
        id: "handoff_owner",
        title: "Handoff sem responsavel",
        detail: "Defina o numero do responsavel para evitar escaladas sem dono.",
        tone: "danger",
        badge: "handoff",
        action: () => setDecisionFilter("handoff"),
      });
    }

    if (logSummary.lowConfidence > 0) {
      items.push({
        id: "low_confidence",
        title: "Logs de baixa confianca",
        detail: `${logSummary.lowConfidence} interacao(oes) merecem revisao de base e guardrails.`,
        tone: "warning",
        badge: "risco",
        action: () => {
          setDecisionFilter("all");
          setLogRiskFilter("low_confidence");
        },
      });
    }

    if (logSummary.handoff > logSummary.responded) {
      items.push({
        id: "handoff_excess",
        title: "Handoff acima de resposta",
        detail: `${logSummary.handoff} handoff(s) para ${logSummary.responded} resposta(s) automaticas.`,
        tone: "warning",
        badge: "escalada",
        action: () => {
          setDecisionFilter("handoff");
          setLogRiskFilter("handoff_only");
        },
      });
    }

    if (aiCoverage.unused > 0) {
      items.push({
        id: "unused_docs",
        title: "Base sem uso recente",
        detail: `${aiCoverage.unused} documento(s) ainda nao foram usados nas respostas recentes.`,
        tone: "info",
        badge: "kb",
        action: () => {
          setKbUsageFilter("unused");
          setKbTypeFilter("all");
        },
      });
    }

    return items.slice(0, 5);
  }, [
    aiCoverage.unused,
    logSummary.handoff,
    logSummary.lowConfidence,
    logSummary.responded,
    settings.enabled,
    settings.responsiblePhone,
  ]);

  function applyBusinessProfileDefaults() {
    if (!canManage) return;
    setSettings((prev) => ({
      ...prev,
      toneOfVoice: businessProfile.ai.toneOfVoice,
      objective: businessProfile.ai.objective,
    }));
    setGuardrailsText(businessProfile.ai.guardrails.join("\n"));
    setMandatoryQuestionsText(businessProfile.ai.mandatoryQuestions.join("\n"));
    setEscalationTopicsText(businessProfile.ai.escalationTopics.join("\n"));
    setSuccess(`Defaults do modo ${businessProfile.label} aplicados na governanca da IA.`);
    setError(null);
  }

  const selectedPreviewScenario = useMemo(
    () => PREVIEW_SCENARIOS.find((item) => item.id === previewScenarioId) || PREVIEW_SCENARIOS[0],
    [previewScenarioId]
  );

  const previewBatchSummary = useMemo(() => {
    const total = previewBatchResults.length;
    const approved = previewBatchResults.filter((item) => item.verdict?.passed).length;
    const errors = previewBatchResults.filter((item) => item.error).length;
    const adjustments = previewBatchResults.filter((item) => !item.error && item.verdict && !item.verdict.passed).length;
    return { total, approved, errors, adjustments };
  }, [previewBatchResults]);

  const primaryProvider = useMemo(() => getPrimaryProvider(settings), [settings]);
  const conversationModelOptions = useMemo(
    () => CONVERSATION_MODEL_OPTIONS[primaryProvider] || CONVERSATION_MODEL_OPTIONS.openai,
    [primaryProvider]
  );
  const extractionModelOptions = useMemo(
    () => EXTRACTION_MODEL_OPTIONS[primaryProvider] || EXTRACTION_MODEL_OPTIONS.openai,
    [primaryProvider]
  );

  function applyPreviewScenario(scenarioId: string) {
    const scenario = PREVIEW_SCENARIOS.find((item) => item.id === scenarioId);
    if (!scenario) return;
    setPreviewScenarioId(scenario.id);
    setPreviewMessage(scenario.message);
    setPreviewResult(null);
  }

  async function runPreviewScenario(scenario: PreviewScenario, customMessage?: string) {
    if (!tenant?.tenantId) {
      return { error: "tenant_missing", preview: null } as const;
    }

    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ai-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: (customMessage || scenario.message).trim(),
        messageType: scenario.messageType || "text",
        history: scenario.history || [],
        leadMemory: scenario.leadMemory || null,
      }),
    });
    const payload = (await res.json()) as { error?: string; preview?: PreviewResult };
    if (!res.ok) {
      return { error: payload.error || "Falha ao executar preview da IA.", preview: null } as const;
    }
    return { error: null, preview: payload.preview || null } as const;
  }

  async function handleRunPreview() {
    if (!tenant?.tenantId || !previewMessage.trim()) return;

    setRunningPreview(true);
    setError(null);
    try {
      const result = await runPreviewScenario(selectedPreviewScenario, previewMessage.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreviewResult(result.preview || null);
    } catch {
      setError("Falha ao executar preview da IA.");
    } finally {
      setRunningPreview(false);
    }
  }

  async function handleRunPreviewBatch() {
    if (!tenant?.tenantId) return;

    setRunningPreviewBatch(true);
    setError(null);
    try {
      const results: PreviewBatchRun[] = [];
      for (const scenario of PREVIEW_SCENARIOS) {
        const result = await runPreviewScenario(scenario);
        results.push({
          scenarioId: scenario.id,
          label: scenario.label,
          preview: result.preview,
          error: result.error,
          verdict: result.preview ? evaluatePreviewScenario(result.preview, scenario) : undefined,
        });
      }
      setPreviewBatchResults(results);
    } catch {
      setError("Falha ao executar bateria de cenarios da IA.");
    } finally {
      setRunningPreviewBatch(false);
    }
  }

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    setSavingSettings(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          handoffNotifyEnabled: settings.handoffNotifyEnabled !== false,
          handoffNotifyPhones: handoffNotifyPhonesText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          guardrails: guardrailsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          mandatoryQuestions: mandatoryQuestionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          escalationTopics: escalationTopicsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          whatsappTemplateFollowUpEnabled: settings.whatsappTemplateFollowUpEnabled !== false,
          whatsappTemplateFollowUpName: settings.whatsappTemplateFollowUpName || "follow_up_geral",
          whatsappTemplateFollowUpLanguage: settings.whatsappTemplateFollowUpLanguage || "pt_BR",
          whatsappTemplateFollowUpParams: followUpTemplateParamsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          preferredProviders: settings.preferredProviders || [],
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar configuracoes da IA.");
        return;
      }

      setSuccess("Configuracoes da IA salvas com sucesso.");
      await loadData();
    } catch {
      setError("Falha ao salvar configuracoes da IA.");
    } finally {
      setSavingSettings(false);
    }
  }

  function parseOptionalNumber(value: string) {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, parsed);
  }

  function parseOptionalInteger(value: string) {
    const parsed = parseOptionalNumber(value);
    if (parsed === null) return null;
    return Math.round(parsed);
  }

  function clearCatalogDraft() {
    setDocProductName("");
    setDocProductCategory("");
    setDocTargetProfile("");
    setDocPriceFrom("");
    setDocPriceTo("");
    setDocUpsellKeys("");
    setDocCrossSellKeys("");
    setDocPriority("");
    setDocAvailability("active");
  }

  function clearKbDocForm() {
    setEditingDocId(null);
    setDocType("faq");
    setDocContent("");
    setDocTags("");
    setDocMediaUrl("");
    setDocMediaType("");
    setDocMediaTitle("");
    setDocMediaStoragePath("");
    setDocMediaMimeType("");
    setDocMediaSize(null);
    setDocServiceKey("");
    clearCatalogDraft();
  }

  function startEditingDoc(doc: KbDoc) {
    setEditingDocId(doc.id);
    setDocType(doc.type);
    setDocContent(doc.content);
    setDocTags(doc.tags.join(", "));
    setDocMediaUrl(doc.mediaUrl || "");
    setDocMediaType(doc.mediaType || "");
    setDocMediaTitle(doc.mediaTitle || "");
    setDocMediaStoragePath(doc.mediaStoragePath || "");
    setDocMediaMimeType(doc.mediaMimeType || "");
    setDocMediaSize(doc.mediaSize || null);
    setDocServiceKey(doc.serviceKey || "");
    setDocProductName(doc.productName || "");
    setDocProductCategory(doc.productCategory || "");
    setDocTargetProfile(doc.targetProfile || "");
    setDocPriceFrom(typeof doc.priceFrom === "number" ? String(doc.priceFrom) : "");
    setDocPriceTo(typeof doc.priceTo === "number" ? String(doc.priceTo) : "");
    setDocUpsellKeys((doc.upsellKeys || []).join(", "));
    setDocCrossSellKeys((doc.crossSellKeys || []).join(", "));
    setDocPriority(typeof doc.priority === "number" ? String(doc.priority) : "");
    setDocAvailability(doc.availability || "active");
  }

  async function handleAddKbDoc(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !docContent.trim() || !canEditKb) return;

    setSavingDoc(true);
    setError(null);
    setSuccess(null);

    try {
      const url = editingDocId
        ? `/api/tenant/${tenant.tenantId}/kb-docs/${editingDocId}`
        : `/api/tenant/${tenant.tenantId}/kb-docs`;
      const method = editingDocId ? "PATCH" : "POST";

      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docType,
          content: docContent.trim(),
          tags: docTags,
          mediaUrl: docMediaUrl.trim() || null,
          mediaType: docMediaType || null,
          mediaTitle: docMediaTitle.trim() || null,
          mediaStoragePath: docMediaStoragePath.trim() || null,
          mediaMimeType: docMediaMimeType.trim() || null,
          mediaSize: docMediaSize,
          serviceKey: docServiceKey.trim() || null,
          productName: docType === "catalog" ? docProductName.trim() || null : null,
          productCategory: docType === "catalog" ? docProductCategory.trim() || null : null,
          targetProfile: docType === "catalog" ? docTargetProfile.trim() || null : null,
          priceFrom: docType === "catalog" ? parseOptionalNumber(docPriceFrom) : null,
          priceTo: docType === "catalog" ? parseOptionalNumber(docPriceTo) : null,
          upsellKeys: docType === "catalog" ? docUpsellKeys : [],
          crossSellKeys: docType === "catalog" ? docCrossSellKeys : [],
          priority: docType === "catalog" ? parseOptionalInteger(docPriority) : null,
          availability: docType === "catalog" ? docAvailability : "active",
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar documento.");
        return;
      }

      clearKbDocForm();
      setSuccess(editingDocId ? "Documento atualizado." : "Documento da base de conhecimento adicionado.");
      await loadData();
    } catch {
      setError("Falha ao salvar documento da base de conhecimento.");
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleKbMediaUpload(file: File | null) {
    if (!tenant?.tenantId || !file || !canEditKb) return;

    setUploadingKbMedia(true);
    setError(null);
    setSuccess(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (docMediaTitle.trim()) form.append("title", docMediaTitle.trim());

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/media/upload`, {
        method: "POST",
        body: form,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        media?: {
          mediaUrl?: string;
          mediaStoragePath?: string;
          mediaType?: "image" | "video" | "document";
          mediaMimeType?: string;
          mediaSize?: number;
          mediaTitle?: string;
        };
      };

      if (!res.ok || !payload.media?.mediaUrl) {
        setError(payload.error || "Falha ao subir midia.");
        return;
      }

      setDocMediaUrl(payload.media.mediaUrl || "");
      setDocMediaStoragePath(payload.media.mediaStoragePath || "");
      setDocMediaType(payload.media.mediaType || "");
      setDocMediaMimeType(payload.media.mediaMimeType || "");
      setDocMediaSize(typeof payload.media.mediaSize === "number" ? payload.media.mediaSize : null);
      setDocMediaTitle((current) => current || payload.media?.mediaTitle || file.name);
      setSuccess("Midia enviada e vinculada ao documento.");
    } catch {
      setError("Falha ao subir midia.");
    } finally {
      setUploadingKbMedia(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setBusyDocId(docId);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/${docId}`, {
        method: "DELETE",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao remover documento.");
        return;
      }
      if (editingDocId === docId) {
        clearKbDocForm();
      }
      setSuccess("Documento removido.");
      await loadData();
    } catch {
      setError("Falha ao remover documento da base de conhecimento.");
    } finally {
      setBusyDocId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text)]">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="ia-refined client-daily-page space-y-6">
      <SectionHeader
        title="IA"
        subtitle="Configure o agente, revise a base comercial e acompanhe como ele esta decidindo na pratica."
        action={<StateBadge label={settings.enabled ? "IA automatica ativa" : "IA automatica pausada"} tone={settings.enabled ? "success" : "warning"} />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Docs ativos" value={String(kbDocs.length)} icon={Sparkles} trend="base comercial" />
        <MetricCard label="Guardrails" value={String((settings.guardrails || []).length)} icon={ShieldCheck} trend="regras de governanca" />
        <MetricCard label="Respostas" value={String(logSummary.responded)} icon={Bot} trend="ultima janela" />
        <MetricCard label="Handoffs" value={String(logSummary.handoff)} icon={Waypoints} trend="transferencias humanas" />
        <MetricCard label="Baixa confianca" value={String(logSummary.lowConfidence)} icon={Bot} trend={`latencia media ${latencyLabel(logSummary.avgLatency)}`} />
        <MetricCard label="Qualidade media" value={`${Math.round(logSummary.avgQuality * 100)}%`} icon={Sparkles} trend="curta, progressiva e sem vazamento" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Plano IA" value={tierLabel(settings.tier)} icon={Sparkles} trend={settings.runtimePolicy?.conversationModel || "motor base"} />
        <MetricCard label="Autonomia" value={settings.autonomyMode || "hybrid"} icon={ShieldCheck} trend={responseStyleLabel(settings.responseStyle)} />
        <MetricCard label="Budget IA" value={`$${Number(settings.monthlyBudgetUsd || 0).toFixed(0)}`} icon={Bot} trend={`${usageSummary.total} execucoes registradas`} />
        <MetricCard label="Lane premium" value={String(usageSummary.premiumLane)} icon={Waypoints} trend={`${usageSummary.rulesLane} em rules lane`} />
      </section>

      <PanelCard className="ia-guide-card p-5 md:p-6">
        <CardTitle
          title="Como configurar sem se perder"
          subtitle="Pense nesta pagina em tres blocos: motor, comportamento e base de conhecimento."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="ia-guide-block rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">1. Motor</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
              Escolha OpenAI como motor principal e mantenha ALTUM Rules como reserva para nao deixar o tenant sem resposta.
            </p>
          </div>
          <div className="ia-guide-block rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">2. Comportamento</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
              Ajuste tom, objetivo, guardrails e handoff. Isso define como a IA conversa e quando ela chama o humano.
            </p>
          </div>
          <div className="ia-guide-block rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">3. Base</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
              Cadastre FAQ, ofertas e politicas curtas. A IA responde melhor quando a base esta escrita como conversa, nao como documento interno.
            </p>
          </div>
        </div>
      </PanelCard>

      <PanelCard className="ia-preview-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle
            title="Preview comercial do agente"
            subtitle="Teste a IA com cenarios reais de SDR antes de publicar em producao."
          />
          <StateBadge
            label={previewResult?.quality?.score ? `${Math.round((previewResult.quality.score || 0) * 100)}% de qualidade` : "simulador"}
            tone={previewResult?.quality?.score && previewResult.quality.score < 0.7 ? "warning" : "info"}
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div className="ia-preview-block rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Cenario base</p>
              <div className="mt-3 grid gap-2">
                {PREVIEW_SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => applyPreviewScenario(scenario.id)}
                    className={`ia-scenario-chip rounded-[22px] border px-3.5 py-3.5 text-left text-sm transition ${
                      scenario.id === previewScenarioId
                        ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-card-text)]"
                        : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-panel-soft)]"
                    }`}
                  >
                    <p className="font-medium">{scenario.label}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{scenario.message}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="ia-preview-block rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Mensagem de entrada</p>
              <textarea
                value={previewMessage}
                onChange={(event) => setPreviewMessage(event.target.value)}
                rows={5}
                className="client-input mt-3 w-full rounded-2xl border p-3 text-sm outline-none"
                placeholder="Digite uma mensagem para simular o lead"
              />
              <button
                type="button"
                onClick={() => void handleRunPreview()}
                disabled={runningPreview || !previewMessage.trim()}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
              >
                {runningPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Rodar preview
              </button>
              <button
                type="button"
                onClick={() => void handleRunPreviewBatch()}
                disabled={runningPreviewBatch}
                className="mt-3 ml-2 inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
              >
                {runningPreviewBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Rodar bateria base
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Resposta simulada</p>
              <div className="mt-3 rounded-[20px] border border-[rgba(37,211,102,0.22)] bg-[linear-gradient(180deg,rgba(37,211,102,0.16),rgba(37,211,102,0.08))] p-4 text-sm leading-6 text-[var(--cliente-card-text)]">
                {previewResult?.responseText || "Rode um cenario para ver como o Agent v2 responderia."}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Decisao</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StateBadge label={previewResult?.plannerDecision?.decision || "sem preview"} tone="info" />
                  <StateBadge label={previewResult?.plannerDecision?.stateAfter || "--"} tone="neutral" />
                  <StateBadge label={previewResult?.plannerDecision?.responseGoal || "--"} tone="success" />
                  {typeof previewResult?.plannerDecision?.confidence === "number" ? (
                    <StateBadge
                      label={`${Math.round((previewResult.plannerDecision.confidence || 0) * 100)}% de confianca`}
                      tone={previewResult.plannerDecision.confidence >= 0.75 ? "success" : "warning"}
                    />
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">
                  Motivo: {previewResult?.plannerDecision?.reason || "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">CRM e proximo passo</p>
                <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
                  Oferta: {previewResult?.plannerDecision?.recommendedOffer || "--"}
                </p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                  Next action: {previewResult?.plannerDecision?.nextAction || "--"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Campos que iriam para o CRM</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(previewResult?.extractedFields || {}).length === 0 ? (
                  <span className="text-sm text-[var(--cliente-card-text-soft)]">Sem campos extraidos neste preview.</span>
                ) : (
                  Object.entries(previewResult?.extractedFields || {}).map(([key, value]) => (
                    <StateBadge key={key} label={`${key}: ${value}`} tone="neutral" />
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Leitura de qualidade</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(previewResult?.quality?.notes || []).length === 0 ? (
                    <span className="text-sm text-[var(--cliente-card-text-soft)]">Ainda sem notas de qualidade.</span>
                  ) : (
                    (previewResult?.quality?.notes || []).map((note) => <StateBadge key={note} label={note} tone="neutral" />)
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Base usada no preview</p>
                <div className="mt-3 space-y-2">
                  {(previewResult?.matchedKbDocs || []).length === 0 ? (
                    <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhum documento da base foi puxado para esta simulacao.</p>
                  ) : (
                    (previewResult?.matchedKbDocs || []).slice(0, 3).map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <StateBadge label={doc.type} tone="info" />
                          <span className="text-xs text-[var(--cliente-card-text-soft)]">score {doc.score}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-muted)]">{doc.preview}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Bateria de cenarios SDR</p>
                <StateBadge
                  label={
                    previewBatchResults.length
                      ? `${previewBatchResults.filter((item) => item.verdict?.passed).length}/${previewBatchResults.length} aprovados`
                      : "sem bateria"
                  }
                  tone={
                    previewBatchResults.some((item) => item.error)
                      ? "warning"
                      : previewBatchResults.length && previewBatchResults.every((item) => item.verdict?.passed)
                        ? "success"
                        : "info"
                  }
                />
              </div>
              {previewBatchResults.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Aprovados</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{previewBatchSummary.approved}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Ajustar</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{previewBatchSummary.adjustments}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Erros</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{previewBatchSummary.errors}</p>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {previewBatchResults.length === 0 ? (
                  <p className="text-sm text-[var(--cliente-card-text-soft)]">
                    Rode a bateria para validar saudacao, preco, objecao, proposta e audio de uma vez.
                  </p>
                ) : (
                  previewBatchResults.map((item) => (
                    <div
                      key={item.scenarioId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.label}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                          {item.error
                            ? item.error
                            : item.preview?.plannerDecision?.reason || item.preview?.responseText || "sem detalhe"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.error ? (
                          <StateBadge label="erro" tone="danger" />
                        ) : (
                          <>
                            <StateBadge
                              label={item.preview?.plannerDecision?.decision || "sem decisao"}
                              tone={
                                item.preview?.plannerDecision?.decision === "handoff"
                                  ? "warning"
                                  : item.preview?.plannerDecision?.decision === "ask_more"
                                    ? "info"
                                    : "success"
                              }
                            />
                            <StateBadge
                              label={
                                typeof item.preview?.quality?.score === "number"
                                  ? `${Math.round((item.preview?.quality?.score || 0) * 100)}%`
                                  : "--"
                              }
                              tone={
                                typeof item.preview?.quality?.score === "number" && item.preview.quality.score < 0.7
                                  ? "warning"
                                : "success"
                              }
                            />
                            <StateBadge
                              label={item.verdict?.passed ? "aprovado" : "ajustar"}
                              tone={item.verdict?.passed ? "success" : "warning"}
                            />
                          </>
                        )}
                      </div>
                      {!item.error && item.verdict && item.verdict.issues.length > 0 ? (
                        <div className="w-full rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                          {item.verdict.issues.join(" | ")}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle
            title={`Modo do negocio: ${businessProfile.label}`}
            subtitle="Esse perfil agora orienta o objetivo comercial, o tom, as perguntas obrigatorias e os guardrails sugeridos."
          />
          <div className="flex flex-wrap gap-2">
            <StateBadge label={businessProfile.id} tone="info" />
            {canManage ? (
              <button
                type="button"
                onClick={applyBusinessProfileDefaults}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:bg-[var(--cliente-accent-soft)]"
              >
                <Save className="h-3.5 w-3.5" />
                Aplicar sugestoes do modo
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 xl:col-span-2">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Objetivo sugerido</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.ai.objective}</p>
          </div>
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Perguntas obrigatorias</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.ai.mandatoryQuestions.slice(0, 4).map((question) => (
                <StateBadge key={question} label={question} tone="neutral" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Guardrails centrais</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.ai.guardrails.slice(0, 3).map((rule) => (
                <StateBadge key={rule} label={rule} tone="warning" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Cenas de conversa sugeridas</p>
            <div className="mt-3 space-y-2">
              {playbookPreset.scripts.slice(0, 3).map((item) => (
                <div key={item.situation} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.situation}</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">{item.goal}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Ofertas que o agente deve preparar</p>
            <div className="mt-3 space-y-2">
              {playbookPreset.offers.slice(0, 3).map((item) => (
                <div key={item.title} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">{item.category} · {item.targetProfile}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PanelCard>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <CardTitle title="Ajustes rapidos" subtitle="Sinais que pedem atencao antes de continuar refinando o agente" />
          <div className="mt-4 space-y-3">
            {actionSignals.length === 0 ? (
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Sem alertas criticos no console</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                  O agente esta sem sinais relevantes de risco, base ociosa ou handoff excessivo nesta leitura.
                </p>
              </div>
            ) : (
              actionSignals.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  className="w-full rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 text-left transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                    </div>
                    <StateBadge label={item.badge} tone={item.tone} />
                  </div>
                </button>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Contexto desta leitura" subtitle="Recortes e filtros ativos nesta revisao" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <IaContext title="Filtro de logs" value={decisionFilter === "all" ? "Todos" : decisionLabel(decisionFilter)} detail="decisao observada" />
            <IaContext title="Risco" value={logRiskFilter === "all" ? "Todos" : logRiskFilter} detail="recorte analitico" />
            <IaContext title="Uso da base" value={kbUsageFilter === "all" ? "Todos" : kbUsageFilter} detail="documentos no painel" />
            <IaContext title="Handoff" value={settings.responsiblePhone || "pendente"} detail="responsavel configurado" />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <CardTitle title="Saude do agente" subtitle="Leitura executiva do comportamento atual da IA no tenant" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HealthTile
              label="Modo operacional"
              value={settings.enabled ? "Ativo" : "Pausado"}
              detail={settings.enabled ? "respostas automaticas liberadas" : "somente operacao humana"}
              tone={settings.enabled ? "success" : "warning"}
            />
            <HealthTile
              label="Handoff configurado"
              value={settings.responsiblePhone ? "Pronto" : "Pendente"}
              detail={settings.responsiblePhone || "defina o numero do responsavel"}
              tone={settings.responsiblePhone ? "info" : "warning"}
            />
            <HealthTile
              label="Base ativa"
              value={`${kbDocs.length} docs`}
              detail={`${docsSummary.faq} faq • ${docsSummary.catalog} catalogo • ${docsSummary.policy} politicas`}
              tone={kbDocs.length > 0 ? "success" : "warning"}
            />
            <HealthTile
              label="Cobertura KB"
              value={`${aiCoverage.used}/${kbDocs.length || 0}`}
              detail="docs usados nos logs recentes"
              tone={aiCoverage.used > 0 ? "info" : "warning"}
            />
            <HealthTile
              label="Risco operacional"
              value={String(logSummary.lowConfidence)}
              detail="logs com baixa confianca"
              tone={logSummary.lowConfidence > 0 ? "danger" : "success"}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              href="/cliente/painel/inbox"
              className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <span>Ir para inbox operacional</span>
              <span className="text-[var(--cliente-card-text-soft)]">→</span>
            </Link>
            <Link
              href="/cliente/painel/automacoes"
              className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
                <span>Revisar automacoes</span>
                <span className="text-[var(--cliente-card-text-soft)]">→</span>
              </Link>
            </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Leitura de decisao" subtitle="Como a IA esta respondendo, pedindo contexto e escalando para humano" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HealthTile label="Respondeu" value={String(logSummary.responded)} detail="respostas enviadas" tone="success" />
            <HealthTile label="Pediu contexto" value={String(logSummary.askMore)} detail="qualificacao adicional" tone="info" />
            <HealthTile label="Handoff" value={String(logSummary.handoff)} detail="escaladas ao humano" tone="warning" />
            <HealthTile label="Latencia media" value={latencyLabel(logSummary.avgLatency)} detail="tempo medio de resposta" tone="neutral" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HealthTile
              label="Motivo dominante"
              value={aiCoverage.topReason}
              detail="principal causa de handoff"
              tone={logSummary.handoff > 0 ? "warning" : "success"}
            />
            <HealthTile
              label="Perguntas obrigatorias"
              value={String((settings.mandatoryQuestions || []).length)}
              detail="roteiro minimo de qualificacao"
              tone={(settings.mandatoryQuestions || []).length > 0 ? "info" : "warning"}
            />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <form onSubmit={handleSaveSettings} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Configuracao essencial da IA</h3>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--cliente-card-text-soft)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Configuracao ativa
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Nivel de IA
                <select
                  value={settings.tier || "growth"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, tier: event.target.value as AiSettings["tier"] }))}
                  disabled={!canManage}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  <option value="essential">Essencial</option>
                  <option value="growth">Crescimento</option>
                  <option value="premium">Premium</option>
                  <option value="elite">Elite</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>

              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Grau de autonomia
                <select
                  value={settings.autonomyMode || "hybrid"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, autonomyMode: event.target.value as AiSettings["autonomyMode"] }))}
                  disabled={!canManage}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  <option value="copilot">Copilot</option>
                  <option value="hybrid">Hibrido</option>
                  <option value="autonomous">Autonomo</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Nivel de raciocinio
                <select
                  value={settings.reasoningLevel || "balanced"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, reasoningLevel: event.target.value as AiSettings["reasoningLevel"] }))}
                  disabled={!canManage}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  <option value="fast">Rapido</option>
                  <option value="balanced">Equilibrado</option>
                  <option value="deep">Profundo</option>
                </select>
              </label>

              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Estilo de conversa
                <select
                  value={settings.responseStyle || "consultative"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, responseStyle: event.target.value as AiSettings["responseStyle"] }))}
                  disabled={!canManage}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  <option value="concise">Direto</option>
                  <option value="consultative">Consultivo</option>
                  <option value="premium_sales">Premium Sales</option>
                  <option value="closer">Closer</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Orcamento mensal da IA (USD)"
                value={String(settings.monthlyBudgetUsd || 100)}
                onChange={(value) => setSettings((prev) => ({ ...prev, monthlyBudgetUsd: Number(value) || 0 }))}
                placeholder="100"
                disabled={!canManage}
              />
              <Field
                label="Limite mensal de execucoes"
                value={String(settings.monthlyUsageCap || 1500)}
                onChange={(value) => setSettings((prev) => ({ ...prev, monthlyUsageCap: Number(value) || 0 }))}
                placeholder="1500"
                disabled={!canManage}
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs text-[var(--cliente-card-text-soft)]">
              <input
                type="checkbox"
                checked={Boolean(settings.allowPremiumModels)}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, allowPremiumModels: event.target.checked }))
                }
                disabled={!canManage}
                className="h-4 w-4 rounded border-[var(--cliente-border)] bg-transparent"
              />
              Permitir modelos premium (pode aumentar custo rapidamente)
            </label>

            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Motores preferidos
              <div className="mt-2 flex flex-wrap gap-2">
                {PROVIDER_OPTIONS.map((provider) => {
                  const active = (settings.preferredProviders || []).includes(provider.id as NonNullable<AiSettings["preferredProviders"]>[number]);
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      disabled={!canManage}
                      onClick={() =>
                        setSettings((prev) => {
                          const nextProviders = reorderProviders(
                            prev.preferredProviders || [...DEFAULT_AI_PROVIDERS],
                            provider.id as NonNullable<AiSettings["preferredProviders"]>[number],
                            !active
                          );
                          return {
                            ...prev,
                            preferredProviders: nextProviders,
                          };
                        })
                      }
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                          : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"
                      } disabled:opacity-60`}
                    >
                      {provider.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {PROVIDER_OPTIONS.map((provider) => {
                  const status = settings.providerStatus?.[provider.id];
                  return (
                    <span
                      key={`${provider.id}-status`}
                      className={`rounded-full border px-2.5 py-1 ${
                        status?.ready
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      }`}
                    >
                      {provider.label}: {status?.ready ? "pronto" : "sem chave"}
                    </span>
                  );
                })}
              </div>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Modelo principal da conversa
                <select
                  value={settings.conversationModelOverride || ""}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, conversationModelOverride: event.target.value }))
                  }
                  disabled={!canManage}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  {conversationModelOptions.map((option) => (
                    <option key={option.value || "default"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Modelo de extracao
                <select
                  value={settings.extractionModelOverride || ""}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, extractionModelOverride: event.target.value }))
                  }
                  disabled={!canManage}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  {extractionModelOptions.map((option) => (
                    <option key={option.value || "default"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge label={tierLabel(settings.tier)} tone="info" />
                <StateBadge label={settings.autonomyMode || "hybrid"} tone="neutral" />
                <StateBadge label={settings.reasoningLevel || "balanced"} tone="neutral" />
                <StateBadge label={responseStyleLabel(settings.responseStyle)} tone="success" />
              </div>
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
                Motor atual da IA: {settings.runtimePolicy?.primaryProvider || "openai"} / {settings.runtimePolicy?.conversationModel || "gpt-4.1-mini"}.
              </p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                Extracao atual: {settings.runtimePolicy?.extractionModel || "gpt-4.1-mini"}.
              </p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                Busca {settings.runtimePolicy?.retrievalMode || "keyword"} • ferramentas {settings.runtimePolicy?.supportsToolCalling ? "ligadas" : "desligadas"} • budget {settings.runtimePolicy?.budgetMode || "balanced"}.
              </p>
              {settings.runtimePolicy?.modelGuardrailApplied ? (
                <p className="mt-1 text-xs text-amber-300">
                  Guardrail ativo: modelo premium reduzido automaticamente para modo economico.
                </p>
              ) : null}
              <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
                Padrao novo: OpenAI usa `gpt-4.1-mini` por economia. Modelo mais caro so entra se voce escolher explicitamente aqui.
              </p>
              {!settings.allowPremiumModels ? (
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                  Trava de custo ativa: modelos premium ficam bloqueados para este tenant.
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                disabled={!canManage}
              />
              IA habilitada para responder automaticamente
            </label>

            <Field label="Tom de voz" value={settings.toneOfVoice} onChange={(value) => setSettings((prev) => ({ ...prev, toneOfVoice: value }))} placeholder="consultivo, claro e humano" disabled={!canManage} />
            <Field label="Nome do agente" value={settings.agentName || ""} onChange={(value) => setSettings((prev) => ({ ...prev, agentName: value }))} placeholder="Ex: Laura da clinica, Agente da imobiliaria" disabled={!canManage} />
            <Field label="Resumo do negocio" value={settings.businessSummary} onChange={(value) => setSettings((prev) => ({ ...prev, businessSummary: value }))} placeholder="o que a empresa vende, para quem e com qual foco" disabled={!canManage} />
            <Field label="Objetivo principal da IA" value={settings.objective || ""} onChange={(value) => setSettings((prev) => ({ ...prev, objective: value }))} placeholder="qualificar, orientar, vender e encaminhar" disabled={!canManage} />
            <Field label="WhatsApp responsavel (handoff)" value={settings.responsiblePhone} onChange={(value) => setSettings((prev) => ({ ...prev, responsiblePhone: value }))} placeholder="5511999999999" disabled={!canManage} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
                <input
                  type="checkbox"
                  checked={settings.voiceReplyEnabled === true}
                  onChange={(event) => setSettings((prev) => ({ ...prev, voiceReplyEnabled: event.target.checked }))}
                  disabled={!canManage}
                />
                Responder com audio quando o lead enviar audio
              </label>
              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Voz da IA
                <select
                  value={settings.voiceReplyVoice || "alloy"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, voiceReplyVoice: event.target.value }))}
                  disabled={!canManage || settings.voiceReplyEnabled !== true}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  <option value="alloy">Alloy</option>
                  <option value="ash">Ash</option>
                  <option value="ballad">Ballad</option>
                  <option value="coral">Coral</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="nova">Nova</option>
                  <option value="onyx">Onyx</option>
                  <option value="sage">Sage</option>
                  <option value="shimmer">Shimmer</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <input
                type="checkbox"
                checked={settings.handoffNotifyEnabled !== false}
                onChange={(event) => setSettings((prev) => ({ ...prev, handoffNotifyEnabled: event.target.checked }))}
                disabled={!canManage}
              />
              Notificar responsaveis via WhatsApp quando a IA pedir handoff
            </label>
            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              WhatsApps para notificar no handoff (um por linha)
              <textarea
                value={handoffNotifyPhonesText}
                onChange={(event) => setHandoffNotifyPhonesText(event.target.value)}
                rows={3}
                disabled={!canManage}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
                placeholder={"5511999999999\n5511888888888"}
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <input
                type="checkbox"
                checked={settings.whatsappTemplateFollowUpEnabled !== false}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, whatsappTemplateFollowUpEnabled: event.target.checked }))
                }
                disabled={!canManage}
              />
              Follow-up automatico por template quando fechar a janela de 24h
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Template padrao (24h+)"
                value={settings.whatsappTemplateFollowUpName || "follow_up_geral"}
                onChange={(value) => setSettings((prev) => ({ ...prev, whatsappTemplateFollowUpName: value }))}
                placeholder="follow_up_geral"
                disabled={!canManage}
              />
              <Field
                label="Idioma do template"
                value={settings.whatsappTemplateFollowUpLanguage || "pt_BR"}
                onChange={(value) => setSettings((prev) => ({ ...prev, whatsappTemplateFollowUpLanguage: value }))}
                placeholder="pt_BR"
                disabled={!canManage}
              />
            </div>
            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Parametros do template (um por linha, opcional)
              <textarea
                value={followUpTemplateParamsText}
                onChange={(event) => setFollowUpTemplateParamsText(event.target.value)}
                rows={3}
                disabled={!canManage}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
                placeholder={"Exemplo sem variavel\nou\n{{nome}}"}
              />
            </label>

            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Guardrails (uma regra por linha)
              <textarea
                value={guardrailsText}
                onChange={(event) => setGuardrailsText(event.target.value)}
                rows={5}
                disabled={!canManage}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
                placeholder="Nao conceder desconto sem aprovacao\nNao prometer prazo sem validar operacao"
              />
            </label>

            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Perguntas obrigatorias da IA
              <textarea
                value={mandatoryQuestionsText}
                onChange={(event) => setMandatoryQuestionsText(event.target.value)}
                rows={4}
                disabled={!canManage}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
                placeholder="Qual o servico desejado?\nQual prazo voce precisa?\nQual faixa de investimento?"
              />
            </label>

            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Assuntos que exigem handoff humano
              <textarea
                value={escalationTopicsText}
                onChange={(event) => setEscalationTopicsText(event.target.value)}
                rows={4}
                disabled={!canManage}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
                placeholder="pedido de desconto especial\ncliente irritado\nnegociacao fora da politica"
              />
            </label>

            {canManage ? (
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
              >
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar configuracoes
              </button>
            ) : null}
          </form>
        </PanelCard>

        <PanelCard className="p-5">
          <form onSubmit={handleAddKbDoc} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Base de conhecimento</h3>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--cliente-card-text-soft)]">
                <Sparkles className="h-3.5 w-3.5" />
                {editingDocId ? "Editando documento" : "Conteudo vivo"}
              </span>
            </div>

            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Tipo
              <select
                value={docType}
                onChange={(event) => {
                  const nextType = event.target.value as KbDoc["type"];
                  setDocType(nextType);
                  if (nextType !== "catalog") {
                    clearCatalogDraft();
                  }
                }}
                disabled={!canEditKb}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
              >
                <option value="faq">FAQ</option>
                <option value="catalog">Catalogo</option>
                <option value="policy">Politica</option>
              </select>
            </label>

            <label className="block text-xs text-[var(--cliente-card-text-soft)]">
              Conteudo
              <textarea
                value={docContent}
                onChange={(event) => setDocContent(event.target.value)}
                rows={6}
                disabled={!canEditKb}
                className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
                placeholder="Descreva produto, resposta pronta, politica ou informacoes comerciais"
              />
            </label>

            <Field label="Tags (separadas por virgula)" value={docTags} onChange={setDocTags} placeholder="preco, prazo, onboarding" disabled={!canEditKb} />
            {docType === "catalog" ? (
              <div className="space-y-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Campos comerciais do catalogo</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="Nome do produto"
                    value={docProductName}
                    onChange={setDocProductName}
                    placeholder="Plano Growth WhatsApp"
                    disabled={!canEditKb}
                  />
                  <Field
                    label="Categoria"
                    value={docProductCategory}
                    onChange={setDocProductCategory}
                    placeholder="assinatura, servico, pacote"
                    disabled={!canEditKb}
                  />
                </div>
                <Field
                  label="Perfil alvo"
                  value={docTargetProfile}
                  onChange={setDocTargetProfile}
                  placeholder="ecommerce, clinicas, imobiliarias"
                  disabled={!canEditKb}
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Preco inicial" value={docPriceFrom} onChange={setDocPriceFrom} placeholder="297" disabled={!canEditKb} />
                  <Field label="Preco final" value={docPriceTo} onChange={setDocPriceTo} placeholder="1290" disabled={!canEditKb} />
                  <Field label="Prioridade" value={docPriority} onChange={setDocPriority} placeholder="80" disabled={!canEditKb} />
                </div>
                <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                  Disponibilidade
                  <select
                    value={docAvailability}
                    onChange={(event) => setDocAvailability(event.target.value as typeof docAvailability)}
                    disabled={!canEditKb}
                    className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                  >
                    <option value="active">Ativo</option>
                    <option value="seasonal">Sazonal</option>
                    <option value="paused">Pausado</option>
                  </select>
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="Upsell (chaves)"
                    value={docUpsellKeys}
                    onChange={setDocUpsellKeys}
                    placeholder="plano_pro, suporte_premium"
                    disabled={!canEditKb}
                  />
                  <Field
                    label="Cross-sell (chaves)"
                    value={docCrossSellKeys}
                    onChange={setDocCrossSellKeys}
                    placeholder="crm_plus, automacao_followup"
                    disabled={!canEditKb}
                  />
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Chave do servico" value={docServiceKey} onChange={setDocServiceKey} placeholder="botox, visita_apto, limpeza_pele" disabled={!canEditKb} />
              <Field label="Titulo da midia" value={docMediaTitle} onChange={setDocMediaTitle} placeholder="Resultado botox 30 dias" disabled={!canEditKb} />
            </div>
            <div className="grid gap-3 md:grid-cols-[0.7fr_1.3fr]">
              <label className="block text-xs text-[var(--cliente-card-text-soft)]">
                Tipo de midia
                <select
                  value={docMediaType}
                  onChange={(event) => setDocMediaType(event.target.value as typeof docMediaType)}
                  disabled={!canEditKb}
                  className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  <option value="">Sem midia</option>
                  <option value="image">Imagem</option>
                  <option value="video">Video</option>
                  <option value="document">Documento</option>
                </select>
              </label>
              <Field label="URL publica da midia" value={docMediaUrl} onChange={setDocMediaUrl} placeholder="https://..." disabled={!canEditKb} />
            </div>
            <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--cliente-card-text)]">Upload de midia</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                    Imagens ate 12 MB, videos ate 64 MB e documentos ate 24 MB.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-accent)]">
                  {uploadingKbMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                  {uploadingKbMedia ? "Enviando" : "Escolher arquivo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    className="hidden"
                    disabled={!canEditKb || uploadingKbMedia}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void handleKbMediaUpload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {docMediaUrl ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel)] px-3 py-2">
                  <p className="text-xs text-[var(--cliente-card-text-muted)]">
                    {docMediaTitle || "Midia vinculada"} {docMediaSize ? `- ${(docMediaSize / 1024 / 1024).toFixed(1)} MB` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDocMediaUrl("");
                      setDocMediaType("");
                      setDocMediaTitle("");
                      setDocMediaStoragePath("");
                      setDocMediaMimeType("");
                      setDocMediaSize(null);
                    }}
                    disabled={!canEditKb}
                    className="text-xs font-semibold text-rose-300 disabled:opacity-60"
                  >
                    Remover vinculo
                  </button>
                </div>
              ) : null}
            </div>

            {canEditKb ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={savingDoc || !docContent.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  {savingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingDocId ? "Atualizar documento" : "Adicionar documento"}
                </button>
                {editingDocId ? (
                  <button
                    type="button"
                    onClick={clearKbDocForm}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]"
                  >
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Documentos cadastrados" subtitle="Base ativa com busca e manutencao por tipo" />
            <StateBadge label={`${filteredDocs.length}/${kbDocs.length}`} tone="info" />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="client-input flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
              <input
                value={kbSearch}
                onChange={(event) => setKbSearch(event.target.value)}
                placeholder="Buscar por conteudo, tag ou tipo..."
                className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>
            <select
              value={kbTypeFilter}
              onChange={(event) => setKbTypeFilter(event.target.value as typeof kbTypeFilter)}
              className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">Todos os tipos</option>
              <option value="faq">FAQ</option>
              <option value="catalog">Catalogo</option>
              <option value="policy">Politica</option>
            </select>
            <select
              value={kbUsageFilter}
              onChange={(event) => setKbUsageFilter(event.target.value as typeof kbUsageFilter)}
              className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">Todos os docs</option>
              <option value="used">Em uso</option>
              <option value="unused">Sem uso</option>
            </select>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <DocColumn
              title="FAQ"
              docs={filteredDocsByType.faq}
              canEdit={canEditKb}
              canDelete={canManage}
              busyDocId={busyDocId}
              onEdit={startEditingDoc}
              onDelete={(docId) => void handleDeleteDoc(docId)}
            />
            <DocColumn
              title="Catalogo"
              docs={filteredDocsByType.catalog}
              canEdit={canEditKb}
              canDelete={canManage}
              busyDocId={busyDocId}
              onEdit={startEditingDoc}
              onDelete={(docId) => void handleDeleteDoc(docId)}
            />
            <DocColumn
              title="Politicas"
              docs={filteredDocsByType.policy}
              canEdit={canEditKb}
              canDelete={canManage}
              busyDocId={busyDocId}
              onEdit={startEditingDoc}
              onDelete={(docId) => void handleDeleteDoc(docId)}
            />
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Base mais acionada" subtitle="Quais documentos a IA mais usa nas decisoes" />
            <StateBadge label={`${kbUsage.filter((item) => item.total > 0).length} em uso`} tone="info" />
          </div>
          <div className="mt-4 space-y-2">
            {kbUsage.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao ha dados de uso da base.</p>
            ) : (
              kbUsage.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.type.toUpperCase()}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.preview || "Documento sem preview."}</p>
                    </div>
                    <StateBadge label={`${item.total} usos`} tone={item.total > 0 ? "success" : "neutral"} />
                  </div>
                </div>
              ))
            )}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Motivos de handoff" subtitle="Principais causas de escalada para humano" />
            <StateBadge label={`${handoffReasons.length} mapeados`} tone="warning" />
          </div>
          <div className="mt-4 space-y-2">
            {handoffReasons.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao houve handoffs recentes com motivo consolidado.</p>
            ) : (
              handoffReasons.map((item) => (
                <div key={item.reason} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[var(--cliente-card-text-muted)]">{item.reason}</p>
                    <StateBadge label={`${item.total}x`} tone="warning" />
                  </div>
                </div>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Logs recentes da IA" subtitle="Rastreabilidade de decisao, contexto e handoff" />
            <StateBadge label={`${filteredLogs.length}/${logs.length} registros`} tone="info" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_220px]">
            <label className="client-input flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
              <input
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="Buscar por chat, motivo ou resposta..."
                className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>
            <select
              value={decisionFilter}
              onChange={(event) => setDecisionFilter(event.target.value as typeof decisionFilter)}
              className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">Todas as decisoes</option>
              <option value="respond">Responder</option>
              <option value="ask_more">Perguntar mais</option>
              <option value="handoff">Handoff</option>
              <option value="skip">Skip</option>
            </select>
            <select
              value={logRiskFilter}
              onChange={(event) => setLogRiskFilter(event.target.value as typeof logRiskFilter)}
              className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">Todos os riscos</option>
              <option value="low_confidence">Baixa confianca</option>
              <option value="handoff_only">Somente handoff</option>
            </select>
          </div>
          <div className="mt-3 space-y-2">
            {filteredLogs.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhum log recente encontrado.</p>
            ) : (
              filteredLogs.map((log) => (
                <article key={log.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--cliente-card-text)]">Chat {log.chatId || "-"}</p>
                      <p className="text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(log.createdAt)} | motivo {log.reason || "-"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StateBadge label={decisionLabel(log.decision)} tone={decisionTone(log.decision)} />
                      <StateBadge label={`conf ${confidenceLabel(log.confidence)}`} tone="neutral" />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Entrada</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{log.input || "Sem entrada registrada."}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Saida</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{log.output || "Sem resposta enviada."}</p>
                    </div>
                  </div>

                  {log.plannerIntent || log.responseGoal || log.stateBefore || log.stateAfter || log.recommendedOffer || log.objectionType || log.commercialTemperature ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-[0.95fr_1.05fr]">
                      <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Decisao do agente</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {log.plannerIntent ? (
                            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                              intencao: {log.plannerIntent}
                            </span>
                          ) : null}
                          {log.responseGoal ? (
                            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                              objetivo: {log.responseGoal}
                            </span>
                          ) : null}
                          {log.stateBefore ? (
                            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                              antes: {log.stateBefore}
                            </span>
                          ) : null}
                          {log.stateAfter ? (
                            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                              depois: {log.stateAfter}
                            </span>
                          ) : null}
                          {log.objectionType ? (
                            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                              objecao: {log.objectionType}
                            </span>
                          ) : null}
                          {log.commercialTemperature ? (
                            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                              temperatura: {log.commercialTemperature}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Oferta sugerida</p>
                        <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                          {log.recommendedOffer || "Sem oferta dominante neste ponto da conversa."}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {log.nextAction || (log.extractedFields && Object.keys(log.extractedFields).length) ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-[0.8fr_1.2fr]">
                      <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Proximo passo sugerido</p>
                        <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{log.nextAction || "Sem sugestao operacional."}</p>
                      </div>
                      <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Campos extraidos</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(log.extractedFields || {}).length ? (
                            Object.entries(log.extractedFields || {}).slice(0, 6).map(([field, value]) => (
                              <span key={`${log.id}_${field}`} className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                                {field}: {value}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-[var(--cliente-card-text-soft)]">Sem estrutura extraida neste log.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--cliente-card-text-soft)]">
                    {log.chatId ? (
                      <Link
                        href={`/cliente/painel/inbox?chatId=${encodeURIComponent(log.chatId)}`}
                        className="rounded-full border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-2.5 py-1 text-[var(--cliente-accent)] transition hover:brightness-95"
                      >
                        abrir conversa
                      </Link>
                    ) : null}
                    <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1">latencia {latencyLabel(log.latencyMs)}</span>
                    {(log.matchedKbDocIds || []).slice(0, 3).map((docId) => (
                      <span key={`${log.id}_${docId}`} className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1">
                        kb {docId.slice(0, 10)}
                      </span>
                    ))}
                    {(log.toolCalls || []).slice(0, 3).map((tool) => (
                      <span key={`${log.id}_${tool}`} className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1">
                        {tool}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </PanelCard>
      </section>

      {error ? (
        <p className="rounded-[22px] border border-rose-400/18 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-[22px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
          {success}
        </p>
      ) : null}
    </div>
  );
}

function HealthTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{label}</p>
        <StateBadge label={label} tone={tone} />
      </div>
      <p className="mt-3 text-lg font-semibold text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs text-[var(--cliente-card-text-soft)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="client-input mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-[var(--cliente-accent-soft)] focus:ring disabled:opacity-60"
      />
    </label>
  );
}

function IaContext({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{title}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );
}

function DocColumn({
  title,
  docs,
  canEdit,
  canDelete,
  busyDocId,
  onEdit,
  onDelete,
}: {
  title: string;
  docs: KbDoc[];
  canEdit: boolean;
  canDelete: boolean;
  busyDocId: string | null;
  onEdit: (doc: KbDoc) => void;
  onDelete: (docId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <h4 className="text-xs uppercase tracking-wide text-[var(--cliente-card-text-soft)]">{title}</h4>
      <div className="mt-2 space-y-2">
        {docs.map((doc) => (
          <article key={doc.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
            <p className="line-clamp-4 text-xs text-[var(--cliente-card-text-muted)]">{doc.content}</p>
            <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">{doc.tags.join(", ") || "sem tags"}</p>
            {doc.type === "catalog" ? (
              <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">
                {[doc.productName, doc.productCategory, doc.targetProfile].filter(Boolean).join(" | ") || "catalogo sem estrutura comercial"}
              </p>
            ) : null}
            {doc.type === "catalog" && (typeof doc.priceFrom === "number" || typeof doc.priceTo === "number") ? (
              <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">
                faixa: {typeof doc.priceFrom === "number" ? doc.priceFrom : "-"} ate {typeof doc.priceTo === "number" ? doc.priceTo : "-"}
              </p>
            ) : null}
            {doc.type === "catalog" && (doc.upsellKeys?.length || doc.crossSellKeys?.length) ? (
              <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">
                upsell: {(doc.upsellKeys || []).join(", ") || "-"} | cross: {(doc.crossSellKeys || []).join(", ") || "-"}
              </p>
            ) : null}
            {doc.mediaUrl ? (
              <p className="mt-1 text-[10px] text-[var(--cliente-accent)]">
                {doc.mediaType || "midia"}: {doc.mediaTitle || doc.serviceKey || "asset cadastrado"}
              </p>
            ) : null}
            <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">{formatDateTime(doc.updatedAt || doc.createdAt)}</p>
            {canEdit || canDelete ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(doc)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1.5 text-[11px] text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    Editar
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    disabled={busyDocId === doc.id}
                    onClick={() => onDelete(doc.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
        {docs.length === 0 ? <p className="text-xs text-[var(--cliente-card-text-soft)]">Nenhum documento.</p> : null}
      </div>
    </div>
  );
}
