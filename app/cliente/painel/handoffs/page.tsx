"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Brain,
  GitBranchPlus,
  Inbox,
  Loader2,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { getBusinessProfile, getBusinessProfilePlaybookPreset, type BusinessProfileId } from "@/lib/business-profiles";
import { CardTitle, EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type ChatStateItem = {
  aiEnabled: boolean;
  pausedUntil?: unknown;
  humanOwnerUserId?: string | null;
  updatedAt?: unknown;
};

type ChatItem = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  channel?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  status?: string;
  priority?: string;
  unreadCount?: number;
  assignedUserId?: string;
  queueStatus?: string;
  leadId?: string;
  aiState?: ChatStateItem | null;
};

type AiLog = {
  id: string;
  chatId?: string;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  reason?: string;
  confidence?: number | null;
  createdAt?: unknown;
  output?: string;
};

type TenantUser = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  team?: string;
  availability?: "online" | "busy" | "offline";
};

type HandoffRow = {
  chatId: string;
  contactName: string;
  contactPhone: string;
  channel: string;
  status: string;
  priority: string;
  queueStatus: string;
  unreadCount: number;
  leadId: string;
  assignedUserId: string;
  humanOwnerUserId: string;
  humanOwnerName: string;
  humanOwnerTeam: string;
  humanOwnerAvailability: string;
  handoffReason: string;
  handoffTime: number;
  lastMessageTime: number;
  confidence: number | null;
  aiEnabled: boolean;
  preview: string;
};

type FocusSignal = {
  id: string;
  title: string;
  detail: string;
  badge: string;
  tone: "warning" | "danger" | "info" | "success" | "neutral";
  action: () => void;
};

type TenantSettingsResponse = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function formatDateTime(value: number) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(value: number) {
  if (!value) return "Sem atividade";
  const diff = Date.now() - value;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} min atras`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h atras`;
  const days = Math.round(hours / 24);
  return `${days} d atras`;
}

function formatChannel(value?: string) {
  const channel = String(value || "").toLowerCase();
  if (channel === "instagram") return "Instagram";
  if (channel === "messenger") return "Messenger";
  if (channel === "facebook") return "Facebook";
  if (channel === "site_chat") return "Site chat";
  if (channel === "whatsapp") return "WhatsApp";
  return channel || "Canal";
}

function formatStatus(value?: string) {
  const status = String(value || "").toLowerCase();
  if (status === "closed" || status === "resolved") return "resolvido";
  if (status === "pending") return "pendente";
  return "aberto";
}

function formatQueue(value?: string) {
  const queue = String(value || "").toLowerCase();
  if (queue === "sla_breached") return "sla estourado";
  if (queue === "awaiting_reply") return "aguardando resposta";
  if (queue === "unassigned") return "sem responsavel";
  if (queue === "triage") return "triagem";
  if (queue === "in_progress") return "em atendimento";
  return queue || "operacao";
}

function formatPriority(value?: string) {
  const priority = String(value || "").toLowerCase();
  if (priority === "high") return "alta";
  if (priority === "medium") return "media";
  if (priority === "low") return "baixa";
  return priority || "normal";
}

function formatAvailability(value?: string) {
  const availability = String(value || "").toLowerCase();
  if (availability === "busy") return "ocupado";
  if (availability === "offline") return "offline";
  return "online";
}

function ownerTone(value?: string) {
  const availability = String(value || "").toLowerCase();
  if (availability === "offline") return "danger" as const;
  if (availability === "busy") return "warning" as const;
  return "success" as const;
}

function confidenceTone(value: number | null) {
  if (typeof value !== "number") return "neutral" as const;
  if (value < 0.45) return "danger" as const;
  if (value < 0.65) return "warning" as const;
  return "success" as const;
}

function confidenceLabel(value: number | null) {
  if (typeof value !== "number") return "--";
  return `${Math.round(value * 100)}%`;
}

function safeSearchParam(searchParams: URLSearchParams, key: string, nextValue?: string | null) {
  const params = new URLSearchParams(searchParams.toString());
  if (!nextValue || nextValue === "all") {
    params.delete(key);
  } else {
    params.set(key, nextValue);
  }
  return params.toString();
}

