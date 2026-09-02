"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type {
  AgencyLead,
  LeadPriority,
  LeadStageKey,
  LeadStatus,
  TeamMemberDoc,
  TimestampLike,
} from "@/app/types/domain";
import { authedFetch } from "@/app/lib/authed-fetch";
import { canReceiveDistributedLeads } from "@/lib/agency-roles";
import {
  Search,
  Loader2,
  MessageCircle,
  ArrowRight,
  Trash2,
  AlertTriangle,
  Flame,
  Timer,
  Target,
  User,
  Tags,
  CheckCircle2,
  BadgeCheck,
  ShieldCheck,
  Phone,
  Layers,
  BarChart3,
  Sparkles,
  Filter,
  X,
  RefreshCcw,
  Calendar,
  BrainCircuit,
  Send,
  CheckSquare,
  Square,
  ClipboardList,
  FileDown
} from "lucide-react";

/* ======================================================
   TIPOS
====================================================== */

type Priority = LeadPriority;
type StageKey = LeadStageKey;
type LeadHeat = "quente" | "morno" | "frio";
type IntelligenceStatus = "ready" | "processing" | "pending" | "failed" | "disabled";
type Lead = AgencyLead & {
  score?: number;
  heat?: LeadHeat | string;
  reasons?: string[];
  sourceType?: string;
  intelligence?: {
    status?: IntelligenceStatus | string;
    confidence?: number;
  };
};

type BulkSendResult = {
  leadId: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  chatId?: string;
  phone?: string;
};

type BulkSendMode = "template" | "text";
type BulkHeaderMediaType = "none" | "image" | "video" | "document";

type MetaTemplate = {
  id?: string | null;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: Array<{
    type?: string;
    text?: string;
    format?: string;
  }>;
};

type AudienceItem = {
  id: string;
  name: string;
  leadCount: number;
  campaignName?: string;
  createdAt?: string | null;
  summary?: {
    hot?: number;
    withOffer?: number;
    withIaReady?: number;
    missingPhone?: number;
  };
};

/* ======================================================
   UI CONSTANTES
====================================================== */

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondido: "Respondido",
  qualificado: "Qualificado",
  descartado: "Descartado",
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  novo: "bg-blue-50 text-blue-700 border border-blue-200",
  contatado: "bg-amber-50 text-amber-700 border border-amber-200",
  respondido: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  qualificado: "bg-purple-50 text-purple-700 border border-purple-200",
  descartado: "bg-red-50 text-red-700 border border-red-200",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-slate-50 text-slate-600 border border-slate-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high: "bg-red-50 text-red-700 border border-red-200",
};

const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: "INVISIVEL", label: "Invisível Digital", hint: "Quase não aparece / ficha ruim / sem presença" },
  { key: "PRESENTE_FRACO", label: "Presença Fraca", hint: "Existe, mas não gera confiança nem demanda" },
  { key: "SITE_RUIM", label: "Site Ruim/Amador", hint: "Site existe, mas passa pouca autoridade/conversão" },
  { key: "SITE_OK", label: "Site OK", hint: "Site aceitável, dá pra melhorar e criar funil" },
  { key: "TRAFEGO_ZERO", label: "Sem Tráfego", hint: "Não anuncia, depende de orgânico" },
  { key: "TRAFEGO_FRACO", label: "Tráfego Fraco", hint: "Anuncia pouco/sem consistência" },
  { key: "TRAFEGO_OK", label: "Tráfego OK", hint: "Anúncios rodando, precisa otimização/escala" },
  { key: "OPERACAO_ATIVA", label: "Operação Ativa", hint: "Já vende e tem rotina comercial" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function safeToDate(ts: TimestampLike | number | null | undefined): Date | null {
  try {
    if (!ts) return null;
    if (typeof ts === "object" && "toDate" in ts && typeof ts.toDate === "function") {
      return ts.toDate();
    }
    if (typeof ts === "number") return new Date(ts);
    return null;
  } catch {
    return null;
  }
}

function formatDateOnly(ts: TimestampLike | number | null | undefined) {
  const d = safeToDate(ts);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTimeForExport(ts: TimestampLike | number | null | undefined) {
  const d = safeToDate(ts);
  if (!d) return "";
  return d.toLocaleString("pt-BR");
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function moneyBR(v?: number) {
  if (typeof v !== "number") return "—";
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function stageLabel(stage?: string) {
  if (!stage) return null;
  const f = STAGES.find((s) => s.key === stage);
  return f?.label || stage;
}

function heatLabel(heat?: string) {
  const normalized = (heat || "").toLowerCase();
  if (normalized === "quente") return "Quente";
  if (normalized === "morno") return "Morno";
  if (normalized === "frio") return "Frio";
  return "Sem heat";
}

function heatClass(heat?: string) {
  const normalized = (heat || "").toLowerCase();
  if (normalized === "quente") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "morno") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "frio") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function intelligenceLabel(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "ready") return "IA pronta";
  if (normalized === "processing") return "IA processando";
  if (normalized === "failed") return "IA falhou";
  if (normalized === "disabled") return "IA desativada";
  return "IA pendente";
}

function intelligenceClass(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "processing") return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (normalized === "disabled") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function daysBetween(a: Date, b: Date) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

/* ======================================================
   COMPONENTES UI PEQUENOS
====================================================== */

function Pill({
  active,
  children,
  onClick,
  title,
  tone = "default",
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  tone?: "default" | "danger" | "success" | "warning" | "info";
}) {
  const toneCls =
    tone === "danger"
      ? active
        ? "bg-red-600 text-white border-red-600"
        : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
      : tone === "success"
        ? active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
        : tone === "warning"
          ? active
            ? "bg-amber-600 text-white border-amber-600"
            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : tone === "info"
            ? active
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            : active
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50";

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition",
        toneCls
      )}
    >
      {children}
    </button>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-slate-200 bg-slate-50 p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-500">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-slate-400">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-slate-200" />;
}

/* ======================================================
   PÁGINA PRINCIPAL
====================================================== */

type DatePreset = "all" | "today" | "7d" | "30d";

type SortKey =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "contact_desc";

