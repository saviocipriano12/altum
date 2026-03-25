"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Building2, Loader2, MessageSquare, Shuffle, Users2, UsersRound } from "lucide-react";
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
    } catch {
      setError("Falha ao carregar configuracoes.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        description: "Preencha dados de marca, nicho e contato para handoff, widgets e operacao comercial.",
        badge: "perfil",
        tone: "warning",
      });
    }

    if (summary.activeUsers === 0) {
      items.push({
        id: "users",
        href: "/cliente/painel/configuracoes/usuarios",
        title: "Adicionar equipe ao tenant",
        description: "Sem usuarios ativos, o inbox e a distribuicao nao conseguem operar com ownership real.",
        badge: "equipe",
        tone: "danger",
      });
    } else if (summary.onlineUsers === 0) {
      items.push({
        id: "availability",
        href: "/cliente/painel/configuracoes/usuarios",
        title: "Ninguem esta online para atendimento",
        description: "Revise disponibilidade dos membros para ativar distribuicao e takeover com menos atrito.",
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
        title: "Revisar governanca da IA",
        description: "Defina handoff, guardrails e cobertura do agente para reduzir escaladas sem dono.",
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
        title: "Estruturar times da operacao",
        description: "Defina ownership por time para distribuir inbound com mais contexto e menos conflito.",
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
      description: `${summary.activeUsers} membro(s) com acesso ao tenant.`,
      icon: Users2,
      badge: `${summary.activeUsers} ativos`,
      tone: summary.activeUsers > 0 ? ("info" as const) : ("warning" as const),
    }]
      : []),
    ...(hasCapability("manage_settings")
      ? [{
      href: "/cliente/painel/configuracoes/times",
      title: "Times e ownership",
      description: `${summary.managedTeams} time(s) configurado(s) para SLA, filas e distribuicao.`,
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
      href: "/cliente/painel/ia",
      title: "Politicas da IA",
      description: summary.aiEnabled
        ? `${summary.guardrails} guardrail(s) e handoff ${summary.hasAiOwner ? "configurado" : "pendente"}.`
        : "IA pausada. Revise tom, guardrails e handoff.",
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
    <div className="space-y-4">
      <SectionHeader
        title="Configuracoes"
        subtitle="Governanca do tenant, conectores, usuarios e politicas operacionais em um unico lugar."
        action={<StateBadge label="Tenant configuravel" tone="info" />}
      />

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      {!loading ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <PanelCard className="p-5">
              <CardTitle title="Prontidao do tenant" subtitle="Checklist rapido para operar CRM, inbox, IA e automacoes." />
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Score de prontidao</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--cliente-card-text)]">{effectiveReadinessScore}%</p>
                  </div>
                  <StateBadge
                    label={
                      effectivePilotReady
                        ? "pronto para piloto"
                        : effectiveReadinessScore >= 80
                        ? "tenant pronto"
                        : effectiveReadinessScore >= 60
                          ? "quase pronto"
                          : "ajustar setup"
                    }
                    tone={
                      effectivePilotReady
                        ? "success"
                        : effectiveReadinessScore >= 80
                        ? "success"
                        : effectiveReadinessScore >= 60
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
                <ReadinessRow label="Perfil da empresa" value={summary.hasCompanyProfile ? "Pronto" : "Pendente"} tone={summary.hasCompanyProfile ? "success" : "warning"} />
                <ReadinessRow label="Modo do negocio" value={summary.hasBusinessMode ? "Definido" : "Pendente"} tone={summary.hasBusinessMode ? "info" : "warning"} />
                <ReadinessRow label="Usuarios ativos" value={String(summary.activeUsers)} tone={summary.activeUsers > 0 ? "info" : "warning"} />
                <ReadinessRow label="Canais ativos" value={String(summary.activeChannels)} tone={summary.activeChannels > 0 ? "success" : "warning"} />
                <ReadinessRow label="Formularios ativos" value={String(summary.activeForms)} tone={summary.activeForms > 0 ? "success" : "warning"} />
                <ReadinessRow label="IA" value={summary.aiEnabled ? "Ativa" : "Pausada"} tone={summary.aiEnabled ? "success" : "warning"} />
                <ReadinessRow label="Handoff" value={summary.hasAiOwner ? "Configurado" : "Pendente"} tone={summary.hasAiOwner ? "info" : "warning"} />
                <ReadinessRow label="Guardrails" value={String(summary.guardrails)} tone={summary.guardrails > 0 ? "info" : "warning"} />
                <ReadinessRow label="Usuarios online" value={String(summary.onlineUsers)} tone={summary.onlineUsers > 0 ? "success" : "warning"} />
                <ReadinessRow label="Times configurados" value={String(summary.managedTeams || summary.teamsConfigured)} tone={(summary.managedTeams || summary.teamsConfigured) > 0 ? "info" : "warning"} />
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Sinal de go-live</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                  {effectivePilotReady
                    ? "Este tenant ja atingiu o minimo seguro para entrar em piloto com cliente real."
                    : "Ainda faltam alguns pontos minimos para colocar o tenant em piloto com seguranca."}
                </p>
              </div>
            </PanelCard>

            <PanelCard className="p-5">
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
            <PanelCard className="p-5">
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

            <PanelCard className="p-5">
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

            <PanelCard className="p-5">
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

            <PanelCard className="p-5">
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
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {links.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl border p-4 transition ${
                    item.featured
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] hover:brightness-95"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] hover:bg-[var(--cliente-panel-soft)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`inline-flex rounded-lg border p-2 ${
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
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--cliente-card-text-muted)]">{label}</p>
        <StateBadge label={value} tone={tone} />
      </div>
    </div>
  );
}

function Insight({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
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
      className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
    >
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{detail}</p>
    </Link>
  );
}

