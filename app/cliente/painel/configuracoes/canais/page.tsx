"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type ChannelItem = {
  id?: string;
  type?: string;
  provider?: string;
  displayName?: string;
  status?: string;
  connectionStatus?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
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
};

type ChannelsResponse = {
  items?: ChannelItem[];
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
    displayName?: string;
    phoneNumber?: string;
    phoneNumberId?: string;
    status?: string;
    accessTokenMasked?: string;
    verifyTokenMasked?: string;
    appSecretMasked?: string;
  } | null;
  error?: string;
};

type ConnectorType = "whatsapp" | "instagram" | "messenger" | "meta_ads" | "google_ads";

type ConnectorDefinition = {
  type: ConnectorType;
  label: string;
  description: string;
  provider: string;
  icon: typeof MessageSquare;
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
    description: "Canal oficial para webhook, inbox e envio manual por tenant.",
    provider: "meta_whatsapp",
    icon: MessageSquare,
    primaryLabel: "phoneNumberId",
    secondaryLabel: "Numero",
    secondaryKey: "username",
  },
  {
    type: "instagram",
    label: "Instagram DM",
    description: "Preparado para atendimento omnichannel e roteamento por tenant.",
    provider: "meta_instagram",
    icon: Instagram,
    primaryLabel: "Instagram business ID",
    secondaryLabel: "Usuario",
    secondaryKey: "username",
  },
  {
    type: "messenger",
    label: "Facebook Messenger",
    description: "Conector para mensagens da pagina e centralizacao do inbox.",
    provider: "facebook_messenger",
    icon: Facebook,
    primaryLabel: "Facebook page ID",
    secondaryLabel: "Nome da pagina",
    secondaryKey: "pageId",
  },
  {
    type: "meta_ads",
    label: "Meta Ads",
    description: "Origem de leads e atribuicao de campanhas no dashboard comercial.",
    provider: "meta_ads",
    icon: Megaphone,
    primaryLabel: "Ad account ID",
    secondaryLabel: "Page ID",
    secondaryKey: "pageId",
    metadataKey: "formId",
    metadataLabel: "Lead form ID",
  },
  {
    type: "google_ads",
    label: "Google Ads",
    description: "Conector com OAuth server-side para custo, CPL e atribuicao comercial por tenant.",
    provider: "google_ads",
    icon: Search,
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
  if (status === "webhook_pending") return "Webhook pendente";
  if (status === "syncing") return "Sincronizando";
  if (status === "ready") return "Pronto";
  if (status === "degraded") return "Degradado";
  if (status === "reauth_required") return "Reconexao necessaria";
  if (status === "revoked") return "Revogado";
  if (status === "error") return "Erro";
  return "Rascunho";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem sync";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sem sync" : parsed.toLocaleString("pt-BR", {
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
      label: "Webhook inbound",
      value: readinessLabel(channel?.inboundReady, "Pronto", "Pendente"),
      tone: readinessTone(channel?.inboundReady),
    });
  }

  if (!isAdsConnector || definition.type === "meta_ads") {
    rows.push({
      label: definition.type === "meta_ads" ? "Captura inbound" : "Envio manual",
      value: readinessLabel(channel?.outboundReady ?? channel?.inboundReady, "Pronto", "Pendente"),
      tone: readinessTone(channel?.outboundReady ?? channel?.inboundReady),
    });
  }

  rows.push({
    label: isAdsConnector ? "Sync server-side" : "Roteamento operacional",
    value: readinessLabel(isAdsConnector ? channel?.syncReady : channel?.routingReady, "Pronto", "Pendente"),
    tone: readinessTone(isAdsConnector ? channel?.syncReady : channel?.routingReady),
  });

  if (definition.type === "google_ads") {
    rows.push({
      label: "Servidor OAuth",
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
        label: "Ultimo sync",
        value: channel?.lastCampaignDateRef || formatDateTime(channel?.lastSyncAt),
        tone: channel?.lastCampaignDateRef || channel?.lastSyncAt ? "info" : "neutral",
      },
      {
        label: "Snapshots",
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

function buildConnectorPlaybook(definition: ConnectorDefinition, channel: ChannelItem | null) {
  const inboxHref = `/cliente/painel/inbox?channel=${encodeURIComponent(definition.type)}`;
  const crmHref = `/cliente/painel/crm?channel=${encodeURIComponent(definition.type)}`;

  if (definition.type === "instagram" || definition.type === "messenger") {
    return {
      summary: channel?.routingReady
        ? "Conector pronto para receber mensagens e permitir envio manual pelo inbox do tenant."
        : "Complete token, webhook e mapeamento da conta para liberar atendimento inbound e outbound no inbox.",
      links: [
        { href: inboxHref, label: "Abrir conversa no inbox" },
        { href: "/cliente/painel/logs", label: "Ver logs operacionais" },
      ],
    };
  }

  if (definition.type === "meta_ads" || definition.type === "google_ads") {
    return {
      summary: channel?.syncReady
        ? "Campanhas prontas para alimentar origem, CPL e atribuicao comercial do tenant."
        : "Complete credenciais e mapeamento da conta para sincronizar campanhas e atribuir leads com seguranca.",
      links: [
        { href: crmHref, label: "Abrir leads no CRM" },
        { href: "/cliente/painel/metricas", label: "Ver impacto nas metricas" },
      ],
    };
  }

  return {
    summary: channel?.routingReady
      ? "Canal pronto para webhook, envio manual, IA e takeover dentro do inbox unificado."
      : "Finalize credenciais e webhook para colocar o canal em operacao completa no tenant.",
    links: [
      { href: inboxHref, label: "Abrir no inbox" },
      { href: "/cliente/painel/handoffs", label: "Ver handoffs" },
    ],
  };
}

export default function ClienteCanaisPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncingCampaigns, setSyncingCampaigns] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [completingPending, setCompletingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ConnectorType>("whatsapp");
  const canManage = hasCapability("manage_channels");

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [pendingSelection, setPendingSelection] = useState<IntegrationPendingItem | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState("");
  const [whatsAppMasked, setWhatsAppMasked] = useState<{ access?: string; verify?: string; secret?: string }>({});
  const [whatsAppForm, setWhatsAppForm] = useState({
    displayName: "WhatsApp",
    phoneNumber: "",
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "",
    appSecret: "",
    status: "active",
  });
  const [genericForm, setGenericForm] = useState({
    channelId: "",
    displayName: "",
    externalAccountId: "",
    secondaryValue: "",
    status: "draft",
    metadataValue: "",
  });

  const selectedDefinition = useMemo(
    () => CONNECTORS.find((item) => item.type === selectedType) || CONNECTORS[0],
    [selectedType]
  );
  const selectedChannel = useMemo(
    () => channels.find((item) => item.type === selectedType) || null,
    [channels, selectedType]
  );

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [channelsRes, whatsAppRes] = await Promise.all([
          authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
          authedFetch(`/api/tenant/${tenant.tenantId}/channels/whatsapp`),
        ]);

        const channelsData = (await channelsRes.json()) as ChannelsResponse;
        const whatsAppData = (await whatsAppRes.json()) as WhatsAppChannelResponse;

        if (!mounted) return;

        if (!channelsRes.ok) {
          setError(channelsData.error || "Falha ao carregar canais.");
        } else {
          setChannels(channelsData.items || []);
        }

        if (whatsAppRes.ok && whatsAppData.channel) {
          setWhatsAppForm((current) => ({
            ...current,
            displayName: whatsAppData.channel?.displayName || "WhatsApp",
            phoneNumber: whatsAppData.channel?.phoneNumber || "",
            phoneNumberId: whatsAppData.channel?.phoneNumberId || "",
            status: whatsAppData.channel?.status || "active",
          }));
          setWhatsAppMasked({
            access: whatsAppData.channel.accessTokenMasked || "",
            verify: whatsAppData.channel.verifyTokenMasked || "",
            secret: whatsAppData.channel.appSecretMasked || "",
          });
        }
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar conectores do tenant.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

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
    const activeTypes = new Set(channels.filter((item) => item.status === "active").map((item) => item.type || ""));
    if (whatsAppForm.phoneNumberId && !activeTypes.has("whatsapp")) {
      activeTypes.add("whatsapp");
    }
    return activeTypes.size;
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
      setNotice(`Sync concluido: ${data.synced || 0} snapshot(s) atualizados e ${data.failed || 0} falha(s).`);
      await refreshChannels();
    } catch {
      setError("Falha ao sincronizar campanhas.");
    } finally {
      setSyncingCampaigns(false);
    }
  }

  const refreshChannels = useCallback(async () => {
    if (!tenant?.tenantId) return;
    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`);
    const data = (await res.json()) as ChannelsResponse;
    if (res.ok) setChannels(data.items || []);
  }, [tenant?.tenantId]);

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
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whatsAppForm),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao salvar canal WhatsApp.");
        return;
      }

      setWhatsAppForm((current) => ({ ...current, accessToken: "", verifyToken: "", appSecret: "" }));
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
      const metadata = selectedDefinition.metadataKey && genericForm.metadataValue
        ? { [selectedDefinition.metadataKey]: genericForm.metadataValue }
        : {};

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
    <div className="space-y-4">
      <SectionHeader
        title="Canais conectados"
        subtitle="Hub de conectores do tenant para atendimento, captacao e atribuicao comercial."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />

      {!canManage ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Seu acesso e somente leitura para conectores. A configuracao e o sync exigem capacidade de gestao de canais.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Arquitetura omnichannel" subtitle="Cada conector fica isolado por tenant e pronto para o inbox unificado." />
            <StateBadge label={`${configuredCount} conectores ativos`} tone="info" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {CONNECTORS.map((connector) => {
              const item = connector.type === "whatsapp"
                ? channels.find((channel) => channel.type === "whatsapp") || { status: whatsAppForm.phoneNumberId ? whatsAppForm.status : "draft" }
                : channels.find((channel) => channel.type === connector.type);
              const Icon = connector.icon;
              const isSelected = connector.type === selectedType;

              return (
                <button
                  key={connector.type}
                  type="button"
                  onClick={() => setSelectedType(connector.type)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-xl border border-white/12 bg-black/25 p-2 text-[var(--cliente-accent)]">
                      <Icon className="h-4 w-4" />
                    </div>
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
                  <p className="mt-4 text-sm font-semibold text-white">{connector.label}</p>
                  <p className="mt-1 text-sm leading-6 text-white/56">{connector.description}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MiniPanel title="Atendimento" value="WhatsApp, Instagram e Messenger preparados para o inbox do tenant." />
            <MiniPanel title="Captacao" value="Meta Ads e Google Ads conectam origem, CPL e atribuicao." />
            <MiniPanel title="Seguranca" value="Tokens ficam server-side e isolados por empresa cliente." />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Prontidao atual" subtitle="Leitura rapida dos conectores que ja podem operar no tenant" />
              <StateBadge label={`${activeConnectors.length} ativos`} tone="success" />
            </div>
            <div className="mt-4 space-y-2">
              {activeConnectors.length === 0 ? (
                <p className="text-sm text-white/52">Nenhum conector ativo ainda. Comece pelo WhatsApp e pelos canais de origem do lead.</p>
              ) : (
                activeConnectors.map((channel) => (
                  <div key={channel.id || channel.type} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{CONNECTORS.find((item) => item.type === channel.type)?.label || channel.displayName || channel.type}</p>
                      <p className="mt-1 text-xs text-white/48">
                        atualizado {formatDateTime(channel.updatedAt)}{channel.lastSyncAt ? ` • sync ${formatDateTime(channel.lastSyncAt)}` : ""}
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
                      {channel.hasAccessToken ? <StateBadge label="token OK" tone="info" /> : null}
                      {channel.outboundReady ? <StateBadge label="envio pronto" tone="success" /> : null}
                      {channel.inboundReady ? <StateBadge label="entrada pronta" tone="success" /> : null}
                      {channel.syncReady ? <StateBadge label="sync pronto" tone="success" /> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle title={selectedDefinition.label} subtitle={selectedDefinition.description} />
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
              <ConnectorReadiness title="Readiness do WhatsApp" rows={selectedReadinessRows} />
              <ConnectorGuidance summary={selectedPlaybook.summary} links={selectedPlaybook.links} />
              <Field label="Nome do canal" value={whatsAppForm.displayName} onChange={(value) => setWhatsAppForm((current) => ({ ...current, displayName: value }))} placeholder="WhatsApp Comercial" disabled={!canManage} />
              <Field label="Numero (opcional)" value={whatsAppForm.phoneNumber} onChange={(value) => setWhatsAppForm((current) => ({ ...current, phoneNumber: value }))} placeholder="+55 11 99999-9999" disabled={!canManage} />
              <Field label="phoneNumberId" value={whatsAppForm.phoneNumberId} onChange={(value) => setWhatsAppForm((current) => ({ ...current, phoneNumberId: value }))} placeholder="123456789012345" required disabled={!canManage} />
              <SelectField label="Status" value={whatsAppForm.status} onChange={(value) => setWhatsAppForm((current) => ({ ...current, status: value }))} disabled={!canManage} />
              <SecretField label="Access Token" value={whatsAppForm.accessToken} onChange={(value) => setWhatsAppForm((current) => ({ ...current, accessToken: value }))} placeholder={whatsAppMasked.access || "EAAG..."} required disabled={!canManage} />
              <SecretField label="Verify Token" value={whatsAppForm.verifyToken} onChange={(value) => setWhatsAppForm((current) => ({ ...current, verifyToken: value }))} placeholder={whatsAppMasked.verify || "verify-token"} required disabled={!canManage} />
              <SecretField label="App Secret" value={whatsAppForm.appSecret} onChange={(value) => setWhatsAppForm((current) => ({ ...current, appSecret: value }))} placeholder={whatsAppMasked.secret || "app-secret"} required disabled={!canManage} />

              <SaveButton saving={saving} label="Salvar canal WhatsApp" disabled={!canManage} />
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
              <ConnectorReadiness title={`Readiness de ${selectedDefinition.label}`} rows={selectedReadinessRows} />
              <ConnectorGuidance summary={selectedPlaybook.summary} links={selectedPlaybook.links} />
              {loadingPending ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/65">
                  Carregando ativos disponiveis...
                </div>
              ) : null}
              {pendingSelection && pendingSelection.channelType === selectedDefinition.type ? (
                <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/80">Selecione o ativo</p>
                  <p className="mt-2 text-xs text-emerald-100/85">
                    Encontramos mais de uma conta elegivel. Escolha qual ativo deve ser vinculado a este tenant.
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
                  A Altum gerencia OAuth, webhook e segredos de plataforma no backend. Nao e necessario informar App Secret, Verify Token, Client ID ou Client Secret aqui.
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
              <SelectField label="Status" value={genericForm.status} onChange={(value) => setGenericForm((current) => ({ ...current, status: value }))} disabled={!canManage} />

              {supportsMetaWebhook(selectedDefinition.type) ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/58">
                  Webhook unico Meta: <span className="font-medium text-white/82">/api/webhooks/meta</span> (verify token e assinatura globais da plataforma)
                </div>
              ) : null}
              {selectedDefinition.type === "google_ads" ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/58">
                  O sync do Google Ads usa OAuth offline no backend. O servidor da Altum precisa de
                  <span className="font-medium text-white/82"> GOOGLE_ADS_CLIENT_ID</span>,
                  <span className="font-medium text-white/82"> GOOGLE_ADS_CLIENT_SECRET</span> e
                  <span className="font-medium text-white/82"> GOOGLE_ADS_DEVELOPER_TOKEN</span>.
                </div>
              ) : null}

              {selectedChannel?.lastError ? (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs text-rose-100">
                  Ultimo erro do conector: {selectedChannel.lastError}
                </div>
              ) : null}

              <SaveButton saving={saving} label={`Salvar ${selectedDefinition.label}`} disabled={!canManage} />
              <div className="flex flex-wrap gap-2">
                {isAdsConnector ? (
                  <button
                    type="button"
                    onClick={() => void syncCampaignConnector()}
                    disabled={syncingCampaigns || !canManage || !selectedChannel?.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08] disabled:opacity-60"
                  >
                    {syncingCampaigns ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync campanhas
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

function MiniPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{title}</p>
      <p className="mt-2 text-sm text-white/68">{value}</p>
    </div>
  );
}

function ConnectorReadiness({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
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
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
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
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
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
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
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
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        type="password"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
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
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
      >
        <option value="draft">Rascunho</option>
        <option value="active">Ativo</option>
        <option value="inactive">Inativo</option>
        <option value="error">Erro</option>
      </select>
    </label>
  );
}

