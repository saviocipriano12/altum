"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MailPlus, ShieldCheck, UserCog } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type TenantUser = {
  id: string;
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  team?: string;
  availability?: string;
  allowedChannels?: string[];
  maxOpenChats?: number | null;
  capabilities?: string[];
};

type InviteForm = {
  name: string;
  email: string;
  role: InviteRole;
  team: string;
  availability: "online" | "busy" | "offline";
  allowedChannels: string;
  maxOpenChats: string;
  capabilities: string[];
};

const CAPABILITY_OPTIONS = [
  { id: "view_metrics", label: "Ver metricas" },
  { id: "respond_inbox", label: "Responder inbox" },
  { id: "edit_leads", label: "Editar leads" },
  { id: "manage_pipeline", label: "Gerir pipeline" },
  { id: "manage_commercial", label: "Gerir comercial" },
  { id: "manage_ai", label: "Gerir IA" },
  { id: "manage_automations", label: "Gerir automacoes" },
  { id: "manage_channels", label: "Gerir canais" },
  { id: "manage_users", label: "Gerir usuarios" },
  { id: "manage_settings", label: "Gerir configuracoes" },
] as const;

const DEFAULT_CAPABILITIES_BY_ROLE: Record<InviteRole | "client_owner", string[]> = {
  client_owner: CAPABILITY_OPTIONS.map((item) => item.id),
  client_admin: CAPABILITY_OPTIONS.map((item) => item.id),
  client_agent: ["view_metrics", "respond_inbox", "edit_leads", "manage_pipeline", "manage_commercial"],
  client_viewer: ["view_metrics"],
};

type InviteRole = "client_admin" | "client_agent" | "client_viewer";

