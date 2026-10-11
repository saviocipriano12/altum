import { hasCreativeProviderContract } from "@/lib/server/agent-os/creative-provider-contracts";

export type CreativeRoute = {
  model: string | null;
  purpose: "final" | "draft" | "avatar" | "image" | "audio" | "provider_default";
  reason: string;
};

/** The only choices exposed to a person. Provider and model selection stay internal. */
export type MediaPreference = "economy" | "balanced" | "quality" | "private";

export type MediaConnectionCandidate = {
  id: string;
  providerId: string;
  displayName?: string;
  capabilities: string[];
  status: string;
  /** The secret stays in the server vault; routing only needs to know whether it exists. */
  credentialConfigured?: boolean;
  scope?: "platform" | "tenant";
  tenantId?: string | null;
  connectionType?: string;
  /** URL is only used to recognize an explicitly configured custom bridge. */
  baseUrl?: string;
  creativeModel?: unknown;
  /** Dados do último probe ou da última execução. Nunca incluem credenciais. */
  health?: unknown;
};

export type MediaConnectionRoute = {
  connection: MediaConnectionCandidate;
  preference: MediaPreference;
  reason: string;
};

/** Honors a provider request only when it is an actual configured and healthy
 * connection for this capability. Natural language remains the default. */
export function findExplicitMediaConnectionRequest(input: {
  message: string;
  connections: MediaConnectionCandidate[];
  capability: string;
  tenantId: string;
}): MediaConnectionCandidate | null {
  const message = normalized(input.message);
  if (!/\b(usar|use|via|pelo|pela|provider|conexao|conexão|modelo)\b/.test(message)) return null;
  const candidates = input.connections
    .filter((connection) => connection.credentialConfigured !== false && mediaConnectionAvailability(connection).available
      && hasCreativeProviderContract(connection, input.capability)
      && connection.capabilities.includes(input.capability)
      && (connection.scope !== "tenant" || connection.tenantId === input.tenantId))
    .sort((left, right) => Math.max(String(right.displayName || "").length, right.providerId.length) - Math.max(String(left.displayName || "").length, left.providerId.length));
  return candidates.find((connection) => [connection.displayName, connection.providerId]
    .filter((value): value is string => Boolean(value))
    .map(normalized).filter((value) => value.length >= 3).some((name) => message.includes(name))) || null;
}
/**
 * The execution order for one media request.  The user never has to choose a
 * provider: this is persisted with the job and consumed by the worker if a
 * provider is unavailable, out of capacity or rejects the request.
 */
export type MediaConnectionPlan = {
  routes: MediaConnectionRoute[];
  preference: MediaPreference;
};

/** Providers with a versioned adapter for private, persistent identity
 * references. Other video providers can still render media, but must not be
 * offered for anchor training until their distinct consent/reference API is
 * implemented and validated. */
const PERSISTENT_IDENTITY_ANCHOR_PROVIDERS = new Set(["higgsfield"]);

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function providerProfile(provider: string) {
  const id = normalized(provider);
  if (["comfyui", "ltx", "openmontage", "ollama", "local"].includes(id)) return { economy: 96, quality: 62, privacy: 100, label: "executor privado/local" };
  if (id === "fal") return { economy: 52, quality: 96, privacy: 55, label: "produção de alta qualidade" };
  if (id === "replicate") return { economy: 56, quality: 84, privacy: 55, label: "produção compatível" };
  if (id === "higgsfield") return { economy: 46, quality: 95, privacy: 50, label: "produção cinematográfica e de personagem" };
  if (id === "heygen") return { economy: 36, quality: 94, privacy: 48, label: "produção especializada" };
  if (["huggingface", "nvidia", "nvidia-nim", "groq", "freellmapi"].includes(id)) return { economy: 80, quality: 68, privacy: 62, label: "capacidade conectada" };
  return { economy: 60, quality: 70, privacy: 60, label: "capacidade conectada" };
}

type ConnectionHealth = {
  status?: unknown;
  cooldownUntil?: unknown;
  lastSucceededAt?: unknown;
  consecutiveFailures?: unknown;
};

function timestampMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * A configured provider may be attempted for its first verified execution, but
 * a route that just failed is never retried until its short cooldown expires.
 * This lets a newly connected provider prove itself while preventing a quota or
 * outage from making every request take the same failing first step.
 */
