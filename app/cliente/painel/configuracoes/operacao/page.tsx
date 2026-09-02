"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  Loader2,
  MessageSquare,
  Save,
  ShieldCheck,
  Shuffle,
  UsersRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  ClientActionButton,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type SettingsPayload = {
  settings?: {
    rules?: {
      inbox?: {
        firstResponseSlaMinutes?: number;
        assignmentMode?: string;
        autoAssignOnInbound?: boolean;
        prioritizeHighPriority?: boolean;
        preferOnlineAgents?: boolean;
        strictChannelRouting?: boolean;
        fallbackToAnyAgent?: boolean;
        businessHoursOnly?: boolean;
        defaultTeam?: string;
        teams?: Array<{ id?: string; name?: string }>;
      };
    };
  };
  error?: string;
};

type TenantUser = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  availability?: string;
  allowedChannels?: string[];
  maxOpenChats?: number | null;
};

type OperationForm = {
  firstResponseSlaMinutes: number;
  assignmentMode: string;
  autoAssignOnInbound: boolean;
  prioritizeHighPriority: boolean;
  preferOnlineAgents: boolean;
  strictChannelRouting: boolean;
  fallbackToAnyAgent: boolean;
  businessHoursOnly: boolean;
  defaultTeam: string;
};

const DEFAULT_FORM: OperationForm = {
  firstResponseSlaMinutes: 15,
  assignmentMode: "manual",
  autoAssignOnInbound: false,
  prioritizeHighPriority: true,
  preferOnlineAgents: true,
  strictChannelRouting: false,
  fallbackToAnyAgent: true,
  businessHoursOnly: false,
  defaultTeam: "comercial",
};

function assignmentModeLabel(value: string) {
  if (value === "round_robin") return "rodizio";
  if (value === "least_loaded") return "menor carga";
  return "manual";
}

function normalizeAssignmentMode(value?: string) {
  if (value === "round_robin" || value === "least_loaded") return value;
  return "manual";
}

