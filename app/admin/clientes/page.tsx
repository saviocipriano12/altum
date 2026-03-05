"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import type { TimestampLike } from "@/app/types/domain";
import {
  Plus,
  Search,
  Mail,
  Phone,
  Globe2,
  ArrowRight,
  Loader2,
} from "lucide-react";

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

function statusClass(status: string) {
  const lowered = status.toLowerCase();
  if (lowered.includes("ativo")) {
    return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40";
  }
  if (lowered.includes("implanta")) {
    return "bg-amber-500/10 text-amber-300 border border-amber-500/40";
  }
  return "bg-blue-500/10 text-blue-300 border border-blue-500/40";
}

export default function ClientesPage() {
  const { user, isAdmin } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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
    if (!search.trim()) return clients;
    const term = search.toLowerCase();
    return clients.filter((client) => {
      return (
        client.name.toLowerCase().includes(term) ||
        (client.niche || "").toLowerCase().includes(term) ||
        (client.city || "").toLowerCase().includes(term) ||
        (client.contactName || "").toLowerCase().includes(term)
      );
    });
  }, [clients, search]);

  async function handleCreateClient(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;

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
      const data = await res.json();
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
      alert("Nao foi possivel criar o cliente.");
    } finally {
      setCreating(false);
    }
  }

  const ativos = clients.filter((client) =>
    (client.status || "").toLowerCase().includes("ativo")
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Clientes</h1>
          <p className="text-sm text-white/60">
            Gerencie as empresas atendidas pela ALTUM, contratos e servicos ativos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          <span className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-500/10">
            {ativos} ativos • {clients.length} no total
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Buscar cliente
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white/80">
            <Search size={16} className="text-white/40" />
            <input
              placeholder="Nome, nicho, cidade ou contato"
              className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <form
          onSubmit={handleCreateClient}
          className="rounded-xl border border-white/10 bg-[#111111] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Novo cliente rapido
            </p>
            <span className="text-[11px] text-white/40">
              Fluxo conectado com Projetos, Orcamentos e Financeiro
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Nome da empresa *"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Nicho / segmento"
              value={form.niche}
              onChange={(event) => setForm((prev) => ({ ...prev, niche: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Cidade / UF"
              value={form.city}
              onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Contato principal"
              value={form.contactName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contactName: event.target.value }))
              }
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="E-mail *"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="WhatsApp / telefone"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Site (opcional)"
              value={form.site}
              onChange={(event) => setForm((prev) => ({ ...prev, site: event.target.value }))}
            />
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as ClientStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className="mt-2 w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
            rows={2}
            placeholder="Servicos (separados por virgula) - ex: Trafego, LP, Consultoria"
            value={form.servicesText}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, servicesText: event.target.value }))
            }
          />

          <button
            type="submit"
            disabled={creating}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Plus size={14} />
                Salvar cliente
              </>
            )}
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" />
            Carregando clientes...
          </div>
        )}

        {!loading && filteredClients.length === 0 && (
          <p className="text-sm text-white/50">
            Nenhum cliente encontrado. Cadastre o primeiro usando o formulario acima.
          </p>
        )}

        {filteredClients.map((client) => (
          <div
            key={client.id}
            className="rounded-xl border border-white/10 bg-[#101010] p-4 hover:border-blue-500/60 transition"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white/90">{client.name}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClass(
                      client.status || ""
                    )}`}
                  >
                    {client.status || "Prospeccao"}
                  </span>
                </div>

                <p className="text-xs text-white/60">
                  {(client.niche || "Nicho nao informado") + " • " + (client.city || "Cidade nao informada")}
                </p>
                <p className="text-[11px] text-white/50">
                  Contato principal: <span className="text-white/80">{client.contactName || "Nao informado"}</span>
                </p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {client.services?.map((service) => (
                    <span
                      key={service}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70"
                    >
                      {service}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 text-xs text-white/70 md:items-end">
                <div className="flex flex-wrap gap-2">
                  {client.email && (
                    <div className="flex items-center gap-1">
                      <Mail size={14} className="text-white/40" />
                      <span>{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1">
                      <Phone size={14} className="text-white/40" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                </div>

                {client.site && (
                  <a
                    href={client.site.startsWith("http") ? client.site : `https://${client.site}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200"
                  >
                    <Globe2 size={14} />
                    <span>{client.site}</span>
                  </a>
                )}

                <Link
                  href={`/admin/clientes/${client.id}`}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] hover:bg-white/10 transition"
                >
                  <span>Ver detalhes do cliente</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
