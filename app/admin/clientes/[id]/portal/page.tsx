"use client";

import { FormEvent, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

type ContractDoc = {
  title?: string;
  status?: "ativo" | "encerrado" | "suspenso";
  monthlyValue?: number;
  dueDay?: number;
  startDate?: string;
  nextDueDate?: string;
  notes?: string;
  paymentLink?: string;
};

type PortalUserDoc = {
  id: string;
  email?: string;
  name?: string;
  status?: string;
};

export default function ClientePortalAdminPage() {
  const { isAdmin } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params.id;

  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingContract, setSavingContract] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [portalUsers, setPortalUsers] = useState<PortalUserDoc[]>([]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const [contract, setContract] = useState<ContractDoc>({
    title: "Contrato de Prestacao de Servicos",
    status: "ativo",
    monthlyValue: 0,
    dueDay: 10,
    startDate: "",
    nextDueDate: "",
    notes: "",
    paymentLink: "",
  });

  useEffect(() => {
    if (!isAdmin) {
      router.push("/admin/clientes");
    }
  }, [isAdmin, router]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const clientSnap = await getDoc(doc(db, "clientes", clientId));
      if (!clientSnap.exists()) {
        throw new Error("Cliente nao encontrado.");
      }
      const clientData = clientSnap.data() as { name?: string };
      setClientName(clientData.name || "Cliente");

      const [usersRes, contractRes] = await Promise.all([
        authedFetch(`/api/admin/client-portal/users/list?clientId=${encodeURIComponent(clientId)}`),
        authedFetch(`/api/admin/client-portal/contracts/get?clientId=${encodeURIComponent(clientId)}`),
      ]);

      const usersData = (await usersRes.json()) as { items?: PortalUserDoc[]; error?: string };
      const contractData = (await contractRes.json()) as { contract?: ContractDoc | null; error?: string };
      if (!usersRes.ok) throw new Error(usersData.error || "Falha ao carregar acessos.");
      if (!contractRes.ok) throw new Error(contractData.error || "Falha ao carregar contrato.");

      setPortalUsers(usersData.items || []);
      if (contractData.contract) {
        setContract({
          title: contractData.contract.title || "Contrato de Prestacao de Servicos",
          status: contractData.contract.status || "ativo",
          monthlyValue: Number(contractData.contract.monthlyValue || 0),
          dueDay: Number(contractData.contract.dueDay || 10),
          startDate: contractData.contract.startDate || "",
          nextDueDate: contractData.contract.nextDueDate || "",
          notes: contractData.contract.notes || "",
          paymentLink: contractData.contract.paymentLink || "",
        });
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao carregar portal do cliente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function invitePortalUser(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setInviteLink("");
    try {
      const res = await authedFetch("/api/admin/client-portal/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          email: inviteEmail.trim().toLowerCase(),
          name: inviteName.trim(),
        }),
      });
      const data = (await res.json()) as { inviteLink?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao convidar usuario.");

      setInviteLink(data.inviteLink || "");
      setInviteEmail("");
      setInviteName("");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao convidar usuario.");
    } finally {
      setInviting(false);
    }
  }

  async function saveContract(e: FormEvent) {
    e.preventDefault();
    setSavingContract(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/client-portal/contracts/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          ...contract,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao salvar contrato.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao salvar contrato.");
    } finally {
      setSavingContract(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/admin/clientes/${clientId}`}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao cliente
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Portal do Cliente</h1>
          <p className="text-sm text-white/60">
            Configuração de acesso e contrato do cliente: {clientName || "..." }
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-white/60 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando portal...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={invitePortalUser} className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-blue-300" />
              Convidar usuário do cliente
            </h2>

            <input
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Nome do usuário cliente"
            />
            <input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="email@cliente.com"
            />

            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Gerar convite
            </button>

            {inviteLink && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                <p className="text-xs text-emerald-100 mb-1">Link de ativação:</p>
                <textarea
                  readOnly
                  value={inviteLink}
                  className="w-full h-24 rounded border border-emerald-500/30 bg-black/40 p-2 text-xs text-emerald-100"
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-white/45">Acessos ativos</p>
              {portalUsers.length === 0 ? (
                <p className="text-sm text-white/55">Nenhum usuário convidado.</p>
              ) : (
                portalUsers.map((portalUser) => (
                  <div key={portalUser.id} className="rounded-lg border border-white/10 bg-black/40 p-2">
                    <p className="text-sm text-white/90">{portalUser.name || "Usuário"}</p>
                    <p className="text-xs text-white/55">
                      {portalUser.email || "-"} • {portalUser.status || "active"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </form>

          <form onSubmit={saveContract} className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Contrato do portal
            </h2>

            <input
              value={contract.title || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Título do contrato"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                value={contract.status || "ativo"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    status: e.target.value as ContractDoc["status"],
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="encerrado">Encerrado</option>
              </select>
              <input
                type="number"
                min={0}
                value={contract.monthlyValue || 0}
                onChange={(e) => setContract((prev) => ({ ...prev, monthlyValue: Number(e.target.value || 0) }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Valor mensal"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                min={1}
                max={31}
                value={contract.dueDay || 10}
                onChange={(e) => setContract((prev) => ({ ...prev, dueDay: Number(e.target.value || 10) }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Dia venc."
              />
              <input
                type="date"
                value={contract.startDate || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, startDate: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <input
                type="date"
                value={contract.nextDueDate || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, nextDueDate: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              />
            </div>

            <input
              value={contract.paymentLink || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, paymentLink: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Link de pagamento"
            />

            <textarea
              value={contract.notes || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full h-24 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Observações do contrato"
            />

            <button
              type="submit"
              disabled={savingContract}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
            >
              {savingContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar contrato
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
