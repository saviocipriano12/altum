"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import {
  Loader2,
  ArrowRight,
  Phone,
  Mail,
  Target,
  MapPin,
  Plus,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import type { TimestampLike } from "@/app/types/domain";

type PipelineStage =
  | "captado"
  | "contato_enviado"
  | "respondido"
  | "em_negociacao"
  | "proposta_enviada"
  | "fechado"
  | "perdido";

interface Lead {
  id: string;
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  status?: string;
  pipelineStage?: PipelineStage;
  createdAt?: TimestampLike | number | null;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  captado: "Captado",
  contato_enviado: "Contato enviado",
  respondido: "Respondido",
  em_negociacao: "Em negociação",
  proposta_enviada: "Proposta enviada",
  fechado: "Fechado",
  perdido: "Perdido",
};

const STAGE_BG: Record<PipelineStage, string> = {
  captado: "from-slate-900/80 via-slate-900 to-black",
  contato_enviado: "from-blue-950 via-slate-900 to-black",
  respondido: "from-emerald-950 via-slate-900 to-black",
  em_negociacao: "from-amber-950 via-slate-900 to-black",
  proposta_enviada: "from-purple-950 via-slate-900 to-black",
  fechado: "from-emerald-900 via-slate-900 to-black",
  perdido: "from-red-950 via-slate-900 to-black",
};

const STAGE_BORDER: Record<PipelineStage, string> = {
  captado: "border-slate-700/80",
  contato_enviado: "border-blue-600/60",
  respondido: "border-emerald-600/60",
  em_negociacao: "border-amber-500/70",
  proposta_enviada: "border-purple-500/70",
  fechado: "border-emerald-500/80",
  perdido: "border-red-600/60",
};

const PIPELINE_ORDER: PipelineStage[] = [
  "captado",
  "contato_enviado",
  "respondido",
  "em_negociacao",
  "proposta_enviada",
  "fechado",
  "perdido",
];

