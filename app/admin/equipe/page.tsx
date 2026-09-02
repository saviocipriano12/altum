"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Lock,
  MailPlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Unlock,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { TimestampLike } from "@/app/types/domain";
import { isClientRole } from "@/lib/agency-roles";

type EditableRole = "admin" | "closer" | "sdr" | "agency_agent";
type UserStatus = "active" | "blocked";

type SystemUser = {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: EditableRole | string;
  status: UserStatus;
  commissionRate: number;
  asaasWalletId?: string | null;
  createdAt?: TimestampLike | number | null;
};

type Notice = {
  type: "ok" | "warn" | "err";
  text: string;
};

type FormState = {
  name: string;
  email: string;
  role: EditableRole;
  commissionRate: number;
  asaasWalletId: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  role: "sdr",
  commissionRate: 10,
  asaasWalletId: "",
};

const ROLE_LABEL: Record<EditableRole, string> = {
  admin: "Administrador",
  closer: "Closer",
  sdr: "SDR",
  agency_agent: "Operador",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

function formatDate(value?: TimestampLike | number | null) {
  if (!value) return "-";
  if (typeof value === "number") return new Date(value).toLocaleDateString("pt-BR");
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString("pt-BR");
  }
  return "-";
}

function roleLabel(role: string) {
  return ROLE_LABEL[role as EditableRole] || role || "Sem papel";
}

async function requestJson<T>(path: string, body: Record<string, unknown>) {
  const response = await authedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Falha na API");
  return data;
}

