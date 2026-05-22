"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Upload,
  UsersRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CustomerProfileDrawer } from "@/app/cliente/painel/components/customer-profile-drawer";
import {
  CrmAvatar,
  CrmBadge,
  CrmButton,
  CrmEmpty,
  CrmHero,
  CrmInput,
  CrmLinkButton,
  CrmMetric,
  CrmNotice,
  CrmPanel,
  CrmSectionTitle,
  CrmSelect,
  CrmTextarea,
  CrmWorkspace,
  formatCrmDate,
  formatCrmMoney,
} from "@/app/cliente/painel/components/crm-workspace";
import { getPipelineStageLabel, normalizePipelineStageId, type PipelineStageDefinition } from "@/lib/pipeline";

type LeadTask = {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  priority?: string;
  dueAt?: unknown;
};

type LeadNote = {
  id: string;
  text?: string;
  authorName?: string;
  createdAt?: unknown;
};

type RelatedChat = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  channel?: string;
  status?: string;
  priority?: string;
  ownerName?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  unreadCount?: number;
};

type LeadQualification = {
  score?: number;
  label?: string;
  recommendedStage?: string;
  nextAction?: string;
};

type LeadItem = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  status?: string;
  pipelineStage?: string;
  stage?: string;
  owner?: string;
  ownerId?: string;
  score?: number | null;
  heat?: string;
  priority?: string;
  potentialValue?: number | null;
  tags?: string[];
  notes?: string;
  qualification?: LeadQualification;
  chatSummary?: {
    total?: number;
    open?: number;
    pending?: number;
    unresolved?: number;
    highPriority?: number;
    lastInteractionAt?: unknown;
  };
};

type LeadDetailPayload = {
  lead: LeadItem;
  notes?: LeadNote[];
  tasks?: LeadTask[];
  relatedChats?: RelatedChat[];
  qualification?: LeadQualification;
  stagePolicy?: {
    stageLabel?: string;
    ownerName?: string | null;
    slaBreached?: boolean;
  };
  error?: string;
};

type LeadImportPayload = {
  ok?: boolean;
  summary?: {
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
  };
  error?: string;
};

type ViewKey = "list" | "pipeline" | "analytics";

const heatOptions = ["frio", "morno", "quente"];
const priorityOptions = ["low", "medium", "high"];

function heatTone(value?: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "quente") return "red" as const;
  if (normalized === "morno") return "orange" as const;
  if (normalized === "frio") return "neutral" as const;
  return "blue" as const;
}

function normalizeStage(lead: LeadItem) {
  return normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
}