export function mediaConnectionAvailability(candidate: Pick<MediaConnectionCandidate, "status" | "health">, now = Date.now()) {
  if (!["configured_unapproved", "healthy", "approved"].includes(candidate.status)) return { available: false, score: -10_000 };
  const health = (candidate.health && typeof candidate.health === "object" ? candidate.health : {}) as ConnectionHealth;
  if (["degraded", "down", "unavailable", "disabled"].includes(String(health.status || "").toLowerCase())) return { available: false, score: -10_000 };
  const cooldownUntil = timestampMillis(health.cooldownUntil);
  if (cooldownUntil > now) return { available: false, score: -10_000 };
  const failures = Math.min(6, Math.max(0, Number(health.consecutiveFailures || 0)));
  const freshSuccess = timestampMillis(health.lastSucceededAt) > now - 1000 * 60 * 60 * 24 * 14;
  return { available: true, score: (freshSuccess ? 14 : 0) - failures * 7 };
}

export function inferMediaPreference(prompt: string): MediaPreference {
  const text = normalized(prompt);
  if (/privado|local|na minha maquina|sem enviar|confidencial/.test(text)) return "private";
  if (/final|premium|realista|realismo|cinematograf|campanha principal|alta qualidade|maxima qualidade/.test(text)) return "quality";
  if (/teste|variac|rascunho|rapido|barato|volume|lote|econom/.test(text)) return "economy";
  return "balanced";
}

/**
 * Selects an available executor, not a brand. This is deliberately based only
 * on connections that are already configured, scoped and capable of the task.
 * It does not claim that a remote provider is free: only local executors earn
 * the privacy/local score, while actual provider prices remain an approval concern.
 */
export function routeMediaConnection(input: {
  connections: MediaConnectionCandidate[];
  capability: string;
  tenantId: string;
  prompt: string;
  preference?: MediaPreference;
  /** Internal continuity affinity, never a provider choice exposed to the user. */
  preferredProviderId?: string | null;
}): MediaConnectionRoute | null {
  return planMediaConnections(input).routes[0] || null;
}

export function planMediaConnections(input: {
  connections: MediaConnectionCandidate[];
  capability: string;
  tenantId: string;
  prompt: string;
  preference?: MediaPreference;
  /** Internal continuity affinity, never a provider choice exposed to the user. */
  preferredProviderId?: string | null;
}): MediaConnectionPlan {
  const preference = input.preference || inferMediaPreference(input.prompt);
  const candidates = input.connections.filter((connection) =>
    connection.credentialConfigured !== false
    && mediaConnectionAvailability(connection).available
    && hasCreativeProviderContract(connection, input.capability)
    && connection.capabilities.includes(input.capability)
    && (connection.scope !== "tenant" || connection.tenantId === input.tenantId),
  );
  if (!candidates.length) return { routes: [], preference };
  const ranked = [...candidates].sort((left, right) => {
    const a = providerProfile(left.providerId); const b = providerProfile(right.providerId);
    const score = (profile: ReturnType<typeof providerProfile>) => preference === "economy" ? profile.economy : preference === "quality" ? profile.quality : preference === "private" ? profile.privacy : Math.round(profile.economy * 0.35 + profile.quality * 0.5 + profile.privacy * 0.15);
    const preferred = normalized(input.preferredProviderId || "");
    const bonus = (providerId: string) => preferred && normalized(providerId) === preferred ? 1000 : 0;
    const healthA = mediaConnectionAvailability(left).score;
    const healthB = mediaConnectionAvailability(right).score;
    return (score(b) + healthB + bonus(right.providerId)) - (score(a) + healthA + bonus(left.providerId)) || left.id.localeCompare(right.id);
  });
  const goal = preference === "economy" ? "economia" : preference === "quality" ? "qualidade" : preference === "private" ? "privacidade" : "equilíbrio entre qualidade e custo";
  return {
    preference,
    routes: ranked.map((connection, index) => {
      const profile = providerProfile(connection.providerId);
      const health = mediaConnectionAvailability(connection);
      const verified = health.score > 0 ? " Já concluiu uma entrega recente." : " Será validado nesta primeira entrega.";
      const fallback = index === 0 ? "" : " Será usado automaticamente se a opção anterior não puder concluir a tarefa.";
      return {
        connection,
        preference,
        reason: `A Altum colocou ${connection.displayName || connection.providerId} na posição ${index + 1} para priorizar ${goal} (${profile.label}).${verified}${fallback}`,
      };
    }),
  };
}

export function routeAvatarAnchorConnection(input: {
  connections: MediaConnectionCandidate[];
  tenantId: string;
  prompt: string;
}): MediaConnectionRoute | null {
  return routeMediaConnection({
    ...input,
    capability: "GENERATE_AVATAR_VIDEO",
    preference: "quality",
    connections: input.connections.filter((connection) => PERSISTENT_IDENTITY_ANCHOR_PROVIDERS.has(normalized(connection.providerId))),
  });
}

