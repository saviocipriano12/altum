"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
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
import { db } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { TimestampLike } from "@/app/types/domain";

type UserRole = "admin" | "closer" | "sdr" | "client";
type UserStatus = "active" | "blocked";

type SystemUser = {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: UserRole;
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
  role: UserRole;
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

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  closer: "Closer",
  sdr: "SDR",
  client: "Cliente",
};

function formatDate(value?: TimestampLike | number | null) {
  if (!value) return "-";
  if (typeof value === "number") return new Date(value).toLocaleDateString("pt-BR");
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString("pt-BR");
  }
  return "-";
}

async function requestJson<T>(path: string, body: Record<string, unknown>) {
  const response = await authedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Falha na API");
  }
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
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<SystemUser, "id">),
        })) as SystemUser[];
        const filtered = next.filter((item) => item.role !== "client");
        setUsers(filtered);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar equipe:", error);
        setUsers([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
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
      role: user.role || "sdr",
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
      } else {
        const data = await requestJson<{ ok: boolean; inviteLink?: string }>(
          "/api/admin/users/invite",
          {
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            role: form.role,
            commissionRate: Number(form.commissionRate || 0),
            asaasWalletId: form.asaasWalletId.trim() || null,
          }
        );

        if (data.inviteLink) {
          const copied = await copyToClipboard(data.inviteLink);
          setNotice({
            type: "ok",
            text: copied
              ? "Convite gerado. Link copiado para a area de transferencia."
              : "Convite gerado. Copie o link no log da API para compartilhar.",
          });
        } else {
          setNotice({ type: "ok", text: "Colaborador convidado com sucesso." });
        }
      }

      setModalOpen(false);
      if (editingUser) {
        setNotice({ type: "ok", text: "Colaborador atualizado com sucesso." });
      }
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
        await requestJson<{ ok: boolean }>(endpoint, {
          uid: user.id,
          reason: reason.trim() || null,
        });
        setNotice({ type: "ok", text: `Usuario ${user.name} bloqueado.` });
      } else {
        await requestJson<{ ok: boolean }>(endpoint, { uid: user.id });
        setNotice({ type: "ok", text: `Usuario ${user.name} desbloqueado.` });
      }
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
      const data = await requestJson<{ ok: boolean; inviteLink?: string }>(
        "/api/admin/users/resend-invite",
        {
          uid: user.id,
        }
      );

      if (data.inviteLink) {
        const copied = await copyToClipboard(data.inviteLink);
        setNotice({
          type: "ok",
          text: copied
            ? "Novo link de convite copiado para a area de transferencia."
            : "Convite reenviado. Copie o link retornado pela API.",
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
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/45">IAM Interno</p>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-400" />
              Gestao de Equipe
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Convite, permissao e bloqueio centralizados via API segura.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition"
          >
            <UserPlus className="h-4 w-4" />
            Novo colaborador
          </button>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        <MetricCard label="Ativos" value={String(metrics.active)} />
        <MetricCard label="Bloqueados" value={String(metrics.blocked)} />
        <MetricCard label="Comissao media" value={`${metrics.avgCommission.toFixed(1)}%`} />
      </section>

      {notice && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            notice.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : notice.type === "warn"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {notice.text}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-[#111] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nome ou email"
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          />

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          >
            <option value="all">Todos os papeis</option>
            <option value="admin">Administrador</option>
            <option value="closer">Closer</option>
            <option value="sdr">SDR</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | UserStatus)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="blocked">Bloqueado</option>
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0f0f0f] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm text-white/75">
          Membros cadastrados
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/45 uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Papel</th>
                <th className="px-4 py-3 text-left">Comissao</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/55">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/55">
                    Nenhum usuario encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                visibleUsers.map((user) => (
                  <tr key={user.id} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white/90">{user.name || "Sem nome"}</p>
                      <p className="text-xs text-white/45">{user.email || "-"}</p>
                      <p className="text-[11px] text-white/30 mt-1">
                        Criado em {formatDate(user.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-white/75">{ROLE_LABEL[user.role] || user.role}</td>
                    <td className="px-4 py-3">
                      <p className="text-white/85">{Number(user.commissionRate || 0)}%</p>
                      <p className="text-xs text-white/40 inline-flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5" />
                        {user.asaasWalletId ? "Wallet conectada" : "Sem wallet"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded-lg text-xs border ${
                          user.status === "active"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100"
                            : "bg-red-500/10 border-red-500/30 text-red-100"
                        }`}
                      >
                        {user.status === "active" ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(user)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => resendInvite(user)}
                          disabled={busyId === user.id}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
                          title="Reenviar convite"
                        >
                          {busyId === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MailPlus className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => toggleUserStatus(user)}
                          disabled={busyId === user.id}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
                        >
                          {busyId === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : user.status === "active" ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#121212] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {editingUser ? <Shield className="h-5 w-5 text-blue-300" /> : <Plus className="h-5 w-5 text-blue-300" />}
                {editingUser ? "Editar colaborador" : "Convidar colaborador"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field
                label="Nome"
                value={form.name}
                onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
              />

              <Field
                label="Email"
                value={form.email}
                disabled={Boolean(editingUser)}
                onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Papel</label>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                  >
                    <option value="sdr">SDR</option>
                    <option value="closer">Closer</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <Field
                  label="Comissao (%)"
                  value={String(form.commissionRate)}
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      commissionRate: Number(value || 0),
                    }))
                  }
                />
              </div>

              <Field
                label="Asaas Wallet ID"
                value={form.asaasWalletId}
                onChange={(value) => setForm((prev) => ({ ...prev, asaasWalletId: value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setModalOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Cancelar
              </button>
              <button
                onClick={saveUser}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111] p-4">
      <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
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
      <label className="text-xs text-white/50 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none disabled:opacity-60"
      />
    </div>
  );
}
