"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
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
  Sparkles,
  Filter,
  X,
  RefreshCcw,
  Calendar,
  BadgeCheck,
  ShieldCheck,
  Phone,
  Layers,
  BarChart3,
} from "lucide-react";

/* ======================================================
   TIPOS (compatível com /admin/prospeccao/[id])
====================================================== */

type LeadStatus =
  | "novo"
  | "contatado"
  | "respondido"
  | "qualificado"
  | "descartado";

type Priority = "low" | "medium" | "high";

type StageKey =
  | "INVISIVEL"
  | "PRESENTE_FRACO"
  | "SITE_RUIM"
  | "SITE_OK"
  | "TRAFEGO_ZERO"
  | "TRAFEGO_FRACO"
  | "TRAFEGO_OK"
  | "OPERACAO_ATIVA";

interface Lead {
  id: string;
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  categoria?: string;

  status?: LeadStatus;

  // CRM do /[id]
  stage?: string; // salva StageKey como string no seu código
  stageTags?: string[];
  owner?: string;
  priority?: Priority;

  notes?: string;
  nextStep?: string;

  offer?: {
    id: string;
    title: string;
    priceFrom: number;
    priceTo: number;
    pitch: string;
    deliverables: string[];
  };

  lastContactAt?: any;
  updatedAt?: any;
  createdAt?: any;
}

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
  novo: "bg-blue-500/10 text-blue-200 border border-blue-500/30",
  contatado: "bg-amber-500/10 text-amber-200 border border-amber-500/30",
  respondido: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/30",
  qualificado: "bg-purple-500/10 text-purple-200 border border-purple-500/30",
  descartado: "bg-red-500/10 text-red-200 border border-red-500/30",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-white/5 text-white/70 border border-white/10",
  medium: "bg-amber-500/10 text-amber-100 border border-amber-500/20",
  high: "bg-red-500/10 text-red-100 border border-red-500/25",
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

function safeToDate(ts: any): Date | null {
  try {
    if (!ts) return null;
    if (ts?.toDate) return ts.toDate();
    if (typeof ts === "number") return new Date(ts);
    return null;
  } catch {
    return null;
  }
}

function formatBR(ts: any) {
  const d = safeToDate(ts);
  if (!d) return "—";
  return d.toLocaleString("pt-BR");
}

