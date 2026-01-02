"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe2,
  MapPin,
  Calendar,
  BadgeCheck,
  Loader2,
  FileText,
  Zap,
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

export default function ClienteDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClient() {
      try {
        const ref = doc(db, "clientes", params.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setClient({ id: snap.id, ...(snap.data() as Omit<Client, "id">) });
        } else {
          setClient(null);
        }
      } catch (err) {
        console.error("Erro ao buscar cliente:", err);
        setClient(null);
      } finally {
        setLoading(false);
      }
    }

    fetchClient();
  }, [params.id]);

  const createdAtFormatted =
    client?.createdAt?.toDate &&
    new Date(client.createdAt.toDate()).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando cliente...
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/clientes")}
          className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para lista de clientes
        </button>

        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          Cliente não encontrado. Verifique se o link está correto ou tente novamente
          pela lista de clientes.
        </div>
      </div>
    );
  }

  const statusColor =
    client.status === "Ativo"
      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
      : client.status === "Em implantação"
      ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
      : "bg-blue-500/10 text-blue-300 border border-blue-500/40";

  return (
    <div className="space-y-6">
      {/* Topo / breadcrumb */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <button
            onClick={() => router.push("/admin/clientes")}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para clientes
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-wide">
              {client.name}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusColor}`}
            >
              {client.status}
            </span>
          </div>

          <p className="text-sm text-white/60">
            {client.niche} • {client.city || "Cidade não informada"}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 text-xs text-white/70 md:items-end">
          {createdAtFormatted && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-white/40" />
              <span>Cliente criado em {createdAtFormatted}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-emerald-300">
            <BadgeCheck className="h-4 w-4" />
            <span>Cliente da ALTUM</span>
          </div>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bloco info principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contato */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Informações de contato
            </h2>

            <p className="text-xs text-white/60">
              Contato principal:{" "}
              <span className="text-white/90 font-medium">
                {client.contactName || "Não informado"}
              </span>
            </p>

            <div className="flex flex-wrap gap-3 text-xs text-white/80">
              {client.email && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 border border-white/10">
                  <Mail className="h-4 w-4 text-white/40" />
                  <span>{client.email}</span>
                </div>
              )}

              {client.phone && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 border border-white/10">
                  <Phone className="h-4 w-4 text-white/40" />
                  <span>{client.phone}</span>
                </div>
              )}

              {client.site && (
                <button className="inline-flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 border border-white/10 text-blue-300 hover:text-blue-200">
                  <Globe2 className="h-4 w-4" />
                  <span>{client.site}</span>
                </button>
              )}
            </div>
          </div>

          {/* Serviços contratados */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                Serviços / escopo
              </h2>
              <FileText className="h-4 w-4 text-white/40" />
            </div>

            {client.services && client.services.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.services.map((service) => (
                  <span
                    key={service}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80"
                  >
                    {service}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/50">
                Nenhum serviço especificado ainda. Depois vamos conectar aqui com
                o módulo de projetos, contratos e Máquina de Prospecção.
              </p>
            )}
          </div>

          {/* Espaço para integração com máquina de prospecção */}
          <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-[#071A14] via-[#040708] to-black p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100">
                Máquina de Prospecção • visão deste cliente
              </h2>
              <Zap className="h-4 w-4 text-emerald-300" />
            </div>

            <p className="text-xs text-emerald-100/80">
              Em breve: aqui você vai ver quantos leads, reuniões e oportunidades este
              cliente está gerando dentro da Máquina de Prospecção da ALTUM.
            </p>

            <div className="grid gap-2 sm:grid-cols-3 text-[11px] text-emerald-100/80">
              <div className="rounded-lg border border-emerald-500/30 bg-black/40 p-2">
                <p className="text-[10px] uppercase tracking-wide">
                  Leads gerados
                </p>
                <p className="mt-1 text-lg font-semibold">–</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-black/40 p-2">
                <p className="text-[10px] uppercase tracking-wide">
                  Reuniões marcadas
                </p>
                <p className="mt-1 text-lg font-semibold">–</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-black/40 p-2">
                <p className="text-[10px] uppercase tracking-wide">
                  Última atividade
                </p>
                <p className="mt-1 text-xs">Integração futura</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita: resumo / próximos passos */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Resumo rápido
            </h2>

            <div className="space-y-2 text-xs text-white/70">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-white/40 mt-0.5" />
                <span>{client.city || "Cidade não informada"}</span>
              </div>

              <p>
                Status atual:{" "}
                <span className="font-medium text-white/90">
                  {client.status}
                </span>
              </p>

              <p className="text-white/60">
                Use esta tela como central do cliente: em breve vamos conectar
                projetos, contratos, financeiro e dados da Máquina de Prospecção.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Próximas ações (MVP)
            </h2>
            <ul className="space-y-1 text-xs text-white/70">
              <li>• Definir exatamente quais serviços estão ativos.</li>
              <li>• Criar projeto/escopo desse cliente no módulo de Projetos.</li>
              <li>• Conectar este cliente à Máquina de Prospecção (quando estiver ativa).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
