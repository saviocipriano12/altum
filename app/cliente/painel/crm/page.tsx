"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { EmptyState, MetricCard, PanelCard, SectionHeader } from "@/app/cliente/painel/components/ui";

type TimelineEvent = {
  id: string;
  title?: string;
  detail?: string;
  type?: string;
  createdAt?: unknown;
};

type LeadItem = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  status?: string;
  pipelineStage?: string;
  stage?: string;
  timeline?: TimelineEvent[];
};

const STAGE_OPTIONS = ["captado", "contato", "qualificacao", "proposta", "fechamento", "ganho", "perdido"];

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ClienteCrmPage() {
  const { tenant } = useClienteTenant();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [nextStage, setNextStage] = useState<string>("captado");
  const leadFromQuery = searchParams.get("leadId");

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads`);
        const payload = (await res.json()) as { items?: LeadItem[]; error?: string };

        if (!mounted) return;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar leads.");
          setLeads([]);
          return;
        }

        const nextLeads = payload.items || [];
        setLeads(nextLeads);

        const firstLead = nextLeads[0];
        if (firstLead) {
          const preferredLead =
            leadFromQuery && nextLeads.some((item) => item.id === leadFromQuery)
              ? leadFromQuery
              : firstLead.id;

          setSelectedLeadId((current) => current || preferredLead);

          const selected = nextLeads.find((item) => item.id === preferredLead) || firstLead;
          setNextStage(selected.pipelineStage || selected.stage || "captado");
        }
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar CRM do tenant.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId, leadFromQuery]);

  const selectedLead = useMemo(
    () => leads.find((item) => item.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  useEffect(() => {
    if (!selectedLead) return;
    setNextStage(selectedLead.pipelineStage || selectedLead.stage || "captado");
  }, [selectedLead]);

  const pipelineStats = useMemo(() => {
    const map = new Map<string, number>();
    STAGE_OPTIONS.forEach((stage) => map.set(stage, 0));

    for (const lead of leads) {
      const key = (lead.pipelineStage || lead.stage || "captado").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }

    return STAGE_OPTIONS.map((stage) => ({ stage, total: map.get(stage) || 0 }));
  }, [leads]);

  async function updateStage() {
    if (!tenant?.tenantId || !selectedLead || !nextStage) return;

    setSaving(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLead.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: nextStage }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar stage.");
        return;
      }

      const reload = await authedFetch(`/api/tenant/${tenant.tenantId}/leads`);
      const reloadPayload = (await reload.json()) as { items?: LeadItem[] };
      if (reload.ok) setLeads(reloadPayload.items || []);
    } catch {
      setError("Falha ao atualizar stage do lead.");
    } finally {
      setSaving(false);
    }
  }

  if (!loading && leads.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title="CRM" subtitle="Gestao de funil e timeline comercial." />
        <EmptyState title="Nenhum lead encontrado" description="Quando novos leads entrarem no tenant, o pipeline aparecera aqui." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="CRM" subtitle="Pipeline visual, atualizacao de stage e historico de evolucao do lead." />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pipelineStats.slice(0, 4).map((item) => (
          <MetricCard
            key={item.stage}
            label={item.stage}
            value={item.total.toLocaleString("pt-BR")}
            trend="leads nesta etapa"
          />
        ))}
      </section>

      <section className="grid min-h-[68vh] grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        <PanelCard className="overflow-hidden">
          <div className="border-b border-white/10 p-3 text-xs uppercase tracking-[0.16em] text-white/58">Leads</div>
          <div className="max-h-[68vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              leads.map((lead) => {
                const stage = lead.pipelineStage || lead.stage || "captado";
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full border-b border-white/5 px-3 py-3 text-left transition ${
                      selectedLeadId === lead.id ? "bg-blue-400/13" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-white/92">{lead.nome || "Lead"}</p>
                    <p className="mt-1 truncate text-xs text-white/55">{lead.email || lead.telefone || "Sem contato"}</p>
                    <p className="mt-1 text-[11px] text-blue-200">Stage: {stage}</p>
                  </button>
                );
              })
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          {selectedLead ? (
            <>
              <div>
                <h3 className="text-xl font-semibold text-white">{selectedLead.nome || "Lead"}</h3>
                <p className="mt-1 text-sm text-white/55">{selectedLead.email || selectedLead.telefone || "Sem contato"}</p>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-white/55">Mover stage</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={nextStage}
                    onChange={(event) => setNextStage(event.target.value)}
                    className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm outline-none"
                  >
                    {STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void updateStage()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar stage
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-3 text-xs uppercase tracking-[0.14em] text-white/55">Timeline do lead</p>
                <div className="max-h-[46vh] space-y-2 overflow-y-auto">
                  {(selectedLead.timeline || []).length === 0 && (
                    <p className="text-sm text-white/50">Sem eventos ainda.</p>
                  )}
                  {(selectedLead.timeline || []).map((event) => (
                    <div key={event.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <p className="text-sm text-white/92">{event.title || event.type || "Evento"}</p>
                      <p className="mt-1 text-xs text-white/58">{event.detail || "Sem detalhe"}</p>
                      <p className="mt-1 text-[10px] text-white/45">{formatDateTime(event.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/52">Selecione um lead para abrir o detalhe.</p>
          )}
        </PanelCard>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

