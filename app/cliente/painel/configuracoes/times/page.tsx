"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gauge, Loader2, MailPlus, Save, Trash2, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";
import { CLIENT_ACCESS_PROFILES, getClientAccessProfile, inferClientAccessProfile, type ClientAccessProfileId } from "@/lib/client-access-profiles";

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
    capabilities?: string[];
    accessProfile?: string;
  }>;
  error?: string;
};

type TeamMemberConfig = NonNullable<UsersPayload["items"]>[number];

type QuickMemberForm = {
  name: string;
  email: string;
  accessProfile: ClientAccessProfileId;
  team: string;
  allowedChannels: string;
  maxOpenChats: string;
};

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
  const [savedMembers, setSavedMembers] = useState<TeamMemberConfig[]>([]);
  const [quickTeam, setQuickTeam] = useState({ name: "", description: "", channels: ["whatsapp"] });
  const [quickMember, setQuickMember] = useState<QuickMemberForm>({
    name: "",
    email: "",
    accessProfile: "seller",
    team: "",
    allowedChannels: "whatsapp",
    maxOpenChats: "12",
  });
  const [quickSaving, setQuickSaving] = useState(false);
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
        setSavedMembers(usersPayload.items || []);
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
  const teamOverview = useMemo(() => {
    const activeMembers = members.filter((member) => member.status !== "blocked");
    return {
      active: activeMembers.length,
      available: activeMembers.filter((member) => member.availability === "online").length,
      capacity: activeMembers.reduce((total, member) => total + Number(member.maxOpenChats || 0), 0),
      withoutTeam: activeMembers.filter((member) => !String(member.team || "").trim()).length,
    };
  }, [members]);

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
    const team = teams[index];
    if (members.some((member) => String(member.team || "") === team?.id)) {
      setError("Mova as pessoas para outro time antes de remover este time.");
      return;
    }
    if (team?.id === defaultTeam) {
      setError("Escolha outro time padrão antes de remover este time.");
      return;
    }
    setTeams((current) => current.filter((_, teamIndex) => teamIndex !== index));
  }

  const changedMembers = members.filter((member) => {
    if (!member.userId || member.role === "client_owner") return false;
    const saved = savedMembers.find((item) => item.userId === member.userId);
    return JSON.stringify(member) !== JSON.stringify(saved);
  });

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

  function toggleQuickTeamChannel(channelId: string) {
    setQuickTeam((current) => ({
      ...current,
      channels: current.channels.includes(channelId)
        ? current.channels.filter((item) => item !== channelId)
        : [...current.channels, channelId],
    }));
  }

  async function createTeamAndMember(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage || !canManageUsers) return;
    const teamName = quickTeam.name.trim();
    const memberEmail = quickMember.email.trim();
    if (!teamName || !memberEmail) {
      setError("Informe o nome da equipe e o e-mail da primeira pessoa.");
      return;
    }

    try {
      setQuickSaving(true);
      setError(null);
      setNotice(null);
      const teamId = normalizeTeamId(teamName);
      const nextTeams = [
        ...teams.filter((item) => item.id !== teamId),
        { id: teamId, name: teamName, description: quickTeam.description.trim(), channels: quickTeam.channels, isDefault: teams.length === 0 },
      ];
      const settingsResponse = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: { inbox: { defaultTeam: teams.length === 0 ? teamId : defaultTeam || teamId, teams: nextTeams } } }),
      });
      const settingsPayload = (await settingsResponse.json().catch(() => ({}))) as { error?: string };
      if (!settingsResponse.ok) throw new Error(settingsPayload.error || "Não foi possível criar a equipe.");

      const profile = getClientAccessProfile(quickMember.accessProfile);
      const userResponse = await authedFetch(`/api/tenant/${tenant.tenantId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickMember.name.trim(),
          email: memberEmail,
          team: teamId,
          role: profile.role,
          accessProfile: profile.id,
          availability: "online",
          allowedChannels: quickMember.allowedChannels,
          maxOpenChats: Number(quickMember.maxOpenChats || 0),
          capabilities: profile.capabilities,
        }),
      });
      const userPayload = (await userResponse.json().catch(() => ({}))) as { error?: string; emailDelivery?: string; inviteLink?: string };
      if (!userResponse.ok) throw new Error(userPayload.error || "Equipe criada, mas não foi possível adicionar a pessoa.");

      setTeams(nextTeams);
      setDefaultTeam(teams.length === 0 ? teamId : defaultTeam || teamId);
      setQuickTeam({ name: "", description: "", channels: ["whatsapp"] });
      setQuickMember({ name: "", email: "", accessProfile: "seller", team: teamId, allowedChannels: "whatsapp", maxOpenChats: "12" });
      setNotice(userPayload.emailDelivery === "sent" ? "Equipe criada e convite enviado por e-mail." : "Equipe criada e primeira pessoa adicionada. O convite pode ser copiado na tela de Usuários.");
      const usersResponse = await authedFetch(`/api/tenant/${tenant.tenantId}/users`);
      const usersPayload = (await usersResponse.json().catch(() => ({}))) as UsersPayload;
      if (usersResponse.ok) {
        setMembers(usersPayload.items || []);
        setSavedMembers(usersPayload.items || []);
      }
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Falha ao montar a equipe.");
    } finally {
      setQuickSaving(false);
    }
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

      if (!teams.length || teams.some((team) => !team.name.trim())) {
        setError("Defina pelo menos um time e preencha o nome de todos os times.");
        return;
      }
      if (new Set(teams.map((team) => team.id)).size !== teams.length) {
        setError("Os times precisam ter identificadores únicos.");
        return;
      }
      const validTeamIds = new Set(teams.map((team) => team.id));
      if (changedMembers.some((member) => member.team && !validTeamIds.has(member.team))) {
        setError("Selecione um time existente para cada pessoa alterada.");
        return;
      }

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
      setTeams(teamsWithDefault);
      setDefaultTeam(nextDefaultTeam);

      if (canManageUsers) {
        const editableMembers = changedMembers;
        const memberResponses = await Promise.allSettled(
          editableMembers.map((member) => authedFetch(
            `/api/tenant/${tenant.tenantId}/users/${encodeURIComponent(String(member.userId))}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(
                (["team", "availability", "allowedChannels", "maxOpenChats"] as const)
                  .filter((key) => JSON.stringify(member[key]) !== JSON.stringify(savedMembers.find((item) => item.userId === member.userId)?.[key]))
                  .map((key) => [key, member[key] ?? (key === "team" ? "" : null)])
              )),
            }
          ))
        );
        const savedIds = new Set(memberResponses.flatMap((result, index) => result.status === "fulfilled" && result.value.ok ? [editableMembers[index].userId] : []));
        setSavedMembers((current) => current.map((member) => savedIds.has(member.userId) ? members.find((item) => item.userId === member.userId) || member : member));
        const failedNames = editableMembers.filter((member) => !savedIds.has(member.userId)).map((member) => member.name || member.email || "Membro");
        if (failedNames.length) {
          setError(`Os times foram salvos. Não foi possível salvar: ${failedNames.join(", ")}. Tente novamente para salvar apenas essas pessoas.`);
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
        subtitle="Organize responsáveis, capacidade e canais para distribuir cada nova conversa com clareza."
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

      {canManage && canManageUsers ? (
        <PanelCard className="border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm"><UsersRound className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Montar operação</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Crie uma equipe e coloque a primeira pessoa para trabalhar</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">A equipe define a fila. O perfil define o que a pessoa pode acessar. Os canais definem de onde ela pode receber conversas.</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700"><UserPlus className="h-3.5 w-3.5" />Fluxo guiado</span>
          </div>
          <form onSubmit={createTeamAndMember} className="mt-6 grid gap-5 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
            <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700">1</span><p className="font-bold text-slate-900">Defina a equipe</p></div>
              <div className="mt-4 space-y-3">
                <QuickField label="Nome da equipe" value={quickTeam.name} placeholder="Ex.: Vendas São Paulo" onChange={(value) => setQuickTeam((current) => ({ ...current, name: value }))} />
                <QuickField label="Objetivo da equipe" value={quickTeam.description} placeholder="Ex.: Leads de campanhas e WhatsApp" onChange={(value) => setQuickTeam((current) => ({ ...current, description: value }))} />
                <div><p className="text-xs font-semibold text-slate-500">Canais da fila</p><div className="mt-2 flex flex-wrap gap-2">{OPERATION_CHANNELS.map((channel) => <button key={channel.id} type="button" aria-pressed={quickTeam.channels.includes(channel.id)} onClick={() => toggleQuickTeamChannel(channel.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${quickTeam.channels.includes(channel.id) ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}>{channel.label}</button>)}</div></div>
              </div>
            </div>
            <div className="hidden items-center justify-center xl:flex"><span className="text-2xl text-slate-300">→</span></div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">2</span><p className="font-bold text-slate-900">Adicione a primeira pessoa</p></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <QuickField label="Nome" value={quickMember.name} placeholder="Nome completo" onChange={(value) => setQuickMember((current) => ({ ...current, name: value }))} />
                <QuickField label="E-mail de acesso" value={quickMember.email} placeholder="pessoa@empresa.com" type="email" onChange={(value) => setQuickMember((current) => ({ ...current, email: value }))} />
                <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-500">Perfil</span><select value={quickMember.accessProfile} onChange={(event) => setQuickMember((current) => ({ ...current, accessProfile: event.target.value as ClientAccessProfileId }))} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none"><option value="seller">Vendedor</option>{CLIENT_ACCESS_PROFILES.filter((profile) => ["manager", "support", "analyst"].includes(profile.id)).map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
                <QuickField label="Limite de conversas" value={quickMember.maxOpenChats} type="number" placeholder="12" onChange={(value) => setQuickMember((current) => ({ ...current, maxOpenChats: value }))} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5"><p className="text-xs leading-5 text-emerald-800">A pessoa entra como membro desta equipe e recebe apenas as permissões do perfil escolhido.</p><button type="submit" disabled={quickSaving} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">{quickSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}{quickSaving ? "Criando" : "Criar equipe"}</button></div>
            </div>
          </form>
        </PanelCard>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Pessoas ativas", value: teamOverview.active, detail: "com acesso à operação", icon: UsersRound, tone: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "Disponíveis agora", value: teamOverview.available, detail: "aptas para receber conversas", icon: UserCheck, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Capacidade declarada", value: teamOverview.capacity, detail: "conversas simultâneas", icon: Gauge, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
          { label: "Sem time definido", value: teamOverview.withoutTeam, detail: "precisam de organização", icon: UsersRound, tone: teamOverview.withoutTeam ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200" },
        ].map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className={`rounded-2xl border p-4 ${metric.tone}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">{metric.label}</p><p className="mt-2 text-3xl font-black tracking-tight">{metric.value}</p><p className="mt-1 text-xs opacity-70">{metric.detail}</p></div><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/70"><Icon className="h-5 w-5" /></span></div></div>;
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <form id="team-settings" onSubmit={onSubmit} className="space-y-4">
            <CardTitle title="Estrutura de times" subtitle="Defina a função de cada grupo, os canais atendidos e o destino padrão das novas conversas." />
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
                    disabled={!canManage || saving}
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
                          disabled={!canManage || saving}
                          onChange={(value) => updateTeam(index, { name: value })}
                        />
                        <Field
                          label="Identificador do time"
                          value={team.id}
                          disabled
                          onChange={() => {}}
                        />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                        <Field
                          label="Descricao"
                          value={team.description || ""}
                          disabled={!canManage || saving}
                          onChange={(value) => updateTeam(index, { description: value })}
                        />
                        {canManage ? (
                          <button
                            type="button"
                            disabled={saving}
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
                                aria-pressed={active}
                                disabled={!canManage || saving}
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
                      disabled={saving}
                      onClick={addTeam}
                      className="rounded-xl border border-[var(--cliente-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)]"
                    >
                      Adicionar time
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </form>

          {error ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {notice ? <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <CardTitle title="Pessoas e capacidade" subtitle="Defina onde cada pessoa trabalha, quando pode receber contatos e seu limite simultâneo." />
            <div className="mt-4 space-y-3">
              {members.map((member, index) => {
                const locked = saving || member.role === "client_owner" || !canManageUsers;
                return (
                  <div key={member.userId || member.id || index} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{member.name || member.email || "Membro"}</p>
                        <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{member.email || (member.role === "client_owner" ? "Dono da conta" : "Equipe")}</p>
                      </div>
                      <StateBadge label={member.role === "client_owner" ? "Dono" : member.status === "blocked" ? "Bloqueado" : "Ativo"} tone={member.status === "blocked" ? "warning" : "success"} />
                      {member.role !== "client_owner" ? <StateBadge label={inferClientAccessProfile(member).label} tone="info" /> : null}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block space-y-1">
                        <span className="text-xs text-[var(--cliente-card-text-soft)]">Time</span>
                        <select value={String(member.team || "")} disabled={locked} onChange={(event) => updateMember(index, { team: event.target.value })} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-sm disabled:opacity-60">
                          <option value="">Sem time</option>
                          {member.team && !teams.some((team) => team.id === member.team) ? <option value={member.team}>{member.team} (não configurado)</option> : null}
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
                        <input type="number" min={1} max={200} value={member.maxOpenChats ?? ""} placeholder="Sem limite" disabled={locked} onChange={(event) => updateMember(index, { maxOpenChats: event.target.value === "" ? null : Number(event.target.value) })} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-sm disabled:opacity-60" />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {OPERATION_CHANNELS.map((channel) => {
                        const active = (member.allowedChannels || []).includes(channel.id);
                        return <button key={channel.id} type="button" disabled={locked} onClick={() => toggleMemberChannel(index, channel.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--cliente-border)] bg-white text-[var(--cliente-card-text-soft)]"}`}>{channel.label}</button>;
                      })}
                    </div>
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{(member.allowedChannels || []).length ? "Recebe distribuição nos canais selecionados." : "Sem seleção: pode receber distribuição em todos os canais."} Isso não amplia o acesso à carteira de outras pessoas.</p>
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
      {canManage && !loading ? <div className="sticky bottom-24 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4 shadow-[var(--cliente-shadow-soft)] sm:bottom-4">
        <p className="text-sm text-[var(--cliente-card-text-soft)]">{changedMembers.length ? `${changedMembers.length} pessoa(s) com alterações pendentes` : "Salve para aplicar a estrutura dos times"}</p>
        <button form="team-settings" type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando" : "Salvar configurações"}
        </button>
      </div> : null}
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
        className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none transition placeholder:text-[var(--cliente-card-text-soft)] focus:border-[var(--cliente-border-strong)] disabled:cursor-not-allowed disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-60"
      />
    </label>
  );
}

function QuickField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
    </label>
  );
}