export default function TeamPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | EditableRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void authedFetch("/api/admin/users?includeInactive=true&detailed=true")
      .then(async (response) => {
        const payload = (await response.json()) as { items?: SystemUser[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Falha ao carregar equipe.");
        if (!cancelled) setUsers((payload.items || []).filter((item) => !isClientRole(item.role)));
      })
      .catch((error) => {
        console.error("Erro ao carregar equipe:", error);
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const metrics = useMemo(() => {
    const active = users.filter((user) => user.status === "active").length;
    const blocked = users.filter((user) => user.status === "blocked").length;
    const avgCommission = users.length
      ? users.reduce((sum, item) => sum + Number(item.commissionRate || 0), 0) / users.length
      : 0;
    return { active, blocked, avgCommission };
  }, [users]);

  const visibleUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (!term) return true;
      return (
        (user.name || "").toLowerCase().includes(term) ||
        (user.email || "").toLowerCase().includes(term)
      );
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openCreate() {
    setEditingUser(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEdit(user: SystemUser) {
    setEditingUser(user);
    setForm({
      name: user.name || "",
      email: user.email || "",
      role: (user.role === "admin" || user.role === "closer" || user.role === "sdr" || user.role === "agency_agent"
        ? user.role
        : "agency_agent") as EditableRole,
      commissionRate: Number(user.commissionRate || 0),
      asaasWalletId: user.asaasWalletId || "",
    });
    setModalOpen(true);
  }

  async function copyToClipboard(value: string) {
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      console.error("Falha ao copiar texto:", error);
      return false;
    }
  }

  async function saveUser() {
    if (!form.name.trim() || !form.email.trim()) {
      setNotice({ type: "warn", text: "Preencha nome e email." });
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        await requestJson<{ ok: boolean }>("/api/admin/users/update", {
          uid: editingUser.id,
          name: form.name.trim(),
          role: form.role,
          commissionRate: Number(form.commissionRate || 0),
          asaasWalletId: form.asaasWalletId.trim() || null,
        });
        setNotice({ type: "ok", text: "Colaborador atualizado com sucesso." });
      } else {
        const data = await requestJson<{ ok: boolean; inviteLink?: string }>("/api/admin/users/invite", {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          commissionRate: Number(form.commissionRate || 0),
          asaasWalletId: form.asaasWalletId.trim() || null,
        });

        if (data.inviteLink) {
          const copied = await copyToClipboard(data.inviteLink);
          setNotice({
            type: "ok",
            text: copied
              ? "Convite gerado. Link copiado para a area de transferencia."
              : "Convite gerado. Copie o link retornado pela API.",
          });
        } else {
          setNotice({ type: "ok", text: "Colaborador convidado com sucesso." });
        }
      }
      setRefreshKey((value) => value + 1);
      setModalOpen(false);
    } catch (error) {
      console.error("Erro ao salvar usuario:", error);
      setNotice({
        type: "err",
        text: error instanceof Error ? error.message : "Falha ao salvar usuario.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleUserStatus(user: SystemUser) {
    const block = user.status === "active";
    const endpoint = block ? "/api/admin/users/block" : "/api/admin/users/unblock";

    setBusyId(user.id);
    try {
      if (block) {
        const reason = window.prompt("Motivo do bloqueio (opcional):", "") || "";
        await requestJson<{ ok: boolean }>(endpoint, { uid: user.id, reason: reason.trim() || null });
        setNotice({ type: "ok", text: `Usuario ${user.name} bloqueado.` });
      } else {
        await requestJson<{ ok: boolean }>(endpoint, { uid: user.id });
        setNotice({ type: "ok", text: `Usuario ${user.name} desbloqueado.` });
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      setNotice({
        type: "err",
        text: error instanceof Error ? error.message : "Falha ao atualizar status.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function resendInvite(user: SystemUser) {
    setBusyId(user.id);
    try {
      const data = await requestJson<{ ok: boolean; inviteLink?: string }>("/api/admin/users/resend-invite", {
        uid: user.id,
      });

      if (data.inviteLink) {
        const copied = await copyToClipboard(data.inviteLink);
        setNotice({
          type: "ok",
          text: copied ? "Novo link de convite copiado." : "Convite reenviado.",
        });
      } else {
        setNotice({ type: "ok", text: "Convite reenviado com sucesso." });
      }
    } catch (error) {
      console.error("Erro ao reenviar convite:", error);
      setNotice({
        type: "err",
        text: error instanceof Error ? error.message : "Falha ao reenviar convite.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10 text-slate-900">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">Equipe da agencia</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950">
              <Users className="h-7 w-7 text-blue-600" />
              Gestao de equipe
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
              Convites, permissoes, comissao e bloqueio de colaboradores. Usuarios de cliente ficam fora desta area.
            </p>
          </div>

          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            <UserPlus className="h-4 w-4" />
            Novo colaborador
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Ativos" value={String(metrics.active)} />
        <MetricCard label="Bloqueados" value={String(metrics.blocked)} />
        <MetricCard label="Comissao media" value={`${metrics.avgCommission.toFixed(1)}%`} />
      </section>

      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            notice.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : notice.type === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar por nome ou email" className={inputClass} />
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | EditableRole)} className={inputClass}>
            <option value="all">Todos os papeis</option>
            <option value="admin">Administrador</option>
            <option value="agency_agent">Operador</option>
            <option value="closer">Closer</option>
            <option value="sdr">SDR</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | UserStatus)} className={inputClass}>
            <option value="all">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="blocked">Bloqueado</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-bold text-slate-700">
          Colaboradores cadastrados
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Papel</th>
                <th className="px-4 py-3 text-left">Comissao</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-medium text-slate-500">
                    Nenhum usuario encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                visibleUsers.map((user) => (
                  <tr key={user.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-950">{user.name || "Sem nome"}</p>
                      <p className="text-xs font-medium text-slate-500">{user.email || "-"}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Criado em {formatDate(user.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{roleLabel(user.role)}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{Number(user.commissionRate || 0)}%</p>
                      <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Wallet className="h-3.5 w-3.5" />
                        {user.asaasWalletId ? "Wallet conectada" : "Sem wallet"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-bold ${user.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                        {user.status === "active" ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <IconButton onClick={() => openEdit(user)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton onClick={() => resendInvite(user)} disabled={busyId === user.id} title="Reenviar convite">
                          {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailPlus className="h-3.5 w-3.5" />}
                        </IconButton>
                        <IconButton onClick={() => toggleUserStatus(user)} disabled={busyId === user.id} title={user.status === "active" ? "Bloquear" : "Desbloquear"}>
                          {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : user.status === "active" ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                {editingUser ? <Shield className="h-5 w-5 text-blue-600" /> : <Plus className="h-5 w-5 text-blue-600" />}
                {editingUser ? "Editar colaborador" : "Convidar colaborador"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Nome" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
              <Field label="Email" value={form.email} disabled={Boolean(editingUser)} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Papel</label>
                  <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as EditableRole }))} className={inputClass}>
                    <option value="sdr">SDR</option>
                    <option value="closer">Closer</option>
                    <option value="agency_agent">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <Field label="Comissao (%)" value={String(form.commissionRate)} onChange={(value) => setForm((prev) => ({ ...prev, commissionRate: Number(value || 0) }))} />
              </div>

              <Field label="Asaas Wallet ID" value={form.asaasWalletId} onChange={(value) => setForm((prev) => ({ ...prev, asaasWalletId: value }))} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModalOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" />
                Cancelar
              </button>
              <button onClick={saveUser} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-slate-600">{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} />
    </div>
  );
}
