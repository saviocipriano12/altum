"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, Loader2, Save, Shuffle, ShieldCheck } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

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

export default function ClienteOperacaoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstResponseSlaMinutes: 15,
    assignmentMode: "manual",
    autoAssignOnInbound: false,
    prioritizeHighPriority: true,
    preferOnlineAgents: true,
    strictChannelRouting: false,
    fallbackToAnyAgent: true,
    businessHoursOnly: false,
    defaultTeam: "comercial",
  });
  const [teamOptions, setTeamOptions] = useState<Array<{ id?: string; name?: string }>>([]);
  const canManage = hasCapability("manage_settings");

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`);
        const payload = (await res.json()) as SettingsPayload;
        if (!mounted) return;
        if (!res.ok) {
          setError(payload.error || "Falha ao carregar operacao.");
          return;
        }
        const inbox = payload.settings?.rules?.inbox;
        const assignmentMode =
          inbox?.assignmentMode === "round_robin"
            ? "round_robin"
            : inbox?.assignmentMode === "least_loaded"
              ? "least_loaded"
              : "manual";
        setForm({
          firstResponseSlaMinutes: Number(inbox?.firstResponseSlaMinutes || 15),
          assignmentMode,
          autoAssignOnInbound: inbox?.autoAssignOnInbound === true,
          prioritizeHighPriority: inbox?.prioritizeHighPriority !== false,
          preferOnlineAgents: inbox?.preferOnlineAgents !== false,
          strictChannelRouting: inbox?.strictChannelRouting === true,
          fallbackToAnyAgent: inbox?.fallbackToAnyAgent !== false,
          businessHoursOnly: inbox?.businessHoursOnly === true,
          defaultTeam: inbox?.defaultTeam || "comercial",
        });
        setTeamOptions(inbox?.teams || []);
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar configuracoes operacionais.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

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

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Operacao"
        subtitle="SLA, distribuicao e padroes do inbox do tenant."
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

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <CardTitle title="Regras do inbox" subtitle="Essas regras dirigem SLA e distribuicao no atendimento do cliente." />

            {loading ? (
              <div className="py-10 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">SLA primeira resposta (min)</span>
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
                    className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">Modo de distribuicao</span>
                  <select
                    value={form.assignmentMode}
                    onChange={(event) => setForm((current) => ({ ...current, assignmentMode: event.target.value }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                  >
                  <option value="manual">manual</option>
                  <option value="round_robin">round_robin</option>
                  <option value="least_loaded">least_loaded</option>
                </select>
              </label>

                <Toggle
                  title="Autoatribuir no inbound"
                  description="Ao entrar nova conversa, o sistema distribui automaticamente conforme a regra atual."
                  checked={form.autoAssignOnInbound}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, autoAssignOnInbound: checked }))}
                />

                <Toggle
                  title="Priorizar leads quentes"
                  description="Mantem a base pronta para pesos operacionais e regras por prioridade."
                  checked={form.prioritizeHighPriority}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, prioritizeHighPriority: checked }))}
                />

                <Toggle
                  title="Priorizar operadores online"
                  description="Roteia primeiro para quem estiver marcado como online no time do tenant."
                  checked={form.preferOnlineAgents}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, preferOnlineAgents: checked }))}
                />

                <Toggle
                  title="Roteamento estrito por canal"
                  description="Respeita os canais permitidos em cada operador antes de distribuir o inbound."
                  checked={form.strictChannelRouting}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, strictChannelRouting: checked }))}
                />

                <Toggle
                  title="Fallback para qualquer operador"
                  description="Se nao houver operador elegivel pelo canal, o sistema usa qualquer operador ativo compativel."
                  checked={form.fallbackToAnyAgent}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, fallbackToAnyAgent: checked }))}
                />

                <Toggle
                  title="Restringir ao horario comercial"
                  description="Mantem o tenant preparado para janelas operacionais e handoff fora do expediente."
                  checked={form.businessHoursOnly}
                  disabled={!canManage}
                  onChange={(checked) => setForm((current) => ({ ...current, businessHoursOnly: checked }))}
                />

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">Time padrao de entrada</span>
                  <select
                    value={form.defaultTeam}
                    onChange={(event) => setForm((current) => ({ ...current, defaultTeam: event.target.value }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                  >
                    {defaultTeamOptions.map((team) => (
                      <option key={String(team.id || team.name)} value={String(team.id || team.name)} className="bg-[#111111] text-white">
                        {String(team.name || team.id || "Time")}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {canManage ? "Salvar operacao" : "Somente leitura"}
                </button>
              </>
            )}
          </form>

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <Clock3 className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">SLA aplicado no inbox</p>
            <p className="mt-1 text-sm text-white/58">
              Conversas novas passam a carregar vencimento de primeira resposta e alerta visual na fila.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StateBadge label={`${form.firstResponseSlaMinutes} min`} tone="info" />
              <StateBadge label={form.businessHoursOnly ? "janela comercial" : "24/7"} tone={form.businessHoursOnly ? "warning" : "success"} />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <Shuffle className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Distribuicao operacional</p>
            <p className="mt-1 text-sm text-white/58">
              O modo round robin alterna por operador. O least_loaded envia para quem tem menos conversas ativas, respeitando online, canais e limite de carga.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StateBadge
                label={form.assignmentMode}
                tone={form.assignmentMode === "round_robin" || form.assignmentMode === "least_loaded" ? "success" : "neutral"}
              />
              <StateBadge label={`time ${form.defaultTeam || "comercial"}`} tone="info" />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Base enterprise</p>
            <p className="mt-1 text-sm text-white/58">
              Esta camada prepara o produto para filas por canal, score, horario e times sem refazer a arquitetura.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StateBadge label={form.autoAssignOnInbound ? "autoassign ligado" : "fila manual"} tone="neutral" />
              <StateBadge label={form.strictChannelRouting ? "canal estrito" : "canal flexivel"} tone="info" />
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
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
      className={`flex w-full items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition ${disabled ? "opacity-65" : "hover:bg-black/45"}`}
    >
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/56">{description}</p>
      </div>
      <span
        className={`inline-flex h-6 w-11 rounded-full border p-1 transition ${
          checked ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] justify-end" : "border-white/15 bg-white/[0.04] justify-start"
        }`}
      >
        <span className={`h-4 w-4 rounded-full ${checked ? "bg-[var(--cliente-accent)]" : "bg-white/45"}`} />
      </span>
    </button>
  );
}

