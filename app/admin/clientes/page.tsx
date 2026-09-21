"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import type { TimestampLike } from "@/app/types/domain";

type ClientStatus = "Ativo" | "Em implantacao" | "Prospeccao";

interface Client {
  id: string;
  name: string;
  niche: string;
  city: string;
  contactName: string;
  email: string;
  phone: string;
  site?: string;
  status: ClientStatus | string;
  services: string[];
  companyKind?: "platform" | "commercial";
  createdAt?: TimestampLike | number | null;
}

const STATUS_OPTIONS: ClientStatus[] = ["Ativo", "Em implantacao", "Prospeccao"];

const inputClass =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function statusClass(status: string) {
  const lowered = status.toLowerCase();
  if (["ativo", "active"].includes(lowered)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (lowered.includes("implanta")) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function ClientesPage() {
  const { user, isAdmin } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsRefreshKey, setClientsRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    name: "",
    niche: "",
    city: "",
    contactName: "",
    email: "",
    phone: "",
    site: "",
    status: "Prospeccao" as ClientStatus,
    servicesText: "",
  });

  useEffect(() => {
    if (!user) {
      setClients([]);
      setLoading(false);
      return;
    }

    let active = true;
    void authedFetch("/api/clientes")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { items?: Client[]; error?: string; partial?: boolean };
        if (!response.ok) throw new Error(payload.error || "Falha ao carregar empresas.");
        if (active) {
          setClients(payload.items || []);
          setLoadError(payload.partial ? "Cobertura  a lista atingiu o limite de leitura. A operação da carteira apresenta a cobertura por fonte." : null);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Falha ao carregar empresas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };

    /* Legacy client-side listener kept in source history for migration context.
    const clientsRef = collection(db, "clientes");
    const clientsQuery = isAdmin
      ? query(clientsRef, orderBy("createdAt", "desc"))
      : query(clientsRef, where("ownerId", "==", user.uid));

    const unsubscribe = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const docs: Client[] = snapshot.docs.map((item) => {
          const data = item.data() as Partial<Client>;
          return {
            id: item.id,
            name: data.name || "Cliente",
            niche: data.niche || "Nao informado",
            city: data.city || "Nao informado",
            status: data.status || "Prospeccao",
            contactName: data.contactName || "Nao informado",
            email: data.email || "",
            phone: data.phone || "",
            site: data.site || "",
            services: Array.isArray(data.services) ? data.services : [],
            createdAt: data.createdAt ?? null,
          };
        });

        setClients(docs);
        setLoadError(null);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar clientes:", error);
        void authedFetch("/api/clientes")
          .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as { items?: Client[]; error?: string };
            if (!response.ok) throw new Error(payload.error || "Falha ao carregar empresas.");
            setClients(payload.items || []);
            setLoadError(null);
          })
          .catch((fallbackError) => {
            setLoadError(fallbackError instanceof Error ? fallbackError.message : "Falha ao carregar empresas.");
          })
          .finally(() => setLoading(false));
        setLoadError("Não foi possível carregar as empresas. Atualize a página ou confira suas permissões.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
    */
  }, [user, isAdmin, clientsRefreshKey]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matchingStatus = clients.filter(client => !statusFilter || (statusFilter === "active" ? ["ativo", "active"].includes((client.status || "").toLowerCase()) : !["ativo", "active"].includes((client.status || "").toLowerCase())));
    if (!term) return matchingStatus;
    return matchingStatus.filter((client) => {
      return (
        client.name.toLowerCase().includes(term) ||
        (client.niche || "").toLowerCase().includes(term) ||
        (client.city || "").toLowerCase().includes(term) ||
        (client.contactName || "").toLowerCase().includes(term)
      );
    });
  }, [clients, search, statusFilter]);

  const activeCount = clients.filter((client) =>
    ["ativo", "active"].includes((client.status || "").toLowerCase())
  ).length;

  async function handleCreateClient(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Preencha nome da empresa e e-mail.");
      return;
    }

    try {
      setFormError("");
      setCreating(true);
      const services = form.servicesText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const res = await authedFetch("/api/clientes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          niche: form.niche.trim() || "Nao informado",
          city: form.city.trim() || "Nao informado",
          contactName: form.contactName.trim() || "Nao informado",
          email: form.email.trim(),
          phone: form.phone.trim(),
          site: form.site.trim(),
          status: form.status,
          services,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao criar cliente.");

      setForm({
        name: "",
        niche: "",
        city: "",
        contactName: "",
        email: "",
        phone: "",
        site: "",
        status: "Prospeccao",
        servicesText: "",
      });
      setClientsRefreshKey((value) => value + 1);
      setShowCreate(false);
    } catch (error) {
      console.error("Erro ao criar cliente:", error);
      setFormError(error instanceof Error ? error.message : "Nao foi possivel criar o cliente.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteClient(client: Client) {
    const confirmed = window.confirm(
      `Excluir o cliente "${client.name}"? Projetos, propostas e historico vinculados nao serao apagados automaticamente.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(client.id);
      const res = await authedFetch("/api/clientes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir cliente.");
      setClientsRefreshKey((value) => value + 1);
    } catch (error) {
      console.error("Erro ao excluir cliente:", error);
      alert(error instanceof Error ? error.message : "Nao foi possivel excluir o cliente.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Empresas</h1><p className="mt-1 text-sm text-slate-500">{clients.length} empresas na carteira · {activeCount} ativas</p></div>
        <button onClick={() => { setShowCreate(!showCreate); setFormError(""); }} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700" aria-expanded={showCreate}><Plus size={16} />Nova empresa</button>
      </header>
      {showCreate && <form onSubmit={handleCreateClient} className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">Cadastrar empresa</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{([
          ["name", "Nome da empresa", true], ["email", "E-mail", true], ["contactName", "Contato principal", false], ["phone", "Telefone", false], ["niche", "Segmento", false], ["city", "Cidade / UF", false], ["site", "Site", false],
        ] as const).map(([key, label, required]) => <label key={key} className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">{label}{required ? " *" : ""}<input className={inputClass} required={required} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Situação<select className={inputClass} value={form.status} onChange={event => setForm(previous => ({ ...previous, status: event.target.value as ClientStatus }))}>{STATUS_OPTIONS.map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Serviços<input className={inputClass} placeholder="Separados por vírgula" value={form.servicesText} onChange={event => setForm(previous => ({ ...previous, servicesText: event.target.value }))} /></label>
        </div>
        {formError && <p role="alert" className="mt-4 text-sm text-red-700">{formError}</p>}
        <div className="mt-5 flex items-center gap-3"><button disabled={creating} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{creating ? "Salvando..." : "Cadastrar empresa"}</button><button type="button" disabled={creating} onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-slate-600">Cancelar</button></div>
      </form>}
      {loadError && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={18} />{loadError}</div>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4"><label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"><Search size={16} className="text-slate-400" /><input aria-label="Buscar empresa" placeholder="Buscar por empresa, contato ou segmento" className="w-full bg-transparent text-sm outline-none" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filtrar situação" className={inputClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todas as situações</option><option value="active">Ativas</option><option value="other">Outras situações</option></select></div>
        {loading ? <p className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando empresas...</p> : !filteredClients.length ? <div className="p-10 text-center"><p className="font-medium">{search || statusFilter ? "Nenhuma empresa encontrada" : "Sua carteira ainda está vazia"}</p><p className="mt-1 text-sm text-slate-500">{search || statusFilter ? "Ajuste a busca ou os filtros." : "Cadastre uma empresa para organizar sua operação."}</p></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">Empresa</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Contato</th><th className="px-5 py-3 font-medium">Serviços</th><th className="px-5 py-3 font-medium">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredClients.map(client => <tr key={client.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><Link href={`/admin/clientes/${client.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">{client.name}</Link><p className="mt-1 text-xs text-slate-500">{[client.niche, client.city].filter(Boolean).join(" · ") || "Segmento e cidade não informados"}</p></td><td className="px-5 py-4"><span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs ${statusClass(client.status || "")}`}>{client.status === "active" ? "Ativo" : client.status || "Prospeccao"}</span></td><td className="px-5 py-4"><p>{client.contactName || "Sem contato"}</p>{client.email && <a href={`mailto:${client.email}`} className="text-xs text-slate-500 hover:text-indigo-600">{client.email}</a>}{client.phone && <p className="text-xs text-slate-500">{client.phone}</p>}</td><td className="max-w-48 px-5 py-4 text-xs text-slate-500">{client.services?.join(", ") || "Sem serviços definidos"}</td><td className="px-5 py-4"><div className="flex items-center gap-4 whitespace-nowrap"><Link href={`/admin/clientes/${client.id}`} aria-label={`Abrir ${client.name}`} className="inline-flex items-center gap-1 font-medium text-indigo-600">Abrir<ArrowRight size={14} /></Link><details className="relative"><summary className="cursor-pointer text-xs text-slate-500">Mais</summary><div className="mt-2 min-w-44 rounded-lg border border-slate-200 bg-slate-50 p-2"><Link href={`/admin/clientes/${client.id}/portal`} className="block rounded px-3 py-2 text-xs hover:bg-slate-50">Contratos e acessos</Link><button onClick={() => void handleDeleteClient(client)} disabled={deletingId === client.id || client.companyKind === "platform"} className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} />{deletingId === client.id ? "Excluindo..." : "Excluir empresa"}</button></div></details></div></td></tr>)}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden">{filteredClients.map(client => <article key={client.id} className="p-4"><div className="flex items-start justify-between gap-3"><Link href={`/admin/clientes/${client.id}`} className="font-semibold hover:text-indigo-600">{client.name}</Link><span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${statusClass(client.status || "")}`}>{client.status === "active" ? "Ativo" : client.status || "Prospeccao"}</span></div><p className="mt-1 text-xs text-slate-500">{[client.niche, client.city].filter(Boolean).join(" · ") || "Segmento e cidade não informados"}</p>{client.email && <a href={`mailto:${client.email}`} className="mt-2 block break-all text-xs text-slate-500">{client.email}</a>}{client.phone && <p className="mt-1 text-xs text-slate-500">{client.phone}</p>}<div className="mt-4 flex items-center justify-between gap-3"><Link href={`/admin/clientes/${client.id}`} aria-label={`Abrir ${client.name}`} className="inline-flex items-center gap-1 font-medium text-indigo-600">Abrir empresa<ArrowRight size={14} /></Link><details className="text-xs text-slate-500"><summary className="cursor-pointer">Mais ações</summary><Link href={`/admin/clientes/${client.id}/portal`} className="mt-2 block py-2 text-indigo-600">Contratos e acessos</Link><button disabled={deletingId === client.id || client.companyKind === "platform"} onClick={() => void handleDeleteClient(client)} className="py-2 text-red-700 disabled:opacity-40">{deletingId === client.id ? "Excluindo..." : "Excluir empresa"}</button></details></div></article>)}</div></>}
        {!loading && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{filteredClients.length} empresas exibidas</p>}
      </section>
    </div>
  );
}