function toDate(value?: TimestampLike | number | string | null) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const [novoLead, setNovoLead] = useState({
    nome: "",
    origem: "",
  });

  useEffect(() => {
    if (!user) {
      setLeads([]);
      return;
    }
    let active = true;
    void authedFetch("/api/admin/dashboard?include=leads")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { leads?: Lead[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Falha ao carregar o pipeline.");
        if (active) {
          setLeads(
            [...(payload.leads || [])].sort(
              (a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime()
            )
          );
        }
      })
      .catch((error) => console.error("Erro ao carregar leads para pipeline:", error));
    return () => {
      active = false;
    };
  }, [user, refreshKey]);

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!novoLead.nome.trim()) return;

    try {
      setCreating(true);
      const res = await authedFetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: novoLead.nome.trim(),
          origem: novoLead.origem.trim() || "manual",
          status: "novo",
          pipelineStage: "captado",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao criar lead.");
      }

      setNovoLead({ nome: "", origem: "" });
      setRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("Erro ao criar lead manual no pipeline:", err);
    } finally {
      setCreating(false);
    }
  }

  const leadsByStage: Record<PipelineStage, Lead[]> = useMemo(() => {
    const base: Record<PipelineStage, Lead[]> = {
      captado: [],
      contato_enviado: [],
      respondido: [],
      em_negociacao: [],
      proposta_enviada: [],
      fechado: [],
      perdido: [],
    };

    for (const lead of leads) {
      const stage: PipelineStage =
        (lead.pipelineStage as PipelineStage) || "captado";
      base[stage].push(lead);
    }

    return base;
  }, [leads]);

  function getNextStage(current: PipelineStage): PipelineStage | null {
    const idx = PIPELINE_ORDER.indexOf(current);
    if (idx === -1 || idx === PIPELINE_ORDER.length - 1) return null;
    return PIPELINE_ORDER[idx + 1];
  }

  function getPrevStage(current: PipelineStage): PipelineStage | null {
    const idx = PIPELINE_ORDER.indexOf(current);
    if (idx <= 0) return null;
    return PIPELINE_ORDER[idx - 1];
  }

  async function moveLead(id: string, toStage: PipelineStage) {
    try {
      setMovingId(id);
      const res = await authedFetch("/api/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: id,
          patch: { pipelineStage: toStage },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao mover lead.");
      }
      setRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("Erro ao mover lead no pipeline:", err);
    } finally {
      setMovingId(null);
    }
  }

  const totalFechado = leadsByStage.fechado.length;
  const totalAtivos =
    leads.length - leadsByStage.perdido.length - leadsByStage.fechado.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Pipeline Comercial</h1>
          <p className="text-sm text-white/60">
            Visual completo das oportunidades da ALTUM, do primeiro contato ao fechamento.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5">
            Fechados:{" "}
            <span className="font-semibold text-emerald-100">{totalFechado}</span>
          </span>
          <span className="rounded-xl border border-blue-500/50 bg-blue-500/10 px-3 py-1.5">
            Em jogo:{" "}
            <span className="font-semibold text-blue-100">{totalAtivos}</span>
          </span>
          <span className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">
            Total de leads:{" "}
            <span className="font-semibold text-white">{leads.length}</span>
          </span>
        </div>
      </div>

      {/* Criar lead rápido */}
      <form
        onSubmit={handleCreateLead}
        className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Criar oportunidade manual
          </h2>
          <span className="text-[11px] text-white/40">
            Leads adicionados aqui entram direto no funil comercial.
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs outline-none placeholder:text-white/40"
            placeholder="Nome do lead / empresa *"
            value={novoLead.nome}
            onChange={(e) =>
              setNovoLead((f) => ({ ...f, nome: e.target.value }))
            }
          />
          <input
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs outline-none placeholder:text-white/40"
            placeholder="Origem (ex: Indicação, Insta, Prospecção...)"
            value={novoLead.origem}
            onChange={(e) =>
              setNovoLead((f) => ({ ...f, origem: e.target.value }))
            }
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium hover:bg-blue-500 transition disabled:opacity-60"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Adicionar ao funil
              </>
            )}
          </button>
        </div>
      </form>

      {/* Kanban simples */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-[900px]">
          {PIPELINE_ORDER.map((stage) => {
            const colunaLeads = leadsByStage[stage];
            const isEnd = stage === "fechado" || stage === "perdido";

            return (
              <div
                key={stage}
                className={`flex-1 rounded-2xl border ${STAGE_BORDER[stage]} bg-gradient-to-b ${STAGE_BG[stage]} p-3 flex flex-col`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/60">
                      {STAGE_LABELS[stage]}
                    </p>
                    <p className="text-xs text-white/40">
                      {stage === "captado" && "Entradas da máquina + manuais"}
                      {stage === "contato_enviado" && "Primeira abordagem feita"}
                      {stage === "respondido" && "Lead respondeu / abriu canal"}
                      {stage === "em_negociacao" && "Alinhando proposta e escopo"}
                      {stage === "proposta_enviada" && "Aguardando decisão"}
                      {stage === "fechado" && "Ganhamos o cliente 🎉"}
                      {stage === "perdido" && "Não fechou (motivo registrar depois)"}
                    </p>
                  </div>
                  <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/60 border border-white/10">
                    {colunaLeads.length}
                  </span>
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[460px] pr-1">
                  {colunaLeads.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/40 p-3 text-[11px] text-white/40">
                      Nenhuma oportunidade neste estágio.
                    </div>
                  )}

                  {colunaLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="rounded-xl border border-white/15 bg-black/40 p-3 text-xs text-white/80 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {lead.nome || "Lead sem nome"}
                          </p>
                          {lead.origem && (
                            <p className="mt-0.5 text-[11px] text-white/50 flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-white/40" />
                              Origem: {lead.origem}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-white/40">
                          {lead.id.slice(0, 5)}…
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] text-white/70">
                        {lead.telefone && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-white/40" />
                            {lead.telefone}
                          </p>
                        )}
                        {lead.email && (
                          <p className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-white/40" />
                            {lead.email}
                          </p>
                        )}
                        {lead.endereco && (
                          <p className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-white/40" />
                            {lead.endereco}
                          </p>
                        )}
                        {toDate(lead.createdAt) && (
                          <p className="flex items-center gap-1 text-white/50">
                            <Target className="h-3 w-3 text-white/40" />
                            {toDate(lead.createdAt)?.toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>

                      {/* Controles de movimento */}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1">
                          {getPrevStage(stage) && (
                            <button
                              disabled={movingId === lead.id}
                              onClick={() =>
                                moveLead(lead.id, getPrevStage(stage) as PipelineStage)
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 border border-white/10 hover:bg-white/10 transition disabled:opacity-50"
                            >
                              <ChevronLeft className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {!isEnd && getNextStage(stage) && (
                            <button
                              disabled={movingId === lead.id}
                              onClick={() =>
                                moveLead(lead.id, getNextStage(stage) as PipelineStage)
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 border border-blue-400/60 text-[11px] hover:bg-blue-500 transition disabled:opacity-50"
                            >
                              {movingId === lead.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ArrowRight className="h-3 w-3" />
                              )}
                              Próximo estágio
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


