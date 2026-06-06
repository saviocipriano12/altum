"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Save,
  Settings2,
  ShieldAlert,
  WandSparkles,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type SocialAutomationConfig = {
  tenantId: string;
  enabled: boolean;
  dmAutoReply: boolean;
  commentAutoReply: boolean;
  newFollowerMessageEnabled: boolean;
  newFollowerMessageTemplate: string;
  dmPrompt: string;
  commentPrompt: string;
  optOutKeywords: string[];
  commentIntentPricingKeywords: string[];
  commentIntentPurchaseKeywords: string[];
  commentIntentSchedulingKeywords: string[];
  activeHours: {
    timezone: string;
    start: string;
    end: string;
    days: number[];
  };
};

type SocialAutomationLog = {
  id: string;
  status?: string;
  eventType?: string;
  channelType?: string;
  actorName?: string;
  text?: string;
  reason?: string;
  responseText?: string;
  updatedAt?: unknown;
  retriedResult?: string;
  retriedCompletedAt?: unknown;
};

type SocialChannel = {
  id: string;
  type: string;
  status: string;
  displayName?: string;
  externalAccountId?: string;
  pageId?: string;
  updatedAt?: unknown;
};

type SocialAutomationPayload = {
  config?: SocialAutomationConfig;
  summary?: {
    activeChannels?: number;
    sent?: number;
    failed?: number;
    ignored?: number;
    dmAutoReply?: boolean;
    commentAutoReply?: boolean;
    newFollowerMessageEnabled?: boolean;
    enabled?: boolean;
  };
  channels?: SocialChannel[];
  logs?: SocialAutomationLog[];
  error?: string;
};

function toDateTime(value: unknown) {
  if (!value) return "Sem registro";
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Sem registro"
      : date.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "Sem registro";
}

function getToneFromStatus(status?: string) {
  if (status === "sent" || status === "active") return "success" as const;
  if (status === "failed" || status === "error") return "danger" as const;
  if (status === "retrying") return "warning" as const;
  if (String(status || "").startsWith("ignored_") || status === "inactive") return "warning" as const;
  return "neutral" as const;
}

function summarizeStatus(status?: string) {
  if (status === "sent") return "Resposta enviada";
  if (status === "failed") return "Falha";
  if (status === "retrying") return "Reprocessando";
  if (status === "processed") return "Processado";
  if (status === "ignored_opt_out") return "Opt-out";
  if (status === "ignored_inactive_hours") return "Fora do horario";
  if (status === "ignored_disabled") return "Desligado";
  if (status === "ignored_loop") return "Anti-loop";
  if (status === "ignored_duplicate") return "Duplicado";
  return status || "Pendente";
}

function EventCard({
  title,
  description,
  available,
  active,
}: {
  title: string;
  description: string;
  available: boolean;
  active: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
        <div className="flex items-center gap-2">
          <StateBadge label={available ? "disponivel" : "limitado"} tone={available ? "success" : "warning"} />
          <StateBadge label={active ? "ativo" : "desligado"} tone={active ? "info" : "neutral"} />
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{description}</p>
    </div>
  );
}

