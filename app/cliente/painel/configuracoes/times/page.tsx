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
    id?: string;
    userId?: string;
    name?: string;
    email?: string;
    role?: string;
    team?: string;
    availability?: string;
    status?: string;
    allowedChannels?: string[];
    maxOpenChats?: number | null;
  }>;
  error?: string;
};

type TeamMemberConfig = NonNullable<UsersPayload["items"]>[number];

const OPERATION_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "messenger", label: "Messenger" },
  { id: "site_chat", label: "Chat do site" },
  { id: "site_form", label: "Formularios" },
] as const;

function normalizeTeamId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80) || `time_${Date.now()}`;
}

function getNextTeamId(teams: TeamConfig[]) {
  let index = teams.length + 1;
  const used = new Set(teams.map((team) => normalizeTeamId(team.id || team.name)));
  while (used.has(`time_${index}`)) index += 1;
  return `time_${index}`;
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
  const [members, setMembers] = useState<TeamMemberConfig[]>([]);
  const canManage = hasCapability("manage_settings");
  const canManageUsers = hasCapability("manage_users");

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
        setMembers(usersPayload.items || []);
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
        id: getNextTeamId(current),
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

  function toggleTeamChannel(index: number, channelId: string) {
    const current = teams[index]?.channels || [];
    updateTeam(index, {
      channels: current.includes(channelId)
        ? current.filter((item) => item !== channelId)
        : [...current, channelId],
    });
  }

  function updateMember(index: number, patch: Partial<TeamMemberConfig>) {
    setMembers((current) => current.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member));
  }

  function toggleMemberChannel(index: number, channelId: string) {
    const current = members[index]?.allowedChannels || [];
    updateMember(index, {
      allowedChannels: current.includes(channelId)
        ? current.filter((item) => item !== channelId)
        : [...current, channelId],
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId) return;
    if (!canManage) {
      setError("Seu perfil pode consultar os times, mas nao pode alterar a estrutura operacional.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const seen = new Set<string>();
      const normalizedDefaultTeam = normalizeTeamId(defaultTeam);
      const normalizedTeams = teams
        .map((team, index) => {
          let id = normalizeTeamId(team.id || team.name || `time_${index + 1}`);
          while (seen.has(id)) id = `${id}_${seen.size + 1}`;
          seen.add(id);
          return {
            id,
            name: team.name.trim() || "Time",
            description: String(team.description || "").trim(),
            channels: Array.from(new Set((team.channels || []).map((channel) => channel.trim().toLowerCase()).filter(Boolean))),
            isDefault: id === normalizedDefaultTeam,
          };
        });
      const nextDefaultTeam =
        normalizedTeams.find((team) => team.isDefault)?.id ||
        normalizedTeams[0]?.id ||
        "comercial";
      const teamsWithDefault = normalizedTeams.map((team) => ({
        ...team,
        isDefault: team.id === nextDefaultTeam,
      }));

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: {
            inbox: {
              defaultTeam: nextDefaultTeam,
              teams: teamsWithDefault,
            },
          },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar times.");
        return;
      }

      if (canManageUsers) {
        const editableMembers = members.filter((member) => member.userId && member.role !== "client_owner");
        const memberResponses = await Promise.all(
          editableMembers.map((member) => authedFetch(
            `/api/tenant/${tenant.tenantId}/users/${encodeURIComponent(String(member.userId))}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                team: normalizeTeamId(String(member.team || nextDefaultTeam)),
                availability: member.availability || "online",
                allowedChannels: member.allowedChannels || [],
                maxOpenChats: member.maxOpenChats || null,
              }),
            }
          ))
        );
        if (memberResponses.some((response) => !response.ok)) {
          setError("A estrutura foi salva, mas um ou mais membros nao puderam ser atualizados.");
          return;
        }
      }
      setNotice("Times operacionais atualizados.");
      setTeams(teamsWithDefault);
      setDefaultTeam(nextDefaultTeam);
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
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)]"
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
            {!canManage ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Seu perfil pode consultar a estrutura, mas apenas admins podem alterar times e roteamento.
              </p>
            ) : null}

            {loading ? (
              <div className="py-10 text-center text-[var(--cliente-card-text-soft)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Time padrao</span>
                  <select
                    value={defaultTeam}
                    onChange={(event) => setDefaultTeam(event.target.value)}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-70"
                  >
                    {teams.length === 0 ? <option value="comercial">Comercial</option> : null}
                    {teams.map((team) => (
                      <option key={team.id} value={normalizeTeamId(team.id || team.name)} className="bg-white text-slate-900">
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-3">
                  {teams.map((team, index) => (
                    <div key={`${team.id}_${index}`} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
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
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                        <Field
                          label="Descricao"
                          value={team.description || ""}
                          disabled={!canManage}
                          onChange={(value) => updateTeam(index, { description: value })}
                        />
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => removeTeam(index)}
                            className="self-end inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Canais atendidos pelo time</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {OPERATION_CHANNELS.map((channel) => {
                            const active = (team.channels || []).includes(channel.id);
                            return (
                              <button
                                key={channel.id}
                                type="button"
                                disabled={!canManage}
                                onClick={() => toggleTeamChannel(index, channel.id)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-[var(--cliente-border)] bg-white text-[var(--cliente-card-text-muted)]"}`}
                              >
                                {channel.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={addTeam}
                      className="rounded-xl border border-[var(--cliente-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)]"
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

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-600">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <CardTitle title="Equipe e distribuicao" subtitle="Defina o time, disponibilidade, capacidade e canais de cada pessoa." />
            <div className="mt-4 space-y-3">
              {members.map((member, index) => {
                const locked = member.role === "client_owner" || !canManageUsers;
                return (
                  <div key={member.userId || member.id || index} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{member.name || member.email || "Membro"}</p>
                        <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{member.email || (member.role === "client_owner" ? "Dono da conta" : "Equipe")}</p>
                      </div>
                      <StateBadge label={member.role === "client_owner" ? "Dono" : member.status === "blocked" ? "Bloqueado" : "Ativo"} tone={member.status === "blocked" ? "warning" : "success"} />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block space-y-1">
                        <span className="text-xs text-[var(--cliente-card-text-soft)]">Time</span>
                        <select value={String(member.team || defaultTeam)} disabled={locked} onChange={(event) => updateMember(index, { team: event.target.value })} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-sm disabled:opacity-60">
                          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-[var(--cliente-card-text-soft)]">Disponibilidade</span>
                        <select value={String(member.availability || "online")} disabled={locked} onChange={(event) => updateMember(index, { availability: event.target.value })} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-sm disabled:opacity-60">
                          <option value="online">Disponivel</option><option value="busy">Ocupado</option><option value="offline">Fora da escala</option>
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-[var(--cliente-card-text-soft)]">Max. conversas abertas</span>
                        <input type="number" min={1} max={200} value={member.maxOpenChats || 20} disabled={locked} onChange={(event) => updateMember(index, { maxOpenChats: Number(event.target.value) || null })} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-sm disabled:opacity-60" />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {OPERATION_CHANNELS.map((channel) => {
                        const active = (member.allowedChannels || []).includes(channel.id);
                        return <button key={channel.id} type="button" disabled={locked} onClick={() => toggleMemberChannel(index, channel.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--cliente-border)] bg-white text-[var(--cliente-card-text-soft)]"}`}>{channel.label}</button>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-2 text-[var(--cliente-primary)]">
              <UsersRound className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">Cobertura dos times</p>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Compare o que ja esta configurado com os times usados pelos membros da equipe.</p>
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
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-muted)]">
                  Os times usados pelos membros ja estao refletidos na configuracao operacional.
                </div>
              ) : (
                coverage.missing.map((team) => (
                  <div key={team} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <p className="text-sm font-medium text-[var(--cliente-card-text)]">Time sem configuracao formal</p>
                    <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{team}</p>
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
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-70 transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45 disabled:opacity-60"
      />
    </label>
  );
}