function whatsappUrl(phone?: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export default function ClienteCrmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const viewFromQuery = (searchParams.get("view") || "list") as ViewKey;
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("edit_leads");

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [stages, setStages] = useState<PipelineStageDefinition[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leadFromQuery);
  const [detail, setDetail] = useState<LeadDetailPayload | null>(null);
  const [view, setView] = useState<ViewKey>(viewFromQuery === "pipeline" || viewFromQuery === "analytics" ? viewFromQuery : "list");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [heatFilter, setHeatFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [nextStage, setNextStage] = useState("captado");
  const [taskTitle, setTaskTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [editing, setEditing] = useState(false);
  const [leadForm, setLeadForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    origem: "",
    channel: "",
    priority: "medium",
    heat: "morno",
    potentialValue: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, pipelineRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
        authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`),
      ]);
      const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };
      const pipelinePayload = (await pipelineRes.json().catch(() => ({}))) as { stages?: PipelineStageDefinition[] };
      if (!leadsRes.ok || leadsPayload.error) throw new Error(leadsPayload.error || "Falha ao carregar CRM.");
      const nextLeads = leadsPayload.items || [];
      setLeads(nextLeads);
      setStages(pipelinePayload.stages || []);
      const nextSelected = leadFromQuery || selectedLeadId || nextLeads[0]?.id || null;
      setSelectedLeadId(nextSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar CRM.");
    } finally {
      setLoading(false);
    }
  }, [leadFromQuery, selectedLeadId, tenant?.tenantId]);

  const loadDetail = useCallback(async (leadId: string | null) => {
    if (!tenant?.tenantId || !leadId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}`);
      const payload = (await res.json()) as LeadDetailPayload;
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao carregar ficha.");
      setDetail(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ficha.");
    } finally {
      setDetailLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (leadFromQuery) setSelectedLeadId(leadFromQuery);
  }, [leadFromQuery]);

  useEffect(() => {
    loadDetail(selectedLeadId);
  }, [loadDetail, selectedLeadId]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || detail?.lead || null, [detail?.lead, leads, selectedLeadId]);

  useEffect(() => {
    if (!selectedLead) return;
    const stage = normalizeStage(selectedLead);
    setNextStage(stage);
    setLeadForm({
      nome: selectedLead.nome || "",
      email: selectedLead.email || "",
      telefone: selectedLead.telefone || "",
      empresa: selectedLead.empresa || "",
      origem: selectedLead.origem || "",
      channel: selectedLead.channel || "",
      priority: selectedLead.priority || "medium",
      heat: selectedLead.heat || "morno",
      potentialValue: selectedLead.potentialValue ? String(selectedLead.potentialValue) : "",
      notes: selectedLead.notes || "",
    });
  }, [selectedLead]);

  const stageOptions = useMemo(() => {
    const fromPipeline = stages.map((stage) => stage.id).filter(Boolean);
    const fromLeads = leads.map(normalizeStage);
    return Array.from(new Set(["captado", ...fromPipeline, ...fromLeads]));
  }, [leads, stages]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const stage = normalizeStage(lead);
      if (stageFilter !== "all" && stage !== stageFilter) return false;
      if (heatFilter !== "all" && String(lead.heat || "").toLowerCase() !== heatFilter) return false;
      if (!term) return true;
      return `${lead.nome || ""} ${lead.empresa || ""} ${lead.email || ""} ${lead.telefone || ""} ${lead.owner || ""}`.toLowerCase().includes(term);
    });
  }, [heatFilter, leads, search, stageFilter]);

  const summary = useMemo(() => {
    const totalValue = filteredLeads.reduce((sum, lead) => sum + (lead.potentialValue || 0), 0);
    const hot = filteredLeads.filter((lead) => String(lead.heat || "").toLowerCase() === "quente").length;
    const noOwner = filteredLeads.filter((lead) => !lead.owner && !lead.ownerId).length;
    const proposal = filteredLeads.filter((lead) => normalizeStage(lead).includes("proposta")).length;
    return { total: filteredLeads.length, totalValue, hot, noOwner, proposal };
  }, [filteredLeads]);

  const leadsByStage = useMemo(() => {
    return stageOptions.map((stage) => {
      const items = filteredLeads.filter((lead) => normalizeStage(lead) === stage);
      return { stage, items, totalValue: items.reduce((sum, lead) => sum + (lead.potentialValue || 0), 0) };
    });
  }, [filteredLeads, stageOptions]);

  function selectLead(leadId: string) {
    setSelectedLeadId(leadId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("leadId", leadId);
    if (view !== "list") next.set("view", view);
    router.replace(`/cliente/painel/crm?${next.toString()}`);
  }

  function setViewAndUrl(nextView: ViewKey) {
    setView(nextView);
    const next = new URLSearchParams(searchParams.toString());
    if (nextView === "list") next.delete("view");
    else next.set("view", nextView);
    router.replace(`/cliente/painel/crm?${next.toString()}`);
  }

  async function updateStage(leadId = selectedLeadId, stage = nextStage) {
    if (!tenant?.tenantId || !leadId || !stage || !canOperate) return;
    setSavingStage(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar etapa.");
      setNotice("Etapa atualizada.");
      await load();
      await loadDetail(leadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar etapa.");
    } finally {
      setSavingStage(false);
    }
  }

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !canOperate) return;
    setSavingLead(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...leadForm, potentialValue: Number(leadForm.potentialValue || 0) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao salvar contato.");
      setNotice("Contato atualizado.");
      setEditing(false);
      await load();
      await loadDetail(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar contato.");
    } finally {
      setSavingLead(false);
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !taskTitle.trim() || !canOperate) return;
    setSavingTask(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle.trim(), status: "pending", priority: "medium", type: "follow_up" }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao criar tarefa.");
      setTaskTitle("");
      setNotice("Tarefa criada.");
      await loadDetail(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar tarefa.");
    } finally {
      setSavingTask(false);
    }
  }

  async function createNote(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !noteText.trim() || !canOperate) return;
    setSavingNote(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao salvar nota.");
      setNoteText("");
      setNotice("Nota salva.");
      await loadDetail(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar nota.");
    } finally {
      setSavingNote(false);
    }
  }

  async function importLeadBase(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !importFile || !canOperate) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/import`, { method: "POST", body: formData });
      const payload = (await res.json().catch(() => ({}))) as LeadImportPayload;
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao importar base.");
      const created = payload.summary?.created ?? 0;
      const updated = payload.summary?.updated ?? 0;
      setNotice(`Importacao concluida: ${created} criados e ${updated} atualizados.`);
      setImportFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar base.");
    } finally {
      setImporting(false);
    }
  }

  const selectedWhatsApp = whatsappUrl(selectedLead?.telefone);

  return (
    <CrmWorkspace>
      <CrmHero
        active="Lista"
        title="Clientes e oportunidades em uma tela de CRM familiar."
        description="Lista, ficha, funil e proximas acoes no mesmo lugar, com a Altum ajudando sem transformar a operacao em painel tecnico."
        assistantTitle="Prioridade comercial"
        assistantSubtitle="Quem responder primeiro"
        assistantText="A Altum ajuda a destacar contatos quentes, clientes sem responsavel e oportunidades que precisam de retorno."
        action={
          <>
            <CrmButton type="button" onClick={load}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </CrmButton>
            <CrmLinkButton href="/cliente/painel/pipeline">
              Funil
            </CrmLinkButton>
            <CrmLinkButton href="/cliente/painel/comercial" tone="primary">
              Propostas
            </CrmLinkButton>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <CrmMetric label="Base filtrada" value={String(summary.total)} detail={`${leads.length} cadastrados`} icon={UsersRound} tone="blue" />
          <CrmMetric label="Valor acompanhado" value={formatCrmMoney(summary.totalValue)} detail="oportunidades" icon={DollarSign} tone="green" />
          <CrmMetric label="Quentes" value={String(summary.hot)} detail="pedem prioridade" icon={MessageSquareText} tone="red" />
          <CrmMetric label="Sem responsavel" value={String(summary.noOwner)} detail="corrigir hoje" icon={ClipboardList} tone={summary.noOwner ? "orange" : "neutral"} />
        </div>
      </CrmHero>

      {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}
      {notice ? <CrmNotice tone="green">{notice}</CrmNotice> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <CrmPanel padded={false} className="overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-5">
            <CrmSectionTitle
              eyebrow="Base comercial"
              title="Leads e clientes"
              description="Tabela tradicional com filtros simples, ficha lateral e acoes diretas."
              action={!canOperate ? <CrmBadge tone="orange">somente leitura</CrmBadge> : null}
            />
            <div className="mt-5 flex flex-col gap-3 xl:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-muted)]" />
                <CrmInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato, empresa, telefone..." className="w-full pl-9" />
              </div>
              <CrmSelect value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                <option value="all">Todas etapas</option>
                {stageOptions.map((stage) => <option key={stage} value={stage}>{getPipelineStageLabel(stage)}</option>)}
              </CrmSelect>
              <CrmSelect value={heatFilter} onChange={(event) => setHeatFilter(event.target.value)}>
                <option value="all">Temperatura</option>
                {heatOptions.map((heat) => <option key={heat} value={heat}>{heat}</option>)}
              </CrmSelect>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["list", "pipeline", "analytics"] as ViewKey[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setViewAndUrl(item)}
                  className={`rounded-full border px-3 py-2 text-xs font-black transition ${view === item ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary)] text-white" : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"}`}
                >
                  {item === "list" ? "Lista" : item === "pipeline" ? "Resumo do funil" : "Analise"}
                </button>
              ))}
            </div>
          </div>

          {view === "list" ? (
            <div>
              <div className="hidden border-b border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-5 py-3 text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)] lg:grid lg:grid-cols-[minmax(0,1fr)_150px_130px_150px_150px]">
                <span>Contato</span>
                <span>Etapa</span>
                <span>Temperatura</span>
                <span>Valor</span>
                <span>Responsavel</span>
              </div>
              <div className="divide-y divide-[var(--cliente-border)]">
              {loading ? <div className="p-5"><CrmEmpty title="Carregando clientes" /></div> : null}
              {!loading && filteredLeads.length === 0 ? <div className="p-5"><CrmEmpty title="Nenhum contato encontrado" /></div> : null}
              {filteredLeads.map((lead) => {
                const stage = normalizeStage(lead);
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => selectLead(lead.id)}
                    className={`grid w-full gap-4 px-5 py-4 text-left transition hover:bg-[var(--cliente-surface-muted)] lg:grid-cols-[minmax(0,1fr)_150px_130px_150px_150px] lg:items-center ${selectedLeadId === lead.id ? "bg-[var(--cliente-primary-soft)]" : ""}`}
                  >
                    <CrmAvatar name={lead.nome} subtitle={lead.empresa || lead.telefone || lead.email || "Sem empresa"} />
                    <CrmBadge tone="blue">{getPipelineStageLabel(stage)}</CrmBadge>
                    <CrmBadge tone={heatTone(lead.heat)}>{lead.heat || "sem temp."}</CrmBadge>
                    <p className="text-sm font-black text-[var(--cliente-card-text)]">{formatCrmMoney(lead.potentialValue)}</p>
                    <p className="truncate text-xs font-bold text-[var(--cliente-card-text-soft)]">{lead.owner || "Sem responsavel"}</p>
                  </button>
                );
              })}
              </div>
            </div>
          ) : null}

          {view === "pipeline" ? (
            <div className="client-scrollbar flex gap-4 overflow-x-auto p-4">
              {leadsByStage.map((column) => (
                <section key={column.stage} className="min-w-[280px] rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]">
                  <div className="border-b border-[var(--cliente-border)] p-4">
                    <p className="text-sm font-black text-[var(--cliente-card-text)]">{getPipelineStageLabel(column.stage)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{column.items.length} oportunidades | {formatCrmMoney(column.totalValue)}</p>
                  </div>
                  <div className="space-y-3 p-3">
                    {column.items.length === 0 ? <CrmEmpty title="Sem itens" /> : null}
                    {column.items.slice(0, 8).map((lead) => (
                      <button key={lead.id} type="button" onClick={() => selectLead(lead.id)} className="w-full rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-left hover:border-[var(--cliente-border-strong)]">
                        <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{lead.nome || "Contato"}</p>
                        <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{lead.empresa || lead.telefone || "Sem empresa"}</p>
                        <div className="mt-3 flex gap-2">
                          {lead.heat ? <CrmBadge tone={heatTone(lead.heat)}>{lead.heat}</CrmBadge> : null}
                          <CrmBadge>{formatCrmMoney(lead.potentialValue)}</CrmBadge>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {view === "analytics" ? (
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {leadsByStage.map((column) => (
                <CrmPanel key={column.stage} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[var(--cliente-card-text)]">{getPipelineStageLabel(column.stage)}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatCrmMoney(column.totalValue)}</p>
                    </div>
                    <CrmBadge tone="blue">{column.items.length}</CrmBadge>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-[var(--cliente-border)]">
                    <div className="h-full rounded-full bg-[var(--cliente-primary)]" style={{ width: `${Math.min(100, Math.max(4, (column.items.length / Math.max(1, filteredLeads.length)) * 100))}%` }} />
                  </div>
                </CrmPanel>
              ))}
            </div>
          ) : null}
        </CrmPanel>

        <aside className="space-y-4 xl:sticky xl:top-[132px] xl:self-start">
          <CrmPanel>
            <CrmSectionTitle eyebrow="Ficha" title="Cliente selecionado" description="Contexto, etapa e proxima acao." />
            {selectedLead ? (
              <div className="mt-5 space-y-4">
                <CrmAvatar name={selectedLead.nome} subtitle={selectedLead.empresa || selectedLead.email || selectedLead.telefone} size="lg" />
                <div className="grid grid-cols-2 gap-3">
                  <CrmMetric label="Valor" value={formatCrmMoney(selectedLead.potentialValue)} />
                  <CrmMetric label="Score" value={String(selectedLead.score ?? detail?.qualification?.score ?? "--")} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <CrmBadge tone="blue">{getPipelineStageLabel(normalizeStage(selectedLead))}</CrmBadge>
                  {selectedLead.heat ? <CrmBadge tone={heatTone(selectedLead.heat)}>{selectedLead.heat}</CrmBadge> : null}
                  {detail?.stagePolicy?.slaBreached ? <CrmBadge tone="orange">sem retorno</CrmBadge> : null}
                </div>

                <div className="grid gap-2">
                  <CrmSelect value={nextStage} onChange={(event) => setNextStage(event.target.value)} disabled={!canOperate}>
                    {stageOptions.map((stage) => <option key={stage} value={stage}>{getPipelineStageLabel(stage)}</option>)}
                  </CrmSelect>
                  <CrmButton type="button" tone="primary" disabled={!canOperate || savingStage} onClick={() => updateStage()}>
                    {savingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar etapa
                  </CrmButton>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] px-3 py-3 text-xs font-bold text-[var(--cliente-card-text)]">
                    Conversa
                  </Link>
                  <Link href={`/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] px-3 py-3 text-xs font-bold text-[var(--cliente-card-text)]">
                    Proposta
                  </Link>
                  <Link href={`/cliente/painel/agenda?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] px-3 py-3 text-xs font-bold text-[var(--cliente-card-text)]">
                    Agenda
                  </Link>
                  <CrmButton type="button" onClick={() => setEditing(true)} disabled={!canOperate}>Editar</CrmButton>
                </div>

                {selectedWhatsApp ? (
                  <button type="button" onClick={() => window.open(selectedWhatsApp, "_blank", "noopener,noreferrer")} className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-success)] px-4 py-3 text-sm font-black text-white">
                    <MessageSquareText className="h-4 w-4" />
                    Responder no WhatsApp
                  </button>
                ) : null}

                {(detail?.qualification?.nextAction || detail?.qualification?.label || selectedLead.qualification?.nextAction) ? (
                  <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase text-[var(--cliente-ai)]">Altum sugeriu</p>
                      {detail?.qualification?.label ? <CrmBadge tone="purple">{detail.qualification.label}</CrmBadge> : null}
                    </div>
                    <p className="mt-3 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">
                      {detail?.qualification?.nextAction || selectedLead.qualification?.nextAction || "Revise o contexto e defina o proximo passo comercial."}
                    </p>
                  </div>
                ) : null}

                {detail?.relatedChats?.length ? (
                  <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase text-[var(--cliente-card-text-soft)]">Conversas recentes</p>
                      <CrmBadge tone="green">{detail.relatedChats.length}</CrmBadge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {detail.relatedChats.slice(0, 3).map((chat) => (
                        <Link
                          key={chat.id}
                          href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}&chatId=${encodeURIComponent(chat.id)}`}
                          className="block rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 transition hover:bg-[var(--cliente-panel-soft)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-xs font-black text-[var(--cliente-card-text)]">{chat.contactName || chat.contactPhone || "Conversa"}</p>
                            {chat.unreadCount ? <CrmBadge tone="green">{chat.unreadCount} novas</CrmBadge> : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{chat.lastMessage || chat.channel || "Abrir historico"}</p>
                          <p className="mt-1 text-[11px] text-[var(--cliente-card-text-muted)]">{formatCrmDate(chat.lastMessageTime, "sem data")}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5"><CrmEmpty title="Selecione um cliente" /></div>
            )}
          </CrmPanel>

          <CrmPanel>
            <CrmSectionTitle eyebrow="Rotina" title="Tarefas e notas" />
            {detailLoading ? <div className="mt-4"><CrmEmpty title="Carregando ficha" /></div> : null}
            {selectedLead ? (
              <div className="mt-4 space-y-4">
                <form onSubmit={createTask} className="space-y-2">
                  <CrmInput value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} disabled={!canOperate} placeholder="Criar proxima acao" className="w-full" />
                  <CrmButton type="submit" disabled={!canOperate || savingTask || !taskTitle.trim()} className="w-full">
                    {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Criar tarefa
                  </CrmButton>
                </form>
                <form onSubmit={createNote} className="space-y-2">
                  <CrmTextarea value={noteText} onChange={(event) => setNoteText(event.target.value)} disabled={!canOperate} placeholder="Adicionar nota interna" rows={3} className="w-full" />
                  <CrmButton type="submit" disabled={!canOperate || savingNote || !noteText.trim()} className="w-full">
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Salvar nota
                  </CrmButton>
                </form>
                <div className="space-y-2">
                  {(detail?.tasks || []).slice(0, 4).map((task) => (
                    <div key={task.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-xs font-black text-[var(--cliente-card-text)]">{task.title || "Tarefa"}</p>
                      <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{task.status || "pending"} | {formatCrmDate(task.dueAt, "sem prazo")}</p>
                    </div>
                  ))}
                  {(detail?.notes || []).slice(0, 3).map((note) => (
                    <div key={note.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-xs text-[var(--cliente-card-text)]">{note.text || "-"}</p>
                      <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{formatCrmDate(note.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CrmPanel>

          <CrmPanel>
            <CrmSectionTitle eyebrow="Base" title="Importar contatos" />
            <form onSubmit={importLeadBase} className="mt-4 space-y-3">
              <input type="file" accept=".csv,text/csv" disabled={!canOperate} onChange={(event) => setImportFile(event.target.files?.[0] || null)} className="block w-full rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm text-[var(--cliente-card-text)]" />
              <CrmButton type="submit" tone="primary" disabled={!canOperate || importing || !importFile} className="w-full">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar base
              </CrmButton>
            </form>
          </CrmPanel>
        </aside>
      </section>

      <CustomerProfileDrawer open={editing && Boolean(selectedLead)} onClose={() => setEditing(false)} title={selectedLead?.nome || "Contato"} subtitle={selectedLead?.empresa || selectedLead?.telefone || selectedLead?.email} status={selectedLead ? getPipelineStageLabel(normalizeStage(selectedLead)) : undefined}>
        <form onSubmit={saveLead} className="space-y-3">
          <CrmInput value={leadForm.nome} onChange={(event) => setLeadForm((current) => ({ ...current, nome: event.target.value }))} disabled={!canOperate} placeholder="Nome" className="w-full" />
          <CrmInput value={leadForm.telefone} onChange={(event) => setLeadForm((current) => ({ ...current, telefone: event.target.value }))} disabled={!canOperate} placeholder="Telefone" className="w-full" />
          <CrmInput value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} disabled={!canOperate} placeholder="E-mail" className="w-full" />
          <CrmInput value={leadForm.empresa} onChange={(event) => setLeadForm((current) => ({ ...current, empresa: event.target.value }))} disabled={!canOperate} placeholder="Empresa" className="w-full" />
          <div className="grid grid-cols-2 gap-3">
            <CrmSelect value={leadForm.priority} onChange={(event) => setLeadForm((current) => ({ ...current, priority: event.target.value }))} disabled={!canOperate}>
              {priorityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </CrmSelect>
            <CrmSelect value={leadForm.heat} onChange={(event) => setLeadForm((current) => ({ ...current, heat: event.target.value }))} disabled={!canOperate}>
              {heatOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </CrmSelect>
          </div>
          <CrmInput type="number" value={leadForm.potentialValue} onChange={(event) => setLeadForm((current) => ({ ...current, potentialValue: event.target.value }))} disabled={!canOperate} placeholder="Valor potencial" className="w-full" />
          <CrmTextarea value={leadForm.notes} onChange={(event) => setLeadForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Resumo comercial" rows={5} className="w-full" />
          <CrmButton type="submit" tone="primary" disabled={!canOperate || savingLead} className="w-full">
            {savingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar contato
          </CrmButton>
        </form>
      </CustomerProfileDrawer>
    </CrmWorkspace>
  );
}
