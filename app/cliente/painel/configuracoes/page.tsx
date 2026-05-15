"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  BookOpenText,
  Bot,
  Building2,
  Loader2,
  MessageSquare,
  Package,
  Plug,
  RefreshCw,
  Send,
  Shuffle,
  Users2,
  UsersRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type SettingsPayload = {
  settings?: {
    name?: string;
    niche?: string;
    businessProfileId?: string;
    phone?: string;
    website?: string;
    inboxRules?: {
      defaultResponseSlaMinutes?: number;
      mode?: string;
      businessHoursOnly?: boolean;
      defaultTeam?: string;
      teams?: Array<{ id?: string; name?: string }>;
    };
  };
  error?: string;
};

type UsersPayload = {
  items?: Array<{
    role?: string;
    status?: string;
    availability?: string;
    team?: string;
    allowedChannels?: string[];
    maxOpenChats?: number;
  }>;
  error?: string;
};

type ChannelsPayload = {
  items?: Array<{
    status?: string;
    type?: string;
    chatCount?: number;
    openChatCount?: number;
    lastActivityAt?: string | null;
  }>;
  error?: string;
};

type AiPayload = {
  ai?: {
    enabled?: boolean;
    responsiblePhone?: string;
    guardrails?: string[];
  };
  error?: string;
};

type CaptureFormsPayload = {
  forms?: Array<{ id?: string; status?: string }>;
  error?: string;
};

type ReadinessPayload = {
  summary?: {
    pilotReady?: boolean;
    readinessScore?: number;
    criticalBlockers?: number;
    knowledgeDocs?: number;
    knowledgeDocsMinimum?: number;
    aiMonthlyCostUsd?: number;
    aiMonthlyRuns?: number;
    aiMonthlyBudgetUsd?: number;
    aiMonthlyUsageCap?: number;
  };
  checklist?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    status: "ready" | "warning" | "pending" | "blocked";
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
    blocking: boolean;
    critical: boolean;
    weight: number;
    evidence: string;
    target: string;
  }>;
  activation?: {
    gateStatus?: "open" | "blocked";
    status?: "approved" | "ready_to_activate" | "blocked";
    title?: string;
    description?: string;
    readyForSale?: boolean;
    blockingItems?: string[];
    validation?: {
      status?: "approved" | "blocked" | "not_checked";
      checkedAt?: string | null;
      checkedByName?: string;
      approvedAt?: string | null;
      approvedByName?: string;
    };
  };
  blockers?: ActionItem[];
  modules?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    status: "ready" | "partial" | "pending";
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  insights?: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  nextBuildItems?: ActionItem[];
  error?: string;
};

type SettingsLink = {
  href: string;
  title: string;
  description: string;
  icon: typeof Building2;
  badge: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  featured?: boolean;
};

type ActionItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  badge: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

type PushSubscriptionPayload = {
  enabled?: boolean;
  publicKey?: string | null;
  hasOwnSubscription?: boolean;
  ownSubscriptionCount?: number;
  error?: string;
};