export default function InstagramAutomationOpsPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_automations") || hasCapability("manage_channels");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<SocialAutomationConfig | null>(null);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [logs, setLogs] = useState<SocialAutomationLog[]>([]);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

  const loadPanel = useCallback(async () => {
    const tenantId = tenant?.tenantId;
    if (!tenantId) return;
    const res = await authedFetch(`/api/tenant/${tenantId}/social-automations`);
    const payload = (await res.json()) as SocialAutomationPayload;
    if (!res.ok || !payload.config) {
      throw new Error(payload.error || "Falha ao carregar painel do Instagram.");
    }
    setConfig(payload.config);
    setChannels(payload.channels || []);
    setLogs(payload.logs || []);
  }, [tenant?.tenantId]);

  useEffect(() => {
    if (!tenant?.tenantId) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadPanel();
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Falha ao carregar painel do Instagram.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId, loadPanel]);

  const instagramChannel = useMemo(
    () => channels.find((channel) => channel.type === "instagram") || null,
    [channels]
  );

  const instagramLogs = useMemo(
    () => logs.filter((log) => log.channelType === "instagram"),
    [logs]
  );

  const stats = useMemo(() => {
    const sent = instagramLogs.filter((log) => log.status === "sent").length;
    const failed = instagramLogs.filter((log) => log.status === "failed").length;
    const ignored = instagramLogs.filter((log) => String(log.status || "").startsWith("ignored_")).length;
    return {
      sent,
      failed,
      ignored,
      total: instagramLogs.length,
    };
  }, [instagramLogs]);

  const lastEvent = instagramLogs[0];

  async function saveQuickSettings() {
    if (!tenant?.tenantId || !config || !canManage) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = (await res.json()) as { config?: SocialAutomationConfig; error?: string };
      if (!res.ok || !payload.config) {
        setError(payload.error || "Falha ao salvar configuracoes do Instagram.");
        return;
      }
      setConfig(payload.config);
      setNotice("Configuracoes do Instagram atualizadas.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar configuracoes do Instagram.");
    } finally {
      setSaving(false);
    }
  }

  async function retryLog(logId: string) {
    if (!tenant?.tenantId || !canManage || !logId || retryingLogId) return;
    setRetryingLogId(logId);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      const payload = (await res.json()) as { error?: string; result?: { status?: string } };
      if (!res.ok) {
        setError(payload.error || "Falha ao reprocessar evento do Instagram.");
        return;
      }
      await loadPanel();
      setNotice(`Evento reprocessado (${payload.result?.status || "ok"}).`);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Falha ao reprocessar evento do Instagram.");
    } finally {
      setRetryingLogId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        {error || "Nao foi possivel carregar o painel Instagram."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Automacao do Instagram"
        subtitle="Transforme DMs e comentarios em conversas, oportunidades e proximos passos comerciais."
        action={
          <StateBadge
            label={config.enabled ? "respostas ativas" : "respostas pausadas"}
            tone={config.enabled ? "success" : "warning"}
          />
        }
      />

      <section className="overflow-hidden rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)]">
        <div className="grid gap-0 md:grid-cols-[1.2fr_0.8fr]">
          <div className="p-5 md:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#feda75,#d62976_55%,#4f5bd5)] text-lg font-black text-white">IG</span>
              <div>
                <p className="text-lg font-extrabold text-[var(--cliente-card-text)]">{instagramChannel?.displayName || "Instagram Business"}</p>
                <p className="text-sm text-[var(--cliente-card-text-soft)]">{instagramChannel?.status === "active" ? "Canal pronto para operar" : "Conexao pendente"}</p>
              </div>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
              A Altum recebe o contato, responde dentro das regras da Meta e leva a conversa para o mesmo atendimento usado pelo time comercial.
            </p>
          </div>
          <div className="grid grid-cols-3 border-t border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] md:border-l md:border-t-0">
            <HeroStat label="Interacoes" value={stats.total} />
            <HeroStat label="Enviadas" value={stats.sent} success />
            <HeroStat label="Falhas" value={stats.failed} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PanelCard className="p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Canal Instagram</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-[var(--cliente-card-text)]">{instagramChannel?.displayName || "Nao conectado"}</p>
            <StateBadge
              label={instagramChannel?.status === "active" ? "ativo" : instagramChannel?.status || "pendente"}
              tone={instagramChannel?.status === "active" ? "success" : "warning"}
            />
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Eventos Instagram</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--cliente-card-text)]">{stats.total}</p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">interacoes recentes</p>
        </PanelCard>

        <PanelCard className="p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Respostas enviadas</p>
          <p className="mt-3 text-2xl font-semibold text-emerald-300">{stats.sent}</p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">falhas: {stats.failed} | ignorados: {stats.ignored}</p>
        </PanelCard>

        <PanelCard className="p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Ultimo evento</p>
          <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">
            {lastEvent?.eventType ? lastEvent.eventType.replaceAll("_", " ") : "Sem eventos"}
          </p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{toDateTime(lastEvent?.updatedAt)}</p>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle title="Acoes rapidas Instagram" subtitle="Ligue ou pause os principais fluxos sociais sem sair da operacao." />
            <StateBadge label={canManage ? "editavel" : "somente leitura"} tone={canManage ? "info" : "neutral"} />
          </div>

          <div className="mt-4 space-y-3">
            <QuickToggle
              title="Automacao social geral"
              description="Liga ou desliga respostas automaticas nas redes sociais conectadas."
              enabled={config.enabled}
              onToggle={() => setConfig((current) => (current ? { ...current, enabled: !current.enabled } : current))}
              disabled={!canManage}
            />
            <QuickToggle
              title="Responder DM"
              description="Responde mensagens diretas do Instagram com contexto comercial."
              enabled={config.dmAutoReply}
              onToggle={() => setConfig((current) => (current ? { ...current, dmAutoReply: !current.dmAutoReply } : current))}
              disabled={!canManage}
            />
            <QuickToggle
              title="Responder comentario"
              description="Responde comentarios novos e pode puxar a pessoa para a conversa."
              enabled={config.commentAutoReply}
              onToggle={() =>
                setConfig((current) => (current ? { ...current, commentAutoReply: !current.commentAutoReply } : current))
              }
              disabled={!canManage}
            />
            <QuickToggle
              title="Mensagem para novo seguidor"
              description="A Meta nao disponibiliza um evento publico confiavel para iniciar esta mensagem."
              enabled={false}
              onToggle={() => undefined}
              disabled
            />
          </div>

          {instagramChannel?.status !== "active" ? (
            <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Canal Instagram ainda nao esta ativo. Conecte o canal para liberar respostas em DM e comentarios.
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveQuickSettings()}
              disabled={saving || !canManage}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar ajustes
            </button>
            <Link
              href="/cliente/painel/configuracoes/social"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <Settings2 className="h-4 w-4" />
              Ajustes completos
            </Link>
            <Link
              href="/cliente/painel/inbox?channel=instagram"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <MessageCircleMore className="h-4 w-4" />
              Abrir conversas do Instagram
            </Link>
          </div>

          {error ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              {notice}
            </div>
          ) : null}
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="O que o Instagram permite" subtitle="Fluxos disponiveis e limites atuais da plataforma Meta." />
          <div className="mt-4 space-y-3">
            <EventCard
              title="DM recebida"
              description="Disponivel: a DM entra em Conversas, pode receber IA e virar oportunidade."
              available
              active={config.enabled && config.dmAutoReply}
            />
            <EventCard
              title="Comentario em post/reel"
              description="Disponivel: comentario novo pode receber resposta publica automatica."
              available
              active={config.enabled && config.commentAutoReply}
            />
            <EventCard
              title="Novo seguidor"
              description="Indisponivel pela API publica da Meta. Use comentario com palavra-chave ou uma DM iniciada pela pessoa."
              available={false}
              active={false}
            />
            <EventCard
              title="Usuario salvou post/reel"
              description="A Meta nao libera este evento publicamente. Use comentario ou palavra-chave na DM como alternativa."
              available={false}
              active={false}
            />
          </div>
        </PanelCard>
      </section>

      <section>
        <PanelCard className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cliente-border)] p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <WandSparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-extrabold text-[var(--cliente-card-text)]">Construtor de automacoes</p>
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Defina o que ativa cada fluxo e como a Altum deve conduzir a conversa.</p>
              </div>
            </div>
            <StateBadge label="3 fluxos comerciais" tone="ai" />
          </div>

          <div className="grid divide-y divide-[var(--cliente-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <AutomationRule
              title="Preco e orcamento"
              description="Identifica pessoas perguntando valor e cria contexto comercial."
              keywords={config.commentIntentPricingKeywords}
              onChange={(keywords) => setConfig((current) => current ? { ...current, commentIntentPricingKeywords: keywords } : current)}
              disabled={!canManage}
            />
            <AutomationRule
              title="Interesse de compra"
              description="Detecta quem quer contratar, comprar ou receber contato."
              keywords={config.commentIntentPurchaseKeywords}
              onChange={(keywords) => setConfig((current) => current ? { ...current, commentIntentPurchaseKeywords: keywords } : current)}
              disabled={!canManage}
            />
            <AutomationRule
              title="Agendamento"
              description="Reconhece pedidos de horario, consulta ou reuniao."
              keywords={config.commentIntentSchedulingKeywords}
              onChange={(keywords) => setConfig((current) => current ? { ...current, commentIntentSchedulingKeywords: keywords } : current)}
              disabled={!canManage}
            />
          </div>

          <div className="grid gap-5 border-t border-[var(--cliente-border)] p-5 lg:grid-cols-2">
            <label>
              <span className="text-sm font-bold text-[var(--cliente-card-text)]">Como responder DMs</span>
              <textarea
                value={config.dmPrompt}
                onChange={(event) => setConfig((current) => current ? { ...current, dmPrompt: event.target.value } : current)}
                disabled={!canManage}
                className="client-input mt-2 min-h-28 w-full resize-y"
              />
            </label>
            <label>
              <span className="text-sm font-bold text-[var(--cliente-card-text)]">Como responder comentarios</span>
              <textarea
                value={config.commentPrompt}
                onChange={(event) => setConfig((current) => current ? { ...current, commentPrompt: event.target.value } : current)}
                disabled={!canManage}
                className="client-input mt-2 min-h-28 w-full resize-y"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-t border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--cliente-card-text)]">
              <Clock3 className="h-4 w-4 text-[var(--cliente-primary)]" /> Horario ativo
            </div>
            <label className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">
              Inicio
              <input
                type="time"
                value={config.activeHours.start}
                onChange={(event) => setConfig((current) => current ? { ...current, activeHours: { ...current.activeHours, start: event.target.value } } : current)}
                className="client-input ml-2"
                disabled={!canManage}
              />
            </label>
            <label className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">
              Fim
              <input
                type="time"
                value={config.activeHours.end}
                onChange={(event) => setConfig((current) => current ? { ...current, activeHours: { ...current.activeHours, end: event.target.value } } : current)}
                className="client-input ml-2"
                disabled={!canManage}
              />
            </label>
            <button
              type="button"
              onClick={() => void saveQuickSettings()}
              disabled={saving || !canManage}
              className="ml-auto inline-flex items-center gap-2 rounded-[14px] bg-[var(--cliente-ai)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar construtor
            </button>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <CardTitle title="Historico do Instagram" subtitle="Ultimas interacoes processadas no canal Instagram." />
          <div className="mt-4 space-y-3">
            {instagramLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                Ainda nao ha interacoes de Instagram para exibir.
              </div>
            ) : (
              instagramLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">
                        {log.actorName || "Perfil"} | {log.eventType || "evento"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{toDateTime(log.updatedAt)}</p>
                    </div>
                    <StateBadge label={summarizeStatus(log.status)} tone={getToneFromStatus(log.status)} />
                  </div>
                  {log.text ? <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">{log.text}</p> : null}
                  {log.responseText ? (
                    <div className="mt-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 text-sm text-[var(--cliente-card-text)]">
                      {log.responseText}
                    </div>
                  ) : null}
                  {log.reason ? <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Motivo: {log.reason}</p> : null}
                  {log.status === "failed" && canManage ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => void retryLog(log.id)}
                        disabled={retryingLogId === log.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-60"
                      >
                        {retryingLogId === log.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Reprocessar falha
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Playbook de ativacao" subtitle="Sequencia recomendada para colocar Instagram em operacao total." />
          <div className="mt-4 space-y-3 text-sm text-[var(--cliente-card-text-muted)]">
            <PlaybookStep
              done={instagramChannel?.status === "active"}
              title="1. Conectar Instagram Business"
              detail="Conectar canal em Configuracoes > Canais e validar status ativo."
            />
            <PlaybookStep
              done={Boolean(config.enabled && config.dmAutoReply)}
              title="2. Ativar DM automatica"
              detail="Ligar DM + definir prompt base para conversa comercial."
            />
            <PlaybookStep
              done={Boolean(config.enabled && config.commentAutoReply)}
              title="3. Ativar resposta de comentario"
              detail="Responder comentario com CTA para DM sem parecer robo."
            />
            <PlaybookStep
              done={Boolean(config.enabled && config.commentAutoReply)}
              title="4. Levar comentario para a DM"
              detail="Use palavra-chave no post e continue a conversa quando a pessoa abrir o direct."
            />
            <PlaybookStep
              done={false}
              title="5. Gatilhos avancados de engajamento"
              detail="Para 'salvou post' usar alternativa com comentario palavra-chave + DM automatica."
            />
          </div>
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Nem todo evento de engajamento do Instagram fica disponivel para automacao. O fluxo robusto e receber
                DM, responder comentario e usar palavra-chave para a pessoa iniciar a conversa.
              </p>
            </div>
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

function QuickToggle({
  title,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        enabled
          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
          : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{description}</p>
        </div>
        <StateBadge label={enabled ? "ativo" : "desligado"} tone={enabled ? "success" : "neutral"} />
      </div>
    </button>
  );
}

function PlaybookStep({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
        <StateBadge label={done ? "ok" : "pendente"} tone={done ? "success" : "warning"} />
      </div>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{detail}</p>
    </div>
  );
}

function HeroStat({ label, value, success = false }: { label: string; value: number; success?: boolean }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center border-r border-[var(--cliente-border)] p-3 text-center last:border-r-0">
      <p className={`text-2xl font-extrabold ${success ? "text-[var(--cliente-success)]" : "text-[var(--cliente-card-text)]"}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-[var(--cliente-card-text-soft)]">{label}</p>
    </div>
  );
}

function AutomationRule({
  title,
  description,
  keywords,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  keywords: string[];
  onChange: (keywords: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-[var(--cliente-card-text)]">{title}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{description}</p>
        </div>
        <StateBadge label="ativo" tone="success" />
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-bold text-[var(--cliente-card-text-muted)]">Palavras-chave</span>
        <textarea
          value={keywords.join(", ")}
          onChange={(event) =>
            onChange(Array.from(new Set(event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))).slice(0, 30))
          }
          disabled={disabled}
          className="client-input mt-2 min-h-24 w-full resize-y text-sm"
        />
      </label>
    </div>
  );
}
