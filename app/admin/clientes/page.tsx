"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import {
  ArrowRight,
  Globe2,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { db } from "@/firebaseConfig";
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
  createdAt?: TimestampLike | number | null;
}

const STATUS_OPTIONS: ClientStatus[] = ["Ativo", "Em implantacao", "Prospeccao"];

const inputClass =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function statusClass(status: string) {
  const lowered = status.toLowerCase();
  if (lowered.includes("ativo")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (lowered.includes("implanta")) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function ClientesPage() {
  const { user, isAdmin } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar clientes:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      return (
        client.name.toLowerCase().includes(term) ||
        (client.niche || "").toLowerCase().includes(term) ||
        (client.city || "").toLowerCase().includes(term) ||
        (client.contactName || "").toLowerCase().includes(term)
      );
    });
  }, [clients, search]);

  const activeCount = clients.filter((client) =>
    (client.status || "").toLowerCase().includes("ativo")
  ).length;

  async function handleCreateClient(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      alert("Preencha nome da empresa e email.");
      return;
    }

    try {
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
    } catch (error) {
      console.error("Erro ao criar cliente:", error);
      alert(error instanceof Error ? error.message : "Nao foi possivel criar o cliente.");
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
    } catch (error) {
      console.error("Erro ao excluir cliente:", error);
      alert(error instanceof Error ? error.message : "Nao foi possivel excluir o cliente.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Clientes</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
            Base de empresas atendidas pela Altum, com acesso rapido a contratos, projetos e operacao.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {activeCount} ativos - {clients.length} no total
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Buscar cliente
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              placeholder="Nome, nicho, cidade ou contato"
              className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>

        <form onSubmit={handleCreateClient} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Novo cliente rapido
            </p>
            <span className="text-[11px] font-medium text-slate-500">
              Conecta com projetos, propostas e financeiro
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <input className={inputClass} placeholder="Nome da empresa *" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <input className={inputClass} placeholder="Nicho / segmento" value={form.niche} onChange={(event) => setForm((prev) => ({ ...prev, niche: event.target.value }))} />
            <input className={inputClass} placeholder="Cidade / UF" value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} />
            <input className={inputClass} placeholder="Contato principal" value={form.contactName} onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))} />
            <input className={inputClass} placeholder="E-mail *" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
            <input className={inputClass} placeholder="WhatsApp / telefone" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
            <input className={inputClass} placeholder="Site (opcional)" value={form.site} onChange={(event) => setForm((prev) => ({ ...prev, site: event.target.value }))} />
            <select className={inputClass} value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ClientStatus }))}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className={`${inputClass} mt-2 w-full`}
            rows={2}
            placeholder="Servicos separados por virgula - Trafego, LP, Consultoria"
            value={form.servicesText}
            onChange={(event) => setForm((prev) => ({ ...prev, servicesText: event.target.value }))}
          />

          <button
            type="submit"
            disabled={creating}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {creating ? "Salvando..." : "Salvar cliente"}
          </button>
        </form>
      </div>

      <section className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
            <Loader2 size={16} className="animate-spin" />
            Carregando clientes...
          </div>
        ) : null}

        {!loading && filteredClients.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm font-medium text-slate-500">
            Nenhum cliente encontrado. Cadastre o primeiro usando o formulario acima.
          </p>
        ) : null}

        {filteredClients.map((client) => (
          <article
            key={client.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-slate-950">{client.name}</h2>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(client.status || "")}`}>
                    {client.status || "Prospeccao"}
                  </span>
                </div>

                <p className="text-xs font-medium text-slate-600">
                  {(client.niche || "Nicho nao informado") + " - " + (client.city || "Cidade nao informada")}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  Contato principal: <span className="font-bold text-slate-700">{client.contactName || "Nao informado"}</span>
                </p>

                {client.services?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {client.services.map((service) => (
                      <span key={service} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {service}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col items-start gap-2 text-xs font-medium text-slate-600 md:items-end">
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {client.email ? (
                    <span className="flex items-center gap-1">
                      <Mail size={14} className="text-slate-400" />
                      {client.email}
                    </span>
                  ) : null}
                  {client.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone size={14} className="text-slate-400" />
                      {client.phone}
                    </span>
                  ) : null}
                </div>

                {client.site ? (
                  <a
                    href={client.site.startsWith("http") ? client.site : `https://${client.site}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800"
                  >
                    <Globe2 size={14} />
                    {client.site}
                  </a>
                ) : null}

                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <Link
                    href={`/admin/clientes/${client.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Ver detalhes
                    <ArrowRight size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDeleteClient(client)}
                    disabled={deletingId === client.id}
                    className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === client.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