export default function ClienteHandoffsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenant, hasCapability } = useClienteTenant();

  const [loading, setLoading] = useState(true);
  const [actingChatId, setActingChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");

  const q = searchParams.get("q") || "";
  const owner = searchParams.get("owner") || "all";
  const channel = searchParams.get("channel") || "all";
  const assignment = searchParams.get("assignment") || "all";
  const risk = searchParams.get("risk") || "all";
  const chatId = searchParams.get("chatId") || "";

  const updateQuery = useCallback(
    (key: string, value?: string | null) => {
      const next = safeSearchParam(searchParams, key, value);
      router.replace(next ? `/cliente/painel/handoffs?${next}` : "/cliente/painel/handoffs");
    },
    [router, searchParams]
  );

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [chatsRes, logsRes, usersRes, settingsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/chats`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
      ]);

      const chatsPayload = (await chatsRes.json()) as { items?: ChatItem[]; error?: string };
      const logsPayload = (await logsRes.json()) as { items?: AiLog[]; error?: string };
      const usersPayload = (await usersRes.json()) as { items?: TenantUser[]; error?: string };
      const settingsPayload = (await settingsRes.json()) as TenantSettingsResponse;

      if (!chatsRes.ok) throw new Error(chatsPayload.error || "Falha ao carregar chats.");
      if (!logsRes.ok) throw new Error(logsPayload.error || "Falha ao carregar logs de IA.");
      if (!usersRes.ok) throw new Error(usersPayload.error || "Falha ao carregar usuarios.");

      setChats(chatsPayload.items || []);
      setLogs(logsPayload.items || []);
      setUsers(usersPayload.items || []);
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar central de handoffs.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  const canOperate = hasCapability("respond_inbox");
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const playbookPreset = useMemo(() => getBusinessProfilePlaybookPreset(businessProfileId), [businessProfileId]);

  async function handleHandoffAction(chatIdToUpdate: string, action: "takeover" | "resume") {
    if (!tenant?.tenantId || !canOperate) return;

    try {
      setActingChatId(chatIdToUpdate);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${chatIdToUpdate}/ai-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          pausedMinutes: 240,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar handoff.");
        return;
      }
      await loadData();
    } catch {
      setError("Falha ao atualizar handoff.");
    } finally {
      setActingChatId(null);
    }
  }

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const usersById = useMemo(() => {
    return new Map(
      users.map((user) => [
        String(user.userId || user.id || ""),
        {
          name: String(user.name || user.email || "Sem responsavel"),
          team: String(user.team || ""),
          availability: formatAvailability(user.availability),
        },
      ])
    );
  }, [users]);

  const latestHandoffByChat = useMemo(() => {
    const map = new Map<string, AiLog>();
    logs
      .filter((item) => item.decision === "handoff" && item.chatId)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .forEach((item) => {
        const key = String(item.chatId || "");
        if (!map.has(key)) map.set(key, item);
      });
    return map;
  }, [logs]);

  const handoffRows = useMemo<HandoffRow[]>(() => {
    return chats
      .map((chat) => {
        const latestLog = latestHandoffByChat.get(chat.id);
        const humanOwnerUserId = String(chat.aiState?.humanOwnerUserId || "");
        if (!latestLog && !humanOwnerUserId) return null;

        const ownerMeta = usersById.get(humanOwnerUserId);
        const aiEnabled = chat.aiState?.aiEnabled !== false;

        return {
          chatId: chat.id,
          contactName: String(chat.contactName || "Conversa"),
          contactPhone: String(chat.contactPhone || ""),
          channel: String(chat.channel || "whatsapp"),
          status: formatStatus(chat.status),
          priority: formatPriority(chat.priority),
          queueStatus: formatQueue(chat.queueStatus),
          unreadCount: Number(chat.unreadCount || 0),
          leadId: String(chat.leadId || ""),
          assignedUserId: String(chat.assignedUserId || ""),
          humanOwnerUserId,
          humanOwnerName: ownerMeta?.name || "Sem responsavel",
          humanOwnerTeam: ownerMeta?.team || "",
          humanOwnerAvailability: ownerMeta?.availability || "offline",
          handoffReason: String(latestLog?.reason || (humanOwnerUserId ? "assumido manualmente" : "handoff sem motivo")),
          handoffTime: toMillis(latestLog?.createdAt || chat.aiState?.updatedAt || chat.lastMessageTime),
          lastMessageTime: toMillis(chat.lastMessageTime),
          confidence: typeof latestLog?.confidence === "number" ? latestLog.confidence : null,
          aiEnabled,
          preview: String(chat.lastMessage || latestLog?.output || ""),
        };
      })
      .filter((item): item is HandoffRow => Boolean(item))
      .sort((a, b) => (b.handoffTime || b.lastMessageTime) - (a.handoffTime || a.lastMessageTime));
  }, [chats, latestHandoffByChat, usersById]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = q.trim().toLowerCase();

    return handoffRows.filter((row) => {
      if (chatId && row.chatId !== chatId) return false;
      if (owner !== "all" && row.humanOwnerUserId !== owner) return false;
      if (channel !== "all" && row.channel !== channel) return false;
      if (assignment === "unassigned" && row.humanOwnerUserId) return false;
      if (assignment === "assigned" && !row.humanOwnerUserId) return false;
      if (assignment === "offline_owner" && row.humanOwnerAvailability !== "offline") return false;
      if (risk === "low_confidence" && !(typeof row.confidence === "number" && row.confidence < 0.55)) return false;
      if (risk === "sla" && row.queueStatus !== "sla estourado") return false;
      if (risk === "paused_ai" && row.aiEnabled) return false;
      if (risk === "unread" && row.unreadCount <= 0) return false;
      if (
        normalizedQuery &&
        !`${row.contactName} ${row.contactPhone} ${row.handoffReason} ${row.humanOwnerName} ${row.humanOwnerTeam} ${row.channel}`
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [assignment, channel, chatId, handoffRows, owner, q, risk]);

  const ownerLoad = useMemo(() => {
    return Array.from(
      handoffRows.reduce((acc, row) => {
        const key = row.humanOwnerUserId || "unassigned";
        const current = acc.get(key) || {
          id: key,
          name: row.humanOwnerUserId ? row.humanOwnerName : "Sem responsavel",
          availability: row.humanOwnerUserId ? row.humanOwnerAvailability : "offline",
          total: 0,
          urgent: 0,
        };
        current.total += 1;
        if (row.queueStatus === "sla estourado" || row.priority === "alta") current.urgent += 1;
        acc.set(key, current);
        return acc;
      }, new Map<string, { id: string; name: string; availability: string; total: number; urgent: number }>())
    )
      .map(([, value]) => value)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [handoffRows]);

  const handoffReasons = useMemo(() => {
    return Array.from(
      handoffRows.reduce((acc, row) => {
        const key = row.handoffReason || "sem motivo";
        acc.set(key, (acc.get(key) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [handoffRows]);

  const stats = useMemo(() => {
    const noOwner = handoffRows.filter((row) => !row.humanOwnerUserId).length;
    const lowConfidence = handoffRows.filter((row) => typeof row.confidence === "number" && row.confidence < 0.55).length;
    const slaBreached = handoffRows.filter((row) => row.queueStatus === "sla estourado").length;
    const last24h = handoffRows.filter((row) => row.handoffTime >= Date.now() - 24 * 60 * 60 * 1000).length;
    const pausedAi = handoffRows.filter((row) => !row.aiEnabled).length;
    const unreadBacklog = handoffRows.filter((row) => row.unreadCount > 0).length;
    const offlineOwners = handoffRows.filter((row) => row.humanOwnerAvailability === "offline").length;
    return {
      total: handoffRows.length,
      noOwner,
      lowConfidence,
      slaBreached,
      last24h,
      pausedAi,
      unreadBacklog,
      offlineOwners,
    };
  }, [handoffRows]);

  const focusSignals = useMemo<FocusSignal[]>(() => {
    return [
      {
        id: "unassigned",
        title: "Handoffs sem responsavel",
        detail: "Escaladas que ainda nao foram assumidas por um humano.",
        badge: String(stats.noOwner),
        tone: stats.noOwner ? "danger" : "success",
        action: () => updateQuery("assignment", stats.noOwner ? "unassigned" : null),
      },
      {
        id: "sla",
        title: "Fila em risco de SLA",
        detail: "Conversas escaladas que ja ultrapassaram o tempo operacional esperado.",
        badge: String(stats.slaBreached),
        tone: stats.slaBreached ? "warning" : "success",
        action: () => updateQuery("risk", stats.slaBreached ? "sla" : null),
      },
      {
        id: "confidence",
        title: "Baixa confianca antes do handoff",
        detail: "Escaladas em que a IA demonstrou mais incerteza antes de chamar humano.",
        badge: String(stats.lowConfidence),
        tone: stats.lowConfidence ? "info" : "success",
        action: () => updateQuery("risk", stats.lowConfidence ? "low_confidence" : null),
      },
      {
        id: "today",
        title: "Volume das ultimas 24h",
        detail: "Handoffs recentes para acompanhar pico operacional e calibragem da IA.",
        badge: String(stats.last24h),
        tone: stats.last24h > 6 ? "warning" : "neutral",
        action: () => updateQuery("chatId", null),
      },
      {
        id: "paused_ai",
        title: "IA pausada nas escaladas",
        detail: "Conversas em handoff onde o autopilot segue pausado e exigem revisao do retorno.",
        badge: String(stats.pausedAi),
        tone: stats.pausedAi ? "info" : "success",
        action: () => updateQuery("risk", stats.pausedAi ? "paused_ai" : null),
      },
    ];
  }, [stats.last24h, stats.lowConfidence, stats.noOwner, stats.pausedAi, stats.slaBreached, updateQuery]);

  const ownerOptions = useMemo(() => {
    return ownerLoad
      .filter((item) => item.id !== "unassigned")
      .map((item) => ({ value: item.id, label: item.name }));
  }, [ownerLoad]);

  const channelOptions = useMemo(() => {
    return Array.from(new Set(handoffRows.map((row) => row.channel))).sort();
  }, [handoffRows]);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Falha ao carregar central de handoffs"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
          >
            Tentar novamente
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Central de handoffs"
            subtitle="Controle de escaladas da IA, donos humanos e gargalos operacionais no inbox."
            action={<StateBadge label={`${stats.total} ativos`} tone={stats.total ? "warning" : "success"} />}
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {focusSignals.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-left transition hover:bg-[var(--cliente-panel-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.detail}</p>
                  </div>
                  <StateBadge label={item.badge} tone={item.tone} />
                </div>
              </button>
            ))}
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <CardTitle title="Mesa de decisao" subtitle="Leitura rapida para operacao e calibragem do agente." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Handoffs ativos" value={String(stats.total)} icon={GitBranchPlus} trend="conversas com escalada" />
            <MetricCard label="Sem dono" value={String(stats.noOwner)} icon={UserRound} trend="precisam de takeover humano" />
            <MetricCard label="Baixa confianca" value={String(stats.lowConfidence)} icon={Brain} trend="pedem revisao do prompt/KB" />
            <MetricCard label="SLA estourado" value={String(stats.slaBreached)} icon={ShieldAlert} trend="exigem priorizacao" />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Modo operacional do handoff"
            subtitle="O takeover humano fica mais consistente quando seguimos o contexto do negocio e do CRM."
            action={<StateBadge label={businessProfile.label} tone="info" />}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Movimento comercial</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{businessProfile.commercialMotion}</p>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Ao assumir, preserve</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {businessProfile.ai.mandatoryQuestions.slice(0, 4).map((question) => (
                  <span key={question} className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                    {question}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Campos de CRM criticos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {businessProfile.crm.leadFields.slice(0, 6).map((field) => (
                  <span key={field} className="rounded-full border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-1 text-xs text-[var(--cliente-accent)]">
                    {field}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Escalar sem perder contexto</p>
              <div className="mt-2 space-y-2">
                {businessProfile.ai.escalationTopics.slice(0, 3).map((topic) => (
                  <div key={topic} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text-muted)]">
                    {topic}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <SectionHeader title="Playbook de takeover" subtitle="Cenas e ofertas que ajudam o humano a retomar a conversa sem parecer ruptura." />
          <div className="space-y-3">
            {playbookPreset.scripts.slice(0, 2).map((script) => (
              <div key={`${script.situation}-${script.goal}`} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{script.situation}</p>
                  <StateBadge label={script.goal} tone="info" />
                </div>
                <p className="mt-2 text-xs leading-6 text-[var(--cliente-card-text-muted)]">{script.script}</p>
              </div>
            ))}

            <div className="rounded-2xl border border-emerald-300/14 bg-emerald-500/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Oferta para preparar no takeover</p>
              <p className="mt-2 text-sm text-emerald-50">
                {playbookPreset.offers[0]
                  ? `${playbookPreset.offers[0].title} | ${playbookPreset.offers[0].targetProfile}`
                  : "Sem oferta sugerida para este perfil."}
              </p>
              {playbookPreset.offers[0] ? (
                <p className="mt-1 text-xs text-emerald-100/72">
                  Entrar com essa linha ajuda o humano a retomar a venda sem reiniciar o discovery.
                </p>
              ) : null}
            </div>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Fila de escaladas"
            subtitle="Converse com o inbox no contexto certo e distribua a carga com clareza."
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="xl:col-span-2 flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <Search className="h-4 w-4" />
              <input
                value={q}
                onChange={(event) => updateQuery("q", event.target.value)}
                placeholder="Buscar contato, motivo ou responsavel"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>

            <FilterSelect
              label="Responsavel"
              value={owner}
              options={[{ value: "all", label: "Todos" }, ...ownerOptions]}
              onChange={(value) => updateQuery("owner", value)}
            />
            <FilterSelect
              label="Canal"
              value={channel}
              options={[{ value: "all", label: "Todos" }, ...channelOptions.map((item) => ({ value: item, label: formatChannel(item) }))]}
              onChange={(value) => updateQuery("channel", value)}
            />
            <FilterSelect
              label="Recorte"
              value={assignment}
              options={[
                { value: "all", label: "Todos" },
                { value: "assigned", label: "Com responsavel" },
                { value: "unassigned", label: "Sem responsavel" },
                { value: "offline_owner", label: "Responsavel offline" },
              ]}
              onChange={(value) => updateQuery("assignment", value)}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <FilterPill active={risk === "all"} label="Todos" onClick={() => updateQuery("risk", null)} />
            <FilterPill active={risk === "low_confidence"} label="Baixa confianca" onClick={() => updateQuery("risk", "low_confidence")} />
            <FilterPill active={risk === "sla"} label="SLA estourado" onClick={() => updateQuery("risk", "sla")} />
            <FilterPill active={risk === "paused_ai"} label="IA pausada" onClick={() => updateQuery("risk", "paused_ai")} />
            <FilterPill active={risk === "unread"} label="Com backlog" onClick={() => updateQuery("risk", "unread")} />
            <FilterPill active={!chatId} label="Sem foco" onClick={() => updateQuery("chatId", null)} />
          </div>

          <div className="mt-4 space-y-3">
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <article
                  key={row.chatId}
                  className={`rounded-2xl border p-4 transition ${
                    chatId === row.chatId ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] hover:bg-[var(--cliente-panel-soft)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{row.contactName}</p>
                        <StateBadge label={formatChannel(row.channel)} tone="info" />
                        <StateBadge label={row.queueStatus} tone={row.queueStatus === "sla estourado" ? "danger" : "neutral"} />
                        <StateBadge label={row.priority} tone={row.priority === "alta" ? "warning" : "neutral"} />
                      </div>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                        {row.contactPhone || "Sem telefone"} {row.leadId ? `| lead ${row.leadId.slice(0, 8)}` : ""} | ultimo handoff {formatRelative(row.handoffTime)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/cliente/painel/inbox?chatId=${encodeURIComponent(row.chatId)}&leadId=${encodeURIComponent(row.leadId || "")}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                      >
                        <Inbox className="h-4 w-4" />
                        Abrir inbox
                      </Link>
                      <button
                        type="button"
                        onClick={() => updateQuery("chatId", chatId === row.chatId ? null : row.chatId)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)]"
                      >
                        Focar
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Motivo do handoff</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{row.handoffReason}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-[var(--cliente-card-text-soft)]">{row.preview || "Sem preview recente da conversa."}</p>
                    </div>

                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Owner humano</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">{row.humanOwnerName}</p>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                            {row.humanOwnerTeam
                              ? `${row.humanOwnerTeam}${row.assignedUserId && row.assignedUserId !== row.humanOwnerUserId ? " • fila atribuida para outro owner" : ""}`
                              : row.assignedUserId && row.assignedUserId !== row.humanOwnerUserId
                                ? "fila atribuida para outro owner"
                                : "owner principal da escalada"}
                          </p>
                        </div>
                        <StateBadge label={row.humanOwnerAvailability} tone={ownerTone(row.humanOwnerAvailability)} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StateBadge label={row.status} tone={row.status === "resolvido" ? "success" : "warning"} />
                        <StateBadge label={`IA ${row.aiEnabled ? "ativa" : "pausada"}`} tone={row.aiEnabled ? "info" : "warning"} />
                        <StateBadge label={`conf. ${confidenceLabel(row.confidence)}`} tone={confidenceTone(row.confidence)} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--cliente-card-text-soft)]">
                    <span>Ultima atividade {formatDateTime(row.lastMessageTime || row.handoffTime)}</span>
                    <span>{row.unreadCount ? `${row.unreadCount} nao lidas` : "sem backlog de leitura"}</span>
                  </div>

                  {canOperate ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleHandoffAction(row.chatId, "takeover")}
                        disabled={actingChatId === row.chatId}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/16 disabled:opacity-50"
                      >
                        {actingChatId === row.chatId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRound className="h-3.5 w-3.5" />}
                        Assumir agora
                      </button>
                      {!row.aiEnabled ? (
                        <button
                          type="button"
                          onClick={() => void handleHandoffAction(row.chatId, "resume")}
                          disabled={actingChatId === row.chatId}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/16 disabled:opacity-50"
                        >
                          {actingChatId === row.chatId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                          Devolver para IA
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                title="Nenhum handoff encontrado"
                description="Ajuste os filtros ou espere novas escaladas da IA para acompanhar a operacao humana."
              />
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <SectionHeader title="Motivos recorrentes" subtitle="Onde a IA mais pede ajuda humana." />
            <div className="space-y-3">
              {handoffReasons.length ? (
                handoffReasons.map((item) => (
                  <div key={item.reason} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-[var(--cliente-card-text)]">{item.reason}</p>
                      <StateBadge label={String(item.total)} tone="warning" />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem historico de handoff" description="Quando a IA escalar conversas, os motivos aparecem aqui." />
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <SectionHeader title="Carga por responsavel" subtitle="Quem esta absorvendo a maior parte das escaladas." />
            <div className="space-y-3">
              {ownerLoad.length ? (
                ownerLoad.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateQuery("owner", item.id === "unassigned" ? null : item.id)}
                    className="w-full rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-left transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                          {item.id === "unassigned" ? "precisa de distribuicao" : `${item.urgent} prioritarios em aberto`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StateBadge label={String(item.total)} tone="info" />
                        <StateBadge label={item.availability} tone={ownerTone(item.availability)} />
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState title="Sem owners mapeados" description="Atribua handoffs no inbox para acompanhar carga por responsavel." />
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <SectionHeader title="Risco operacional" subtitle="O que esta travando o fluxo humano agora." />
            <div className="space-y-3">
              <RiskRow label="Owners offline" value={String(stats.offlineOwners)} tone={stats.offlineOwners ? "warning" : "success"} onClick={() => updateQuery("assignment", stats.offlineOwners ? "offline_owner" : null)} />
              <RiskRow label="IA pausada" value={String(stats.pausedAi)} tone={stats.pausedAi ? "info" : "success"} onClick={() => updateQuery("risk", stats.pausedAi ? "paused_ai" : null)} />
              <RiskRow label="Backlog nao lido" value={String(stats.unreadBacklog)} tone={stats.unreadBacklog ? "warning" : "success"} onClick={() => updateQuery("risk", stats.unreadBacklog ? "unread" : null)} />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <SectionHeader title="Playbook rapido" subtitle="Atalhos de execucao para o time comercial." />
            <div className="space-y-3">
              <QuickLink
                href="/cliente/painel/inbox?queue=sla_breached"
                icon={AlertTriangle}
                title="Priorizar SLA"
                description="Abrir conversas em risco alto imediatamente."
              />
              <QuickLink
                href="/cliente/painel/ia?risk=low_confidence"
                icon={Bot}
                title="Revisar IA"
                description="Corrigir guardrails e conhecimento onde a confianca esta baixa."
              />
              <QuickLink
                href="/cliente/painel/configuracoes/usuarios"
                icon={UserRound}
                title="Ajustar owners"
                description="Refinar capacidade, disponibilidade e distribuicao do time."
              />
              <QuickLink
                href="/cliente/painel/logs?ai=handoff"
                icon={Brain}
                title="Auditar handoffs"
                description="Cruzar cada escalada com os logs da IA e corrigir gargalos de decisao."
              />
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs text-[var(--cliente-card-text-soft)]">
      <span className="block uppercase tracking-[0.16em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#111111] text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
        active
          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
          : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof AlertTriangle;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 transition hover:bg-[var(--cliente-panel-soft)]"
    >
      <span className="inline-flex rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-card-text)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="mt-1 block text-xs text-[var(--cliente-card-text-soft)]">{description}</span>
      </span>
    </Link>
  );
}

function RiskRow({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 text-left transition hover:bg-[var(--cliente-panel-soft)]"
    >
      <span className="text-sm text-[var(--cliente-card-text-muted)]">{label}</span>
      <StateBadge label={value} tone={tone} />
    </button>
  );
}