export default function ClienteConfiguracoesPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsPayload["settings"] | null>(null);
  const [users, setUsers] = useState<UsersPayload["items"]>([]);
  const [channels, setChannels] = useState<ChannelsPayload["items"]>([]);
  const [ai, setAi] = useState<AiPayload["ai"] | null>(null);
  const [forms, setForms] = useState<CaptureFormsPayload["forms"]>([]);
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [pushStatus, setPushStatus] = useState<PushSubscriptionPayload>({
    enabled: false,
    publicKey: null,
    hasOwnSubscription: false,
    ownSubscriptionCount: 0,
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  const loadPushStatus = useCallback(async () => {
    try {
      const res = await authedFetch("/api/client-portal/push/subscription");
      const payload = (await res.json()) as PushSubscriptionPayload;
      if (!res.ok) {
        setPushStatus({
          enabled: false,
          publicKey: null,
          hasOwnSubscription: false,
          ownSubscriptionCount: 0,
          error: payload.error || "Falha ao carregar push.",
        });
        return;
      }

      setPushStatus({
        enabled: payload.enabled === true,
        publicKey: typeof payload.publicKey === "string" ? payload.publicKey : null,
        hasOwnSubscription: payload.hasOwnSubscription === true,
        ownSubscriptionCount: Number(payload.ownSubscriptionCount || 0),
      });
    } catch {
      setPushStatus({
        enabled: false,
        publicKey: null,
        hasOwnSubscription: false,
        ownSubscriptionCount: 0,
        error: "Falha ao carregar push.",
      });
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [settingsRes, usersRes, channelsRes, aiRes, formsRes, readinessRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
        authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`),
        authedFetch(`/api/tenant/${tenant.tenantId}/capture/forms`),
        authedFetch(`/api/tenant/${tenant.tenantId}/readiness`),
      ]);

      const settingsPayload = (await settingsRes.json()) as SettingsPayload;
      const usersPayload = (await usersRes.json()) as UsersPayload;
      const channelsPayload = (await channelsRes.json()) as ChannelsPayload;
      const aiPayload = (await aiRes.json()) as AiPayload;
      const formsPayload = (await formsRes.json()) as CaptureFormsPayload;
      const readinessPayload = (await readinessRes.json()) as ReadinessPayload;

      if (!settingsRes.ok || !usersRes.ok || !channelsRes.ok || !aiRes.ok || !formsRes.ok || !readinessRes.ok) {
        setError(
          settingsPayload.error ||
            usersPayload.error ||
            channelsPayload.error ||
            aiPayload.error ||
            formsPayload.error ||
            readinessPayload.error ||
            "Falha ao carregar configuracoes."
        );
      }

      setSettings(settingsPayload.settings || null);
      setUsers(usersPayload.items || []);
      setChannels(channelsPayload.items || []);
      setAi(aiPayload.ai || null);
      setForms(formsPayload.forms || []);
      setReadiness(readinessPayload || null);
      await loadPushStatus();
    } catch {
      setError("Falha ao carregar configuracoes.");
    } finally {
      setLoading(false);
    }
  }, [loadPushStatus, tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  async function handleEnableBrowserNotifications() {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setPushBusy(true);
    setPushNotice(null);
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "granted") {
        setPushNotice("Permissao concedida. Aguarde alguns segundos para sincronizar a assinatura.");
      } else if (result === "denied") {
        setPushNotice("Permissao bloqueada no navegador. Reative manualmente nas configuracoes do site.");
      } else {
        setPushNotice("Permissao de notificacao mantida como padrao.");
      }
      await loadPushStatus();
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSendPushTest() {
    setPushBusy(true);
    setPushNotice(null);
    try {
      const res = await authedFetch("/api/client-portal/push/test", { method: "POST" });
      const payload = (await res.json()) as { error?: string; result?: { sent?: number } };
      if (!res.ok) {
        setPushNotice(payload.error || "Falha ao enviar push de teste.");
        return;
      }
      setPushNotice(
        (payload.result?.sent || 0) > 0
          ? "Push de teste enviado para este usuario/dispositivo."
          : "Sem subscription ativa para este usuario. Ative as notificacoes no navegador."
      );
      await loadPushStatus();
    } catch {
      setPushNotice("Falha ao enviar push de teste.");
    } finally {
      setPushBusy(false);
    }
  }

  const summary = useMemo(() => {
    const activeUsers = (users || []).filter((item) => item.status !== "blocked").length;
    const onlineUsers = (users || []).filter(
      (item) => item.status !== "blocked" && String(item.availability || "online") === "online"
    ).length;
    const teamsConfigured = Array.from(
      new Set(
        (users || [])
          .map((item) => String(item.team || "").trim())
          .filter(Boolean)
      )
    ).length;
    const managedTeams = Array.isArray(settings?.inboxRules?.teams) ? settings.inboxRules.teams.length : 0;
    const activeChannels = (channels || []).filter((item) => item.status === "active").length;
    const operationalChannels = (channels || []).filter((item) =>
      ["whatsapp", "instagram", "messenger"].includes(String(item.type || ""))
    ).length;
    const activeForms = (forms || []).filter((item) => item.status === "active").length;
    const activeBacklog = (channels || []).reduce((sum, item) => sum + Number(item.openChatCount || 0), 0);
    const companySignals = [
      Boolean(settings?.name),
      Boolean(settings?.niche),
      Boolean(settings?.phone),
      Boolean(settings?.website),
    ];
    const operationalSignals = [
      activeUsers > 0,
      activeChannels > 0,
      operationalChannels > 0,
      activeForms > 0,
      Boolean(settings?.inboxRules?.defaultResponseSlaMinutes),
      Boolean(settings?.inboxRules?.defaultTeam),
      Boolean(ai?.responsiblePhone),
      Array.isArray(ai?.guardrails) && ai.guardrails.length > 0,
    ];
    const pilotReady =
      Boolean(settings?.name && settings?.niche) &&
      Boolean(settings?.phone || settings?.website) &&
      activeUsers > 0 &&
      (operationalChannels > 0 || activeForms > 0) &&
      Boolean(settings?.inboxRules?.defaultResponseSlaMinutes) &&
      Boolean(settings?.inboxRules?.defaultTeam) &&
      ai?.enabled !== false &&
      Boolean(ai?.responsiblePhone) &&
      (Array.isArray(ai?.guardrails) ? ai.guardrails.length > 0 : false);
    const readinessScore = Math.round(
      ((companySignals.filter(Boolean).length + operationalSignals.filter(Boolean).length) /
        (companySignals.length + operationalSignals.length)) *
        100
    );

    return {
      activeUsers,
      onlineUsers,
      teamsConfigured,
      managedTeams,
      activeChannels,
      operationalChannels,
      activeForms,
      activeBacklog,
      hasCompanyProfile: Boolean(settings?.name && settings?.niche),
      hasCompanyContact: Boolean(settings?.phone || settings?.website),
      hasBusinessMode: Boolean(settings?.businessProfileId),
      hasAiOwner: Boolean(ai?.responsiblePhone),
      aiEnabled: ai?.enabled !== false,
      guardrails: Array.isArray(ai?.guardrails) ? ai?.guardrails.length : 0,
      hasSla: Boolean(settings?.inboxRules?.defaultResponseSlaMinutes),
      hasDefaultTeam: Boolean(settings?.inboxRules?.defaultTeam),
      businessHoursOnly: Boolean(settings?.inboxRules?.businessHoursOnly),
      pilotReady,
      readinessScore,
    };
  }, [
    ai?.enabled,
    ai?.guardrails,
    ai?.responsiblePhone,
    channels,
    forms,
    settings?.inboxRules?.businessHoursOnly,
    settings?.inboxRules?.defaultResponseSlaMinutes,
    settings?.inboxRules?.defaultTeam,
    settings?.inboxRules?.teams,
    settings?.businessProfileId,
    settings?.name,
    settings?.niche,
    settings?.phone,
    settings?.website,
    users,
  ]);

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    if (!summary.hasCompanyProfile || !summary.hasCompanyContact) {
      items.push({
        id: "company",
        href: "/cliente/painel/configuracoes/empresa",
        title: "Completar perfil da empresa",
        description: "Preencha nome, nicho e contato da empresa para a operacao ficar completa.",
        badge: "perfil",
        tone: "warning",
      });
    }

    if (summary.activeUsers === 0) {
      items.push({
        id: "users",
        href: "/cliente/painel/configuracoes/usuarios",
        title: "Adicionar equipe",
        description: "Sem usuarios ativos, a operacao nao consegue responder e distribuir conversas direito.",
        badge: "equipe",
        tone: "danger",
      });
    } else if (summary.onlineUsers === 0) {
      items.push({
        id: "availability",
        href: "/cliente/painel/configuracoes/usuarios",
        title: "Ninguem esta online para atendimento",
        description: "Revise disponibilidade da equipe para evitar conversas paradas.",
        badge: "escala",
        tone: "warning",
      });
    }

    if (summary.operationalChannels === 0 && summary.activeForms === 0) {
      items.push({
        id: "channels",
        href: "/cliente/painel/configuracoes/canais",
        title: "Conectar canal ou ativar captacao",
        description: "Ative ao menos um canal conversacional ou um formulario publico para iniciar o piloto com cliente.",
        badge: "canal",
        tone: "warning",
      });
    }

    if (!summary.hasAiOwner || summary.guardrails === 0 || !summary.aiEnabled) {
      items.push({
        id: "ai",
        href: "/cliente/painel/ia",
        title: "Revisar o Assistente Altum",
        description: "Ajuste responsavel, regras e cobertura da IA para reduzir pausas e escaladas.",
        badge: "ia",
        tone: !summary.aiEnabled ? "warning" : "info",
      });
    }

    if (!summary.hasSla || !summary.hasDefaultTeam) {
      items.push({
        id: "ops",
        href: "/cliente/painel/configuracoes/operacao",
        title: "Ajustar SLA e time padrao",
        description: "Feche regras operacionais para distribuicao consistente e resposta dentro da meta.",
        badge: "SLA",
        tone: "info",
      });
    }

    if (summary.managedTeams === 0) {
      items.push({
        id: "teams",
        href: "/cliente/painel/configuracoes/times",
        title: "Organizar times",
        description: "Defina os times da operacao para distribuir atendimento com mais clareza.",
        badge: "times",
        tone: "info",
      });
    }

    return items.slice(0, 5);
  }, [
    summary.activeUsers,
    summary.activeForms,
    summary.aiEnabled,
    summary.guardrails,
    summary.hasAiOwner,
    summary.hasCompanyContact,
    summary.hasCompanyProfile,
    summary.hasDefaultTeam,
    summary.hasSla,
    summary.managedTeams,
    summary.onlineUsers,
    summary.operationalChannels,
  ]);

  const effectivePilotReady = readiness?.summary?.pilotReady ?? summary.pilotReady;
  const effectiveReadinessScore = readiness?.summary?.readinessScore ?? summary.readinessScore;
  const checklist = readiness?.checklist || [];
  const criticalChecklist = checklist.filter((item) => item.critical);
  const checklistPreview = criticalChecklist.slice(0, 4);
  const validation = readiness?.activation?.validation;
  const validationText =
    validation?.status === "approved"
      ? `Validado em ${validation.approvedAt || validation.checkedAt || "data indisponivel"} por ${validation.approvedByName || validation.checkedByName || "usuario nao identificado"}.`
      : validation?.status === "blocked"
        ? `Ultimo bloqueio em ${validation.checkedAt || "data indisponivel"} por ${validation.checkedByName || "usuario nao identificado"}.`
        : "Ainda sem validacao definitiva registrada.";

  const links: SettingsLink[] = [
    {
      href: "/cliente/painel/configuracoes/empresa",
      title: "Dados da empresa",
      description: settings?.name
        ? `${settings.name}${settings.niche ? ` • ${settings.niche}` : ""}${settings.businessProfileId ? ` • ${settings.businessProfileId}` : ""}`
        : "Nome, nicho, modo do negocio, responsavel, timezone e horario operacional.",
      icon: Building2,
      badge: summary.hasCompanyProfile ? "perfil pronto" : "pendente",
      tone: summary.hasCompanyProfile ? ("success" as const) : ("warning" as const),
    },
    ...(hasCapability("manage_users")
      ? [{
      href: "/cliente/painel/configuracoes/usuarios",
      title: "Usuarios e permissoes",
      description: `${summary.activeUsers} membro(s) com acesso a esta conta.`,
      icon: Users2,
      badge: `${summary.activeUsers} ativos`,
      tone: summary.activeUsers > 0 ? ("info" as const) : ("warning" as const),
    }]
      : []),
    ...(hasCapability("manage_settings")
      ? [{
      href: "/cliente/painel/configuracoes/times",
      title: "Times e responsaveis",
      description: `${summary.managedTeams} time(s) configurado(s) para distribuir atendimento e vendas.`,
      icon: UsersRound,
      badge: `${summary.managedTeams} times`,
      tone: summary.managedTeams > 0 ? ("info" as const) : ("warning" as const),
    }]
      : []),
    {
      href: "/cliente/painel/configuracoes/canais",
      title: "Canais conectados",
      description: `${summary.activeChannels} conector(es) ativos. ${summary.operationalChannels} canal(is) de atendimento.`,
      icon: MessageSquare,
      badge: `${summary.activeChannels} ativos`,
      tone: summary.activeChannels > 0 ? ("success" as const) : ("warning" as const),
      featured: true,
    },
    {
      href: "/cliente/painel/configuracoes/integracoes",
      title: "Integrações",
      description: "Conectores comerciais para ecommerce, canais e ferramentas que alimentam a Altum.",
      icon: Plug,
      badge: "conectores",
      tone: "info" as const,
    },
    {
      href: "/cliente/painel/produtos-servicos",
      title: "Produtos & Serviços",
      description: "Ofertas, argumentos, duvidas e upsell que a Altum usa nas conversas.",
      icon: Package,
      badge: "oferta",
      tone: "info" as const,
    },
    {
      href: "/cliente/painel/conhecimento",
      title: "Base de conhecimento",
      description: "FAQ, politicas e documentos que alimentam as respostas do Assistente Altum.",
      icon: BookOpenText,
      badge: "conteudo",
      tone: "info" as const,
    },
    {
      href: "/cliente/painel/configuracoes/social",
      title: "Respostas automaticas",
      description: "Configure respostas para DM, comentario e novo seguidor sem complicar a operacao.",
      icon: Bot,
      badge: "social",
      tone: "info" as const,
    },
    {
      href: "/cliente/painel/ia",
      title: "Assistente Altum",
      description: summary.aiEnabled
        ? `${summary.guardrails} regra(s) ativas e ${summary.hasAiOwner ? "responsavel definido" : "responsavel pendente"}.`
        : "IA pausada. Revise comportamento e responsavel.",
      icon: Bot,
      badge: summary.aiEnabled ? "IA ativa" : "IA pausada",
      tone: summary.aiEnabled ? ("success" as const) : ("warning" as const),
    },
    {
      href: "/cliente/painel/configuracoes/operacao",
      title: "Operacao e SLA",
      description: `Modo ${settings?.inboxRules?.mode || "manual"} • SLA ${settings?.inboxRules?.defaultResponseSlaMinutes || 15} min.`,
      icon: Shuffle,
      badge: settings?.inboxRules?.businessHoursOnly ? "horario comercial" : "24/7",
      tone: "info" as const,
    },
   ];

  return (
    <div className="settings-refined client-daily-page space-y-6">
      <SectionHeader
        title="Configuracoes"
        subtitle="Ajuste empresa, equipe, canais e operacao. O avancado fica fora da rotina diaria."
        action={<StateBadge label="Ajustes do negocio" tone="info" />}
      />

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[26px] border border-rose-400/18 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 shadow-[0_18px_40px_-32px_rgba(190,24,93,0.4)] dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {!loading ? (
        <>
          <section className="hidden grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <PanelCard tone="spotlight" className="p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="inline-flex rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/84">
                    Estrutura da operacao
                  </p>
                  <h2 className="mt-4 text-[1.75rem] font-semibold tracking-[-0.045em] text-white md:text-[2.15rem]">
                    Deixe empresa, equipe, canais e implantacao prontos sem expor complexidade demais para o cliente comum.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
                    Esta tela existe para organizar a base do workspace. O trabalho diario continua em Conversas, Clientes & Oportunidades e Agenda.
                  </p>
                </div>
                <div className="grid min-w-[250px] gap-3 sm:grid-cols-2 xl:w-[320px]">
                  <div className="rounded-[22px] border border-white/14 bg-white/12 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/68">Go-live</p><p className="mt-2 text-base font-semibold text-white">{effectiveReadinessScore}%</p></div>
                  <div className="rounded-[22px] border border-white/14 bg-white/12 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/68">Usuarios ativos</p><p className="mt-2 text-base font-semibold text-white">{summary.activeUsers}</p></div>
                  <div className="rounded-[22px] border border-white/14 bg-white/12 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/68">Canais ativos</p><p className="mt-2 text-base font-semibold text-white">{summary.activeChannels}</p></div>
                  <div className="rounded-[22px] border border-white/14 bg-white/12 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/68">Forms ativos</p><p className="mt-2 text-base font-semibold text-white">{summary.activeForms}</p></div>
                </div>
              </div>
            </PanelCard>

            <PanelCard tone="brand" className="p-5">
              <CardTitle title="O que ajustar primeiro" subtitle="Ordem sugerida para nao travar implantacao nem atendimento." />
              <div className="mt-4 space-y-3">
                <div className="rounded-[22px] border border-[var(--cliente-border)] bg-white/80 px-4 py-3"><p className="text-sm font-semibold text-[var(--cliente-card-text)]">1. Empresa e equipe</p><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Defina perfil da conta, usuarios e ownership antes de abrir operacao.</p></div>
                <div className="rounded-[22px] border border-[var(--cliente-border)] bg-white/80 px-4 py-3"><p className="text-sm font-semibold text-[var(--cliente-card-text)]">2. Canais e SLA</p><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Conecte canais, ajuste tempo de resposta e distribua a fila corretamente.</p></div>
                <div className="rounded-[22px] border border-[var(--cliente-border)] bg-white/80 px-4 py-3"><p className="text-sm font-semibold text-[var(--cliente-card-text)]">3. Assistente e implantacao</p><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Revise IA e checklist de prontidao antes de liberar o tenant para uso mais intenso.</p></div>
              </div>
            </PanelCard>
          </section>

          <section className="hidden grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <PanelCard className="settings-hero-card p-5 md:p-6">
              <CardTitle title="Go-live definitivo" subtitle="Gate critico, score e evidencias para entender em 1 tela o que falta para vender e operar este tenant." />
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Score de go-live</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--cliente-card-text)]">{effectiveReadinessScore}%</p>
                  </div>
                  <StateBadge
                    label={
                      readiness?.activation?.status === "approved"
                        ? "go-live validado"
                        : effectivePilotReady
                          ? "pronto para liberar"
                          : `${readiness?.summary?.criticalBlockers || criticalChecklist.filter((item) => item.blocking).length} gate(s) bloqueando`
                    }
                    tone={
                      readiness?.activation?.status === "approved"
                        ? "success"
                        : effectivePilotReady
                          ? "info"
                          : "warning"
                    }
                  />
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--cliente-border)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--cliente-accent)] to-[var(--cliente-accent-strong)]"
                    style={{ width: `${Math.max(6, effectiveReadinessScore)}%` }}
                  />
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {checklistPreview.length > 0 ? (
                  checklistPreview.map((item) => (
                    <ReadinessRow key={item.id} label={item.title} value={item.badge} tone={item.tone} />
                  ))
                ) : (
                  <>
                    <ReadinessRow label="Perfil da empresa" value={summary.hasCompanyProfile ? "Pronto" : "Pendente"} tone={summary.hasCompanyProfile ? "success" : "warning"} />
                    <ReadinessRow label="Modo do negocio" value={summary.hasBusinessMode ? "Definido" : "Pendente"} tone={summary.hasBusinessMode ? "info" : "warning"} />
                    <ReadinessRow label="Usuarios ativos" value={String(summary.activeUsers)} tone={summary.activeUsers > 0 ? "info" : "warning"} />
                    <ReadinessRow label="Canais ativos" value={String(summary.activeChannels)} tone={summary.activeChannels > 0 ? "success" : "warning"} />
                  </>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Status de validacao</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{validationText}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <Link href="/cliente/painel/go-live" className="text-[var(--cliente-accent)] transition hover:brightness-95">
                    Abrir checklist definitivo
                  </Link>
                  <span className="text-[var(--cliente-card-text-soft)]">
                    IA no mes: US$ {Number(readiness?.summary?.aiMonthlyCostUsd || 0).toFixed(2)} · {Number(readiness?.summary?.aiMonthlyRuns || 0)} execucoes
                  </span>
                </div>
              </div>
            </PanelCard>

            <PanelCard className="settings-insights-card p-5 md:p-6">
              <CardTitle title="Leitura operacional" subtitle="O que falta ajustar para o tenant rodar com mais autonomia." />
              <div className="mt-4 space-y-3">
                {(readiness?.insights || []).length > 0 ? (
                  readiness?.insights?.map((item) => (
                    <Insight key={item.id} title={item.title} description={item.description} />
                  ))
                ) : (
                  <>
                    <Insight
                      title="Canais de atendimento"
                      description={
                        summary.operationalChannels > 0
                          ? `${summary.operationalChannels} canal(is) de atendimento ja podem alimentar o inbox.`
                          : "Conecte ao menos um canal conversacional para o cliente operar atendimento centralizado."
                      }
                    />
                    <Insight
                      title="Governanca da IA"
                      description={
                        summary.aiEnabled && summary.hasAiOwner
                          ? "A IA ja tem handoff configurado e pode operar com menos risco."
                          : "Revise o numero responsavel e os guardrails para evitar handoffs sem dono."
                      }
                    />
                    <Insight
                      title="Fluxo da operacao"
                      description={`Distribuicao atual em modo ${settings?.inboxRules?.mode || "manual"} com SLA de ${settings?.inboxRules?.defaultResponseSlaMinutes || 15} minutos.`}
                    />
                    <Insight
                      title="Carga atual dos canais"
                      description={
                        summary.activeBacklog > 0
                          ? `${summary.activeBacklog} conversa(s) abertas estao conectadas aos canais do tenant neste momento.`
                          : "Ainda nao ha backlog ativo nos canais conectados."
                      }
                    />
                  </>
                )}
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <PanelCard className="p-5 md:p-6 xl:col-span-2">
              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div>
                  <CardTitle title="Ajustes recomendados" subtitle="Comece pelo que mais destrava a operacao comercial." />
                  <div className="mt-4 space-y-3">
                    {actionItems.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/8 px-4 py-3">
                        <p className="text-sm font-semibold text-emerald-700">Base principal pronta</p>
                        <p className="mt-1 text-sm text-emerald-700/80">
                          Empresa, canais, equipe e operacao ja estao configurados para o uso diario.
                        </p>
                      </div>
                    ) : (
                      actionItems.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                              <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                            </div>
                            <StateBadge label={item.badge} tone={item.tone} />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <CardTitle title="Atalhos de operacao" subtitle="Entradas rapidas para revisar a conta sem misturar com a rotina." />
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Link
                      href="/cliente/painel/inbox"
                      className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Revisar conversas</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                        {summary.activeBacklog} conversa(s) abertas nos canais conectados.
                      </p>
                    </Link>
                    <Link
                      href="/cliente/painel/metricas"
                      className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Ver relatorios</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Acompanhe fila, SLA e volume da operacao.</p>
                    </Link>
                    <Link
                      href="/cliente/painel/go-live"
                      className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Implantacao</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Checklist e status da conta em segunda camada.</p>
                    </Link>
                    <Link
                      href="/cliente/painel/ia"
                      className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Assistente Altum</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Revise controles da IA, escaladas e automacoes quando necessario.</p>
                    </Link>
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard className="settings-map-card hidden p-5 md:p-6">
              <CardTitle title="Mapa de prontidao" subtitle="Leitura objetiva dos modulos que sustentam o piloto." />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(readiness?.modules || []).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                      </div>
                      <StateBadge label={item.badge} tone={item.tone} />
                    </div>
                  </Link>
                ))}
              </div>
            </PanelCard>

            <PanelCard className="settings-checklist-card hidden p-5 md:p-6">
              <CardTitle title="Checklist acionavel" subtitle="Pendencias mais importantes para fechar o setup do tenant." />
              <div className="mt-4 space-y-3">
                {(readiness?.blockers || actionItems).length === 0 ? (
                  <Insight
                    title="Tenant sem pendencias criticas"
                    description="A base principal de empresa, operacao, IA e conectores ja esta pronta para uso continuo."
                  />
                ) : (
                  (readiness?.blockers || actionItems).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                        </div>
                        <StateBadge label={item.badge} tone={item.tone} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard className="settings-roadmap-card hidden p-5 md:p-6">
              <CardTitle title="Proxima fase do produto" subtitle="Capacidades que ainda nao existem de verdade e entram na proxima construcao." />
              <div className="mt-4 space-y-3">
                {(readiness?.nextBuildItems || []).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.description}</p>
                      </div>
                      <StateBadge label={item.badge} tone={item.tone} />
                    </div>
                  </Link>
                ))}
              </div>
            </PanelCard>

            <PanelCard className="settings-shortcuts-shell hidden p-5 md:p-6">
              <CardTitle title="Atalhos operacionais" subtitle="Entradas rapidas para revisar setup e operacao viva do tenant." />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ShortcutCard
                  href="/cliente/painel/inbox"
                  title="Revisar inbox"
                  detail={`${summary.activeBacklog} conversa(s) abertas nos canais conectados`}
                />
                <ShortcutCard
                  href="/cliente/painel/automacoes"
                  title="Revisar automacoes"
                  detail="ajustar playbooks e filas do tenant"
                />
                <ShortcutCard
                  href="/cliente/painel/ia"
                  title="Governanca da IA"
                  detail={`${summary.guardrails} guardrail(s) e ${summary.hasAiOwner ? "handoff configurado" : "handoff pendente"}`}
                />
                <ShortcutCard
                  href="/cliente/painel/metricas"
                  title="Ver metricas"
                  detail="validar fila, SLA e produtividade"
                />
                <ShortcutCard
                  href="/cliente/painel/captacao"
                  title="Publicar captacao"
                  detail={`${summary.activeForms} formulario(s) ativo(s) para iniciar o piloto`}
                />
              </div>
            </PanelCard>

            <PanelCard className="settings-notifications-card p-5 md:p-6">
              <CardTitle title="Notificacoes criticas" subtitle="Controle de push web para alertas operacionais do tenant" />
              <div className="mt-4 space-y-3">
                <ReadinessRow
                  label="Push no servidor"
                  value={pushStatus.enabled ? "Configurado" : "Nao configurado"}
                  tone={pushStatus.enabled ? "success" : "warning"}
                />
                <ReadinessRow
                  label="Permissao do navegador"
                  value={
                    notificationPermission === "granted"
                      ? "Concedida"
                      : notificationPermission === "denied"
                        ? "Bloqueada"
                        : notificationPermission === "default"
                          ? "Nao definida"
                          : "Sem suporte"
                  }
                  tone={
                    notificationPermission === "granted"
                      ? "success"
                      : notificationPermission === "denied"
                        ? "danger"
                        : "warning"
                  }
                />
                <ReadinessRow
                  label="Subscription deste usuario"
                  value={pushStatus.hasOwnSubscription ? `${pushStatus.ownSubscriptionCount || 1} ativa(s)` : "Nenhuma"}
                  tone={pushStatus.hasOwnSubscription ? "info" : "warning"}
                />
              </div>

              {pushNotice ? (
                <div className="mt-4 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs text-[var(--cliente-card-text-muted)]">
                  {pushNotice}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void handleEnableBrowserNotifications()}
                  disabled={pushBusy || notificationPermission === "unsupported"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
                >
                  {notificationPermission === "granted" ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  Permissao
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendPushTest()}
                  disabled={pushBusy || notificationPermission !== "granted" || !pushStatus.enabled}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
                >
                  {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Testar push
                </button>
                <button
                  type="button"
                  onClick={() => void loadPushStatus()}
                  disabled={pushBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </button>
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {links.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`settings-link-card rounded-2xl border p-4 transition ${
                    item.featured
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] hover:brightness-95"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] hover:bg-[var(--cliente-panel-soft)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`settings-link-icon inline-flex rounded-lg border p-2 ${
                        item.featured
                          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent)] text-white"
                          : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <StateBadge label={item.badge} tone={item.tone} />
                  </div>
                  <h3 className={`mt-3 text-base font-semibold ${item.featured ? "text-[var(--cliente-accent)]" : "text-[var(--cliente-card-text)]"}`}>
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                    {item.description}
                  </p>
                </Link>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}

function ReadinessRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="settings-readiness-row rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--cliente-card-text-muted)]">{label}</p>
        <StateBadge label={value} tone={tone} />
      </div>
    </div>
  );
}

function Insight({ title, description }: { title: string; description: string }) {
  return (
    <div className="settings-insight-card rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{description}</p>
    </div>
  );
}

function ShortcutCard({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="settings-shortcut-card rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
    >
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{detail}</p>
    </Link>
  );
}

