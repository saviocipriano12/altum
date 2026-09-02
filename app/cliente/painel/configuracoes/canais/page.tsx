"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  BrandIcon,
  type BrandIconId,
  CardTitle,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type ChannelItem = {
  id?: string;
  type?: string;
  provider?: string;
  displayName?: string;
  status?: string;
  connectionStatus?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  wabaId?: string;
  username?: string;
  pageId?: string;
  externalAccountId?: string;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  hasVerifyToken?: boolean;
  hasAppSecret?: boolean;
  accessTokenMasked?: string;
  refreshTokenMasked?: string;
  verifyTokenMasked?: string;
  appSecretMasked?: string;
  lastSyncAt?: string | null;
  updatedAt?: string | null;
  lastActivityAt?: string | null;
  lastError?: string;
  source?: string;
  chatCount?: number;
  openChatCount?: number;
  campaignSnapshotCount?: number;
  lastCampaignDateRef?: string | null;
  serverReady?: boolean;
  inboundReady?: boolean;
  outboundReady?: boolean;
  routingReady?: boolean;
  syncReady?: boolean;
  requiresWebhook?: boolean;
  requiresExternalMapping?: boolean;
  metadata?: Record<string, string>;
  channelScope?: "shared" | "personal";
  ownerUserId?: string;
  ownerUserName?: string;
  distributionEnabled?: boolean;
};

type TenantUserOption = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
};

type ChannelsResponse = {
  items?: ChannelItem[];
  managedProviders?: { evolution?: boolean };
  error?: string;
};

type IntegrationPendingItem = {
  pendingId: string;
  provider: "meta" | "google";
  tenantId: string;
  channelType: ConnectorType;
  expiresAt: string;
  options: Array<{ id: string; label: string; description?: string; meta?: Record<string, string> }>;
};

type WhatsAppChannelResponse = {
  channel?: {
    id?: string;
    provider?: string;
    displayName?: string;
    phoneNumber?: string;
    phoneNumberId?: string;
    wabaId?: string;
    status?: string;
    accessTokenMasked?: string;
    verifyTokenMasked?: string;
    appSecretMasked?: string;
  } | null;
  error?: string;
};

type ConversionHealthItem = {
  channelId: string;
  type: "meta_ads" | "google_ads";
  displayName: string;
  ready: boolean;
  status: string;
  issues: string[];
  configuredEvents: string[];
  recent: {
    processed: number;
    failed: number;
    claimed: number;
    skipped: number;
    total: number;
    lastStatus?: string;
    lastError?: string;
    lastEventAt?: string | null;
  };
};

type ConversionHealthResponse = {
  checkedAt?: string;
  ok?: boolean;
  summary?: {
    total: number;
    ready: number;
    failedRecent: number;
    processedRecent: number;
  };
  issues?: string[];
  items?: ConversionHealthItem[];
  error?: string;
};

type ConnectorType = "whatsapp" | "instagram" | "messenger" | "meta_ads" | "google_ads";

type ConnectorDefinition = {
  type: ConnectorType;
  label: string;
  description: string;
  provider: string;
  brand: BrandIconId;
  primaryLabel: string;
  secondaryLabel: string;
  secondaryKey: "username" | "pageId";
  metadataKey?: string;
  metadataLabel?: string;
};

function supportsMetaWebhook(type: ConnectorType) {
  return type === "instagram" || type === "messenger" || type === "meta_ads";
}

const CONNECTORS: ConnectorDefinition[] = [
  {
    type: "whatsapp",
    label: "WhatsApp",
    description: "Atendimento, vendas e automacoes.",
    provider: "meta_whatsapp",
    brand: "whatsapp",
    primaryLabel: "phoneNumberId",
    secondaryLabel: "Numero",
    secondaryKey: "username",
  },
  {
    type: "instagram",
    label: "Instagram",
    description: "Mensagens diretas e interacoes.",
    provider: "meta_instagram",
    brand: "instagram",
    primaryLabel: "Instagram business ID",
    secondaryLabel: "Usuario",
    secondaryKey: "username",
  },
  {
    type: "messenger",
    label: "Facebook Messenger",
    description: "Conversas da sua pagina.",
    provider: "facebook_messenger",
    brand: "messenger",
    primaryLabel: "Facebook page ID",
    secondaryLabel: "Nome da pagina",
    secondaryKey: "pageId",
  },
  {
    type: "meta_ads",
    label: "Meta Ads",
    description: "Leads e conversoes dos anuncios.",
    provider: "meta_ads",
    brand: "meta",
    primaryLabel: "Ad account ID",
    secondaryLabel: "Page ID",
    secondaryKey: "pageId",
    metadataKey: "formId",
    metadataLabel: "Lead form ID",
  },
  {
    type: "google_ads",
    label: "Google Ads",
    description: "Campanhas, custos e conversoes.",
    provider: "google_ads",
    brand: "google",
    primaryLabel: "Customer ID",
    secondaryLabel: "Login customer ID (MCC)",
    secondaryKey: "pageId",
    metadataKey: "conversionActionId",
    metadataLabel: "Conversion action ID (opcional)",
  },
];

