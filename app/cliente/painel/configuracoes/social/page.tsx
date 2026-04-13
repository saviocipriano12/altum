"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, Clock3, Loader2, Save, ShieldCheck, Sparkles } from "lucide-react";
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
  logs?: SocialAutomationLog[];
  error?: string;
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

function toLocalDateTime(value: unknown) {
  if (!value) return "Sem registro";
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Sem registro"
      : parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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

function statusTone(status?: string) {
  if (status === "sent") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (String(status || "").startsWith("ignored_")) return "warning" as const;
  if (status === "processed") return "info" as const;
  return "neutral" as const;
}

function statusLabel(status?: string) {
  if (status === "sent") return "Resposta enviada";
  if (status === "failed") return "Falha";
  if (status === "processed") return "Persistido";
  if (status === "ignored_opt_out") return "Opt-out";
  if (status === "ignored_inactive_hours") return "Fora do horario";
  if (status === "ignored_disabled") return "Desativado";
  if (status === "ignored_loop") return "Anti-loop";
  if (status === "ignored_duplicate") return "Duplicado";
  return status || "Pendente";
}

export default function ClienteSocialAutomationsPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<SocialAutomationConfig | null>(null);
  const [logs, setLogs] = useState<SocialAutomationLog[]>([]);
  const [summary, setSummary] = useState<SocialAutomationPayload["summary"] | null>(null);
  const canManage = hasCapability("manage_channels") || hasCapability("manage_automations");

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations`);
        const payload = (await response.json()) as SocialAutomationPayload;
        if (!mounted) return;
        if (!response.ok || !payload.config) {
          setError(payload.error || "Falha ao carregar automacoes sociais.");
          return;
        }
        setConfig(payload.config);
        setLogs(payload.logs || []);
        setSummary(payload.summary || null);
      } catch {
        if (mounted) {
          setError("Falha ao carregar automacoes sociais.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Canais ativos",
        value: String(summary?.activeChannels || 0),
        tone: (summary?.activeChannels || 0) > 0 ? ("success" as const) : ("warning" as const),
      },
      {
        label: "Respostas enviadas",
        value: String(summary?.sent || 0),
        tone: (summary?.sent || 0) > 0 ? ("info" as const) : ("neutral" as const),
      },
      {
        label: "Ignorados",
        value: String(summary?.ignored || 0),
        tone: (summary?.ignored || 0) > 0 ? ("warning" as const) : ("neutral" as const),
      },
      {
        label: "Falhas",
        value: String(summary?.failed || 0),
        tone: (summary?.failed || 0) > 0 ? ("danger" as const) : ("neutral" as const),
      },
    ],
    [summary?.activeChannels, summary?.failed, summary?.ignored, summary?.sent]
  );

  async function handleSave() {
    if (!tenant?.tenantId || !config || !canManage) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = (await response.json()) as { config?: SocialAutomationConfig; error?: string };
      if (!response.ok || !payload.config) {
        setError(payload.error || "Falha ao salvar automacoes sociais.");
        return;
      }

      setConfig(payload.config);
      setNotice("Configuracao social salva com sucesso.");
    } catch {
      setError("Falha ao salvar automacoes sociais.");
    } finally {
      setSaving(false);
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
        {error || "Nao foi possivel carregar a configuracao social."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Automacoes Sociais"
        subtitle="Gerencie DMs, comentarios e mensagens de novo seguidor por tenant, com janela ativa e opt-out."
        action={<StateBadge label={config.enabled ? "social ativo" : "social pausado"} tone={config.enabled ? "success" : "warning"} />}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <PanelCard key={card.label} className="p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{card.label}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-2xl font-semibold text-[var(--cliente-card-text)]">{card.value}</p>
              <StateBadge label={card.label.toLowerCase()} tone={card.tone} />
            </div>
          </PanelCard>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle title="Controles de automacao" subtitle="Defina quais eventos sociais podem disparar resposta automatica." />
            <StateBadge label={canManage ? "editavel" : "somente leitura"} tone={canManage ? "info" : "neutral"} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ToggleCard
              label="Automacoes sociais"
              description="Liga ou desliga a camada social automatica por tenant."
              checked={config.enabled}
              onChange={(checked) => setConfig((current) => (current ? { ...current, enabled: checked } : current))}
              disabled={!canManage}
              icon={Sparkles}
            />
            <ToggleCard
              label="Responder DMs"
              description="Quando ligado, a DM entra no fluxo automatico dentro do horario ativo."
              checked={config.dmAutoReply}
              onChange={(checked) => setConfig((current) => (current ? { ...current, dmAutoReply: checked } : current))}
              disabled={!canManage}
              icon={Bot}
            />
            <ToggleCard
              label="Responder comentarios"
              description="Envia resposta publica automatica para comentarios novos."
              checked={config.commentAutoReply}
              onChange={(checked) => setConfig((current) => (current ? { ...current, commentAutoReply: checked } : current))}
              disabled={!canManage}
              icon={ShieldCheck}
            />
            <ToggleCard
              label="Novo seguidor"
              description="Tenta enviar mensagem automatica de boas-vindas para novos seguidores."
              checked={config.newFollowerMessageEnabled}
              onChange={(checked) =>
                setConfig((current) => (current ? { ...current, newFollowerMessageEnabled: checked } : current))
              }
              disabled={!canManage}
              icon={Clock3}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Timezone"
              value={config.activeHours.timezone}
              onChange={(value) =>
                setConfig((current) =>
                  current
                    ? { ...current, activeHours: { ...current.activeHours, timezone: value } }
                    : current
                )
              }
              disabled={!canManage}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Inicio"
                value={config.activeHours.start}
                onChange={(value) =>
                  setConfig((current) =>
                    current ? { ...current, activeHours: { ...current.activeHours, start: value } } : current
                  )
                }
                disabled={!canManage}
              />
              <Field
                label="Fim"
                value={config.activeHours.end}
                onChange={(value) =>
                  setConfig((current) =>
                    current ? { ...current, activeHours: { ...current.activeHours, end: value } } : current
                  )
                }
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Dias ativos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((item) => {
                const active = config.activeHours.days.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    disabled={!canManage}
                    onClick={() =>
                      setConfig((current) => {
                        if (!current) return current;
                        const nextDays = active
                          ? current.activeHours.days.filter((value) => value !== item.value)
                          : [...current.activeHours.days, item.value].sort((a, b) => a - b);
                        return {
                          ...current,
                          activeHours: {
                            ...current.activeHours,
                            days: nextDays.length > 0 ? nextDays : current.activeHours.days,
                          },
                        };
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                        : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-soft)]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <TextAreaField
              label="Keywords de opt-out"
              value={config.optOutKeywords.join(", ")}
              onChange={(value) =>
                setConfig((current) =>
                  current
                    ? {
                        ...current,
                        optOutKeywords: value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }
                    : current
                )
              }
              disabled={!canManage}
            />
            <TextAreaField
              label="Prompt para DM"
              value={config.dmPrompt}
              onChange={(value) => setConfig((current) => (current ? { ...current, dmPrompt: value } : current))}
              disabled={!canManage}
            />
            <TextAreaField
              label="Prompt para comentarios"
              value={config.commentPrompt}
              onChange={(value) => setConfig((current) => (current ? { ...current, commentPrompt: value } : current))}
              disabled={!canManage}
            />
            <TextAreaField
              label="Mensagem para novo seguidor"
              value={config.newFollowerMessageTemplate}
              onChange={(value) =>
                setConfig((current) =>
                  current ? { ...current, newFollowerMessageTemplate: value } : current
                )
              }
              disabled={!canManage}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !canManage}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar automacoes sociais
            </button>
            <Link
              href="/cliente/painel/configuracoes/canais"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              Revisar canais Meta
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
              <ShieldCheck className="h-4 w-4" />
              {notice}
            </div>
          ) : null}
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Logs recentes" subtitle="Ultimos eventos sociais processados por tenant." />
          <div className="mt-4 space-y-3">
            {logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                Nenhum evento social registrado ainda para este tenant.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">
                        {(log.actorName || "Perfil social")} / {log.channelType || "social"}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                        {log.eventType || "evento"} / {toLocalDateTime(log.updatedAt)}
                      </p>
                    </div>
                    <StateBadge label={statusLabel(log.status)} tone={statusTone(log.status)} />
                  </div>
                  {log.text ? (
                    <p className="mt-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{log.text}</p>
                  ) : null}
                  {log.reason ? (
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Motivo: {log.reason}</p>
                  ) : null}
                  {log.responseText ? (
                    <div className="mt-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 text-sm text-[var(--cliente-card-text)]">
                      {log.responseText}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

function ToggleCard({
  label,
  description,
  checked,
  onChange,
  disabled,
  icon: Icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  icon: typeof Bot;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`rounded-2xl border p-4 text-left transition ${
        checked
          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
          : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-card-text-muted)]">
          <Icon className="h-4 w-4" />
        </div>
        <StateBadge label={checked ? "ativo" : "desligado"} tone={checked ? "success" : "neutral"} />
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{description}</p>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="client-input w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={4}
        className="client-input min-h-[110px] w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
      />
    </label>
  );
}