export default function ClienteUsuariosPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [savingInvite, setSavingInvite] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    name: "",
    email: "",
    role: "client_viewer",
    team: "comercial",
    availability: "online",
    allowedChannels: "whatsapp",
    maxOpenChats: "12",
    capabilities: DEFAULT_CAPABILITIES_BY_ROLE.client_viewer,
  });

  const canManage = hasCapability("manage_users");

  const loadUsers = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/users`);
      const payload = (await res.json()) as { items?: TenantUser[]; error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao carregar usuarios.");
        return;
      }
      setUsers(payload.items || []);
    } catch {
      setError("Falha ao carregar usuarios do tenant.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((user) => user.role === "client_admin" || user.role === "client_owner").length,
    agents: users.filter((user) => user.role === "client_agent").length,
    blocked: users.filter((user) => user.status === "blocked").length,
  }), [users]);

  const capabilitySummary = useMemo(() => {
    return CAPABILITY_OPTIONS.map((capability) => ({
      id: capability.id,
      label: capability.label,
      total: users.filter((user) => (user.capabilities || []).includes(capability.id)).length,
    }))
      .filter((item) => item.total > 0)
      .slice(0, 6);
  }, [users]);

  const teamSummary = useMemo(() => {
    return Array.from(
      users.reduce((acc, user) => {
        const team = String(user.team || "sem time").trim() || "sem time";
        acc.set(team, (acc.get(team) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .map(([team, total]) => ({ team, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [users]);

  async function inviteUser(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    try {
      setSavingInvite(true);
      setError(null);
      setNotice(null);
      setInviteLink(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteForm.email,
          name: inviteForm.name,
          role: inviteForm.role,
          team: inviteForm.team,
          availability: inviteForm.availability,
          allowedChannels: inviteForm.allowedChannels,
          maxOpenChats: Number(inviteForm.maxOpenChats || 0),
          capabilities: inviteForm.capabilities,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; inviteLink?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao convidar usuario.");
        return;
      }
      setInviteForm({
        name: "",
        email: "",
        role: "client_viewer",
        team: "comercial",
        availability: "online",
        allowedChannels: "whatsapp",
        maxOpenChats: "12",
        capabilities: DEFAULT_CAPABILITIES_BY_ROLE.client_viewer,
      });
      setInviteLink(payload.inviteLink || null);
      setNotice("Usuario convidado com sucesso.");
      await loadUsers();
    } catch {
      setError("Falha ao convidar usuario do tenant.");
    } finally {
      setSavingInvite(false);
    }
  }

  async function updateUser(userId: string, patch: Record<string, unknown>) {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setBusyUserId(userId);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar usuario.");
        return;
      }
      await loadUsers();
    } catch {
      setError("Falha ao atualizar usuario do tenant.");
    } finally {
      setBusyUserId(null);
    }
  }

  function toggleInviteCapability(capabilityId: string) {
    setInviteForm((current) => ({
      ...current,
      capabilities: current.capabilities.includes(capabilityId)
        ? current.capabilities.filter((item) => item !== capabilityId)
        : [...current.capabilities, capabilityId],
    }));
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Usuarios e permissoes"
        subtitle="Controle quem opera o tenant e com qual nivel de acesso dentro do painel cliente."
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Usuarios" value={String(stats.total)} icon={UserCog} trend="tenant_users" />
        <MetricCard label="Admins" value={String(stats.admins)} icon={ShieldCheck} trend="governanca" />
        <MetricCard label="Operadores" value={String(stats.agents)} icon={UserCog} trend="client_agent" />
        <MetricCard label="Bloqueados" value={String(stats.blocked)} icon={MailPlus} trend="status inativo" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <form onSubmit={inviteUser} className="space-y-3">
            <CardTitle title="Convidar usuario" subtitle="Fluxo direto do tenant, sem depender do painel da agencia para cada novo operador." />
            <Field label="Nome" value={inviteForm.name} onChange={(value) => setInviteForm((current) => ({ ...current, name: value }))} />
            <Field label="E-mail" value={inviteForm.email} onChange={(value) => setInviteForm((current) => ({ ...current, email: value }))} />
            <Field label="Time" value={inviteForm.team} onChange={(value) => setInviteForm((current) => ({ ...current, team: value }))} />
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-[0.14em] text-white/55">Role</span>
              <select
                value={inviteForm.role}
                onChange={(event) =>
                  setInviteForm((current) => {
                    const nextRole = event.target.value as InviteRole;
                    return {
                      ...current,
                      role: nextRole,
                      capabilities: [...DEFAULT_CAPABILITIES_BY_ROLE[nextRole]],
                    };
                  })
                }
                className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="client_admin">client_admin</option>
                <option value="client_agent">client_agent</option>
                <option value="client_viewer">client_viewer</option>
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-white/55">Disponibilidade inicial</span>
                <select
                  value={inviteForm.availability}
                  onChange={(event) => setInviteForm((current) => ({ ...current, availability: event.target.value as InviteForm["availability"] }))}
                  className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                >
                  <option value="online">online</option>
                  <option value="busy">busy</option>
                  <option value="offline">offline</option>
                </select>
              </label>
              <Field label="Canais permitidos" value={inviteForm.allowedChannels} onChange={(value) => setInviteForm((current) => ({ ...current, allowedChannels: value }))} />
              <Field label="Limite de chats" value={inviteForm.maxOpenChats} onChange={(value) => setInviteForm((current) => ({ ...current, maxOpenChats: value }))} />
            </div>
            <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-white/55">Capacidades do usuario</p>
              <div className="grid gap-2 md:grid-cols-2">
                {CAPABILITY_OPTIONS.map((capability) => (
                  <label key={capability.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-sm text-white/78">
                    <input
                      type="checkbox"
                      checked={inviteForm.capabilities.includes(capability.id)}
                      onChange={() => toggleInviteCapability(capability.id)}
                      className="rounded border-white/20 bg-black/40"
                    />
                    {capability.label}
                  </label>
                ))}
              </div>
            </div>
            {canManage ? (
              <button
                type="submit"
                disabled={savingInvite}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
              >
                {savingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
                Convidar usuario
              </button>
            ) : (
              <p className="text-sm text-white/55">Seu perfil nao pode convidar usuarios.</p>
            )}
          </form>

          {inviteLink ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-white/70">
              <p className="font-medium text-white">Link de convite gerado</p>
              <p className="mt-1 break-all">{inviteLink}</p>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        </PanelCard>

        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Membros do tenant" subtitle="Roles e status operacionais do workspace cliente." />
            <StateBadge label={loading ? "sincronizando" : `${users.length} membros`} tone={loading ? "info" : "success"} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {teamSummary.map((item) => (
              <StateBadge key={item.team} label={`${item.team}: ${item.total}`} tone="neutral" />
            ))}
            {capabilitySummary.map((item) => (
              <StateBadge key={item.id} label={`${item.label}: ${item.total}`} tone="info" />
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="py-10 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-white/55">Nenhum usuario vinculado ao tenant.</p>
            ) : (
              users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{user.name || user.email || "Usuario"}</p>
                      <p className="mt-1 text-xs text-white/50">{user.email || user.userId || "Sem email"}</p>
                      <p className="mt-1 text-xs text-white/42">
                        {user.team || "sem time"} | {user.availability || "online"} | limite {user.maxOpenChats || "-"}
                      </p>
                    </div>
                  <div className="flex flex-wrap gap-2">
                      <StateBadge label={user.role || "client_viewer"} tone={user.role === "client_admin" || user.role === "client_owner" ? "info" : "neutral"} />
                      <StateBadge label={user.status || "active"} tone={user.status === "blocked" ? "warning" : "success"} />
                      {(user.allowedChannels || []).slice(0, 2).map((channel) => (
                        <StateBadge key={`${user.id}_${channel}`} label={channel} tone="neutral" />
                      ))}
                      {(user.capabilities || []).slice(0, 2).map((capability) => (
                        <StateBadge key={`${user.id}_${capability}`} label={capability} tone="info" />
                      ))}
                    </div>
                  </div>

                  {canManage && user.role !== "client_owner" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <select
                        defaultValue={user.role || "client_viewer"}
                        onChange={(event) => void updateUser(String(user.userId || ""), { role: event.target.value })}
                        disabled={busyUserId === user.userId}
                        className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
                      >
                        <option value="client_admin">client_admin</option>
                        <option value="client_agent">client_agent</option>
                        <option value="client_viewer">client_viewer</option>
                      </select>
                      <button
                        type="button"
                        disabled={busyUserId === user.userId}
                        onClick={() => void updateUser(String(user.userId || ""), { status: user.status === "blocked" ? "active" : "blocked" })}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/82 transition hover:bg-white/[0.06] disabled:opacity-60"
                      >
                        {user.status === "blocked" ? "Reativar" : "Bloquear"}
                      </button>
                    </div>
                  ) : null}

                  {canManage && user.role !== "client_owner" ? (
                    <>
                      <div className="mt-3 grid gap-2 md:grid-cols-4">
                        <input
                          defaultValue={user.team || ""}
                          placeholder="Time"
                          onBlur={(event) => {
                            if (event.target.value !== (user.team || "")) {
                              void updateUser(String(user.userId || ""), { team: event.target.value });
                            }
                          }}
                          className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                        />
                        <select
                          defaultValue={user.availability || "online"}
                          onChange={(event) => void updateUser(String(user.userId || ""), { availability: event.target.value })}
                          disabled={busyUserId === user.userId}
                          className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
                        >
                          <option value="online">online</option>
                          <option value="busy">busy</option>
                          <option value="offline">offline</option>
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          defaultValue={user.maxOpenChats || 12}
                          onBlur={(event) => {
                            const value = Number(event.target.value || 0);
                            if (value !== Number(user.maxOpenChats || 12)) {
                              void updateUser(String(user.userId || ""), { maxOpenChats: value });
                            }
                          }}
                          className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                        />
                        <input
                          defaultValue={(user.allowedChannels || []).join(", ")}
                          placeholder="whatsapp, instagram"
                          onBlur={(event) => {
                            if (event.target.value !== (user.allowedChannels || []).join(", ")) {
                              void updateUser(String(user.userId || ""), { allowedChannels: event.target.value });
                            }
                          }}
                          className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                        />
                      </div>
                      <div className="mt-3 space-y-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/55">Capacidades</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {CAPABILITY_OPTIONS.map((capability) => {
                            const enabled = (user.capabilities || []).includes(capability.id);
                            return (
                              <label key={`${user.id}_${capability.id}`} className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-sm text-white/78">
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => {
                                    const nextCapabilities = enabled
                                      ? (user.capabilities || []).filter((item) => item !== capability.id)
                                      : [...(user.capabilities || []), capability.id];
                                    void updateUser(String(user.userId || ""), { capabilities: nextCapabilities });
                                  }}
                                  className="rounded border-white/20 bg-black/40"
                                />
                                {capability.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
      />
    </label>
  );
}


