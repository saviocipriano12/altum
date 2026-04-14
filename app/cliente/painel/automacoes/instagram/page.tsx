"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Save,
  Settings2,
  ShieldAlert,
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
          <StateBadge label={available ? "api ok" : "nao suportado"} tone={available ? "success" : "warning"} />
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
      } catch {
        if (mounted) setError("Falha ao carregar painel do Instagram.");
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
    } catch {
      setError("Falha ao salvar configuracoes do Instagram.");
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
    } catch {
      setError("Falha ao reprocessar evento do Instagram.");
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
        title="Instagram Ops"
        subtitle="Painel operacional para automacoes de DM, comentario e novo seguidor com visao de status em tempo real."
        action={
          <StateBadge
            label={config.enabled ? "instagram automation ativa" : "instagram automation pausada"}
            tone={config.enabled ? "success" : "warning"}
          />
        }
      />

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
          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">processados nos logs recentes</p>
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
            <CardTitle title="Acoes rapidas Instagram" subtitle="Liga/desliga os 3 fluxos principais sem sair da operacao." />
            <StateBadge label={canManage ? "editavel" : "somente leitura"} tone={canManage ? "info" : "neutral"} />
          </div>

          <div className="mt-4 space-y-3">
            <QuickToggle
              title="Responder DM"
              description="Resposta automatica em mensagens de Instagram DM."
              enabled={config.dmAutoReply}
              onToggle={() => setConfig((current) => (current ? { ...current, dmAutoReply: !current.dmAutoReply } : current))}
              disabled={!canManage}
            />
            <QuickToggle
              title="Responder comentario"
              description="Resposta automatica para comentarios novos em posts/reels."
              enabled={config.commentAutoReply}
              onToggle={() =>
                setConfig((current) => (current ? { ...current, commentAutoReply: !current.commentAutoReply } : current))
              }
              disabled={!canManage}
            />
            <QuickToggle
              title="Mensagem para novo seguidor"
              description="Mensagem de boas-vindas para novos seguidores (quando a API permitir envio)."
              enabled={config.newFollowerMessageEnabled}
              onToggle={() =>
                setConfig((current) =>
                  current ? { ...current, newFollowerMessageEnabled: !current.newFollowerMessageEnabled } : current
                )
              }
              disabled={!canManage}
            />
          </div>

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
              Configuracao completa
            </Link>
            <Link
              href="/cliente/painel/inbox?channel=instagram"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <MessageCircleMore className="h-4 w-4" />
              Abrir inbox Instagram
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
          <CardTitle title="Matriz de eventos Instagram" subtitle="O que ja esta operacional e o que depende de limite da API da Meta." />
          <div className="mt-4 space-y-3">
            <EventCard
              title="DM recebida"
              description="Suportado: webhook + resposta por IA + log + CRM."
              available
              active={config.enabled && config.dmAutoReply}
            />
            <EventCard
              title="Comentario em post/reel"
              description="Suportado: webhook de comentario + resposta automatica publica."
              available
              active={config.enabled && config.commentAutoReply}
            />
            <EventCard
              title="Novo seguidor"
              description="Suportado com restricoes de politica/permissao da Meta para envio de mensagem."
              available
              active={config.enabled && config.newFollowerMessageEnabled}
            />
            <EventCard
              title="Usuario salvou post/reel"
              description="Nao suportado por webhook publico da Meta. Alternativa: gatilho por comentario/DM keyword."
              available={false}
              active={false}
            />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <CardTitle title="Logs recentes do Instagram" subtitle="Ultimos eventos processados no canal Instagram." />
          <div className="mt-4 space-y-3">
            {instagramLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                Ainda nao ha eventos de Instagram para este tenant.
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
              done={Boolean(config.enabled && config.newFollowerMessageEnabled)}
              title="4. Ativar mensagem para novo seguidor"
              detail="Configurar template de boas-vindas e monitorar entrega nos logs."
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
                Nem todo evento de engajamento do Instagram e exposto em webhook oficial. O fluxo mais robusto hoje e:
                DM, comentario e novo seguidor com fallback para palavra-chave.
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