export default function ProspeccaoCRMPage() {
  // --- AUTH & SEGURANÇA ---
  const { user, profile, isAdmin, loading: authLoading } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [search, setSearch] = useState("");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "todos">("todos");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "todas">("todas");
  const [heatFilter, setHeatFilter] = useState<LeadHeat | "todas">("todas");
  const [iaFilter, setIaFilter] = useState<IntelligenceStatus | "todos">("todos");
  const [stageFilter, setStageFilter] = useState<StageKey | "todos" | "sem">("todos");
  const [offerFilter, setOfferFilter] = useState<"todos" | "com" | "sem">("todos");
  const [contactFilter, setContactFilter] = useState<"todos" | "contatado" | "nunca">("todos");
  const [workedFilter, setWorkedFilter] = useState<"todos" | "trabalhado" | "cru">("todos");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showCampaignPanel, setShowCampaignPanel] = useState(false);

  // fila inteligente (chips)
  const [queueMode, setQueueMode] = useState<
    "none" | "abordar_agora" | "sem_estagio" | "alta_prioridade" | "nunca_contatado" | "com_oferta" | "ia_pendente"
  >("none");

  // delete
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [intelRunning, setIntelRunning] = useState<Record<string, boolean>>({});
  const [bulkIntelRunning, setBulkIntelRunning] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkSendMode>("template");
  const [bulkCampaignName, setBulkCampaignName] = useState("Prospeccao landing pages");
  const [bulkMessage, setBulkMessage] = useState(
    "Oi {nome}, tudo bem? Vi sua empresa no Google e percebi uma oportunidade simples para gerar mais contatos pelo WhatsApp. Posso te mostrar uma ideia de landing page com campanha para o seu segmento?"
  );
  const [bulkTemplateName, setBulkTemplateName] = useState("prospect_lp_altum");
  const [bulkLanguageCode, setBulkLanguageCode] = useState("pt_BR");
  const [bulkBodyParams, setBulkBodyParams] = useState("{nome}\nlanding pages e campanhas");
  const [bulkHeaderMediaType, setBulkHeaderMediaType] = useState<BulkHeaderMediaType>("none");
  const [bulkHeaderMediaLink, setBulkHeaderMediaLink] = useState("");
  const [bulkHeaderMediaFilename, setBulkHeaderMediaFilename] = useState("");
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [audiences, setAudiences] = useState<AudienceItem[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  const [audienceSaving, setAudienceSaving] = useState(false);
  const [audienceName, setAudienceName] = useState("Audiencia Maps - LPs");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    sent: number;
    skipped: number;
    failed: number;
    results: BulkSendResult[];
  } | null>(null);

  /* ======================================================
      FETCH (A GRANDE MUDANÇA ESTÁ AQUI)
  ====================================================== */
