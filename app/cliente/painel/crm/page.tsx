"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [nextStage, setNextStage] = useState<string>("captado");

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
          setSelectedLeadId((current) => current || firstLead.id);
          setNextStage(firstLead.pipelineStage || firstLead.stage || "captado");
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
  }, [tenant?.tenantId]);

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
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/leads/${selectedLead.id}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: nextStage }),
        }
      );

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar stage.");
        return;
      }

      const reload = await authedFetch(`/api/tenant/${tenant.tenantId}/leads`);
      const reloadPayload = (await reload.json()) as { items?: LeadItem[] };
      if (reload.ok) {
        setLeads(reloadPayload.items || []);
      }
    } catch {
      setError("Falha ao atualizar stage do lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pipelineStats.map((item) => (
          <div key={item.stage} className="rounded-xl border border-white/10 bg-[#111] p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/45">{item.stage}</p>
            <p className="text-2xl font-semibold mt-1">{item.total}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-[65vh]">
        <div className="rounded-2xl border border-white/10 bg-[#101010] overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm uppercase tracking-wide text-white/70">Leads</h2>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-white/60">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : leads.length === 0 ? (
              <div className="p-6 text-sm text-white/50">Nenhum lead encontrado neste tenant.</div>
            ) : (
              leads.map((lead) => {
                const stage = lead.pipelineStage || lead.stage || "captado";
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full text-left p-3 border-b border-white/5 transition hover:bg-white/5 ${
                      selectedLeadId === lead.id ? "bg-blue-500/15" : ""
                    }`}
                  >
                    <p className="text-sm font-medium text-white/90 truncate">{lead.nome || "Lead"}</p>
                    <p className="text-xs text-white/55 truncate">{lead.email || lead.telefone || "Sem contato"}</p>
                    <p className="text-[11px] text-blue-300/90 mt-1">Stage: {stage}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#101010] p-4 space-y-4">
          {selectedLead ? (
            <>
              <div>
                <h3 className="text-lg font-semibold">{selectedLead.nome || "Lead"}</h3>
                <p className="text-sm text-white/55">{selectedLead.email || selectedLead.telefone || "Sem contato"}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Pipeline</p>
                <div className="flex gap-2 items-center">
                  <select
                    value={nextStage}
                    onChange={(event) => setNextStage(event.target.value)}
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
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
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar stage
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50 mb-3">Timeline do lead</p>
                <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                  {(selectedLead.timeline || []).length === 0 && (
                    <p className="text-sm text-white/50">Sem eventos ainda.</p>
                  )}
                  {(selectedLead.timeline || []).map((event) => (
                    <div key={event.id} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                      <p className="text-sm text-white/90">{event.title || event.type || "Evento"}</p>
                      <p className="text-xs text-white/55">{event.detail || "Sem detalhe"}</p>
                      <p className="text-[10px] text-white/40 mt-1">{formatDateTime(event.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/50">Selecione um lead para abrir CRM e timeline.</p>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
