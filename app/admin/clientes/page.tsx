"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  Plus,
  Search,
  Mail,
  Phone,
  Globe2,
  ArrowRight,
  Loader2,
} from "lucide-react";

type ClientStatus = "Ativo" | "Em implantação" | "Prospecção";

interface Client {
  id: string;
  name: string;
  niche: string;
  city: string;
  status: ClientStatus;
  contactName: string;
  email: string;
  phone: string;
  site?: string;
  services: string[];
  createdAt?: any;
}

const STATUS_OPTIONS: ClientStatus[] = ["Ativo", "Em implantação", "Prospecção"];

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  // form novo cliente
  const [form, setForm] = useState({
    name: "",
    niche: "",
    city: "",
    contactName: "",
    email: "",
    phone: "",
    site: "",
    status: "Prospecção" as ClientStatus,
    servicesText: "",
  });

  // Carregar clientes do Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db, "clientes"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: Client[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Client, "id">),
        }));
        setClients(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar clientes:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // filtro simples por busca
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const term = search.toLowerCase();
    return clients.filter((client) => {
      return (
        client.name.toLowerCase().includes(term) ||
        client.niche.toLowerCase().includes(term) ||
        client.city.toLowerCase().includes(term) ||
        (client.contactName && client.contactName.toLowerCase().includes(term))
      );
    });
  }, [clients, search]);

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.email.trim()) return;

    try {
      setCreating(true);

      const services = form.servicesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await addDoc(collection(db, "clientes"), {
        name: form.name.trim(),
        niche: form.niche.trim() || "Não informado",
        city: form.city.trim() || "Não informado",
        contactName: form.contactName.trim() || "Não informado",
        email: form.email.trim(),
        phone: form.phone.trim(),
        site: form.site.trim(),
        status: form.status,
        services,
        createdAt: serverTimestamp(),
      });

      // limpa form
      setForm({
        name: "",
        niche: "",
        city: "",
        contactName: "",
        email: "",
        phone: "",
        site: "",
        status: "Prospecção",
        servicesText: "",
      });
    } catch (err) {
      console.error("Erro ao criar cliente:", err);
    } finally {
      setCreating(false);
    }
  }

  const ativos = clients.filter((c) => c.status === "Ativo").length;

  return (
    <div className="space-y-6">
      {/* Header da página */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Clientes</h1>
          <p className="text-sm text-white/60">
            Gerencie as empresas atendidas pela ALTUM, contratos e serviços ativos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          <span className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-500/10">
            {ativos} ativos • {clients.length} no total
          </span>
        </div>
      </div>

      {/* Filtro / busca + form rápido */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Busca */}
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Novo cliente rápido */}
        <form
          onSubmit={handleCreateClient}
          className="rounded-xl border border-white/10 bg-[#111111] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Novo cliente rápido
            </p>
            <span className="text-[11px] text-white/40">
              MVP • depois criamos tela completa de cadastro
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Nome da empresa *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Nicho / segmento"
              value={form.niche}
              onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Cidade / UF"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Contato principal"
              value={form.contactName}
              onChange={(e) =>
                setForm((f) => ({ ...f, contactName: e.target.value }))
              }
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="E-mail *"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="WhatsApp / telefone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Site (opcional)"
              value={form.site}
              onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}
            />
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as ClientStatus }))
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
            placeholder="Serviços (separados por vírgula) — ex: Tráfego, LP, Consultoria"
            value={form.servicesText}
            onChange={(e) =>
              setForm((f) => ({ ...f, servicesText: e.target.value }))
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

      {/* Lista de clientes */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" />
            Carregando clientes...
          </div>
        )}

        {!loading && filteredClients.length === 0 && (
          <p className="text-sm text-white/50">
            Nenhum cliente encontrado. Cadastre o primeiro usando o formulário acima.
          </p>
        )}

        {filteredClients.map((client) => (
          <div
            key={client.id}
            className="rounded-xl border border-white/10 bg-[#101010] p-4 hover:border-blue-500/60 transition"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              {/* Esquerda */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white/90">
                    {client.name}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      client.status === "Ativo"
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                        : client.status === "Em implantação"
                        ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
                        : "bg-blue-500/10 text-blue-300 border border-blue-500/40"
                    }`}
                  >
                    {client.status}
                  </span>
                </div>

                <p className="text-xs text-white/60">
                  {client.niche} • {client.city}
                </p>
                <p className="text-[11px] text-white/50">
                  Contato principal:{" "}
                  <span className="text-white/80">{client.contactName}</span>
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

              {/* Direita */}
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
                  <button className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200">
                    <Globe2 size={14} />
                    <span>{client.site}</span>
                  </button>
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