// --- NOVOS ESTADOS PARA O SAAS ---
  const [distributing, setDistributing] = useState(false);
  const [sellers, setSellers] = useState<{id: string, name: string}[]>([]);
  const dailyUnassignedLeads = useMemo(() => {
    const now = new Date();
    return leads.filter((lead) => {
      if (lead.ownerId) return false;
      const created = safeToDate(lead.createdAt);
      if (!created) return false;
      return created.toDateString() === now.toDateString();
    });
  }, [leads]);
  const allUnassignedLeads = useMemo(() => leads.filter((lead) => !lead.ownerId), [leads]);

  // Buscar vendedores ativos (Somente se for Admin)
  useEffect(() => {
    if (!isAdmin || !user) {
      setSellers([]);
      return;
    }
    void authedFetch("/api/admin/users")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          items?: Array<TeamMemberDoc & { id: string }>;
        };
        if (!response.ok) throw new Error("Falha ao carregar vendedores.");
        setSellers(
          (payload.items || [])
            .filter((member) => canReceiveDistributedLeads(member.role))
            .map((member) => ({ id: member.id, name: member.name || "Sem nome" }))
        );
      })
      .catch((error) => console.error("Erro ao carregar vendedores:", error));
  }, [isAdmin, user]);

  // FUNÇÃO: Roleta de Distribuicao (Round-Robin)
  const handleAutoDistribute = async (mode: "today" | "all" = "today") => {
    const targetLeads = mode === "all" ? allUnassignedLeads : dailyUnassignedLeads;
    if (targetLeads.length === 0) {
      return alert(
        mode === "all"
          ? "Nao ha leads sem dono para distribuir."
          : "Nao ha leads de hoje sem dono para distribuir."
      );
    }
    if (sellers.length === 0) return alert("Nao ha vendedores ativos na equipe!");

    if (
      !confirm(
        mode === "all"
          ? `Distribuir ${targetLeads.length} lead(s) sem dono entre ${sellers.length} vendedores?`
          : `Distribuir ${targetLeads.length} lead(s) de hoje entre ${sellers.length} vendedores?`
      )
    ) {
      return;
    }

    setDistributing(true);
    try {
      const res = await authedFetch("/api/leads/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: targetLeads.map((lead) => lead.id),
          sellerIds: sellers.map((seller) => seller.id),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha na distribuicao.");

      alert("Distribuicao concluida com sucesso!");
    } catch (error) {
      console.error(error);
      alert("Erro ao distribuir leads.");
    } finally {
      setDistributing(false);
    }
  };

  const loadCampaignAssets = useCallback(async () => {
    setTemplatesLoading(true);
    setAudiencesLoading(true);
    setTemplatesError("");

    try {
      const [templatesRes, audiencesRes] = await Promise.all([
        authedFetch("/api/admin/whatsapp/templates?tenantId=ALTUM_AGENCY"),
        authedFetch("/api/admin/audiences?tenantId=ALTUM_AGENCY&limit=12"),
      ]);

      const templatesData = await templatesRes.json().catch(() => ({}));
      const audiencesData = await audiencesRes.json().catch(() => ({}));

      if (templatesRes.ok && templatesData?.ok !== false) {
        setMetaTemplates(Array.isArray(templatesData.templates) ? templatesData.templates : []);
      } else {
        setMetaTemplates([]);
        setTemplatesError(templatesData?.error || "Nao foi possivel carregar templates Meta.");
      }

      if (audiencesRes.ok) {
        setAudiences(Array.isArray(audiencesData.items) ? audiencesData.items : []);
      }
    } catch (error) {
      console.error("Falha ao carregar assets de campanha:", error);
      setTemplatesError("Nao foi possivel carregar templates e audiencias.");
    } finally {
      setTemplatesLoading(false);
      setAudiencesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadCampaignAssets();
  }, [loadCampaignAssets, user]);

  useEffect(() => {
  if (authLoading) return;
  if (!user) {
    setLoading(false);
    return;
  }

  let active = true;
  void authedFetch("/api/admin/dashboard?include=leads")
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as { leads?: Lead[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar leads.");
      if (active) setLeads(payload.leads || []);
    })
    .catch((error) => console.error("Erro ao carregar leads:", error))
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [user, authLoading, isAdmin]);

  /* ======================================================
      MÉTRICAS (TOPO)
  ====================================================== */

  const metrics = useMemo(() => {
    const base = showDiscarded ? leads : leads.filter((l) => l.status !== "descartado");

    const total = base.length;
    const novos = base.filter((l) => (l.status || "novo") === "novo").length;
    const contatados = base.filter((l) => l.status === "contatado").length;
    const respondidos = base.filter((l) => l.status === "respondido").length;
    const qualificados = base.filter((l) => l.status === "qualificado").length;

    const semStage = base.filter((l) => !l.stage).length;
    const high = base.filter((l) => l.priority === "high").length;
    const quentes = base.filter((l) => (l.heat || "").toLowerCase() === "quente").length;
    const iaReady = base.filter((l) => (l.intelligence?.status || "").toLowerCase() === "ready").length;
    const iaPending = base.filter((l) => {
      const status = (l.intelligence?.status || "pending").toLowerCase();
      return status === "pending" || status === "processing";
    }).length;

    const nuncaContatado = base.filter((l) => !l.lastContactAt).length;
    const comOferta = base.filter((l) => !!l.offer?.title).length;

    return {
      total,
      novos,
      contatados,
      respondidos,
      qualificados,
      semStage,
      high,
      quentes,
      iaReady,
      iaPending,
      nuncaContatado,
      comOferta,
    };
  }, [leads, showDiscarded]);

  /* ======================================================
      FILTRAGEM + ORDENAR
  ====================================================== */

  const filtered = useMemo(() => {
    const now = new Date();

    // base: inclui ou não descartados
    let arr = showDiscarded ? [...leads] : leads.filter((l) => l.status !== "descartado");

    // queue chips (puxa prioridade)
    if (queueMode !== "none") {
      if (queueMode === "sem_estagio") arr = arr.filter((l) => !l.stage);
      if (queueMode === "alta_prioridade") arr = arr.filter((l) => l.priority === "high");
      if (queueMode === "nunca_contatado") arr = arr.filter((l) => !l.lastContactAt);
      if (queueMode === "com_oferta") arr = arr.filter((l) => !!l.offer?.title);
      if (queueMode === "ia_pendente") {
        arr = arr.filter((l) => {
          const status = (l.intelligence?.status || "pending").toLowerCase();
          return status === "pending" || status === "processing" || status === "failed";
        });
      }

      if (queueMode === "abordar_agora") {
        arr = arr.filter((l) => {
          const created = safeToDate(l.createdAt);
          const diffOk = created ? daysBetween(now, created) <= 2 : true;
          const notQualified = l.status !== "qualificado";
          const isHigh = l.priority === "high";
          return diffOk && notQualified && isHigh;
        });
      }
    }

    // search
    if (search.trim()) {
      const t = search.toLowerCase();
      arr = arr.filter((l) => {
        return (
          (l.nome || "").toLowerCase().includes(t) ||
          (l.telefone || "").includes(t) ||
          (l.email || "").toLowerCase().includes(t) ||
          (l.origem || "").toLowerCase().includes(t)
        );
      });
    }

    // status
    if (statusFilter !== "todos") {
      arr = arr.filter((l) => (l.status || "novo") === statusFilter);
    }

    // priority
    if (priorityFilter !== "todas") {
      arr = arr.filter((l) => (l.priority || "medium") === priorityFilter);
    }

    if (heatFilter !== "todas") {
      arr = arr.filter((l) => (l.heat || "").toLowerCase() === heatFilter);
    }

    if (iaFilter !== "todos") {
      arr = arr.filter((l) => (l.intelligence?.status || "pending").toLowerCase() === iaFilter);
    }

    // stage
    if (stageFilter !== "todos") {
      if (stageFilter === "sem") arr = arr.filter((l) => !l.stage);
      else arr = arr.filter((l) => l.stage === stageFilter);
    }

    // offer
    if (offerFilter !== "todos") {
      if (offerFilter === "com") arr = arr.filter((l) => !!l.offer?.title);
      if (offerFilter === "sem") arr = arr.filter((l) => !l.offer?.title);
    }

    // contact
    if (contactFilter !== "todos") {
      if (contactFilter === "contatado") arr = arr.filter((l) => !!l.lastContactAt);
      if (contactFilter === "nunca") arr = arr.filter((l) => !l.lastContactAt);
    }

    // worked
    if (workedFilter !== "todos") {
      const isWorked = (l: Lead) => !!l.stage || !!l.offer?.title || !!(l.notes && l.notes.trim());
      if (workedFilter === "trabalhado") arr = arr.filter(isWorked);
      if (workedFilter === "cru") arr = arr.filter((l) => !isWorked(l));
    }

    // date preset (createdAt)
    if (datePreset !== "all") {
      arr = arr.filter((l) => {
        const d = safeToDate(l.createdAt);
        if (!d) return false;
        if (datePreset === "today") return d.toDateString() === now.toDateString();
        if (datePreset === "7d") return daysBetween(now, d) <= 7;
        if (datePreset === "30d") return daysBetween(now, d) <= 30;
        return true;
      });
    }

    // sort
    arr.sort((a, b) => {
      const aCreated = safeToDate(a.createdAt)?.getTime() || 0;
      const bCreated = safeToDate(b.createdAt)?.getTime() || 0;

      const aUpdated = safeToDate(a.updatedAt)?.getTime() || 0;
      const bUpdated = safeToDate(b.updatedAt)?.getTime() || 0;

      const aContact = safeToDate(a.lastContactAt)?.getTime() || 0;
      const bContact = safeToDate(b.lastContactAt)?.getTime() || 0;

      if (sort === "created_desc") return bCreated - aCreated;
      if (sort === "created_asc") return aCreated - bCreated;
      if (sort === "updated_desc") return bUpdated - aUpdated;
      if (sort === "contact_desc") return bContact - aContact;

      return 0;
    });

    return arr;
  }, [
    leads,
    showDiscarded,
    queueMode,
    search,
    statusFilter,
    priorityFilter,
    heatFilter,
    iaFilter,
    stageFilter,
    offerFilter,
    contactFilter,
    workedFilter,
    datePreset,
    sort,
  ]);

  const selectedLeads = useMemo(() => {
    const selected = new Set(selectedLeadIds);
    return leads.filter((lead) => selected.has(lead.id));
  }, [leads, selectedLeadIds]);

  const selectableFilteredLeads = useMemo(() => {
    return filtered.filter((lead) => !!onlyDigits(lead.telefone || ""));
  }, [filtered]);

  const selectedWithPhone = useMemo(() => {
    return selectedLeads.filter((lead) => !!onlyDigits(lead.telefone || ""));
  }, [selectedLeads]);

  function exportLeadsCsv(scope: "selection" | "filtered") {
    const source = scope === "selection" && selectedLeads.length > 0 ? selectedLeads : filtered;
    if (source.length === 0) {
      alert("Nao ha leads para exportar.");
      return;
    }

    const rows = [
      [
        "Nome",
        "Telefone",
        "Email",
        "Origem",
        "Categoria",
        "Status",
        "Etapa",
        "Prioridade",
        "Temperatura",
        "Score",
        "Responsavel",
        "Site",
        "Endereco",
        "Criado em",
        "Atualizado em",
      ],
      ...source.map((lead) => [
        lead.nome || "",
        lead.telefone || "",
        lead.email || "",
        lead.origem || lead.sourceType || "",
        lead.categoria || "",
        STATUS_LABEL[(lead.status || "novo") as LeadStatus] || lead.status || "Novo",
        stageLabel(lead.stage) || "",
        PRIORITY_LABEL[(lead.priority || "medium") as Priority] || lead.priority || "",
        heatLabel(lead.heat),
        String(lead.score ?? ""),
        lead.owner || "",
        lead.website || "",
        lead.endereco || "",
        formatDateTimeForExport(lead.createdAt),
        formatDateTimeForExport(lead.updatedAt),
      ]),
    ];

    const exportedSelection = scope === "selection" && selectedLeads.length > 0;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`altum-leads-${exportedSelection ? "selecionados" : "filtrados"}-${stamp}.csv`, rows);
  }

  const bulkAudienceSummary = useMemo(() => {
    const hot = selectedWithPhone.filter((lead) => (lead.heat || "").toLowerCase() === "quente").length;
    const withOffer = selectedWithPhone.filter((lead) => !!lead.offer?.title).length;
    const withIaReady = selectedWithPhone.filter(
      (lead) => (lead.intelligence?.status || "").toLowerCase() === "ready"
    ).length;

    return {
      hot,
      withOffer,
      withIaReady,
      missingPhone: selectedLeads.length - selectedWithPhone.length,
    };
  }, [selectedLeads, selectedWithPhone]);

  const approvedMetaTemplates = useMemo(() => {
    return metaTemplates
      .filter((template) => template.status === "approved")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metaTemplates]);

  function getTemplateBody(template: MetaTemplate) {
    return template.components?.find((component) => String(component.type || "").toUpperCase() === "BODY")?.text || "";
  }

  function getTemplateHeader(template: MetaTemplate) {
    return template.components?.find((component) => String(component.type || "").toUpperCase() === "HEADER") || null;
  }

  function getTemplateVariables(template: MetaTemplate) {
    const body = getTemplateBody(template);
    const matches = body.match(/\{\{\s*\d+\s*\}\}/g) || [];
    return Array.from(new Set(matches.map((item) => item.replace(/\s+/g, ""))));
  }

  const selectedTemplate = useMemo(() => {
    return approvedMetaTemplates.find(
      (template) => template.name === bulkTemplateName && template.language === bulkLanguageCode
    ) || approvedMetaTemplates.find((template) => template.name === bulkTemplateName) || null;
  }, [approvedMetaTemplates, bulkLanguageCode, bulkTemplateName]);

  /* ======================================================
      HELPERS (ações)
  ====================================================== */

  function openWhatsApp(phone?: string) {
    if (!phone) return;
    const digits = onlyDigits(phone);
    if (!digits) return;
    const normalized = digits.startsWith("55") ? digits : `55${digits}`;
    window.open(`https://wa.me/${normalized}`, "_blank", "noopener,noreferrer");
  }

  async function confirmDeleteLead() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authedFetch("/api/leads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao remover lead.");
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      alert("Nao foi possivel remover o lead.");
    } finally {
      setDeleting(false);
    }
  }

  async function runLeadIntelligence(leadId: string) {
    if (!leadId) return;
    setIntelRunning((prev) => ({ ...prev, [leadId]: true }));
    try {
      const res = await authedFetch("/api/leads/intelligence/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          force: true,
          trigger: "crm_list_manual",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar IA do lead.");
    } catch (error) {
      console.error(error);
      alert("Nao foi possivel atualizar a IA deste lead.");
    } finally {
      setIntelRunning((prev) => ({ ...prev, [leadId]: false }));
    }
  }

  async function runBulkIntelligence() {
    const targets = filtered.slice(0, 80);
    if (!targets.length) {
      alert("Nao ha leads filtrados para atualizar IA.");
      return;
    }

    const approved = confirm(`Rodar IA em ${targets.length} lead(s) filtrados?`);
    if (!approved) return;

    setBulkIntelRunning(true);
    try {
      const settled = await Promise.allSettled(
        targets.map(async (lead) => {
          setIntelRunning((prev) => ({ ...prev, [lead.id]: true }));
          try {
            const res = await authedFetch("/api/leads/intelligence/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                leadId: lead.id,
                force: true,
                trigger: "crm_list_bulk",
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || "Falha ao atualizar IA.");
          } finally {
            setIntelRunning((prev) => ({ ...prev, [lead.id]: false }));
          }
        })
      );

      const ok = settled.filter((item) => item.status === "fulfilled").length;
      const fail = settled.length - ok;
      alert(`IA atualizada. Sucesso: ${ok} | Falhas: ${fail}`);
    } catch (error) {
      console.error(error);
      alert("Falha ao executar atualizacao em lote da IA.");
    } finally {
      setBulkIntelRunning(false);
    }
  }

  function toggleLeadSelection(leadId: string) {
    setBulkResult(null);
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  }

  function selectVisibleLeads() {
    setBulkResult(null);
    setSelectedLeadIds(selectableFilteredLeads.slice(0, 50).map((lead) => lead.id));
  }

  function clearSelection() {
    setBulkResult(null);
    setSelectedLeadIds([]);
  }

  function applyMetaTemplate(template: MetaTemplate) {
    setBulkMode("template");
    setBulkTemplateName(template.name);
    setBulkLanguageCode(template.language || "pt_BR");

    const variables = getTemplateVariables(template);
    if (variables.length > 0) {
      setBulkBodyParams(
        variables
          .map((_, index) => (index === 0 ? "{nome}" : "landing pages e campanhas"))
          .join("\n")
      );
    }

    const header = getTemplateHeader(template);
    const format = String(header?.format || "").toUpperCase();
    if (format === "IMAGE") setBulkHeaderMediaType("image");
    else if (format === "VIDEO") setBulkHeaderMediaType("video");
    else if (format === "DOCUMENT") setBulkHeaderMediaType("document");
    else setBulkHeaderMediaType("none");
  }

  async function saveAudience() {
    const leadIds = selectedWithPhone.slice(0, 50).map((lead) => lead.id);
    if (!leadIds.length) {
      alert("Selecione pelo menos um lead com telefone para salvar a audiencia.");
      return;
    }

    setAudienceSaving(true);
    try {
      const res = await authedFetch("/api/admin/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: audienceName.trim() || bulkCampaignName.trim() || "Audiencia de prospeccao",
          tenantId: "ALTUM_AGENCY",
          leadIds,
          campaignName: bulkCampaignName.trim(),
          source: "admin_prospecting",
          filters: {
            search,
            statusFilter,
            priorityFilter,
            heatFilter,
            iaFilter,
            stageFilter,
            offerFilter,
            contactFilter,
            workedFilter,
            datePreset,
            queueMode,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar audiencia.");
      await loadCampaignAssets();
      alert(`Audiencia salva com ${Number(data.leadCount || leadIds.length)} lead(s).`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Nao foi possivel salvar a audiencia.");
    } finally {
      setAudienceSaving(false);
    }
  }

  async function sendBulkWhatsApp() {
    const leadIds = selectedWithPhone.slice(0, 50).map((lead) => lead.id);
    if (!leadIds.length) {
      alert("Selecione pelo menos um lead com telefone.");
      return;
    }

    const text = bulkMessage.trim();
    const templateName = bulkTemplateName.trim();
    const languageCode = bulkLanguageCode.trim() || "pt_BR";
    const bodyParams = bulkBodyParams
      .split(/\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const headerMedia =
      bulkHeaderMediaType !== "none" && bulkHeaderMediaLink.trim()
        ? {
            type: bulkHeaderMediaType,
            link: bulkHeaderMediaLink.trim(),
            ...(bulkHeaderMediaFilename.trim() ? { filename: bulkHeaderMediaFilename.trim() } : {}),
          }
        : null;

    if (bulkMode === "text" && !text) {
      alert("Escreva a mensagem antes de enviar.");
      return;
    }

    if (bulkMode === "template" && !templateName) {
      alert("Informe o nome do template aprovado na Meta.");
      return;
    }

    const approved = confirm(
      bulkMode === "template"
        ? `Enviar o template Meta "${templateName}" para ${leadIds.length} lead(s) pelo WhatsApp oficial da Altum?`
        : `Enviar texto livre para ${leadIds.length} lead(s) pelo WhatsApp oficial da Altum?`
    );
    if (!approved) return;

    setBulkSending(true);
    setBulkResult(null);

    try {
      const res = await authedFetch("/api/whatsapp/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds,
          mode: bulkMode,
          text,
          campaignName: bulkCampaignName.trim() || "Prospeccao ativa",
          templateName,
          languageCode,
          bodyParams,
          headerMedia,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha no envio em massa.");

      setBulkResult({
        sent: Number(data.sent || 0),
        skipped: Number(data.skipped || 0),
        failed: Number(data.failed || 0),
        results: Array.isArray(data.results) ? data.results : [],
      });
      setSelectedLeadIds([]);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Nao foi possivel enviar em massa.");
    } finally {
      setBulkSending(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("todos");
    setPriorityFilter("todas");
    setHeatFilter("todas");
    setIaFilter("todos");
    setStageFilter("todos");
    setOfferFilter("todos");
    setContactFilter("todos");
    setWorkedFilter("todos");
    setDatePreset("all");
    setSort("created_desc");
    setQueueMode("none");
    setShowDiscarded(false);
  }

  const activeFiltersCount = useMemo(() => {
    let c = 0;
    if (search.trim()) c++;
    if (statusFilter !== "todos") c++;
    if (priorityFilter !== "todas") c++;
    if (heatFilter !== "todas") c++;
    if (iaFilter !== "todos") c++;
    if (stageFilter !== "todos") c++;
    if (offerFilter !== "todos") c++;
    if (contactFilter !== "todos") c++;
    if (workedFilter !== "todos") c++;
    if (datePreset !== "all") c++;
    if (queueMode !== "none") c++;
    if (showDiscarded) c++;
    return c;
  }, [
    search,
    statusFilter,
    priorityFilter,
    heatFilter,
    iaFilter,
    stageFilter,
    offerFilter,
    contactFilter,
    workedFilter,
    datePreset,
    queueMode,
    showDiscarded,
  ]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (search.trim()) labels.push("Busca");
    if (statusFilter !== "todos") labels.push(`Status: ${statusFilter}`);
    if (priorityFilter !== "todas") labels.push(`Prioridade: ${priorityFilter}`);
    if (heatFilter !== "todas") labels.push(`Temperatura: ${heatFilter}`);
    if (iaFilter !== "todos") labels.push(`IA: ${iaFilter}`);
    if (stageFilter !== "todos") labels.push(stageFilter === "sem" ? "Sem etapa" : `Etapa: ${stageFilter}`);
    if (offerFilter !== "todos") labels.push(offerFilter === "com" ? "Com oferta" : "Sem oferta");
    if (contactFilter !== "todos") labels.push(contactFilter === "contatado" ? "Ja contatado" : "Nunca contatado");
    if (workedFilter !== "todos") labels.push(workedFilter === "trabalhado" ? "Trabalhados" : "Leads crus");
    if (datePreset !== "all") labels.push(`Data: ${datePreset}`);
    if (queueMode !== "none") labels.push(`Fila: ${queueMode}`);
    if (showDiscarded) labels.push("Mostrando descartados");
    return labels;
  }, [
    search,
    statusFilter,
    priorityFilter,
    heatFilter,
    iaFilter,
    stageFilter,
    offerFilter,
    contactFilter,
    workedFilter,
    datePreset,
    queueMode,
    showDiscarded,
  ]);

  const hasAdvancedFilters =
    heatFilter !== "todas" ||
    iaFilter !== "todos" ||
    stageFilter !== "todos" ||
    offerFilter !== "todos" ||
    contactFilter !== "todos" ||
    workedFilter !== "todos" ||
    showDiscarded;

  /* ======================================================
      UI
  ====================================================== */

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-10 text-slate-900">
      {/* HERO HEADER */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {isAdmin ? "Admin Altum" : `Operador ${profile?.role?.toUpperCase() || "COMERCIAL"}`}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Prospeccao ativa
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {isAdmin 
                    ? "Lista operacional para captar, distribuir, abordar e acompanhar leads."
                    : "Leads atribuidos a voce para abordagem e acompanhamento comercial."}
            </p>
          </div>

          <div className="flex max-w-4xl flex-wrap items-center justify-start gap-2 lg:justify-end">
            {/* ACOES DE ADMIN */}
            {isAdmin && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
                <button
                  onClick={() => void handleAutoDistribute("today")}
                  disabled={distributing || dailyUnassignedLeads.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  {distributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Hoje ({dailyUnassignedLeads.length})
                </button>
                <button
                  onClick={() => void handleAutoDistribute("all")}
                  disabled={distributing || allUnassignedLeads.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                >
                  {distributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Todos sem dono ({allUnassignedLeads.length})
                </button>
              </div>
            )}
            {isAdmin && (
              <button
                onClick={() => void runBulkIntelligence()}
                disabled={bulkIntelRunning || filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
              >
                {bulkIntelRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                Atualizar IA ({Math.min(filtered.length, 80)})
              </button>
            )}
            <Pill
              tone="warning"
              active={queueMode === "abordar_agora"}
              onClick={() => setQueueMode((v) => (v === "abordar_agora" ? "none" : "abordar_agora"))}
              title="Alta prioridade, recente e ainda nao qualificado"
            >
              <Flame className="h-4 w-4" />
              Abordar agora
            </Pill>

            <Pill
              tone="default"
              active={queueMode === "nunca_contatado"}
              onClick={() => setQueueMode((v) => (v === "nunca_contatado" ? "none" : "nunca_contatado"))}
            >
              <Phone className="h-4 w-4" />
              Nunca contatado
            </Pill>

            <button
              onClick={() => exportLeadsCsv(selectedLeadIds.length > 0 ? "selection" : "filtered")}
              disabled={filtered.length === 0 && selectedLeadIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
              title="Baixar leads em CSV para Excel ou Google Sheets"
            >
              <FileDown className="h-4 w-4" />
              Exportar {selectedLeadIds.length > 0 ? `(${selectedLeadIds.length})` : `(${filtered.length})`}
            </button>

            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
              title="Limpar filtros"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset
              {activeFiltersCount > 0 ? (
                <span className="ml-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                  {activeFiltersCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Exibidos" value={`${filtered.length}`} sub={`Base: ${metrics.total}`} />
          <StatCard icon={<Phone className="h-5 w-5" />} label="Sem contato" value={`${metrics.nuncaContatado}`} />
          <StatCard icon={<Flame className="h-5 w-5" />} label="Quentes" value={`${metrics.quentes}`} />
          <StatCard icon={<BrainCircuit className="h-5 w-5" />} label="IA pronta" value={`${metrics.iaReady}`} />
        </div>
      </div>

      {/* FILTERS PANEL */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          title="Filtros comerciais"
          subtitle="Filtre por status, prioridade, temperatura, etapa, IA, oferta, contato e periodo."
          icon={<Filter className="h-4 w-4" />}
          right={
            <div className="text-[11px] font-medium text-slate-500">
              {loading ? "Carregando..." : `${filtered.length} leads exibidos`}
            </div>
          }
        />

        <Divider />

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-12">
          {/* Search */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, e-mail, origem..."
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  title="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Status */}
          <div className={cx("lg:col-span-2", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "todos")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todos">Status (todos)</option>
              <option value="novo">Novo</option>
              <option value="contatado">Contatado</option>
              <option value="respondido">Respondido</option>
              <option value="qualificado">Qualificado</option>
              <option value="descartado">Descartado</option>
            </select>
          </div>

          {/* Priority */}
          <div className="lg:col-span-2">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Priority | "todas")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todas">Prioridade (todas)</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baixa</option>
            </select>
          </div>

          {/* Heat */}
          <div className="lg:col-span-2">
            <select
              value={heatFilter}
              onChange={(e) => setHeatFilter(e.target.value as LeadHeat | "todas")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todas">Temperatura (todas)</option>
              <option value="quente">Quente</option>
              <option value="morno">Morno</option>
              <option value="frio">Frio</option>
            </select>
          </div>

          {/* IA status */}
          <div className={cx("lg:col-span-2", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <select
              value={iaFilter}
              onChange={(e) => setIaFilter(e.target.value as IntelligenceStatus | "todos")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todos">IA (todos)</option>
              <option value="ready">IA pronta</option>
              <option value="processing">IA processando</option>
              <option value="pending">IA pendente</option>
              <option value="failed">IA falhou</option>
              <option value="disabled">IA desativada</option>
            </select>
          </div>

          {/* Stage */}
          <div className={cx("lg:col-span-3", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as StageKey | "todos" | "sem")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todos">Etapa (todos)</option>
              <option value="sem">Sem etapa</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Offer */}
          <div className={cx("lg:col-span-2", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <select
              value={offerFilter}
              onChange={(e) => setOfferFilter(e.target.value as "todos" | "com" | "sem")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todos">Oferta (todas)</option>
              <option value="com">Com oferta</option>
              <option value="sem">Sem oferta</option>
            </select>
          </div>

          {/* Contact */}
          <div className={cx("lg:col-span-2", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value as "todos" | "contatado" | "nunca")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todos">Contato (todos)</option>
              <option value="contatado">Ja contatado</option>
              <option value="nunca">Nunca contatado</option>
            </select>
          </div>

          {/* Worked */}
          <div className={cx("lg:col-span-2", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <select
              value={workedFilter}
              onChange={(e) => setWorkedFilter(e.target.value as "todos" | "trabalhado" | "cru")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="todos">Trabalho (todos)</option>
              <option value="trabalhado">Trabalhados</option>
              <option value="cru">Leads crus</option>
            </select>
          </div>

          {/* Date preset */}
          <div className="lg:col-span-2">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="all">Data (tudo)</option>
              <option value="today">Hoje</option>
              <option value="7d">Ultimos 7 dias</option>
              <option value="30d">Ultimos 30 dias</option>
            </select>
          </div>

          {/* Sort */}
          <div className="lg:col-span-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
            >
              <option value="created_desc">Ordenar: + recentes</option>
              <option value="created_asc">Ordenar: + antigos</option>
              <option value="updated_desc">Ordenar: atualizados</option>
              <option value="contact_desc">Ordenar: ultimo contato</option>
            </select>
          </div>

          <div className="lg:col-span-2 flex items-center">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((value) => !value)}
              className={cx(
                "inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition",
                showAdvancedFilters || hasAdvancedFilters
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Filter className="h-4 w-4" />
              {showAdvancedFilters || hasAdvancedFilters ? "Filtros avancados" : "Mais filtros"}
              {hasAdvancedFilters ? (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">ativo</span>
              ) : null}
            </button>
          </div>

          {/* Discarded toggle */}
          <div className={cx("lg:col-span-2 flex items-center", !showAdvancedFilters && !hasAdvancedFilters && "hidden")}>
            <button
              onClick={() => setShowDiscarded((v) => !v)}
              className={cx(
                "inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                showDiscarded
                  ? "border-red-500/25 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              )}
            >
              <Trash2 className="h-4 w-4" />
              {showDiscarded ? "Mostrando descartados" : "Ocultar descartados"}
            </button>
          </div>
        </div>
      </div>

      {/* BULK WHATSAPP */}
      <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <SectionHeader
          title="Campanha WhatsApp"
          subtitle={showCampaignPanel ? "Prepare template Meta, audiencia e disparo." : undefined}
          icon={<Send className="h-4 w-4 text-emerald-600" />}
          right={
            <button
              type="button"
              onClick={() => setShowCampaignPanel((value) => !value)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <Send className="h-4 w-4" />
              {showCampaignPanel ? "Fechar campanha" : `Abrir campanha (${selectedWithPhone.length}/50)`}
            </button>
          }
        />

        {!showCampaignPanel ? (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-lg font-semibold text-slate-950">{filtered.length}</p>
              <p className="text-xs text-slate-500">leads filtrados</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-700">{selectableFilteredLeads.length}</p>
              <p className="text-xs text-slate-500">com telefone</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-blue-700">{selectedWithPhone.length}</p>
              <p className="text-xs text-slate-500">selecionados</p>
            </div>
          </div>
        ) : (
        <>
        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBulkMode("template")}
                className={cx(
                  "rounded-xl border px-4 py-3 text-left transition",
                  bulkMode === "template"
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-50"
                    : "border-slate-700/70 bg-slate-950/45 text-slate-300 hover:bg-slate-900"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4" />
                  Template Meta
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/50">
                  Recomendado para listas frias, fora da janela de 24h.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBulkMode("text")}
                className={cx(
                  "rounded-xl border px-4 py-3 text-left transition",
                  bulkMode === "text"
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-50"
                    : "border-slate-700/70 bg-slate-950/45 text-slate-300 hover:bg-slate-900"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <MessageCircle className="h-4 w-4" />
                  Texto legado
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/50">
                  Use apenas em operacoes controladas e com base legitima.
                </span>
              </button>
            </div>

            <input
              value={bulkCampaignName}
              onChange={(event) => setBulkCampaignName(event.target.value)}
              className="w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
              placeholder="Nome da campanha. Ex: Advogados - landing page"
            />

            {bulkMode === "template" ? (
              <div className="rounded-xl border border-emerald-400/15 bg-slate-950/35 p-4">
                <div className="mb-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
                        Biblioteca Meta
                      </p>
                      <p className="mt-1 text-[11px] text-white/45">
                        Escolha um template aprovado do WABA da Altum.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadCampaignAssets()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 py-2 text-[11px] text-slate-300 transition hover:bg-slate-700/70 hover:text-white"
                    >
                      {templatesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                      Atualizar
                    </button>
                  </div>

                  {templatesError ? (
                    <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                      {templatesError}
                    </p>
                  ) : null}

                  {approvedMetaTemplates.length > 0 ? (
                    <select
                      value={`${bulkTemplateName}::${bulkLanguageCode}`}
                      onChange={(event) => {
                        const [name, language] = event.target.value.split("::");
                        const template = approvedMetaTemplates.find(
                          (item) => item.name === name && item.language === language
                        );
                        if (template) applyMetaTemplate(template);
                      }}
                      className="mt-3 w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none"
                    >
                      <option value={`${bulkTemplateName}::${bulkLanguageCode}`}>Selecionar template aprovado</option>
                      {approvedMetaTemplates.map((template) => (
                        <option key={`${template.name}_${template.language}_${template.id || ""}`} value={`${template.name}::${template.language}`}>
                          {template.name} - {template.language} - {template.category}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-3 text-[11px] text-white/45">
                      Nenhum template aprovado carregado ainda. Voce ainda pode informar o nome manualmente.
                    </p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                  <input
                    value={bulkTemplateName}
                    onChange={(event) => setBulkTemplateName(event.target.value)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
                    placeholder="Nome do template aprovado. Ex: prospect_lp_altum"
                  />
                  <input
                    value={bulkLanguageCode}
                    onChange={(event) => setBulkLanguageCode(event.target.value)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
                    placeholder="pt_BR"
                  />
                </div>

                <textarea
                  value={bulkBodyParams}
                  onChange={(event) => setBulkBodyParams(event.target.value)}
                  rows={3}
                  className="mt-3 w-full resize-none rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
                  placeholder="Uma variavel por linha. Ex: {nome}"
                />

                <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr]">
                  <select
                    value={bulkHeaderMediaType}
                    onChange={(event) => setBulkHeaderMediaType(event.target.value as BulkHeaderMediaType)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none"
                  >
                    <option value="none">Sem midia</option>
                    <option value="image">Imagem</option>
                    <option value="video">Video</option>
                    <option value="document">Documento</option>
                  </select>
                  <input
                    value={bulkHeaderMediaLink}
                    onChange={(event) => setBulkHeaderMediaLink(event.target.value)}
                    disabled={bulkHeaderMediaType === "none"}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50 disabled:opacity-45"
                    placeholder="URL publica da midia aprovada no template"
                  />
                </div>

                {bulkHeaderMediaType === "document" ? (
                  <input
                    value={bulkHeaderMediaFilename}
                    onChange={(event) => setBulkHeaderMediaFilename(event.target.value)}
                    className="mt-3 w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50"
                    placeholder="Nome do arquivo. Ex: proposta-altum.pdf"
                  />
                ) : null}

                {selectedTemplate ? (
                  <div className="mt-3 rounded-xl border border-blue-500/15 bg-blue-500/10 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-blue-100">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      <span>{selectedTemplate.category}</span>
                      <span>{getTemplateVariables(selectedTemplate).length} variavel(is)</span>
                      <span>header: {getTemplateHeader(selectedTemplate)?.format || "sem midia"}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-blue-50/65">
                      {getTemplateBody(selectedTemplate) || "Template sem corpo retornado pela Meta."}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <textarea
                value={bulkMessage}
                onChange={(event) => setBulkMessage(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-amber-500/20 bg-slate-950/55 px-4 py-3 text-sm text-white/85 outline-none transition placeholder:text-slate-500 focus:border-amber-400/50"
                placeholder="Escreva uma mensagem objetiva para iniciar a conversa..."
              />
            )}

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
              <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2.5 py-1">Variaveis: {"{nome}"}</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2.5 py-1">{"{categoria}"}</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2.5 py-1">{"{origem}"}</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2.5 py-1">{"{cidade}"}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-semibold text-white/90">{filtered.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/40">filtrados</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-emerald-100">{selectableFilteredLeads.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/40">com telefone</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-blue-100">{selectedWithPhone.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/40">no lote</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                {bulkAudienceSummary.hot} quentes
              </div>
              <div className="rounded-lg border border-blue-500/15 bg-blue-500/10 px-3 py-2 text-blue-100">
                {bulkAudienceSummary.withIaReady} com IA
              </div>
              <div className="rounded-lg border border-purple-500/15 bg-purple-500/10 px-3 py-2 text-purple-100">
                {bulkAudienceSummary.withOffer} com oferta
              </div>
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/10 px-3 py-2 text-amber-100">
                {bulkAudienceSummary.missingPhone} sem telefone
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectVisibleLeads}
                disabled={selectableFilteredLeads.length === 0 || bulkSending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-700/70 disabled:opacity-50"
              >
                <CheckSquare className="h-4 w-4" />
                Selecionar visiveis
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedLeadIds.length === 0 || bulkSending}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-700/70 disabled:opacity-50"
              >
                Limpar
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Audiencia persistente
              </p>
              <input
                value={audienceName}
                onChange={(event) => setAudienceName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-3 py-2 text-xs text-white/80 outline-none placeholder:text-slate-500"
                placeholder="Nome da audiencia"
              />
              <button
                type="button"
                onClick={() => void saveAudience()}
                disabled={audienceSaving || selectedWithPhone.length === 0}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/15 disabled:opacity-45"
              >
                {audienceSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                Salvar audiencia
              </button>
            </div>

            {audiences.length > 0 ? (
              <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    Ultimas audiencias
                  </p>
                  {audiencesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/35" /> : null}
                </div>
                <div className="mt-2 space-y-2">
                  {audiences.slice(0, 3).map((audience) => (
                    <div key={audience.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-white/75">{audience.name}</p>
                        <span className="shrink-0 text-[11px] text-white/40">{audience.leadCount}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/40">
                        {audience.summary?.hot || 0} quentes / {audience.summary?.withIaReady || 0} com IA
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void sendBulkWhatsApp()}
              disabled={
                bulkSending ||
                selectedWithPhone.length === 0 ||
                (bulkMode === "text" && !bulkMessage.trim()) ||
                (bulkMode === "template" && !bulkTemplateName.trim())
              }
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
            >
              {bulkSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {bulkMode === "template" ? "Enviar template Meta" : "Enviar texto legado"}
            </button>

            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              Limite atual de 50 leads por lote. Opt-out e contatos recentes sao bloqueados antes do envio.
              A resposta entra no workspace e a IA recebe o contexto da campanha.
            </p>
          </div>
        </div>

        {bulkResult ? (
          <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/45 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                Enviados: {bulkResult.sent}
              </span>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-amber-100">
                Ignorados: {bulkResult.skipped}
              </span>
              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-red-100">
                Falhas: {bulkResult.failed}
              </span>
            </div>
            {bulkResult.results.some((item) => item.status !== "sent") ? (
              <div className="mt-3 space-y-1 text-xs text-white/55">
                {bulkResult.results
                  .filter((item) => item.status !== "sent")
                  .slice(0, 5)
                  .map((item) => (
                    <p key={item.leadId}>
                      {item.leadId}: {item.reason || item.status}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}
        </>
        )}
      </div>

      {/* GRID / LIST */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando leads...
        </div>
      ) : filtered.length === 0 && leads.length > 0 && activeFiltersCount > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex items-start gap-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <h3 className="text-base font-semibold">Nenhum lead apos filtros</h3>
              <p className="mt-1 text-sm text-amber-700">
                O CRM tem {metrics.total} lead(s), mas os filtros atuais estao escondendo a lista.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeFilterLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] text-amber-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Limpar filtros agora
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
            <Search className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">
              {isAdmin ? "Nenhum lead encontrado" : "Voce ainda nao tem leads atribuidos"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin 
                ? "Ajuste os filtros ou limpe a busca." 
                : "Peca ao administrador para distribuir leads para sua conta."}
          </p>
          <div className="mt-4 flex justify-center">
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCcw className="h-4 w-4" />
              Resetar filtros
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              isAdmin={isAdmin}
              selected={selectedLeadIds.includes(l.id)}
              onToggleSelected={() => toggleLeadSelection(l.id)}
              onOpenWhatsApp={() => openWhatsApp(l.telefone)}
              onDelete={() => setDeleteTarget(l)}
              onRunIntelligence={() => void runLeadIntelligence(l.id)}
              runningIntelligence={Boolean(intelRunning[l.id])}
            />
          ))}
        </div>
      )}

      {/* MODAL DELETE */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Remover lead</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Voce esta prestes a excluir <b className="text-slate-950">{deleteTarget.nome || "Lead sem nome"}</b>.
                  <br />
                  Isso remove o documento do lead (subcolecoes como <code className="text-slate-800">events</code> podem permanecer no Firestore).
                </p>
              </div>

              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Divider />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancelar
              </button>

              <button
                disabled={deleting}
                onClick={confirmDeleteLead}
                className={cx(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition",
                  "border border-red-500/25 bg-red-500/10 text-red-100 hover:bg-red-500/15",
                  deleting && "opacity-60"
                )}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================================================
   CARD PREMIUM (Lead)
====================================================== */

function LeadCard({
  lead,
  isAdmin,
  selected,
  onToggleSelected,
  onOpenWhatsApp,
  onDelete,
  onRunIntelligence,
  runningIntelligence,
}: {
  lead: Lead;
  isAdmin: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenWhatsApp: () => void;
  onDelete: () => void;
  onRunIntelligence: () => void;
  runningIntelligence: boolean;
}) {
  const status: LeadStatus = (lead.status || "novo") as LeadStatus;
  const priority: Priority = (lead.priority || "medium") as Priority;

  const hasStage = !!lead.stage;
  const hasOffer = !!lead.offer?.title;
  const contacted = !!lead.lastContactAt;
  const heat = (lead.heat || "").toLowerCase();
  const intelligenceStatus = (lead.intelligence?.status || "pending").toLowerCase();

  const stageText = stageLabel(lead.stage);

  return (
    <div
      className={cx(
        "group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        hasStage ? "border-slate-200 hover:border-blue-300" : "border-amber-300 hover:border-amber-400"
      )}
    >
      {/* TOP */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSelected}
              disabled={!lead.telefone}
              className={cx(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition",
                selected
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700",
                !lead.telefone && "cursor-not-allowed opacity-40"
              )}
              title={lead.telefone ? "Selecionar para disparo" : "Lead sem telefone"}
            >
              {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
            <p className="truncate text-sm font-semibold text-slate-950">
              {lead.nome || "Lead sem nome"}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", STATUS_STYLE[status])}>
              {STATUS_LABEL[status]}
            </span>

            <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", PRIORITY_BADGE[priority])}>
              {PRIORITY_LABEL[priority]}
            </span>

            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", heatClass(heat))}>
              {heatLabel(heat)}
            </span>

            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", intelligenceClass(intelligenceStatus))}>
              {intelligenceLabel(intelligenceStatus)}
            </span>

            {!hasStage ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                Sem etapa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-700">
                <Tags className="h-3.5 w-3.5" />
                {stageText}
              </span>
            )}
          </div>
        </div>

        {/* SÓ ADMIN PODE DELETAR */}
        {isAdmin && (
            <button
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 opacity-90 transition hover:bg-red-100 hover:opacity-100"
            title="Excluir lead"
            >
            <Trash2 className="h-4 w-4" />
            </button>
        )}
      </div>

      {/* BODY */}
      <div className="mt-4 space-y-2 text-xs text-slate-600">
        {lead.telefone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-800">{lead.telefone}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <span>Sem telefone (sem WhatsApp)</span>
          </div>
        )}

        {lead.origem ? (
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-slate-400" />
            <span>{lead.origem}</span>
          </div>
        ) : null}

        {lead.sourceType ? (
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-400" />
            <span>Canal: {lead.sourceType}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-400" />
          <span>
            Score: <b className="text-slate-900">{typeof lead.score === "number" ? Math.round(lead.score) : 0}</b>
            {lead.intelligence?.confidence ? ` | IA ${Math.round(lead.intelligence.confidence)}%` : ""}
          </span>
        </div>

        {lead.owner ? (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">
              Responsavel: <b className="text-slate-900">{lead.owner}</b>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <User className="h-4 w-4 text-slate-300" />
            <span>Sem responsavel definido</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Entrada
            </p>
            <p className="mt-1 text-xs text-slate-700">{formatDateOnly(lead.createdAt)}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              Ultimo contato
            </p>
            <p className="mt-1 text-xs text-slate-700">{formatDateOnly(lead.lastContactAt)}</p>
          </div>
        </div>

        {/* Offer */}
        <div className={cx("rounded-xl border p-3", hasOffer ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Oferta
              </p>
              <p className={cx("mt-1 text-xs font-semibold", hasOffer ? "text-emerald-800" : "text-slate-500")}>
                {hasOffer ? lead.offer?.title : "Sem oferta salva (salve no /[id])"}
              </p>
              {hasOffer ? (
                <p className="mt-1 text-[11px] text-slate-600">
                  Faixa: <b className="text-slate-900">{moneyBR(lead.offer?.priceFrom)}</b> -{" "}
                  <b className="text-slate-900">{moneyBR(lead.offer?.priceTo)}</b>
                </p>
              ) : null}
            </div>

            {hasOffer ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-100">
                <BadgeCheck className="h-4 w-4" />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>

        {!!lead.reasons?.length && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Motivos de qualificacao</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lead.reasons.slice(0, 3).map((reason) => (
                <span key={reason} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Status hints */}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            contacted ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
          )}>
            {contacted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
            {contacted ? "Contatado" : "Sem contato"}
          </span>

          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            hasStage ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"
          )}>
            <Tags className="h-3.5 w-3.5" />
            {hasStage ? "Diagnostico ok" : "Precisa diagnostico"}
          </span>

          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            hasOffer ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
          )}>
            <BadgeCheck className="h-3.5 w-3.5" />
            {hasOffer ? "Oferta pronta" : "Sem oferta"}
          </span>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={onOpenWhatsApp}
          disabled={!lead.telefone}
          className={cx(
            "col-span-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition",
            lead.telefone
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400"
          )}
          title={lead.telefone ? "Abrir WhatsApp" : "Sem telefone"}
        >
          <MessageCircle className="h-4 w-4" />
        </button>

        <Link
          href={`/admin/prospeccao/${lead.id}`}
          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Abrir lead <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <button
        onClick={onRunIntelligence}
        disabled={runningIntelligence}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
      >
        {runningIntelligence ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
        Atualizar IA deste lead
      </button>

      {/* subtle footer */}
      <div className="mt-3 text-[11px] text-slate-400">
        ID: <span className="font-mono text-slate-500">{lead.id}</span>
      </div>
    </div>
  );
}