function toneForStatus(status?: string) {
  if (status === "active") return "success" as const;
  if (status === "inactive") return "warning" as const;
  if (status === "error") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(status?: string) {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  if (status === "error") return "Erro";
  return "Rascunho";
}

function toneForConnectionStatus(status?: string) {
  if (status === "ready" || status === "connected") return "success" as const;
  if (status === "syncing" || status === "webhook_pending" || status === "auth_pending") return "info" as const;
  if (status === "degraded" || status === "reauth_required" || status === "revoked") return "warning" as const;
  if (status === "error") return "danger" as const;
  return "neutral" as const;
}

function connectionStatusLabel(status?: string) {
  if (status === "auth_pending") return "Autenticacao pendente";
  if (status === "connected") return "Conectado";
  if (status === "webhook_pending") return "Aguardando eventos";
  if (status === "syncing") return "Sincronizando";
  if (status === "ready") return "Pronto";
  if (status === "degraded") return "Degradado";
  if (status === "reauth_required") return "Reconexao necessaria";
  if (status === "revoked") return "Revogado";
  if (status === "error") return "Erro";
  return "Rascunho";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem leitura";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sem leitura" : parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOperationalCount(value?: number, noun = "conversas") {
  return `${Number(value || 0)} ${noun}`;
}

function readinessTone(value: boolean | undefined) {
  return value ? ("success" as const) : ("warning" as const);
}

function readinessLabel(value: boolean | undefined, positive = "Pronto", negative = "Pendente") {
  return value ? positive : negative;
}

function buildConnectorOperationalRows(input: {
  definition: ConnectorDefinition;
  channel: ChannelItem | null;
  operations: { chatCount: number; openChatCount: number; lastActivityAt: string | null };
  statusValue: string;
}) {
  const { definition, channel, operations, statusValue } = input;
  const isAdsConnector = definition.type === "meta_ads" || definition.type === "google_ads";
  const rows: Array<{ label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = [
    { label: "Status", value: statusLabel(statusValue), tone: toneForStatus(statusValue) },
    ...(definition.type === "whatsapp"
      ? []
      : [
          {
            label: "Status da integracao",
            value: connectionStatusLabel(channel?.connectionStatus || "draft"),
            tone: toneForConnectionStatus(channel?.connectionStatus || "draft"),
          } as { label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "info" },
        ]),
    {
      label: "Mapeamento da conta",
      value: readinessLabel(
        !channel?.requiresExternalMapping || Boolean(channel?.externalAccountId || channel?.pageId),
        "Configurado",
        "Pendente"
      ),
      tone: !channel?.requiresExternalMapping || Boolean(channel?.externalAccountId || channel?.pageId) ? "success" : "warning",
    },
  ];

  if (channel?.requiresWebhook || definition.type === "whatsapp") {
    rows.push({
      label: "Entrada de mensagens",
      value: readinessLabel(channel?.inboundReady, "Pronto", "Pendente"),
      tone: readinessTone(channel?.inboundReady),
    });
  }

  if (!isAdsConnector || definition.type === "meta_ads") {
    rows.push({
      label: definition.type === "meta_ads" ? "Entrada de leads" : "Envio manual",
      value: readinessLabel(channel?.outboundReady ?? channel?.inboundReady, "Pronto", "Pendente"),
      tone: readinessTone(channel?.outboundReady ?? channel?.inboundReady),
    });
  }

  rows.push({
    label: isAdsConnector ? "Campanhas atualizadas" : "Distribuicao no atendimento",
    value: readinessLabel(isAdsConnector ? channel?.syncReady : channel?.routingReady, "Pronto", "Pendente"),
    tone: readinessTone(isAdsConnector ? channel?.syncReady : channel?.routingReady),
  });

  if (definition.type === "google_ads") {
    rows.push({
      label: "Conexao segura",
      value: readinessLabel(channel?.serverReady !== false, "Pronto", "Pendente"),
      tone: channel?.serverReady === false ? "warning" : "success",
    });
  }

  rows.push({
    label: "Ultima atualizacao",
    value: formatDateTime(channel?.updatedAt),
    tone: "info",
  });

  if (isAdsConnector) {
    rows.push(
      {
        label: "Ultima leitura",
        value: channel?.lastCampaignDateRef || formatDateTime(channel?.lastSyncAt),
        tone: channel?.lastCampaignDateRef || channel?.lastSyncAt ? "info" : "neutral",
      },
      {
        label: "Campanhas lidas",
        value: String(channel?.campaignSnapshotCount || 0),
        tone: Number(channel?.campaignSnapshotCount || 0) > 0 ? "success" : "neutral",
      }
    );
  } else {
    rows.push(
      {
        label: "Ultima atividade",
        value: formatDateTime(operations.lastActivityAt),
        tone: operations.lastActivityAt ? "info" : "neutral",
      },
      {
        label: "Conversas",
        value: formatOperationalCount(operations.chatCount),
        tone: operations.chatCount ? "info" : "neutral",
      },
      {
        label: "Backlog aberto",
        value: formatOperationalCount(operations.openChatCount, "abertas"),
        tone: operations.openChatCount ? "warning" : "neutral",
      }
    );
  }

  return rows;
}

const WHATSAPP_PROVIDER_OPTIONS = [
  {
    value: "meta_whatsapp",
    label: "Oficial Meta",
    description: "Numero oficial para equipe, campanhas e templates.",
    brand: "meta" as const,
  },
  {
    value: "evolution",
    label: "WhatsApp por QR",
    description: "Conecte o WhatsApp que voce ja usa pelo QR Code.",
    brand: "whatsapp" as const,
  },
  {
    value: "whatsapp_gateway",
    label: "Conexao externa",
    description: "Usar um provedor externo de WhatsApp ja existente na operacao.",
    brand: "generic" as const,
  },
] as const;

function whatsappProviderLabel(value?: string) {
  const normalized = String(value || "meta_whatsapp").toLowerCase();
  return WHATSAPP_PROVIDER_OPTIONS.find((option) => option.value === normalized)?.label || "WhatsApp";
}

function buildConnectorPlaybook(definition: ConnectorDefinition, channel: ChannelItem | null) {
  const inboxHref = `/cliente/painel/inbox?channel=${encodeURIComponent(definition.type)}`;
  const crmHref = `/cliente/painel/crm?channel=${encodeURIComponent(definition.type)}`;

  if (definition.type === "instagram" || definition.type === "messenger") {
    return {
      summary: channel?.routingReady
        ? "Canal pronto para receber mensagens e permitir atendimento manual em Conversas."
        : "Complete a conexao e o mapeamento da conta para liberar atendimento em Conversas.",
      links: [
        { href: inboxHref, label: "Abrir conversas" },
        { href: "/cliente/painel/handoffs", label: "Ver atendimento humano" },
      ],
    };
  }

  if (definition.type === "meta_ads" || definition.type === "google_ads") {
    return {
      summary: channel?.syncReady
        ? "Campanhas prontas para alimentar origem, CPL e atribuicao comercial."
        : "Complete credenciais e mapeamento da conta para sincronizar campanhas e atribuir leads com seguranca.",
      links: [
        { href: crmHref, label: "Abrir leads no CRM" },
        { href: "/cliente/painel/metricas", label: "Ver impacto nas metricas" },
      ],
    };
  }

  return {
    summary: channel?.routingReady
      ? "Canal pronto para mensagens, IA e atendimento humano dentro de Conversas."
      : "Finalize a conexao para colocar o canal em operacao completa.",
    links: [
      { href: inboxHref, label: "Abrir conversas" },
      { href: "/cliente/painel/handoffs", label: "Ver escaladas" },
    ],
  };
}

export default function ClienteCanaisPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [checkingConversions, setCheckingConversions] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deletingChannel, setDeletingChannel] = useState(false);
  const [syncingCampaigns, setSyncingCampaigns] = useState(false);
  const [checkingWhatsAppSession, setCheckingWhatsAppSession] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [completingPending, setCompletingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ConnectorType>("whatsapp");
  const canManage = hasCapability("manage_channels");

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [managedEvolutionConfigured, setManagedEvolutionConfigured] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [conversionHealth, setConversionHealth] = useState<ConversionHealthResponse | null>(null);
  const [pendingSelection, setPendingSelection] = useState<IntegrationPendingItem | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState("");
  const [whatsAppSession, setWhatsAppSession] = useState<{
    channelId?: string;
    status?: string;
    qr?: string;
    message?: string;
  } | null>(null);
  const [selectedWhatsAppChannelId, setSelectedWhatsAppChannelId] = useState("");
  const [whatsAppMasked, setWhatsAppMasked] = useState<{ access?: string; verify?: string; secret?: string }>({});
  const [whatsAppForm, setWhatsAppForm] = useState({
    channelId: "",
    provider: "meta_whatsapp",
    displayName: "WhatsApp",
    phoneNumber: "",
    phoneNumberId: "",
    wabaId: "",
    gatewayEndpoint: "",
    sessionStatusEndpoint: "",
    qrCodeEndpoint: "",
    callEndpoint: "",
    sessionId: "",
    accessToken: "",
    verifyToken: "",
    appSecret: "",
    status: "active",
    channelScope: "shared" as "shared" | "personal",
    ownerUserId: "",
    distributionEnabled: true,
  });
  const [genericForm, setGenericForm] = useState({
    channelId: "",
    displayName: "",
    externalAccountId: "",
    secondaryValue: "",
    status: "draft",
    metadataValue: "",
    pixelId: "",
    testEventCode: "",
    leadConversionActionId: "",
    qualifiedConversionActionId: "",
    meetingConversionActionId: "",
    meetingCompletedConversionActionId: "",
    saleConversionActionId: "",
  });

  const selectedDefinition = useMemo(
    () => CONNECTORS.find((item) => item.type === selectedType) || CONNECTORS[0],
    [selectedType]
  );
  const whatsAppChannels = useMemo(
    () => channels.filter((item) => item.type === "whatsapp"),
    [channels]
  );
  const selectedChannel = useMemo(() => {
    if (selectedType === "whatsapp") {
      return (
        whatsAppChannels.find((item) => item.id === selectedWhatsAppChannelId) ||
        whatsAppChannels[0] ||
        null
      );
    }
    return channels.find((item) => item.type === selectedType) || null;
  }, [channels, selectedType, selectedWhatsAppChannelId, whatsAppChannels]);

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [channelsRes, whatsAppRes, conversionHealthRes, usersRes] = await Promise.all([
          authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
          authedFetch(`/api/tenant/${tenant.tenantId}/channels/whatsapp`),
          authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/conversions/health`),
          authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        ]);

        const channelsData = (await channelsRes.json()) as ChannelsResponse;
        const whatsAppData = (await whatsAppRes.json()) as WhatsAppChannelResponse;
        const conversionHealthData = (await conversionHealthRes.json().catch(() => ({}))) as ConversionHealthResponse;
        const usersData = (await usersRes.json().catch(() => ({}))) as { items?: TenantUserOption[] };

        if (!mounted) return;

        if (!channelsRes.ok) {
          setError(channelsData.error || "Falha ao carregar canais.");
        } else {
          setChannels(channelsData.items || []);
          const hasManagedEvolution = Boolean(channelsData.managedProviders?.evolution);
          setManagedEvolutionConfigured(hasManagedEvolution);
          const firstWhatsApp = (channelsData.items || []).find((item) => item.type === "whatsapp");
          if (firstWhatsApp?.id) setSelectedWhatsAppChannelId((current) => current || firstWhatsApp.id || "");
          if (!firstWhatsApp && hasManagedEvolution) {
            setWhatsAppForm((current) => ({ ...current, provider: "evolution" }));
          }
        }

        if (whatsAppRes.ok && whatsAppData.channel) {
          setWhatsAppForm((current) => ({
            ...current,
            channelId: whatsAppData.channel?.id || current.channelId,
            provider: whatsAppData.channel?.provider || current.provider,
            displayName: whatsAppData.channel?.displayName || "WhatsApp",
            phoneNumber: whatsAppData.channel?.phoneNumber || "",
            phoneNumberId: whatsAppData.channel?.phoneNumberId || "",
            wabaId: whatsAppData.channel?.wabaId || "",
            status: whatsAppData.channel?.status || "active",
          }));
          setWhatsAppMasked({
            access: whatsAppData.channel.accessTokenMasked || "",
            verify: whatsAppData.channel.verifyTokenMasked || "",
            secret: whatsAppData.channel.appSecretMasked || "",
          });
        }

        if (conversionHealthRes.ok) {
          setConversionHealth(conversionHealthData);
        }
        if (usersRes.ok) {
          setTenantUsers((usersData.items || []).filter((item) => item.status !== "blocked"));
        }
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar canais da conta.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  useEffect(() => {
    if (selectedType !== "whatsapp") return;
    if (!selectedChannel) return;
    setWhatsAppForm((current) => ({
      ...current,
      channelId: selectedChannel.id || "",
      provider: selectedChannel.provider || "meta_whatsapp",
      displayName: selectedChannel.displayName || "WhatsApp",
      phoneNumber: selectedChannel.phoneNumber || "",
      phoneNumberId: selectedChannel.phoneNumberId || "",
      wabaId: selectedChannel.wabaId || selectedChannel.metadata?.wabaId || selectedChannel.metadata?.whatsappBusinessAccountId || "",
      gatewayEndpoint: selectedChannel.metadata?.gatewayEndpoint || "",
      sessionStatusEndpoint: selectedChannel.metadata?.sessionStatusEndpoint || "",
      qrCodeEndpoint: selectedChannel.metadata?.qrCodeEndpoint || "",
      callEndpoint: selectedChannel.metadata?.callEndpoint || "",
      sessionId: selectedChannel.metadata?.sessionId || "",
      status: selectedChannel.status || "active",
      accessToken: "",
      verifyToken: "",
      appSecret: "",
      channelScope: selectedChannel.channelScope || "shared",
      ownerUserId: selectedChannel.ownerUserId || "",
      distributionEnabled: selectedChannel.distributionEnabled !== false,
    }));
    setWhatsAppMasked({
      access: selectedChannel.accessTokenMasked || "",
      verify: selectedChannel.verifyTokenMasked || "",
      secret: selectedChannel.appSecretMasked || "",
    });
    setWhatsAppSession((current) =>
      current?.channelId === selectedChannel.id ? current : null
    );
  }, [selectedChannel, selectedType]);

  useEffect(() => {
    if (selectedType === "whatsapp") return;
    const metadataKey = selectedDefinition.metadataKey || "";
    setGenericForm({
      channelId: selectedChannel?.id || "",
      displayName: selectedChannel?.displayName || selectedDefinition.label,
      externalAccountId: selectedChannel?.externalAccountId || "",
      secondaryValue:
        selectedDefinition.secondaryKey === "pageId"
          ? selectedChannel?.pageId || ""
          : selectedChannel?.username || "",
      status: selectedChannel?.status || "draft",
      metadataValue: metadataKey ? selectedChannel?.metadata?.[metadataKey] || "" : "",
      pixelId: selectedChannel?.metadata?.pixelId || selectedChannel?.metadata?.metaPixelId || "",
      testEventCode: selectedChannel?.metadata?.testEventCode || "",
      leadConversionActionId: selectedChannel?.metadata?.leadConversionActionId || "",
      qualifiedConversionActionId: selectedChannel?.metadata?.qualifiedConversionActionId || "",
      meetingConversionActionId: selectedChannel?.metadata?.meetingConversionActionId || "",
      meetingCompletedConversionActionId: selectedChannel?.metadata?.meetingCompletedConversionActionId || "",
      saleConversionActionId: selectedChannel?.metadata?.saleConversionActionId || "",
    });
  }, [selectedChannel, selectedDefinition, selectedType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const integration = url.searchParams.get("integration");
    const result = url.searchParams.get("result");
    if (!integration || !result) return;

    const message = url.searchParams.get("message");
    const warning = url.searchParams.get("warning");
    const status = url.searchParams.get("status");
    if (result === "success") {
      setNotice(
        `${integration === "meta" ? "Meta" : "Google"} conectado${status ? ` (${connectionStatusLabel(status)})` : ""}.` +
          (warning ? ` Aviso: ${warning}` : "")
      );
      if (tenant?.tenantId) {
        void (async () => {
          const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`);
          const data = (await res.json()) as ChannelsResponse;
          if (res.ok) setChannels(data.items || []);
        })();
      }
    } else {
      if (result === "select") {
        const pendingId = url.searchParams.get("pendingId");
        const channel = url.searchParams.get("channel");
        if (pendingId) {
          setLoadingPending(true);
          void (async () => {
            try {
              const pendingRes = await authedFetch(`/api/integrations/pending/${encodeURIComponent(pendingId)}`);
              const pendingData = (await pendingRes.json()) as {
                error?: string;
                item?: IntegrationPendingItem;
              };
              if (!pendingRes.ok || !pendingData.item) {
                setError(pendingData.error || "Falha ao carregar selecao de ativos.");
                return;
              }
              setPendingSelection(pendingData.item);
              setPendingOptionId(pendingData.item.options[0]?.id || "");
              if (channel) {
                const normalized = channel as ConnectorType;
                if (["instagram", "messenger", "meta_ads", "google_ads"].includes(normalized)) {
                  setSelectedType(normalized);
                }
              }
              setNotice("Selecione o ativo correto para concluir a conexao.");
            } finally {
              setLoadingPending(false);
            }
          })();
        }
      } else {
        setError(`Falha na integracao ${integration}: ${message || "erro desconhecido"}.`);
      }
    }

    url.searchParams.delete("integration");
    url.searchParams.delete("result");
    url.searchParams.delete("message");
    url.searchParams.delete("warning");
    url.searchParams.delete("status");
    url.searchParams.delete("channel");
    url.searchParams.delete("pendingId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [tenant?.tenantId]);

  const configuredCount = useMemo(() => {
    const activeChannels = channels.filter((item) => item.status === "active").length;
    return activeChannels + (channels.some((item) => item.type === "whatsapp") || !whatsAppForm.phoneNumberId ? 0 : 1);
  }, [channels, whatsAppForm.phoneNumberId]);

  const activeConnectors = useMemo(
    () => channels.filter((item) => item.status === "active"),
    [channels]
  );
  const selectedOperations = useMemo(() => ({
    chatCount: Number(selectedChannel?.chatCount || 0),
    openChatCount: Number(selectedChannel?.openChatCount || 0),
    lastActivityAt: selectedChannel?.lastActivityAt || null,
  }), [selectedChannel?.chatCount, selectedChannel?.lastActivityAt, selectedChannel?.openChatCount]);
  const isAdsConnector = selectedDefinition.type === "meta_ads" || selectedDefinition.type === "google_ads";
  const selectedStatus = selectedChannel?.status || (selectedType === "whatsapp" ? whatsAppForm.status : "draft");
  const selectedReadinessRows = useMemo(
    () =>
      buildConnectorOperationalRows({
        definition: selectedDefinition,
        channel: selectedChannel,
        operations: selectedOperations,
        statusValue: selectedStatus,
      }),
    [selectedDefinition, selectedChannel, selectedOperations, selectedStatus]
  );
  const selectedPlaybook = useMemo(
    () => buildConnectorPlaybook(selectedDefinition, selectedChannel),
    [selectedDefinition, selectedChannel]
  );

  async function syncCampaignConnector() {
    if (!tenant?.tenantId || !canManage || !isAdsConnector) return;

    setSyncingCampaigns(true);
    setError(null);
    setNotice(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      const data = (await res.json()) as { error?: string; synced?: number; failed?: number };
      if (!res.ok) {
        setError(data.error || "Falha ao sincronizar campanhas.");
        return;
      }
      setNotice(`Atualizacao concluida: ${data.synced || 0} campanha(s) revisadas e ${data.failed || 0} falha(s).`);
      await refreshChannels();
    } catch {
      setError("Falha ao sincronizar campanhas.");
    } finally {
      setSyncingCampaigns(false);
    }
  }

  const refreshConversionHealth = useCallback(async () => {
    if (!tenant?.tenantId) return;
    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/conversions/health`);
    const data = (await res.json().catch(() => ({}))) as ConversionHealthResponse;
    if (res.ok) setConversionHealth(data);
  }, [tenant?.tenantId]);

  const refreshChannels = useCallback(async () => {
    if (!tenant?.tenantId) return;
    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`);
    const data = (await res.json()) as ChannelsResponse;
    if (res.ok) {
      const items = data.items || [];
      setChannels(items);
      setManagedEvolutionConfigured(Boolean(data.managedProviders?.evolution));
      setSelectedWhatsAppChannelId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items.find((item) => item.type === "whatsapp")?.id || "";
      });
    }
    await refreshConversionHealth();
  }, [refreshConversionHealth, tenant?.tenantId]);

  async function checkConversionHealth() {
    setCheckingConversions(true);
    setError(null);
    setNotice(null);
    try {
      await refreshConversionHealth();
      setNotice("Diagnostico de pixels e conversoes atualizado.");
    } catch {
      setError("Falha ao validar pixels e conversoes.");
    } finally {
      setCheckingConversions(false);
    }
  }

  async function startManagedConnect(provider: "meta" | "google") {
    if (!tenant?.tenantId || !canManage) return;
    setConnecting(true);
    setError(null);
    setNotice(null);

    try {
      const endpoint = provider === "meta" ? "/api/integrations/meta/start" : "/api/integrations/google/start";
      const payload =
        provider === "meta"
          ? { tenantId: tenant.tenantId, channelType: selectedDefinition.type, redirectPath: "/cliente/painel/configuracoes/canais" }
          : { tenantId: tenant.tenantId, redirectPath: "/cliente/painel/configuracoes/canais" };
      const res = await authedFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; authUrl?: string };
      if (!res.ok || !data.authUrl) {
        setError(data.error || `Falha ao iniciar conexao ${provider}.`);
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setError(`Falha ao iniciar conexao ${provider}.`);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectManagedChannel() {
    if (!tenant?.tenantId || !selectedChannel?.id || !canManage || selectedType === "whatsapp") return;
    setDisconnecting(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        channelId: selectedChannel.id,
        type: selectedType,
        provider: selectedDefinition.provider,
        displayName: selectedChannel.displayName || selectedDefinition.label,
        externalAccountId: selectedChannel.externalAccountId || "",
        status: "inactive",
        connectionStatus: "revoked",
        metadata: {
          ...(selectedChannel.metadata || {}),
          disconnectedAt: new Date().toISOString(),
        },
      };
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao desconectar canal.");
        return;
      }
      setNotice(`${selectedDefinition.label} desconectado com sucesso.`);
      await refreshChannels();
    } catch {
      setError("Falha ao desconectar canal.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function deleteSelectedChannel() {
    if (!tenant?.tenantId || !selectedChannel?.id || !canManage) return;
    if (selectedChannel.source === "agency_env") {
      setError("Este numero virtual da Altum nao pode ser excluido por aqui.");
      return;
    }

    const label = selectedChannel.displayName || selectedDefinition.label || "canal";
    const confirmed = window.confirm(`Excluir ${label}? Essa acao remove o canal da Altum e nao pode ser desfeita.`);
    if (!confirmed) return;

    setDeletingChannel(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannel.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao excluir canal.");
        return;
      }

      if (selectedType === "whatsapp") {
        setSelectedWhatsAppChannelId("");
        setWhatsAppMasked({});
        setWhatsAppForm((current) => ({
          ...current,
          channelId: "",
          displayName: "WhatsApp",
          phoneNumber: "",
          phoneNumberId: "",
          wabaId: "",
          accessToken: "",
          verifyToken: "",
          appSecret: "",
        }));
      } else {
        setGenericForm((current) => ({ ...current, channelId: "" }));
      }
      setNotice(`${label} excluido com sucesso.`);
      await refreshChannels();
    } catch {
      setError("Falha ao excluir canal.");
    } finally {
      setDeletingChannel(false);
    }
  }

  async function testManagedChannelConnection() {
    if (!tenant?.tenantId || selectedType === "whatsapp") return;
    setTestingConnection(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels/health?attemptRepair=1`);
      const data = (await res.json()) as {
        error?: string;
        items?: Array<{ channelId: string; type: string; ok: boolean; status: string; reason?: string }>;
      };
      if (!res.ok) {
        setError(data.error || "Falha ao testar conexao.");
        return;
      }
      const item = (data.items || []).find((entry) => entry.type === selectedType);
      if (!item) {
        setNotice("Sem diagnostico para este conector ainda.");
      } else if (item.ok) {
        setNotice(`${selectedDefinition.label} validado com sucesso (${connectionStatusLabel(item.status)}).`);
      } else {
        setError(item.reason || `Conexao com problema (${connectionStatusLabel(item.status)}).`);
      }
      await refreshChannels();
    } catch {
      setError("Falha ao executar teste de conexao.");
    } finally {
      setTestingConnection(false);
    }
  }

  async function checkWhatsAppSession(action: "status" | "qr") {
    if (!tenant?.tenantId || !selectedChannel?.id || selectedType !== "whatsapp") return;
    setCheckingWhatsAppSession(true);
    setError(null);
    setNotice(null);

    try {
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/channels/${encodeURIComponent(selectedChannel.id)}/whatsapp-session?action=${action}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        qr?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.error || "Falha ao consultar sessao WhatsApp.");
        return;
      }
      setWhatsAppSession({
        channelId: selectedChannel.id,
        status: data.status,
        qr: data.qr,
        message: data.message,
      });
      setNotice(action === "qr" ? "QR da sessao atualizado." : "Status da sessao atualizado.");
      await refreshChannels();
    } catch {
      setError("Falha ao consultar sessao WhatsApp.");
    } finally {
      setCheckingWhatsAppSession(false);
    }
  }

  async function completePendingSelectionFlow() {
    if (!pendingSelection?.pendingId || !pendingOptionId) return;
    setCompletingPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(
        `/api/integrations/pending/${encodeURIComponent(pendingSelection.pendingId)}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectionId: pendingOptionId }),
        }
      );
      const data = (await res.json()) as { error?: string; status?: string; warning?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao concluir selecao do ativo.");
        return;
      }
      setPendingSelection(null);
      setPendingOptionId("");
      setNotice(
        `Conexao concluida${data.status ? ` (${connectionStatusLabel(data.status)})` : ""}.` +
          (data.warning ? ` Aviso: ${data.warning}` : "")
      );
      await refreshChannels();
    } catch {
      setError("Falha ao concluir selecao do ativo.");
    } finally {
      setCompletingPending(false);
    }
  }

  async function onSubmitWhatsApp(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const isOfficial = whatsAppForm.provider === "meta_whatsapp";
      const sameProvider = selectedChannel?.provider === whatsAppForm.provider;
      const hasAccessToken = Boolean(whatsAppForm.accessToken.trim() || (sameProvider && selectedChannel?.hasAccessToken));
      const hasVerifyToken = Boolean(whatsAppForm.verifyToken.trim() || (sameProvider && selectedChannel?.hasVerifyToken));
      const hasAppSecret = Boolean(whatsAppForm.appSecret.trim() || (sameProvider && selectedChannel?.hasAppSecret));
      if (isOfficial && (!whatsAppForm.phoneNumberId.trim() || !hasAccessToken || !hasVerifyToken || !hasAppSecret)) {
        setError("No modo oficial, informe o ID do numero, a credencial de acesso, o token de verificacao e o segredo do app.");
        return;
      }
      if (
        !isOfficial &&
        !(whatsAppForm.provider === "evolution" && managedEvolutionConfigured) &&
        (!whatsAppForm.gatewayEndpoint.trim() || !hasAccessToken)
      ) {
        setError(whatsAppForm.provider === "evolution"
          ? "Informe a URL da Evolution API e a API key."
          : "Informe a URL do provedor e a credencial de acesso.");
        return;
      }

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: whatsAppForm.channelId || undefined,
          type: "whatsapp",
          provider: whatsAppForm.provider,
          displayName: whatsAppForm.displayName,
          phoneNumber: whatsAppForm.phoneNumber,
          phoneNumberId: whatsAppForm.phoneNumberId,
          wabaId: whatsAppForm.wabaId,
          accessToken: whatsAppForm.accessToken,
          status: whatsAppForm.status,
          channelScope: whatsAppForm.channelScope,
          ownerUserId: whatsAppForm.channelScope === "personal" ? whatsAppForm.ownerUserId : undefined,
          distributionEnabled: whatsAppForm.channelScope === "shared" && whatsAppForm.distributionEnabled,
          metadata: {
            gatewayEndpoint: whatsAppForm.gatewayEndpoint,
            wabaId: whatsAppForm.wabaId,
            whatsappBusinessAccountId: whatsAppForm.wabaId,
            sessionStatusEndpoint: whatsAppForm.sessionStatusEndpoint,
            qrCodeEndpoint: whatsAppForm.qrCodeEndpoint,
            callEndpoint: whatsAppForm.callEndpoint,
            sessionId: whatsAppForm.sessionId,
            verifyToken: whatsAppForm.verifyToken,
            appSecret: whatsAppForm.appSecret,
          },
        }),
      });
      const data = (await res.json()) as { error?: string; channelId?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao salvar canal WhatsApp.");
        return;
      }

      setSelectedWhatsAppChannelId(data.channelId || "");
      setWhatsAppForm((current) => ({
        ...current,
        channelId: data.channelId || current.channelId,
        accessToken: "",
        verifyToken: "",
        appSecret: "",
      }));
      setNotice("Canal WhatsApp salvo com sucesso.");
      await refreshChannels();
    } catch {
      setError("Falha ao salvar configuracao do canal.");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitGeneric(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const metadata: Record<string, string> = {
        ...(selectedChannel?.metadata || {}),
        ...(selectedDefinition.metadataKey && genericForm.metadataValue
          ? { [selectedDefinition.metadataKey]: genericForm.metadataValue }
          : {}),
      };
      if (selectedDefinition.type === "meta_ads") {
        metadata.pixelId = genericForm.pixelId;
        metadata.testEventCode = genericForm.testEventCode;
      }
      if (selectedDefinition.type === "google_ads") {
        metadata.leadConversionActionId = genericForm.leadConversionActionId;
        metadata.qualifiedConversionActionId = genericForm.qualifiedConversionActionId;
        metadata.meetingConversionActionId = genericForm.meetingConversionActionId;
        metadata.meetingCompletedConversionActionId = genericForm.meetingCompletedConversionActionId;
        metadata.saleConversionActionId = genericForm.saleConversionActionId;
      }

      const body = {
        channelId: genericForm.channelId || undefined,
        type: selectedDefinition.type,
        provider: selectedDefinition.provider,
        displayName: genericForm.displayName,
        externalAccountId: genericForm.externalAccountId,
        status: genericForm.status,
        metadata,
        ...(selectedDefinition.secondaryKey === "pageId"
          ? { pageId: genericForm.secondaryValue }
          : { username: genericForm.secondaryValue }),
      };

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao salvar conector.");
        return;
      }

      setGenericForm((current) => ({
        ...current,
        channelId: "",
      }));
      setNotice(`${selectedDefinition.label} salvo com sucesso.`);
      await refreshChannels();
    } catch {
      setError("Falha ao salvar conector.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-channels-refined settings-channels-saas client-daily-page space-y-5">
      <SectionHeader
        title="Canais e integracoes"
        subtitle="Conecte os aplicativos que sua equipe usa para atender, captar leads e acompanhar vendas."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="settings-channels-back inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />

      {!canManage ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Seu acesso e somente leitura para canais. Alteracoes exigem permissao de gestao.
        </div>
      ) : null}

      <section className="space-y-5">
        <PanelCard className="settings-channels-catalog p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Escolha o que deseja conectar" subtitle="Cada integracao passa a funcionar em toda a operacao da Altum." />
            <div className="settings-channels-summary inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {configuredCount} {configuredCount === 1 ? "conectado" : "conectados"}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CONNECTORS.map((connector) => {
              const item = connector.type === "whatsapp"
                ? {
                    status: whatsAppChannels.some((channel) => channel.status === "active")
                      ? "active"
                      : whatsAppForm.phoneNumberId
                        ? whatsAppForm.status
                        : "draft",
                  }
                : channels.find((channel) => channel.type === connector.type);
              const isSelected = connector.type === selectedType;

              return (
                <button
                  key={connector.type}
                  type="button"
                  onClick={() => setSelectedType(connector.type)}
                  className={`settings-channel-card group relative min-h-44 rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "is-selected border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <BrandIcon id={connector.brand} size="md" />
                    <StateBadge
                      label={
                        connector.type === "whatsapp"
                          ? statusLabel(item?.status)
                          : connectionStatusLabel(item?.connectionStatus || item?.status)
                      }
                      tone={
                        connector.type === "whatsapp"
                          ? toneForStatus(item?.status)
                          : toneForConnectionStatus(item?.connectionStatus || item?.status)
                      }
                    />
                  </div>
                  <p className="mt-4 text-sm font-bold text-white">{connector.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/56">{connector.description}</p>
                  {connector.type === "whatsapp" && whatsAppChannels.length ? (
                    <p className="mt-3 text-xs font-medium text-emerald-100/80">
                      {whatsAppChannels.length} numero(s) configurado(s)
                    </p>
                  ) : null}
                  <span className="settings-channel-card-action absolute bottom-3.5 right-3.5 inline-flex h-7 w-7 items-center justify-center rounded-full border opacity-0 transition group-hover:opacity-100">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>

          <details className="settings-channels-overview group mt-5 rounded-2xl border border-white/10 bg-white/[0.03]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold">
              <span>Ver canais conectados e saude da operacao</span>
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-white/10 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MiniPanel title="Atendimento" value="WhatsApp, Instagram e Messenger alimentam Conversas." />
                <MiniPanel title="Captacao" value="Meta Ads e Google Ads conectam origem, CPL e atribuicao." />
                <MiniPanel title="Conversoes" value="Leads, reunioes e vendas voltam para os anuncios quando configurados." />
              </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Prontidao atual" subtitle="Leitura rapida dos canais que ja podem operar" />
              <StateBadge label={`${activeConnectors.length} ativos`} tone="success" />
            </div>
            <div className="mt-4 space-y-2">
              {activeConnectors.length === 0 ? (
                <p className="text-sm text-white/52">Nenhum canal ativo ainda. Comece pelo WhatsApp e pelos canais de origem do lead.</p>
              ) : (
                activeConnectors.map((channel) => (
                  <div key={channel.id || channel.type} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{CONNECTORS.find((item) => item.type === channel.type)?.label || channel.displayName || channel.type}</p>
                      <p className="mt-1 text-xs text-white/48">
                        atualizado {formatDateTime(channel.updatedAt)}{channel.lastSyncAt ? ` | campanhas ${formatDateTime(channel.lastSyncAt)}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-white/40">
                        {formatOperationalCount(channel.chatCount)} • {formatOperationalCount(channel.openChatCount, "abertas")} • ultima atividade {formatDateTime(channel.lastActivityAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StateBadge
                        label={connectionStatusLabel(channel.connectionStatus || channel.status)}
                        tone={toneForConnectionStatus(channel.connectionStatus || channel.status)}
                      />
                      {channel.hasAccessToken ? <StateBadge label="credencial OK" tone="info" /> : null}
                      {channel.outboundReady ? <StateBadge label="envio pronto" tone="success" /> : null}
                      {channel.inboundReady ? <StateBadge label="entrada pronta" tone="success" /> : null}
                      {channel.syncReady ? <StateBadge label="campanhas OK" tone="success" /> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <ConversionHealthPanel
            health={conversionHealth}
            loading={checkingConversions}
            onRefresh={() => void checkConversionHealth()}
          />
            </div>
          </details>
        </PanelCard>

        <PanelCard className="settings-channels-editor p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <BrandIcon id={selectedDefinition.brand} size="lg" />
              <CardTitle title={selectedDefinition.label} subtitle={selectedDefinition.description} />
            </div>
            <StateBadge
              label={
                selectedType === "whatsapp"
                  ? statusLabel(selectedStatus)
                  : connectionStatusLabel(selectedChannel?.connectionStatus || selectedStatus)
              }
              tone={
                selectedType === "whatsapp"
                  ? toneForStatus(selectedStatus)
                  : toneForConnectionStatus(selectedChannel?.connectionStatus || selectedStatus)
              }
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-white/60">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          ) : selectedType === "whatsapp" ? (
            <form onSubmit={onSubmitWhatsApp} className="mt-4 space-y-3">
              <ConnectorDiagnostics
                title="Diagnostico do WhatsApp"
                rows={selectedReadinessRows}
                summary={selectedPlaybook.summary}
                links={selectedPlaybook.links}
              />
              {whatsAppChannels.length ? (
                <label className="settings-channels-field block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">Numero configurado</span>
                  <select
                    value={selectedWhatsAppChannelId}
                    onChange={(event) => setSelectedWhatsAppChannelId(event.target.value)}
                    className="settings-channels-select w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
                  >
                    {whatsAppChannels.map((channel) => (
                      <option key={channel.id || channel.phoneNumberId} value={channel.id || ""}>
                        {channel.displayName || "WhatsApp"} / {whatsappProviderLabel(channel.provider)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/55">Como deseja conectar?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                {WHATSAPP_PROVIDER_OPTIONS.map((option) => {
                  const active = whatsAppForm.provider === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setWhatsAppForm((current) => ({ ...current, provider: option.value }))}
                      disabled={!canManage}
                      className={`settings-whatsapp-provider rounded-2xl border p-3 text-left transition ${
                        active
                          ? "is-selected border-emerald-300/35 bg-emerald-500/12 text-emerald-50"
                          : "border-white/10 bg-white/[0.03] text-white/68 hover:bg-white/[0.06]"
                      } disabled:opacity-60`}
                    >
                      <div className="flex items-center gap-3">
                        <BrandIcon id={option.brand} size="sm" />
                        <div>
                          <p className="text-sm font-semibold">{option.label}</p>
                          <p className="mt-0.5 text-xs leading-5 opacity-75">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
              <Field label="Nome do canal" value={whatsAppForm.displayName} onChange={(value) => setWhatsAppForm((current) => ({ ...current, displayName: value }))} placeholder="WhatsApp Comercial" disabled={!canManage} />
              <Field label="Numero" value={whatsAppForm.phoneNumber} onChange={(value) => setWhatsAppForm((current) => ({ ...current, phoneNumber: value }))} placeholder="+55 11 99999-9999" disabled={!canManage} />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="settings-channels-field block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">Uso do numero</span>
                  <select
                    value={whatsAppForm.channelScope}
                    onChange={(event) => setWhatsAppForm((current) => ({
                      ...current,
                      channelScope: event.target.value === "personal" ? "personal" : "shared",
                      distributionEnabled: event.target.value !== "personal" && current.distributionEnabled,
                    }))}
                    disabled={!canManage}
                    className="settings-channels-select w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[var(--cliente-border-strong)]"
                  >
                    <option value="shared">Numero oficial compartilhado</option>
                    <option value="personal">Numero pessoal de vendedor</option>
                  </select>
                </label>
                {whatsAppForm.channelScope === "personal" ? (
                  <label className="settings-channels-field block space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-white/55">Vendedor responsavel</span>
                    <select
                      value={whatsAppForm.ownerUserId}
                      onChange={(event) => setWhatsAppForm((current) => ({ ...current, ownerUserId: event.target.value }))}
                      required
                      disabled={!canManage}
                      className="settings-channels-select w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[var(--cliente-border-strong)]"
                    >
                      <option value="">Selecione o vendedor</option>
                      {tenantUsers.map((seller) => (
                        <option key={seller.userId || seller.id} value={seller.userId || ""}>
                          {seller.name || seller.email || "Vendedor"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/76">
                    <input
                      type="checkbox"
                      checked={whatsAppForm.distributionEnabled}
                      onChange={(event) => setWhatsAppForm((current) => ({ ...current, distributionEnabled: event.target.checked }))}
                      disabled={!canManage}
                      className="h-4 w-4 rounded border-white/20"
                    />
                    Distribuir novas conversas entre vendedores
                  </label>
                )}
              </div>
              {whatsAppForm.provider === "meta_whatsapp" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="ID do numero na Meta" value={whatsAppForm.phoneNumberId} onChange={(value) => setWhatsAppForm((current) => ({ ...current, phoneNumberId: value }))} placeholder="123456789012345" required disabled={!canManage} />
                  <Field label="ID da conta WhatsApp (WABA)" value={whatsAppForm.wabaId} onChange={(value) => setWhatsAppForm((current) => ({ ...current, wabaId: value }))} placeholder="1495967261502319" disabled={!canManage} />
                </div>
              ) : whatsAppForm.provider === "evolution" && managedEvolutionConfigured ? (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm text-emerald-50/85">
                  Conexao por QR gerenciada pela Altum. Salve o canal e escaneie o codigo com seu WhatsApp.
                </div>
              ) : (
                <Field
                  label={whatsAppForm.provider === "evolution" ? "URL da Evolution API" : "URL de envio do provedor"}
                  value={whatsAppForm.gatewayEndpoint}
                  onChange={(value) => setWhatsAppForm((current) => ({ ...current, gatewayEndpoint: value }))}
                  placeholder={whatsAppForm.provider === "evolution" ? "https://evolution.suaempresa.com" : "https://seu-provedor.com/messages/send"}
                  required
                  disabled={!canManage}
                />
              )}
              {whatsAppForm.provider === "evolution" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Identificacao deste numero" value={whatsAppForm.sessionId} onChange={(value) => setWhatsAppForm((current) => ({ ...current, sessionId: value }))} placeholder="whatsapp-savio" disabled={!canManage} />
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-50/80">
                    Depois de salvar, clique em Gerar QR. A Altum cria a instancia, configura os eventos e acompanha a conexao automaticamente.
                  </div>
                </div>
              ) : whatsAppForm.provider !== "meta_whatsapp" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="URL de status" value={whatsAppForm.sessionStatusEndpoint} onChange={(value) => setWhatsAppForm((current) => ({ ...current, sessionStatusEndpoint: value }))} placeholder="https://seu-provedor.com/session/status" disabled={!canManage} />
                  <Field label="URL do QR" value={whatsAppForm.qrCodeEndpoint} onChange={(value) => setWhatsAppForm((current) => ({ ...current, qrCodeEndpoint: value }))} placeholder="https://seu-provedor.com/session/qr" disabled={!canManage} />
                  <Field label="URL de ligacao" value={whatsAppForm.callEndpoint} onChange={(value) => setWhatsAppForm((current) => ({ ...current, callEndpoint: value }))} placeholder="https://seu-provedor.com/calls/start" disabled={!canManage} />
                  <Field label="ID da sessao" value={whatsAppForm.sessionId} onChange={(value) => setWhatsAppForm((current) => ({ ...current, sessionId: value }))} placeholder="comercial-01" disabled={!canManage} />
                </div>
              ) : null}
              {whatsAppForm.provider === "evolution" && managedEvolutionConfigured ? null : (
                <SelectField label="Status" value={whatsAppForm.status} onChange={(value) => setWhatsAppForm((current) => ({ ...current, status: value }))} disabled={!canManage} />
              )}
              {!(whatsAppForm.provider === "evolution" && managedEvolutionConfigured) ? (
                <SecretField label={whatsAppForm.provider === "meta_whatsapp" ? "Credencial de acesso" : whatsAppForm.provider === "evolution" ? "API key da Evolution" : "Credencial do provedor"} value={whatsAppForm.accessToken} onChange={(value) => setWhatsAppForm((current) => ({ ...current, accessToken: value }))} placeholder={whatsAppMasked.access || "credencial"} required={!selectedChannel?.hasAccessToken} disabled={!canManage} />
              ) : null}
              {whatsAppForm.provider === "meta_whatsapp" ? (
                <>
                  <SecretField label="Token de verificacao" value={whatsAppForm.verifyToken} onChange={(value) => setWhatsAppForm((current) => ({ ...current, verifyToken: value }))} placeholder={whatsAppMasked.verify || "token de verificacao"} required={!selectedChannel?.hasVerifyToken} disabled={!canManage} />
                  <SecretField label="Segredo do app Meta" value={whatsAppForm.appSecret} onChange={(value) => setWhatsAppForm((current) => ({ ...current, appSecret: value }))} placeholder={whatsAppMasked.secret || "segredo do app"} required={!selectedChannel?.hasAppSecret} disabled={!canManage} />
                </>
              ) : (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-50/80">
                  {whatsAppForm.provider === "evolution"
                    ? "Mensagens, midias, audios, respostas da IA e atendimento humano usarao esta mesma conexao."
                    : "A conexao externa precisa aceitar envio de mensagens pela Altum para manter Conversas e Assistente no mesmo fluxo."}
                </div>
              )}

              {whatsAppForm.provider !== "meta_whatsapp" && selectedChannel?.id ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Sessao do WhatsApp</p>
                      <p className="mt-1 text-xs text-white/52">
                        Monitore a conexao do numero e gere QR sem sair da Altum.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void checkWhatsAppSession("status")}
                        disabled={checkingWhatsAppSession}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08] disabled:opacity-60"
                      >
                        {checkingWhatsAppSession ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Status
                      </button>
                      <button
                        type="button"
                        onClick={() => void checkWhatsAppSession("qr")}
                        disabled={checkingWhatsAppSession}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/15 disabled:opacity-60"
                      >
                        Gerar QR
                      </button>
                    </div>
                  </div>
                  {whatsAppSession ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge label={whatsAppSession.status || "sem status"} tone={whatsAppSession.status === "connected" ? "success" : whatsAppSession.status === "error" ? "danger" : "warning"} />
                        {whatsAppSession.message ? <span className="text-xs text-white/52">{whatsAppSession.message}</span> : null}
                      </div>
                      {whatsAppSession.qr ? (
                        whatsAppSession.qr.startsWith("http") || whatsAppSession.qr.startsWith("data:image") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <div className="mt-3 inline-flex rounded-2xl border border-[var(--cliente-border)] bg-white p-4 shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={whatsAppSession.qr}
                              alt="QR do WhatsApp"
                              className="h-64 w-64 object-contain [image-rendering:pixelated]"
                            />
                          </div>
                        ) : (
                          <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/70">{whatsAppSession.qr}</pre>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <SaveButton saving={saving} label={whatsAppForm.channelId ? "Salvar numero" : "Adicionar WhatsApp"} disabled={!canManage} />
                {selectedChannel?.id && selectedChannel.source !== "agency_env" ? (
                  <button
                    type="button"
                    onClick={() => void deleteSelectedChannel()}
                    disabled={deletingChannel || !canManage}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60"
                  >
                    {deletingChannel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Excluir numero
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWhatsAppChannelId("");
                    setWhatsAppMasked({});
                    setWhatsAppForm({
                      channelId: "",
                      provider: managedEvolutionConfigured ? "evolution" : "meta_whatsapp",
                      displayName: "WhatsApp",
                      phoneNumber: "",
                      phoneNumberId: "",
                      wabaId: "",
                      gatewayEndpoint: "",
                      sessionStatusEndpoint: "",
                      qrCodeEndpoint: "",
                      callEndpoint: "",
                      sessionId: "",
                      accessToken: "",
                      verifyToken: "",
                      appSecret: "",
                      status: "active",
                      channelScope: "shared",
                      ownerUserId: "",
                      distributionEnabled: true,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/72 transition hover:bg-white/[0.08]"
                >
                  Novo numero
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/cliente/painel/inbox?channel=whatsapp"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
                >
                  Abrir no inbox
                </Link>
                <Link
                  href="/cliente/painel/metricas"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
                >
                  Ver impacto nas metricas
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={onSubmitGeneric} className="mt-4 space-y-3">
              <ConnectorDiagnostics
                title={`Diagnostico de ${selectedDefinition.label}`}
                rows={selectedReadinessRows}
                summary={selectedPlaybook.summary}
                links={selectedPlaybook.links}
              />
              {loadingPending ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/65">
                  Carregando ativos disponiveis...
                </div>
              ) : null}
              {pendingSelection && pendingSelection.channelType === selectedDefinition.type ? (
                <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/80">Selecione o ativo</p>
                  <p className="mt-2 text-xs text-emerald-100/85">
                    Encontramos mais de uma conta elegivel. Escolha qual ativo deve ser vinculado a esta conta.
                  </p>
                  <div className="mt-3 space-y-2">
                    {pendingSelection.options.map((option) => {
                      const isSelectedOption = pendingOptionId === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPendingOptionId(option.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            isSelectedOption
                              ? "border-emerald-200/50 bg-emerald-500/20"
                              : "border-emerald-200/20 bg-black/25 hover:bg-black/35"
                          }`}
                        >
                          <p className="text-sm font-semibold text-white">{option.label}</p>
                          {option.description ? (
                            <p className="mt-1 text-xs text-emerald-100/80">{option.description}</p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-emerald-100/60">ID: {option.id}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void completePendingSelectionFlow()}
                      disabled={completingPending || !pendingOptionId}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/35 bg-emerald-500/25 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/35 disabled:opacity-60"
                    >
                      {completingPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      Confirmar ativo
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Conexao gerenciada</p>
                <p className="mt-2 text-xs text-white/62">
                  A Altum cuida da conexao segura da plataforma. Quando conectar, campanhas, leads e conversoes passam a alimentar a operacao.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedDefinition.type === "google_ads" ? (
                    <button
                      type="button"
                      onClick={() => void startManagedConnect("google")}
                      disabled={connecting || !canManage}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-[var(--cliente-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
                    >
                      {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      {selectedChannel?.id ? "Reconectar Google" : "Conectar Google"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startManagedConnect("meta")}
                      disabled={connecting || !canManage}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-[var(--cliente-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
                    >
                      {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      {selectedChannel?.id ? "Reconectar Meta" : "Conectar Meta"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void testManagedChannelConnection()}
                    disabled={testingConnection || !selectedChannel?.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08] disabled:opacity-60"
                  >
                    {testingConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Testar conexao
                  </button>
                  <button
                    type="button"
                    onClick={() => void disconnectManagedChannel()}
                    disabled={disconnecting || !selectedChannel?.id || !canManage}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    Desconectar
                  </button>
                </div>
              </div>
              <Field label="Nome do conector" value={genericForm.displayName} onChange={(value) => setGenericForm((current) => ({ ...current, displayName: value }))} placeholder={selectedDefinition.label} required disabled={!canManage} />
              <Field label={selectedDefinition.primaryLabel} value={genericForm.externalAccountId} onChange={(value) => setGenericForm((current) => ({ ...current, externalAccountId: value }))} placeholder="ID externo do conector" required disabled={!canManage} />
              <Field label={selectedDefinition.secondaryLabel} value={genericForm.secondaryValue} onChange={(value) => setGenericForm((current) => ({ ...current, secondaryValue: value }))} placeholder="Referencia secundaria" disabled={!canManage} />
              {selectedDefinition.metadataKey ? (
                <Field label={selectedDefinition.metadataLabel || selectedDefinition.metadataKey} value={genericForm.metadataValue} onChange={(value) => setGenericForm((current) => ({ ...current, metadataValue: value }))} placeholder="Dado complementar" disabled={!canManage} />
              ) : null}
              {selectedDefinition.type === "meta_ads" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="Meta Pixel ID"
                    value={genericForm.pixelId}
                    onChange={(value) => setGenericForm((current) => ({ ...current, pixelId: value }))}
                    placeholder="123456789012345"
                    disabled={!canManage}
                  />
                  <Field
                    label="Test event code"
                    value={genericForm.testEventCode}
                    onChange={(value) => setGenericForm((current) => ({ ...current, testEventCode: value }))}
                    placeholder="TEST123"
                    disabled={!canManage}
                  />
                </div>
              ) : null}
              {selectedDefinition.type === "google_ads" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="Conversion: lead criado"
                    value={genericForm.leadConversionActionId}
                    onChange={(value) => setGenericForm((current) => ({ ...current, leadConversionActionId: value }))}
                    placeholder="1234567890"
                    disabled={!canManage}
                  />
                  <Field
                    label="Conversion: lead qualificado"
                    value={genericForm.qualifiedConversionActionId}
                    onChange={(value) => setGenericForm((current) => ({ ...current, qualifiedConversionActionId: value }))}
                    placeholder="1234567890"
                    disabled={!canManage}
                  />
                  <Field
                    label="Conversion: reuniao marcada"
                    value={genericForm.meetingConversionActionId}
                    onChange={(value) => setGenericForm((current) => ({ ...current, meetingConversionActionId: value }))}
                    placeholder="1234567890"
                    disabled={!canManage}
                  />
                  <Field
                    label="Conversion: reuniao concluida"
                    value={genericForm.meetingCompletedConversionActionId}
                    onChange={(value) => setGenericForm((current) => ({ ...current, meetingCompletedConversionActionId: value }))}
                    placeholder="1234567890"
                    disabled={!canManage}
                  />
                  <Field
                    label="Conversion: venda ganha"
                    value={genericForm.saleConversionActionId}
                    onChange={(value) => setGenericForm((current) => ({ ...current, saleConversionActionId: value }))}
                    placeholder="1234567890"
                    disabled={!canManage}
                  />
                </div>
              ) : null}
              <SelectField label="Status" value={genericForm.status} onChange={(value) => setGenericForm((current) => ({ ...current, status: value }))} disabled={!canManage} />

              {supportsMetaWebhook(selectedDefinition.type) ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/58">
                  Eventos da Meta serao recebidos pela Altum automaticamente quando a conexao estiver pronta.
                </div>
              ) : null}
              {selectedDefinition.type === "google_ads" ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/58">
                  A leitura de campanhas do Google Ads depende da conexao gerenciada da Altum estar ativa.
                </div>
              ) : null}

              {selectedChannel?.lastError ? (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs text-rose-100">
                  Ultimo alerta da conexao: {selectedChannel.lastError}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <SaveButton saving={saving} label={`Salvar ${selectedDefinition.label}`} disabled={!canManage} />
                {selectedChannel?.id ? (
                  <button
                    type="button"
                    onClick={() => void deleteSelectedChannel()}
                    disabled={deletingChannel || !canManage}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60"
                  >
                    {deletingChannel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Excluir canal
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {isAdsConnector ? (
                  <button
                    type="button"
                    onClick={() => void syncCampaignConnector()}
                    disabled={syncingCampaigns || !canManage || !selectedChannel?.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08] disabled:opacity-60"
                  >
                    {syncingCampaigns ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Atualizar campanhas
                  </button>
                ) : null}
                <Link
                  href={selectedDefinition.type === "meta_ads" || selectedDefinition.type === "google_ads" ? "/cliente/painel/crm" : `/cliente/painel/inbox?channel=${encodeURIComponent(selectedDefinition.type)}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
                >
                  {selectedDefinition.type === "meta_ads" || selectedDefinition.type === "google_ads" ? "Abrir leads no CRM" : "Abrir no inbox"}
                </Link>
                <Link
                  href="/cliente/painel/metricas"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
                >
                  Ver impacto nas metricas
                </Link>
              </div>
            </form>
          )}

          {error ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              {notice}
            </div>
          ) : null}
        </PanelCard>
      </section>
    </div>
  );
}

function ConversionHealthPanel({
  health,
  loading,
  onRefresh,
}: {
  health: ConversionHealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const summary = health?.summary;
  const issues = health?.issues || [];
  const items = health?.items || [];

  return (
    <div className="settings-channels-health-panel mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle
          title="Pixels e conversoes"
          subtitle="Valide se leads, reunioes e vendas estao voltando para Meta e Google Ads."
        />
        <div className="flex items-center gap-2">
          <StateBadge
            label={health?.ok ? "Sem bloqueios" : issues.length ? `${issues.length} alerta(s)` : "Nao validado"}
            tone={health?.ok ? "success" : issues.length ? "warning" : "neutral"}
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Validar
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniPanel title="Contas prontas" value={`${summary?.ready || 0}/${summary?.total || 0}`} />
        <MiniPanel title="Eventos enviados" value={String(summary?.processedRecent || 0)} />
        <MiniPanel title="Falhas recentes" value={String(summary?.failedRecent || 0)} />
      </div>

      {items.length ? (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.channelId} className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{item.displayName}</p>
                  <p className="mt-1 text-xs text-white/46">
                    {item.configuredEvents.length} evento(s) configurado(s) / ultimo envio {formatDateTime(item.recent.lastEventAt)}
                  </p>
                </div>
                <StateBadge label={item.ready ? "Pronto" : "Pendente"} tone={item.ready ? "success" : "warning"} />
              </div>
              {item.issues.length ? (
                <p className="mt-2 text-xs text-amber-100/80">{item.issues.join(" ")}</p>
              ) : (
                <p className="mt-2 text-xs text-white/50">
                  Processados {item.recent.processed} de {item.recent.total}; falhas {item.recent.failed}.
                </p>
              )}
              {item.recent.lastError ? (
                <p className="mt-2 text-xs text-rose-100/80">Ultimo alerta: {item.recent.lastError}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-white/52">Conecte Meta Ads ou Google Ads para validar o retorno de dados das campanhas.</p>
      )}
    </div>
  );
}

function MiniPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="settings-channels-mini-panel rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{title}</p>
      <p className="mt-2 text-sm text-white/68">{value}</p>
    </div>
  );
}

type ConnectorReadinessRow = {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

function ConnectorDiagnostics({
  title,
  rows,
  summary,
  links,
}: {
  title: string;
  rows: ConnectorReadinessRow[];
  summary: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <details className="settings-connector-diagnostics group rounded-2xl border border-white/10 bg-white/[0.03]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Detalhes e diagnostico
        </span>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-white/10 p-3 lg:grid-cols-2">
        <ConnectorReadiness title={title} rows={rows} />
        <ConnectorGuidance summary={summary} links={links} />
      </div>
    </details>
  );
}

function ConnectorReadiness({
  title,
  rows,
}: {
  title: string;
  rows: ConnectorReadinessRow[];
}) {
  return (
    <div className="settings-channels-readiness rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2">
            <span className="text-sm text-white/62">{row.label}</span>
            <StateBadge label={row.value} tone={row.tone} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectorGuidance({
  summary,
  links,
}: {
  summary: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="settings-channels-guidance rounded-2xl border border-white/10 bg-black/25 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Playbook operacional</p>
      <p className="mt-2 text-sm leading-6 text-white/68">{summary}</p>
      {links.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SaveButton({ saving, label, disabled = false }: { saving: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving || disabled}
      className="settings-channels-save inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {label}
    </button>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="settings-channels-field block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        className="settings-channels-input w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
      />
    </label>
  );
}

function SecretField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="settings-channels-field block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        type="password"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        className="settings-channels-input w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="settings-channels-field block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="settings-channels-select w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
      >
        <option value="draft">Rascunho</option>
        <option value="active">Ativo</option>
        <option value="inactive">Inativo</option>
        <option value="error">Erro</option>
      </select>
    </label>
  );
}

