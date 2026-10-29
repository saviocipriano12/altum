// Metadata only. Never accepts messages, customer records or connector credentials.
export const LF_SCOPE = {
  tenantId: "saas_fZxgDGSTcpRaiKOp1SpNNcwrOOM2",
  connectionId: "D6yHmAWl8s31HQecWLfs",
  storeDomain: "lf-multimarcas-vitoria-nm0fp51f.myshopify.com",
} as const;
type Row = { id: string; data: Record<string, unknown> };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export function buildLfScopeMetadata(input: { settings: Row; connections: Row[]; channels: Row[]; documents: Row[]; pipelines: Row[] }) {
  if (input.settings.id !== LF_SCOPE.tenantId) throw new Error("Configuracao fora da LF selecionada.");
  for (const row of [...input.connections, ...input.channels, ...input.documents]) {
    if (row.data.tenantId !== LF_SCOPE.tenantId) throw new Error("Metadado de outro tenant; nao gerar inventario.");
  }
  for (const row of input.pipelines) {
    const legacyDirect = row.id === LF_SCOPE.tenantId && !row.data.tenantId;
    if (!legacyDirect && row.data.tenantId !== LF_SCOPE.tenantId) throw new Error("Funil de outro tenant.");
  }
  const connection = input.connections.find(row => row.id === LF_SCOPE.connectionId)?.data;
  if (!connection || connection.provider !== "shopify" || connection.storeId !== LF_SCOPE.storeDomain) throw new Error("Conexao Shopify LF nao confirmada.");
  const settings = input.settings.data;
  if (settings.tenantId && settings.tenantId !== LF_SCOPE.tenantId) throw new Error("Configuracao de outro tenant.");
  const ai = record(settings.ai), profile = record(ai.operatingProfile), rollout = record(ai.rollout);
  const exclusive = record(rollout.exclusiveTest), pilot = record(connection.liveCatalogPilot);
  const ids = Array.isArray(exclusive.chatIds) ? exclusive.chatIds : [];
  const pipeline = input.pipelines.find(row => row.id === LF_SCOPE.tenantId) || input.pipelines[0];
  const stages = Array.isArray(pipeline?.data.stages) ? pipeline.data.stages.map(record) : [];
  const stageIds = stages.map(stage => stage.id).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id));
  return {
    schemaVersion: "lf-ai-scope-metadata-v1", capturedAt: new Date().toISOString(), readOnly: true,
    tenantId: LF_SCOPE.tenantId, connectionId: LF_SCOPE.connectionId,
    identity: { expectedConnectionAndDomainConfirmed: true, configuredNamePresent: present(settings.name) },
    connection: { savedActive: connection.status === "active", credentialsTested: false,
      activeShopifyConnectionsInSample: input.connections.filter(row => row.data.provider === "shopify" && row.data.status === "active").length,
      connectionSampleTruncated: input.connections.length >= 21,
      legacyPilotEnabled: pilot.enabled === true,
      legacyPilotExpiryPresent: present(pilot.expiresAt) },
    controls: { enabled: ai.enabled === true, responsePaused: ai.responsePaused === true,
      businessSummaryPresent: present(ai.businessSummary), guardrailCount: Array.isArray(ai.guardrails) ? ai.guardrails.length : 0,
      autonomyMode: ["hybrid", "autonomous", "copilot", "manual"].includes(String(profile.autonomyMode)) ? String(profile.autonomyMode) : "unknown",
      operationalBudgetConfigured: typeof profile.monthlyBudgetUsd === "number" && Number.isFinite(profile.monthlyBudgetUsd) && profile.monthlyBudgetUsd > 0,
      exclusiveTestPresent: rollout.exclusiveTest !== undefined,
      exclusiveTestStructurallyValid: exclusive.tenantId === LF_SCOPE.tenantId && ids.length > 0 && ids.length <= 3 && ids.every(present),
      exclusiveTestConversationCount: ids.length,
      actualConversationEligibilityChecked: false },
    channels: ["whatsapp", "instagram", "messenger"].map(type => ({ type,
      savedCountInSample: input.channels.filter(row => row.data.type === type).length,
      savedActiveInSample: input.channels.filter(row => row.data.type === type && row.data.status === "active").length,
      liveProviderContractTested: false })),
    channelSampleTruncated: input.channels.length >= 101,
    knowledge: { documentCountInSample: input.documents.length,
      policyCountInSample: input.documents.filter(row => row.data.type === "policy").length,
      catalogCountInSample: input.documents.filter(row => row.data.type === "catalog").length,
      faqCountInSample: input.documents.filter(row => row.data.type === "faq").length,
      sampleTruncated: input.documents.length >= 201, contentRead: false, policyCorrectnessApproved: false },
    pipeline: { configuredDocumentFound: Boolean(pipeline), stageIds,
      legacyDirectBindingMissing: Boolean(pipeline && !pipeline.data.tenantId),
      runtimeFallsBackToBusinessProfile: !pipeline,
      businessProfileConfigured: present(settings.businessProfileId),
      allStageIdsValidAndUnique: stages.length > 0 && stageIds.length === stages.length && new Set(stageIds).size === stageIds.length,
      semanticStageMappingApproved: false, sampleTruncated: input.pipelines.length >= 21 },
    newObservationOrLearningAuthorized: false, newPilotAuthorized: false, productReady: false,
  };
}