export default function ClienteOperacaoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<OperationForm>(DEFAULT_FORM);
  const [teamOptions, setTeamOptions] = useState<Array<{ id?: string; name?: string }>>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [settingsRes, usersRes] = await Promise.all([
          authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
          authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        ]);
        const settingsPayload = (await settingsRes.json().catch(() => ({}))) as SettingsPayload;
        const usersPayload = (await usersRes.json().catch(() => ({}))) as { items?: TenantUser[] };
        if (!mounted) return;

        if (!settingsRes.ok) {
          setError(settingsPayload.error || "Falha ao carregar operacao.");
          return;
        }

        const inbox = settingsPayload.settings?.rules?.inbox;
        setForm({
          firstResponseSlaMinutes: Number(inbox?.firstResponseSlaMinutes || DEFAULT_FORM.firstResponseSlaMinutes),
          assignmentMode: normalizeAssignmentMode(inbox?.assignmentMode),
          autoAssignOnInbound: inbox?.autoAssignOnInbound === true,
          prioritizeHighPriority: inbox?.prioritizeHighPriority !== false,
          preferOnlineAgents: inbox?.preferOnlineAgents !== false,
          strictChannelRouting: inbox?.strictChannelRouting === true,
          fallbackToAnyAgent: inbox?.fallbackToAnyAgent !== false,
          businessHoursOnly: inbox?.businessHoursOnly === true,
          defaultTeam: inbox?.defaultTeam || DEFAULT_FORM.defaultTeam,
        });
        setTeamOptions(inbox?.teams || []);
        if (usersRes.ok) setUsers(usersPayload.items || []);
      } catch {
        if (mounted) setError("Falha ao carregar configuracoes operacionais.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  const defaultTeamOptions = useMemo(() => {
    const source = [{ id: "comercial", name: "Comercial" }, ...(teamOptions || [])];
    const seen = new Set<string>();
    return source.filter((team) => {
      const key = String(team.id || team.name || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [teamOptions]);

  const teamCapacity = useMemo(() => {
    const operationalUsers = users.filter((user) => {
      if (user.status === "blocked") return false;
      return user.role === "client_owner" || user.role === "client_admin" || user.role === "client_agent";
    });
    const online = operationalUsers.filter((user) => String(user.availability || "online") === "online").length;
    const capacity = operationalUsers.reduce((sum, user) => sum + Number(user.maxOpenChats || 0), 0);
    const channels = Array.from(new Set(operationalUsers.flatMap((user) => user.allowedChannels || []))).filter(Boolean);

    return {
      total: operationalUsers.length,
      online,
      capacity,
      channels,
    };
  }, [users]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: {
            inbox: form,
          },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar operacao.");
        return;
      }
      setNotice("Regras operacionais atualizadas.");
    } catch {
      setError("Falha ao salvar operacao.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Operacao de atendimento"
        subtitle="Tempo de resposta, distribuicao e capacidade do time para nao deixar oportunidade sem dono."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Atendentes ativos" value={String(teamCapacity.total)} icon={UsersRound} trend={`${teamCapacity.online} online`} tone="brand" />
        <MetricCard label="Capacidade" value={teamCapacity.capacity ? String(teamCapacity.capacity) : "--"} icon={MessageSquare} trend="conversas simultaneas" tone="success" />
        <MetricCard label="SLA" value={`${form.firstResponseSlaMinutes} min`} icon={Clock3} trend={form.businessHoursOnly ? "horario comercial" : "24/7"} tone="warning" />
        <MetricCard label="Distribuicao" value={form.autoAssignOnInbound ? "Ligada" : "Manual"} icon={Shuffle} trend={assignmentModeLabel(form.assignmentMode)} tone={form.autoAssignOnInbound ? "success" : "neutral"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <CardTitle title="Regras de atendimento" subtitle="Defina como novas conversas entram, quem recebe e qual prazo precisa ser cumprido." />

            {loading ? (
              <div className="py-10 text-center text-[var(--cliente-card-text-soft)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-normal text-[var(--cliente-card-text-soft)]">Prazo da primeira resposta (min)</span>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.firstResponseSlaMinutes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        firstResponseSlaMinutes: Math.max(5, Math.min(1440, Number(event.target.value || 15))),
                      }))
                    }
                    disabled={!canManage}
                    className="client-input w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-normal text-[var(--cliente-card-text-soft)]">Modo de distribuicao</span>
                  <select
                    value={form.assignmentMode}
                    onChange={(event) => setForm((current) => ({ ...current, assignmentMode: event.target.value }))}
                    disabled={!canManage}
                    className="client-input w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
                  >
                    <option value="manual">Manual</option>
                    <option value="round_robin">Rodizio da equipe</option>
                    <option value="least_loaded">Quem tem menos conversas</option>
                  </select>
                </label>

                <Toggle
                  title="Distribuir conversa automaticamente"
                  description="Quando uma nova conversa chega, a Altum direciona para alguem da equipe conforme a regra atual."
                  checked={form.autoAssignOnInbound}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, autoAssignOnInbound: checked }))}
                />

                <Toggle
                  title="Priorizar leads quentes"
                  description="Coloca oportunidades mais promissoras na frente para reduzir perda de venda."
                  checked={form.prioritizeHighPriority}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, prioritizeHighPriority: checked }))}
                />

                <Toggle
                  title="Priorizar operadores online"
                  description="Direciona primeiro para quem esta disponivel no time."
                  checked={form.preferOnlineAgents}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, preferOnlineAgents: checked }))}
                />

                <Toggle
                  title="Respeitar canais da equipe"
                  description="Distribui a conversa apenas para pessoas que podem atender aquele canal."
                  checked={form.strictChannelRouting}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, strictChannelRouting: checked }))}
                />

                <Toggle
                  title="Usar outro atendente se precisar"
                  description="Se nao houver alguem ideal para o canal, a Altum pode escolher outro atendente disponivel."
                  checked={form.fallbackToAnyAgent}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, fallbackToAnyAgent: checked }))}
                />

                <Toggle
                  title="Restringir ao horario comercial"
                  description="Usa o horario comercial para decidir alertas, escaladas e atendimento fora do expediente."
                  checked={form.businessHoursOnly}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, businessHoursOnly: checked }))}
                />

                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-normal text-[var(--cliente-card-text-soft)]">Time padrao de entrada</span>
                  <select
                    value={form.defaultTeam}
                    onChange={(event) => setForm((current) => ({ ...current, defaultTeam: event.target.value }))}
                    disabled={!canManage}
                    className="client-input w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
                  >
                    {defaultTeamOptions.map((team) => (
                      <option key={String(team.id || team.name)} value={String(team.id || team.name)}>
                        {String(team.name || team.id || "Time")}
                      </option>
                    ))}
                  </select>
                </label>

                <ClientActionButton type="submit" tone="primary" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {canManage ? "Salvar operacao" : "Somente leitura"}
                </ClientActionButton>
              </>
            )}
          </form>

          {error ? <p className="mt-3 text-sm font-semibold text-[var(--cliente-danger)]">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm font-semibold text-[var(--cliente-success)]">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <OperationCard
            icon={Clock3}
            tone="brand"
            title="Prazo aplicado nas conversas"
            description="Conversas novas passam a carregar vencimento de primeira resposta e alerta visual na lista."
          >
            <StateBadge label={`${form.firstResponseSlaMinutes} min`} tone="info" />
            <StateBadge label={form.businessHoursOnly ? "janela comercial" : "24/7"} tone={form.businessHoursOnly ? "warning" : "success"} />
          </OperationCard>

          <OperationCard
            icon={Shuffle}
            tone="success"
            title="Distribuicao operacional"
            description="O rodizio alterna entre atendentes. O modo por carga envia para quem tem menos conversas ativas, respeitando disponibilidade, canais e limite de atendimento."
          >
            <StateBadge label={assignmentModeLabel(form.assignmentMode)} tone={form.assignmentMode === "manual" ? "neutral" : "success"} />
            <StateBadge label={`time ${form.defaultTeam || "comercial"}`} tone="info" />
          </OperationCard>

          <OperationCard
            icon={ShieldCheck}
            tone="ai"
            title="Base de escala"
            description={
              teamCapacity.channels.length
                ? `Canais cobertos pelo time: ${teamCapacity.channels.slice(0, 4).join(", ")}.`
                : "Defina canais permitidos nos usuarios para distribuir com mais precisao."
            }
          >
            <StateBadge label={form.autoAssignOnInbound ? "distribuicao ligada" : "fila manual"} tone="neutral" />
            <StateBadge label={form.strictChannelRouting ? "canal estrito" : "canal flexivel"} tone="info" />
            <Link
              href="/cliente/painel/configuracoes/usuarios"
              className="inline-flex items-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-1.5 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              Ajustar equipe
            </Link>
          </OperationCard>
        </div>
      </section>
    </div>
  );
}

function OperationCard({
  icon: Icon,
  tone,
  title,
  description,
  children,
}: {
  icon: typeof Clock3;
  tone: "brand" | "success" | "ai";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    brand: "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]",
    success: "bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]",
    ai: "bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]",
  }[tone];

  return (
    <PanelCard className="p-5">
      <div className={`inline-flex rounded-lg border border-[var(--cliente-border)] p-2 ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </PanelCard>
  );
}

function Toggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`flex w-full items-start justify-between gap-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-left transition ${disabled ? "opacity-65" : "hover:bg-[var(--cliente-panel-soft)]"}`}
    >
      <div>
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
        <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{description}</p>
      </div>
      <span
        className={`inline-flex h-6 w-11 shrink-0 rounded-full border p-1 transition ${
          checked ? "justify-end border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]" : "justify-start border-[var(--cliente-border)] bg-[var(--cliente-card)]"
        }`}
      >
        <span className={`h-4 w-4 rounded-full ${checked ? "bg-[var(--cliente-accent)]" : "bg-[var(--cliente-card-text-muted)]"}`} />
      </span>
    </button>
  );
}
