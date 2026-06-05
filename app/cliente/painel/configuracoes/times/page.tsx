"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save, Trash2, UsersRound } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type TeamConfig = {
  id: string;
  name: string;
  description?: string;
  channels: string[];
  isDefault?: boolean;
};

type SettingsPayload = {
  settings?: {
    rules?: {
      inbox?: {
        defaultTeam?: string;
        teams?: TeamConfig[];
      };
    };
  };
  error?: string;
};

type UsersPayload = {
  items?: Array<{
    team?: string;
    availability?: string;
    status?: string;
    allowedChannels?: string[];
  }>;
  error?: string;
};

function normalizeTeamId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80) || `time_${Date.now()}`;
}

export default function ClienteTimesPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamConfig[]>([]);
  const [defaultTeam, setDefaultTeam] = useState("comercial");
  const [userTeams, setUserTeams] = useState<string[]>([]);
  const canManage = hasCapability("manage_settings");

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
        const settingsPayload = (await settingsRes.json()) as SettingsPayload;
        const usersPayload = (await usersRes.json()) as UsersPayload;
        if (!mounted) return;
        if (!settingsRes.ok || !usersRes.ok) {
          setError(settingsPayload.error || usersPayload.error || "Falha ao carregar times.");
          return;
        }
        const inbox = settingsPayload.settings?.rules?.inbox;
        setTeams(inbox?.teams || []);
        setDefaultTeam(inbox?.defaultTeam || "comercial");
        setUserTeams(
          Array.from(
            new Set(
              (usersPayload.items || [])
                .map((item) => String(item.team || "").trim())
                .filter(Boolean)
            )
          )
        );
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar times.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  const coverage = useMemo(() => {
    const configured = new Set(teams.map((team) => team.id));
    const missing = userTeams.filter((team) => !configured.has(normalizeTeamId(team)) && !configured.has(team));
    return {
      configured: teams.length,
      referenced: userTeams.length,
      missing,
    };
  }, [teams, userTeams]);

  function updateTeam(index: number, patch: Partial<TeamConfig>) {
    setTeams((current) => current.map((team, teamIndex) => (teamIndex === index ? { ...team, ...patch } : team)));
  }

  function addTeam() {
    setTeams((current) => [
      ...current,
      {
        id: normalizeTeamId(`time_${current.length + 1}`),
        name: `Time ${current.length + 1}`,
        description: "",
        channels: ["whatsapp"],
        isDefault: false,
      },
    ]);
  }

  function removeTeam(index: number) {
    setTeams((current) => current.filter((_, teamIndex) => teamIndex !== index));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const normalizedTeams = teams.map((team) => ({
        id: normalizeTeamId(team.id || team.name),
        name: team.name.trim() || "Time",
        description: String(team.description || "").trim(),
        channels: Array.from(new Set((team.channels || []).map((channel) => channel.trim().toLowerCase()).filter(Boolean))),
        isDefault: normalizeTeamId(team.id || team.name) === defaultTeam,
      }));

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: {
            inbox: {
              defaultTeam,
              teams: normalizedTeams,
            },
          },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar times.");
        return;
      }
      setNotice("Times operacionais atualizados.");
      setTeams(normalizedTeams);
    } catch {
      setError("Falha ao salvar times.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Times"
        subtitle="Ownership operacional, cobertura por canal e base para distribuicao do inbound."
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

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <CardTitle title="Estrutura de times" subtitle="Defina nomes, descricao, canais e o time padrao do workspace." />

            {loading ? (
              <div className="py-10 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">Time padrao</span>
                  <select
                    value={defaultTeam}
                    onChange={(event) => setDefaultTeam(event.target.value)}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                  >
                    {teams.length === 0 ? <option value="comercial">Comercial</option> : null}
                    {teams.map((team) => (
                      <option key={team.id} value={normalizeTeamId(team.id || team.name)} className="bg-[#111111] text-white">
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-3">
                  {teams.map((team, index) => (
                    <div key={`${team.id}_${index}`} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field
                          label="Nome"
                          value={team.name}
                          disabled={!canManage}
                          onChange={(value) => updateTeam(index, { name: value, id: normalizeTeamId(value || team.id) })}
                        />
                        <Field
                          label="ID"
                          value={team.id}
                          disabled={!canManage}
                          onChange={(value) => updateTeam(index, { id: normalizeTeamId(value) })}
                        />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <Field
                          label="Descricao"
                          value={team.description || ""}
                          disabled={!canManage}
                          onChange={(value) => updateTeam(index, { description: value })}
                        />
                        <Field
                          label="Canais"
                          value={(team.channels || []).join(", ")}
                          disabled={!canManage}
                          onChange={(value) => updateTeam(index, { channels: value.split(",").map((item) => item.trim()).filter(Boolean) })}
                        />
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => removeTeam(index)}
                            className="self-end inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100 transition hover:bg-rose-500/15"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={addTeam}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/82 transition hover:bg-white/[0.08]"
                    >
                      Adicionar time
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar times
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </form>

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <UsersRound className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Cobertura dos times</p>
            <p className="mt-1 text-sm text-white/58">Compare o que ja esta configurado com os times usados pelos membros da equipe.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StateBadge label={`${coverage.configured} configurados`} tone={coverage.configured > 0 ? "info" : "warning"} />
              <StateBadge label={`${coverage.referenced} referenciados`} tone="neutral" />
              <StateBadge label={`padrao ${defaultTeam || "comercial"}`} tone="success" />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Ajustes sugeridos" subtitle="Onde a estrutura ainda pode ganhar consistencia." />
            <div className="mt-4 space-y-3">
              {coverage.missing.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/68">
                  Os times usados pelos membros ja estao refletidos na configuracao operacional.
                </div>
              ) : (
                coverage.missing.map((team) => (
                  <div key={team} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-sm font-medium text-white">Time sem configuracao formal</p>
                    <p className="mt-1 text-sm text-white/58">{team}</p>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45 disabled:opacity-60"
      />
    </label>
  );
}