/**
 * Picks a production route from the creative brief. The choice is deliberately
 * stored with the job, so a later provider/configuration change cannot alter a
 * job that the user has already approved.
 */
/**
 * Returns the documented, modality-specific default for a certified adapter.
 * A connection used to have one `creativeModel` field, which meant a saved
 * video default could accidentally be forwarded to an image request.  Keep
 * routing defaults here, by capability, and reserve `requestedModel` for an
 * explicit operator/MCP choice.
 */
export function defaultCreativeModel(providerId: string, format: string): string | null {
  const provider = normalized(providerId);
  if (provider === "fal") {
    if (format === "audio") return "fal-ai/chatterbox/text-to-speech";
    if (format === "image") return "fal-ai/flux-2/klein/9b";
    return "bytedance/seedance-2.0/text-to-video";
  }
  if (provider === "replicate") return format === "video" ? "bytedance/seedance-1-pro" : "black-forest-labs/flux-schnell";
  if (provider === "higgsfield") return format === "video" ? "bytedance/seedance-2.0/text-to-video" : "higgsfield-ai/soul/v2/standard";
  if (provider === "ltx-cloud") return format === "video" ? "ltx-2-5-pro" : null;
  if (provider === "alibaba-model-studio") return format === "video" ? "wan2.7-t2v" : "qwen-image-3.0";
  if (provider === "xai") return format === "video" ? "grok-imagine-video-1.5-lite" : "grok-imagine-image-2.0";
  return null;
}

export function routeCreativeModel(input: { providerId: string; format: string; prompt: string; requestedModel?: unknown }): CreativeRoute {
  const requestedModel = typeof input.requestedModel === "string" && input.requestedModel.trim() ? input.requestedModel.trim() : null;
  if (requestedModel) {
    return { model: requestedModel, purpose: "provider_default", reason: "Modelo escolhido explicitamente para esta entrega; a Altum mantém os demais providers compatíveis como fallback." };
  }
  const text = normalized(input.prompt);
  const wantsAvatar = /avatar|clone|apresentador|falando|talking.?head|ugc/.test(text);
  const preference = inferMediaPreference(input.prompt);
  const wantsFinal = preference === "quality";
  const wantsDraft = preference === "economy";
  if (input.providerId === "fal" && input.format === "audio") {
    return { model: "fal-ai/chatterbox/text-to-speech", purpose: "audio", reason: "Narração sintetizada pelo adaptador oficial de voz da fal; a Altum guarda a entrega privada para revisão." };
  }
  if (input.providerId === "higgsfield" && input.format !== "video") {
    return { model: "higgsfield-ai/soul/v2/standard", purpose: "image", reason: "Imagem de produção com suporte a identidade visual persistente quando uma âncora Higgsfield estiver pronta." };
  }
  if (input.providerId === "alibaba-model-studio" && input.format !== "video") {
    return { model: "qwen-image-3.0", purpose: "image", reason: "Imagem Qwen da conta Alibaba conectada; a entrega seguirá para sua biblioteca privada antes de qualquer reutilização." };
  }
  if (input.providerId === "alibaba-model-studio" && input.format === "video") {
    return { model: "wan2.7-t2v", purpose: "final", reason: "Vídeo Wan assíncrono da conta Alibaba conectada; a Altum acompanha a tarefa e salva a entrega antes do link temporário expirar." };
  }
  if (input.providerId !== "fal") {
    return { model: defaultCreativeModel(input.providerId, input.format), purpose: "provider_default", reason: "Usa o modelo padrão certificado para esta modalidade neste provider." };
  }
  if (input.format !== "video") {
    return { model: "fal-ai/flux-2/klein/9b", purpose: "image", reason: "Imagem de conceito rápida; a Altum pode elevar a qualidade em uma revisão posterior." };
  }
  if (wantsAvatar) return { model: "veed/fabric-1.0/text", purpose: "avatar", reason: "O pedido pede uma pessoa falando; a geração continua sujeita ao perfil de avatar e consentimento aprovados." };
  if (wantsFinal) return { model: "bytedance/seedance-2.0/text-to-video", purpose: "final", reason: "O briefing pede realismo ou entrega final; prioriza qualidade visual." };
  if (wantsDraft) return { model: "xai/grok-imagine-video/text-to-video", purpose: "draft", reason: "O briefing prioriza velocidade, volume ou teste; prioriza custo e agilidade." };
  return { model: "bytedance/seedance-2.0/text-to-video", purpose: "final", reason: "Vídeo de campanha usa qualidade como padrão para a primeira entrega." };
}