function formatDateOnly(ts: any) {
  const d = safeToDate(ts);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
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
        ? "bg-red-600 text-white border-red-400/60"
        : "bg-red-500/10 text-red-100 border-red-500/20 hover:bg-red-500/15"
      : tone === "success"
        ? active
          ? "bg-emerald-600 text-white border-emerald-400/60"
          : "bg-emerald-500/10 text-emerald-100 border-emerald-500/20 hover:bg-emerald-500/15"
        : tone === "warning"
          ? active
            ? "bg-amber-600 text-white border-amber-400/60"
            : "bg-amber-500/10 text-amber-100 border-amber-500/20 hover:bg-amber-500/15"
          : tone === "info"
            ? active
              ? "bg-blue-600 text-white border-blue-400/60"
              : "bg-blue-500/10 text-blue-100 border-blue-500/20 hover:bg-blue-500/15"
            : active
              ? "bg-white/15 text-white border-white/30"
              : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10";

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] border transition backdrop-blur",
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
        "rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-4",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-white/45">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white/90">{value}</p>
          {sub ? <p className="mt-1 text-xs text-white/45">{sub}</p> : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/70">
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
        <div className="mt-0.5 text-white/60">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-white/45">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [search, setSearch] = useState("");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "todos">("todos");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "todas">("todas");
  const [stageFilter, setStageFilter] = useState<StageKey | "todos" | "sem">("todos");
  const [offerFilter, setOfferFilter] = useState<"todos" | "com" | "sem">("todos");
  const [contactFilter, setContactFilter] = useState<"todos" | "contatado" | "nunca">("todos");
  const [workedFilter, setWorkedFilter] = useState<"todos" | "trabalhado" | "cru">("todos");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [sort, setSort] = useState<SortKey>("created_desc");

  // fila inteligente (chips)
  const [queueMode, setQueueMode] = useState<
    "none" | "atacar_agora" | "sem_estagio" | "alta_prioridade" | "nunca_contatado" | "com_oferta"
  >("none");

  // delete
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ======================================================
     FETCH
  ====================================================== */

  useEffect(() => {
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Lead[];
        setLeads(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

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

      if (queueMode === "atacar_agora") {
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
    stageFilter,
    offerFilter,
    contactFilter,
    workedFilter,
    datePreset,
    sort,
  ]);

  /* ======================================================
     HELPERS (ações)
  ====================================================== */

  function openWhatsApp(phone?: string) {
    if (!phone) return;
    const digits = onlyDigits(phone);
    if (!digits) return;
    window.open(`https://wa.me/55${digits}`, "_blank", "noopener,noreferrer");
  }

  async function confirmDeleteLead() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "leads", deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("todos");
    setPriorityFilter("todas");
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
    stageFilter,
    offerFilter,
    contactFilter,
    workedFilter,
    datePreset,
    queueMode,
    showDiscarded,
  ]);

  /* ======================================================
     UI
  ====================================================== */

  return (
    <div className="space-y-6">
      {/* HERO HEADER */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-transparent to-transparent p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/60">
              <ShieldCheck className="h-4 w-4" />
              ALTUM • Painel Operacional
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-wide">
              Prospecção / CRM
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Controle total do funil: priorize, ataque, qualifique, converta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill
              tone="warning"
              active={queueMode === "atacar_agora"}
              onClick={() => setQueueMode((v) => (v === "atacar_agora" ? "none" : "atacar_agora"))}
              title="High + recente + não qualificado"
            >
              <Flame className="h-4 w-4" />
              ATACAR AGORA
            </Pill>

            <Pill
              tone="info"
              active={queueMode === "sem_estagio"}
              onClick={() => setQueueMode((v) => (v === "sem_estagio" ? "none" : "sem_estagio"))}
            >
              <AlertTriangle className="h-4 w-4" />
              Sem estágio
            </Pill>

            <Pill
              tone="danger"
              active={queueMode === "alta_prioridade"}
              onClick={() => setQueueMode((v) => (v === "alta_prioridade" ? "none" : "alta_prioridade"))}
            >
              <Flame className="h-4 w-4" />
              Alta prioridade
            </Pill>

            <Pill
              tone="default"
              active={queueMode === "nunca_contatado"}
              onClick={() => setQueueMode((v) => (v === "nunca_contatado" ? "none" : "nunca_contatado"))}
            >
              <Phone className="h-4 w-4" />
              Nunca contatado
            </Pill>

            <Pill
              tone="success"
              active={queueMode === "com_oferta"}
              onClick={() => setQueueMode((v) => (v === "com_oferta" ? "none" : "com_oferta"))}
            >
              <BadgeCheck className="h-4 w-4" />
              Com oferta
            </Pill>

            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 transition"
              title="Limpar filtros"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset
              {activeFiltersCount > 0 ? (
                <span className="ml-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/70">
                  {activeFiltersCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Total" value={`${metrics.total}`} sub="Leads ativos no painel" />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Novos" value={`${metrics.novos}`} sub="Ainda não trabalhados" />
          <StatCard icon={<Phone className="h-5 w-5" />} label="Nunca contatados" value={`${metrics.nuncaContatado}`} sub="Sem lastContactAt" />
          <StatCard icon={<Layers className="h-5 w-5" />} label="Sem estágio" value={`${metrics.semStage}`} sub="Precisa de diagnóstico" />
        </div>
      </div>

      {/* FILTERS PANEL */}
      <div className="rounded-3xl border border-white/10 bg-[#0f0f0f] p-5">
        <SectionHeader
          title="Filtros avançados"
          subtitle="Filtre como um CRM de verdade: status, prioridade, estágio, oferta, contato e janela de tempo."
          icon={<Filter className="h-4 w-4" />}
          right={
            <div className="text-[11px] text-white/40">
              {loading ? "Carregando..." : `${filtered.length} leads exibidos`}
            </div>
          }
        />

        <Divider />

        <div className="mt-4 grid gap-3 lg:grid-cols-12">
          {/* Search */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-white/35" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, e-mail, origem..."
                className="w-full bg-transparent text-sm text-white/85 outline-none placeholder:text-white/30"
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 hover:bg-white/10 transition"
                  title="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Status */}
          <div className="lg:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
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
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
            >
              <option value="todas">Prioridade (todas)</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>
          </div>

          {/* Stage */}
          <div className="lg:col-span-3">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
            >
              <option value="todos">Estágio (todos)</option>
              <option value="sem">Sem estágio</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Offer */}
          <div className="lg:col-span-2">
            <select
              value={offerFilter}
              onChange={(e) => setOfferFilter(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
            >
              <option value="todos">Oferta (todas)</option>
              <option value="com">Com oferta</option>
              <option value="sem">Sem oferta</option>
            </select>
          </div>

          {/* Contact */}
          <div className="lg:col-span-2">
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
            >
              <option value="todos">Contato (todos)</option>
              <option value="contatado">Já contatado</option>
              <option value="nunca">Nunca contatado</option>
            </select>
          </div>

          {/* Worked */}
          <div className="lg:col-span-2">
            <select
              value={workedFilter}
              onChange={(e) => setWorkedFilter(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
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
              onChange={(e) => setDatePreset(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
            >
              <option value="all">Data (tudo)</option>
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </div>

          {/* Sort */}
          <div className="lg:col-span-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
            >
              <option value="created_desc">Ordenar: + recentes</option>
              <option value="created_asc">Ordenar: + antigos</option>
              <option value="updated_desc">Ordenar: atualizados</option>
              <option value="contact_desc">Ordenar: último contato</option>
            </select>
          </div>

          {/* Discarded toggle */}
          <div className="lg:col-span-2 flex items-center">
            <button
              onClick={() => setShowDiscarded((v) => !v)}
              className={cx(
                "w-full inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm transition",
                showDiscarded
                  ? "border-red-500/25 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              )}
            >
              <Trash2 className="h-4 w-4" />
              {showDiscarded ? "Mostrando descartados" : "Ocultar descartados"}
            </button>
          </div>
        </div>
      </div>

      {/* GRID / LIST */}
      {loading ? (
        <div className="flex items-center gap-2 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando leads...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-[#0f0f0f] p-8 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70">
            <Search className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white/85">Nenhum lead encontrado</h3>
          <p className="mt-1 text-sm text-white/50">
            Ajuste os filtros ou limpe a busca para ver os leads novamente.
          </p>
          <div className="mt-4 flex justify-center">
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
            >
              <RefreshCcw className="h-4 w-4" />
              Resetar filtros
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              onOpenWhatsApp={() => openWhatsApp(l.telefone)}
              onDelete={() => setDeleteTarget(l)}
            />
          ))}
        </div>
      )}

      {/* MODAL DELETE */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0b] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white/90">Remover lead</h3>
                <p className="mt-1 text-sm text-white/55">
                  Você está prestes a excluir <b className="text-white/80">{deleteTarget.nome || "Lead sem nome"}</b>.
                  <br />
                  Isso remove o documento do lead (subcoleções como <code className="text-white/70">events</code> podem permanecer no Firestore).
                </p>
              </div>

              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-2xl border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Divider />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
              >
                Cancelar
              </button>

              <button
                disabled={deleting}
                onClick={confirmDeleteLead}
                className={cx(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition",
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
  onOpenWhatsApp,
  onDelete,
}: {
  lead: Lead;
  onOpenWhatsApp: () => void;
  onDelete: () => void;
}) {
  const status: LeadStatus = (lead.status || "novo") as LeadStatus;
  const priority: Priority = (lead.priority || "medium") as Priority;

  const hasStage = !!lead.stage;
  const hasOffer = !!lead.offer?.title;
  const contacted = !!lead.lastContactAt;

  const stageText = stageLabel(lead.stage);

  return (
    <div
      className={cx(
        "group rounded-3xl border bg-[#0f0f0f] p-4 transition",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        hasStage ? "border-white/10 hover:border-blue-500/25" : "border-amber-500/25 hover:border-amber-500/40"
      )}
    >
      {/* TOP */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white/90">
            {lead.nome || "Lead sem nome"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", STATUS_STYLE[status])}>
              {STATUS_LABEL[status]}
            </span>

            <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", PRIORITY_BADGE[priority])}>
              {PRIORITY_LABEL[priority]}
            </span>

            {!hasStage ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                Sem estágio
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-100">
                <Tags className="h-3.5 w-3.5" />
                {stageText}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onDelete}
          className="rounded-2xl border border-red-500/20 bg-red-500/10 p-2 text-red-100 opacity-90 hover:opacity-100 hover:bg-red-500/15 transition"
          title="Excluir lead"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* BODY */}
      <div className="mt-4 space-y-2 text-xs text-white/70">
        {lead.telefone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-white/35" />
            <span className="font-medium text-white/80">{lead.telefone}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <span>Sem telefone (sem WhatsApp)</span>
          </div>
        )}

        {lead.origem ? (
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-white/35" />
            <span>{lead.origem}</span>
          </div>
        ) : null}

        {lead.owner ? (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-white/35" />
            <span className="text-white/75">
              Responsável: <b className="text-white/85">{lead.owner}</b>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white/45">
            <User className="h-4 w-4 text-white/25" />
            <span>Sem responsável definido</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] uppercase tracking-wide text-white/40 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Entrada
            </p>
            <p className="mt-1 text-xs text-white/80">{formatDateOnly(lead.createdAt)}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] uppercase tracking-wide text-white/40 flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              Último contato
            </p>
            <p className="mt-1 text-xs text-white/80">{formatDateOnly(lead.lastContactAt)}</p>
          </div>
        </div>

        {/* Offer */}
        <div className={cx("rounded-2xl border p-3", hasOffer ? "border-emerald-500/20 bg-emerald-500/10" : "border-white/10 bg-black/20")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-white/45">
                Oferta
              </p>
              <p className={cx("mt-1 text-xs font-semibold", hasOffer ? "text-emerald-100" : "text-white/60")}>
                {hasOffer ? lead.offer?.title : "Sem oferta salva (salve no /[id])"}
              </p>
              {hasOffer ? (
                <p className="mt-1 text-[11px] text-white/70">
                  Faixa: <b className="text-white/85">{moneyBR(lead.offer?.priceFrom)}</b> –{" "}
                  <b className="text-white/85">{moneyBR(lead.offer?.priceTo)}</b>
                </p>
              ) : null}
            </div>

            {hasOffer ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-100">
                <BadgeCheck className="h-4 w-4" />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-white/60">
                <AlertTriangle className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>

        {/* Status hints */}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            contacted ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/55"
          )}>
            {contacted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
            {contacted ? "Contatado" : "Sem contato"}
          </span>

          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            hasStage ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-amber-500/20 bg-amber-500/10 text-amber-100"
          )}>
            <Tags className="h-3.5 w-3.5" />
            {hasStage ? "Diagnóstico ok" : "Precisa diagnóstico"}
          </span>

          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            hasOffer ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/55"
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
            "col-span-1 inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm transition",
            lead.telefone
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-white/5 text-white/35 border border-white/10 cursor-not-allowed"
          )}
          title={lead.telefone ? "Abrir WhatsApp" : "Sem telefone"}
        >
          <MessageCircle className="h-4 w-4" />
        </button>

        <Link
          href={`/admin/prospeccao/${lead.id}`}
          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
        >
          Abrir lead <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* subtle footer */}
      <div className="mt-3 text-[11px] text-white/35">
        ID: <span className="font-mono text-white/45">{lead.id}</span>
      </div>
    </div>
  );
}
