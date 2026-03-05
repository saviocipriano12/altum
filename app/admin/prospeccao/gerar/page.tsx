"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowLeft,
  Loader2,
  Play,
  Save,
  RefreshCcw,
  MapPin,
  Phone,
  Globe,
  AlertTriangle,
  CheckCircle2,
  X,
  Filter,
  ShieldCheck,
  Sparkles,
  Flame,
  TrendingUp,
  Zap,
  BadgeCheck,
  Trash2,
  Copy,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Unlock, // Icone do Resgate
  DollarSign, // Icone de Preco
  Clock // Icone de Horario
} from "lucide-react";

/* ======================================================
   TIPOS (FUSAO DO ANTIGO + NOVO)
====================================================== */

type LeadFromAPI = {
  placeId: string;
  nome: string;
  endereco?: string;
  telefone?: string;
  website?: string;
  categoria?: string;
  rating?: number;
  userRatingsTotal?: number;
  origem?: string;

  // NOVOS DADOS DA API TURBINADA
  lat?: number;
  lng?: number;
  priceLevel?: number; // 0 a 4
  isOpenNow?: boolean;
  photos?: string[];
};

type Heat = "quente" | "morno" | "frio";

type LeadQualified = LeadFromAPI & {
  _score: number;
  _heat: Heat;
  _reasons: string[];
  _blockedReasons: string[]; // se descartado
  _hasPhone: boolean;
  _hasWebsite: boolean;
  _rating: number | null;
  _ratingsTotal: number | null;
  _isRescued?: boolean; // Controle de Resgate Manual
};

type ProspectPreset = {
  id: string;
  label: string;
  servico: string;
  nicho: string;
  cidade: string;
  bannedWords: string;
  preferredWords: string;
  minRating: number;
  minRatingsTotal: number;
  scoreMin: number;
};

const SEARCH_PRESETS: ProspectPreset[] = [
  {
    id: "custom",
    label: "Customizado",
    servico: "",
    nicho: "",
    cidade: "",
    bannedWords: "delivery, ifood, atacado, distribuidora",
    preferredWords: "premium, boutique, clinica, estetica, dermatologia",
    minRating: 4.0,
    minRatingsTotal: 15,
    scoreMin: 55,
  },
  {
    id: "clinica_estetica",
    label: "Clinicas de Estetica",
    servico: "marketing digital",
    nicho: "clinica estetica",
    cidade: "Belo Horizonte, MG",
    bannedWords: "franquia, escola, atacado, distribuidora",
    preferredWords: "harmonizacao, dermatologia, odontologia estetica, premium",
    minRating: 4.1,
    minRatingsTotal: 18,
    scoreMin: 60,
  },
  {
    id: "restaurante_local",
    label: "Restaurantes Locais",
    servico: "marketing para restaurante",
    nicho: "restaurante",
    cidade: "Belo Horizonte, MG",
    bannedWords: "franquia, atacado, distribuidora, industria",
    preferredWords: "bistro, pizzaria, hamburgueria, culinaria",
    minRating: 4.0,
    minRatingsTotal: 25,
    scoreMin: 58,
  },
  {
    id: "advocacia",
    label: "Escritorios de Advocacia",
    servico: "captação de clientes",
    nicho: "advogado",
    cidade: "Sao Paulo, SP",
    bannedWords: "faculdade, curso, defensoria, orgao publico",
    preferredWords: "tributario, empresarial, trabalhista, previdenciario",
    minRating: 4.2,
    minRatingsTotal: 12,
    scoreMin: 62,
  },
];

/* ======================================================
   HELPERS
====================================================== */

function cx(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function formatPhoneBR(phone?: string) {
  if (!phone) return "";
  const d = onlyDigits(phone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function safeUrl(u?: string) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function scoreToHeat(score: number): Heat {
  if (score >= 80) return "quente";
  if (score >= 55) return "morno";
  return "frio";
}

function heatBadge(heat: Heat) {
  switch (heat) {
    case "quente":
      return { label: "QUENTE", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30", icon: <Flame className="h-3.5 w-3.5" /> };
    case "morno":
      return { label: "MORNO", cls: "bg-amber-500/10 text-amber-200 border-amber-500/30", icon: <TrendingUp className="h-3.5 w-3.5" /> };
    default:
      return { label: "FRIO", cls: "bg-white/5 text-white/70 border-white/10", icon: <Zap className="h-3.5 w-3.5 opacity-80" /> };
  }
}

function scoreBadge(score: number) {
  if (score >= 85) return { label: "A+", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" };
  if (score >= 75) return { label: "A", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" };
  if (score >= 65) return { label: "B", cls: "bg-amber-500/10 text-amber-200 border-amber-500/30" };
  if (score >= 55) return { label: "C", cls: "bg-white/5 text-white/70 border-white/10" };
  return { label: "D", cls: "bg-red-500/10 text-red-200 border-red-500/30" };
}

function normalizeCategory(c?: string) {
  return (c || "").toLowerCase().trim();
}

/**
 * Logica de Pontuacao "CEO Mode" Expandida
 */
function computeQualification(
  l: LeadFromAPI,
  rules: {
    requirePhone: boolean;
    minRating: number;
    minRatingsTotal: number;
    requireWebsite: "qualquer" | "sim" | "nao";
    bannedWords: string[];
    preferredWords: string[];
    scoreMin: number;
  }
): LeadQualified {
  const name = (l.nome || "").trim();
  const category = normalizeCategory(l.categoria);
  const address = (l.endereco || "").toLowerCase();

  const hasPhone = !!onlyDigits(l.telefone || "");
  const hasWebsite = !!(l.website && l.website.trim().length > 0);

  const rating = typeof l.rating === "number" ? l.rating : null;
  const ratingsTotal = typeof l.userRatingsTotal === "number" ? l.userRatingsTotal : null;

  const blocked: string[] = [];
  const reasons: string[] = [];

  // Hard rules
  if (rules.requirePhone && !hasPhone) blocked.push("Sem telefone (bloqueado)");
  if (rating !== null && rating < rules.minRating) blocked.push(`Rating < ${rules.minRating.toFixed(1)}`);
  if (ratingsTotal !== null && ratingsTotal < rules.minRatingsTotal) blocked.push(`Poucas avaliacoes (< ${rules.minRatingsTotal})`);

  if (rules.requireWebsite === "sim" && !hasWebsite) blocked.push("Sem site (exigido)");
  if (rules.requireWebsite === "nao" && hasWebsite) blocked.push("Tem site (excluido)");

  // Banned words
  const hay = `${name} ${category} ${address}`.toLowerCase();
  for (const w of rules.bannedWords) {
    const ww = w.trim().toLowerCase();
    if (!ww) continue;
    if (hay.includes(ww)) blocked.push(`Contem palavra proibida: "${ww}"`);
  }

  // Score Calculation
  let score = 0;
  score += 10; // Base

  if (hasPhone) {
    score += 40;
    reasons.push("Tem telefone");
  }

  if (hasWebsite) {
    score += 10;
    reasons.push("Tem site");
  } else {
    score += 6;
    reasons.push("Sem site (oportunidade)");
  }

  if (rating !== null) {
    const r = clamp(rating, 0, 5);
    score += Math.round((r / 5) * 18);
    if (r >= 4.4) reasons.push("Rating alto");
  } else {
    score += 4;
  }

  if (ratingsTotal !== null) {
    const rt = clamp(ratingsTotal, 0, 300);
    score += Math.round((rt / 300) * 18);
    if (ratingsTotal >= 80) reasons.push("Muitas avaliacoes");
  } else {
    score += 2;
  }

  let boost = 0;
  for (const w of rules.preferredWords) {
    const ww = w.trim().toLowerCase();
    if (!ww) continue;
    if (hay.includes(ww)) boost += 4;
  }
  if (boost > 0) reasons.push("Match em palavras desejadas");
  score += clamp(boost, 0, 12);

  // === REGRAS NOVAS (Backend Turbinado) ===
  if (l.priceLevel && l.priceLevel >= 3) {
    score += 10;
    reasons.push("Ticket Alto ($$$)");
  }
  if (l.isOpenNow) {
    score += 2; // Bonus pequeno por estar aberto para atender agora
  }
  if (l.photos && l.photos.length >= 1) {
    score += 3;
    reasons.push("Tem fotos (ativos)");
  }

  if (name.length < 6) score -= 6;
  if (name.toLowerCase().includes("ltda")) score += 2;

  score = clamp(score, 0, 100);

  if (score < rules.scoreMin) blocked.push(`Score abaixo do minimo (${rules.scoreMin})`);

  const heat = scoreToHeat(score);

  return {
    ...l,
    _score: score,
    _heat: heat,
    _reasons: reasons,
    _blockedReasons: blocked,
    _hasPhone: hasPhone,
    _hasWebsite: hasWebsite,
    _rating: rating,
    _ratingsTotal: ratingsTotal,
  };
}

/* ======================================================
   UI COMPONENTS (VISUAL RICO DO CODIGO ANTIGO)
====================================================== */

function SectionHeader({
  title,
  subtitle,
  icon,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-white/60">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/75">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-white/45">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "default" | "green" | "amber" | "blue" | "red";
}) {
  const accentCls =
    accent === "green"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : accent === "amber"
      ? "border-amber-500/20 bg-amber-500/5"
      : accent === "blue"
      ? "border-blue-500/20 bg-blue-500/5"
      : accent === "red"
      ? "border-red-500/20 bg-red-500/5"
      : "border-white/10 bg-white/[0.03]";

  return (
    <div className={cx("rounded-2xl border p-4", accentCls)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/45">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white/90">{value}</p>
          {hint ? <p className="mt-1 text-xs text-white/45">{hint}</p> : null}
        </div>
        {icon ? <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70">{icon}</div> : null}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  tone = "neutral",
  icon,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "green" | "amber" | "blue" | "red";
  icon?: React.ReactNode;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition select-none";
  const toneCls =
    tone === "green"
      ? active
        ? "bg-emerald-600 text-white border-emerald-400/60"
        : "bg-emerald-500/10 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/15"
      : tone === "amber"
      ? active
        ? "bg-amber-600 text-white border-amber-400/60"
        : "bg-amber-500/10 text-amber-200 border-amber-500/30 hover:bg-amber-500/15"
      : tone === "blue"
      ? active
        ? "bg-blue-600 text-white border-blue-400/60"
        : "bg-blue-500/10 text-blue-200 border-blue-500/30 hover:bg-blue-500/15"
      : tone === "red"
      ? active
        ? "bg-red-600 text-white border-red-400/60"
        : "bg-red-500/10 text-red-200 border-red-500/30 hover:bg-red-500/15"
      : active
      ? "bg-white/15 text-white border-white/20"
      : "bg-white/5 text-white/75 border-white/10 hover:bg-white/10";

  return (
    <button type="button" onClick={onClick} className={cx(base, toneCls)}>
      {icon ? <span className="opacity-90">{icon}</span> : null}
      {label}
    </button>
  );
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

/* ======================================================
   PAGE COMPONENT
====================================================== */

export default function GerarLeadsPremiumPage() {
  const { user, profile } = useAuth();
  // Core inputs
  const [selectedPresetId, setSelectedPresetId] = useState("custom");
  const [servico, setServico] = useState("restaurante");
  const [nicho, setNicho] = useState("restaurante");
  const [cidade, setCidade] = useState("Belo Horizonte, MG");
  const [searchHintsRaw, setSearchHintsRaw] = useState("");

  // Acquisition controls
  const [limitValid, setLimitValid] = useState(15);
  const [maxPages, setMaxPages] = useState(2);
  const [excludeExistingInCrm, setExcludeExistingInCrm] = useState(true);
  const [mode, setMode] = useState<"conservador" | "balanceado" | "agressivo">("balanceado");

  // Quality rules
  const [minRating, setMinRating] = useState(4.0);
  const [minRatingsTotal, setMinRatingsTotal] = useState(15);
  const [requireWebsite, setRequireWebsite] = useState<"qualquer" | "sim" | "nao">("qualquer");
  const [scoreMin, setScoreMin] = useState(55);

  // Keyword controls
  const [bannedWords, setBannedWords] = useState("delivery, ifood, atacado, distribuidora");
  const [preferredWords, setPreferredWords] = useState("premium, boutique, clinica, estetica, dermatologia");

  // STATE: Resgate Manual (A chave para o controle)
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});

  // Run state
  const [loadingBuscar, setLoadingBuscar] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [autoIntelligence, setAutoIntelligence] = useState(true);

  // Results
  const [rawLeads, setRawLeads] = useState<LeadFromAPI[]>([]);
  const [qualified, setQualified] = useState<LeadQualified[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showDiscarded, setShowDiscarded] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: "ok" | "warn" | "err"; msg: string } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushLog(m: string) {
    setLogs((prev) => [`${new Date().toLocaleTimeString("pt-BR")} - ${m}`, ...prev].slice(0, 30));
  }

  function showToast(type: "ok" | "warn" | "err", msg: string) {
    setToast({ type, msg });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }

  const queryPreview = useMemo(() => {
    const parts = [servico, nicho, cidade].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, [servico, nicho, cidade]);

  useEffect(() => {
    const preset = SEARCH_PRESETS.find((item) => item.id === selectedPresetId);
    if (!preset || preset.id === "custom") return;

    setServico(preset.servico);
    setNicho(preset.nicho);
    setCidade(preset.cidade);
    setBannedWords(preset.bannedWords);
    setPreferredWords(preset.preferredWords);
    setMinRating(preset.minRating);
    setMinRatingsTotal(preset.minRatingsTotal);
    setScoreMin(preset.scoreMin);
  }, [selectedPresetId]);

  useEffect(() => {
    if (mode === "conservador") {
      setScoreMin(70);
      setMinRating(4.3);
      setMinRatingsTotal(35);
    }
    if (mode === "balanceado") {
      setScoreMin(55);
      setMinRating(4.0);
      setMinRatingsTotal(15);
    }
    if (mode === "agressivo") {
      setScoreMin(45);
      setMinRating(3.8);
      setMinRatingsTotal(5);
    }
  }, [mode]);

  const rules = useMemo(() => {
    return {
      requirePhone: true,
      minRating,
      minRatingsTotal,
      requireWebsite,
      bannedWords: bannedWords.split(",").map((s) => s.trim()).filter(Boolean),
      preferredWords: preferredWords.split(",").map((s) => s.trim()).filter(Boolean),
      scoreMin,
    };
  }, [minRating, minRatingsTotal, requireWebsite, bannedWords, preferredWords, scoreMin]);

  // LOGICA COMPUTADA + RESGATE (FUSAO)
  const computed = useMemo(() => {
    const q = rawLeads.map((l) => {
        const qual = computeQualification(l, rules);
        // Logica de Resgate: Se estiver na lista manual, limpa bloqueios
        if (manualOverrides[l.placeId]) {
            qual._blockedReasons = [];
            qual._isRescued = true;
            qual._reasons.push("Resgatado Manualmente");
        }
        return qual;
    });

    // Aprovados = sem bloqueios
    const approved = q.filter((x) => x._blockedReasons.length === 0);

    // Descartados = com bloqueios
    const discarded = q.filter((x) => x._blockedReasons.length > 0);

    // Ordenacao: Resgatados ou Score Alto primeiro
    approved.sort((a, b) => {
        if (a._isRescued && !b._isRescued) return -1;
        if (!a._isRescued && b._isRescued) return 1;
        return b._score - a._score;
    });

    const topApproved = approved.slice(0, clamp(limitValid, 1, 100));

    return { all: q, approved: topApproved, discarded, approvedAll: approved };
  }, [rawLeads, rules, limitValid, manualOverrides]);

  useEffect(() => {
    setQualified(computed.approved);
    const map: Record<string, boolean> = {};
    for (const l of computed.approved) map[l.placeId] = true;
    setSelected(map);
  }, [computed.approved]);

  const stats = useMemo(() => {
    const total = computed.all.length;
    const approved = computed.approved.length;
    const approvedAll = computed.approvedAll.length;
    const discarded = computed.discarded.length;
    const quentes = computed.approved.filter((x) => x._heat === "quente").length;
    const mornos = computed.approved.filter((x) => x._heat === "morno").length;
    const frios = computed.approved.filter((x) => x._heat === "frio").length;
    const withSite = computed.approved.filter((x) => x._hasWebsite).length;
    const selectedCount = Object.values(selected).filter(Boolean).length;
    const ratio = total > 0 ? approvedAll / total : 0;

    return { total, approved, approvedAll, discarded, quentes, mornos, frios, withSite, selectedCount, ratio };
  }, [computed, selected]);

  const selectedLeadsList = useMemo(() => {
    return qualified.filter((l) => selected[l.placeId]);
  }, [qualified, selected]);

  async function buscarLeads() {
    setError(null);
    setLogs([]);
    setRawLeads([]);
    setQualified([]);
    setManualOverrides({}); // Limpa resgates anteriores
    setSelected({});

    if (!servico.trim() || !cidade.trim()) {
      setError("Preencha servico e cidade.");
      return;
    }

    setLoadingBuscar(true);
    pushLog("Iniciando prospeccao no Google Places...");

    try {
      const hints = searchHintsRaw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);

      const res = await authedFetch("/api/prospeccao/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: nicho.trim(),
          cidade: cidade.trim(),
          servico: servico.trim(),
          limit: clamp(limitValid, 1, 80),
          maxPages: clamp(maxPages, 1, 3),
          searchHints: hints,
          bannedWords: bannedWords
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 20),
          preferredWords: preferredWords
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 20),
          requirePhone: true,
          minRating,
          minRatingsTotal,
          excludeExistingInCrm,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao buscar leads.");
        pushLog(`Erro: ${data?.error}`);
        return;
      }

      const items: LeadFromAPI[] = data?.leads || [];
      setRawLeads(items);
      const meta = (data?.meta || {}) as {
        uniquePlaces?: number;
        inspectedDetails?: number;
        removedNoPhone?: number;
        removedByBannedWords?: number;
        afterDedupe?: number;
      };
      pushLog(
        `Busca finalizada. ${items.length} leads prontos (detalhes: ${
          meta.inspectedDetails || 0
        }, sem telefone removidos: ${meta.removedNoPhone || 0}).`
      );
      if (typeof meta.removedByBannedWords === "number" && meta.removedByBannedWords > 0) {
        pushLog(`Filtro por palavras removeu ${meta.removedByBannedWords} resultado(s).`);
      }
      if (typeof meta.uniquePlaces === "number") {
        pushLog(`Places unicos analisados: ${meta.uniquePlaces}.`);
      }
      showToast("ok", "Prospeccao concluida.");
    } catch (e: unknown) {
      console.error(e);
      setError("Falha ao conectar na API de prospeccao.");
    } finally {
      setLoadingBuscar(false);
    }
  }

  async function salvarNoCRM() {
    setError(null);
    const list = selectedLeadsList;

    if (!list.length) {
      setError("Nenhum lead selecionado.");
      showToast("warn", "Selecione pelo menos 1 lead.");
      return;
    }

    setLoadingSalvar(true);
    pushLog("Salvando leads no CRM...");

    try {
      let ok = 0;
      let fail = 0;
      const intelligenceJobs: Promise<void>[] = [];

      for (const l of list) {
        try {
          const rawPhone = (l.telefone || "").replace(/\D/g, "");
          if (!rawPhone) {
            fail++;
            continue;
          }
          const cleanPhone = rawPhone.length >= 10 ? (rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`) : l.telefone || "";

          const res = await authedFetch("/api/leads/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: l.placeId,
              sourceId: l.placeId,
              sourceType: "google_places",
              ownerId:
                profile?.role === "admin" ||
                profile?.role === "agency_owner" ||
                profile?.role === "agency_admin"
                  ? null
                  : user?.uid,
              owner:
                profile?.role === "admin" ||
                profile?.role === "agency_owner" ||
                profile?.role === "agency_admin"
                  ? null
                  : profile?.name || user?.displayName || "Time ALTUM",
              nome: l.nome,
              endereco: l.endereco,
              telefone: cleanPhone,
              website: l.website,
              categoria: l.categoria,
              origem: l.origem || "google_places",
              status: "novo",
              pipelineStage: "captado",
              kanbanIndex: 0,
              score: l._score,
              heat: l._heat,
              reasons: l._reasons,
              foiResgatado: !!l._isRescued,
              rating: l.rating,
              userRatingsTotal: l.userRatingsTotal,
              lat: l.lat,
              lng: l.lng,
              priceLevel: l.priceLevel,
              isOpenNow: l.isOpenNow,
              photos: l.photos || [],
              autoIntelligence,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || "Falha ao salvar lead.");
          }

          const createdLeadId =
            typeof data?.id === "string" && data.id.trim() ? data.id.trim() : l.placeId;

          if (autoIntelligence && createdLeadId) {
            intelligenceJobs.push(
              (async () => {
                const enrichmentRes = await authedFetch("/api/leads/intelligence/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    leadId: createdLeadId,
                    trigger: "google_places_batch",
                  }),
                });
                if (!enrichmentRes.ok) {
                  const enrichmentData = await enrichmentRes.json().catch(() => ({}));
                  throw new Error(enrichmentData?.error || "Falha na pesquisa de IA.");
                }
              })()
            );
          }

          ok++;
        } catch (err) {
          console.error(err);
          fail++;
        }
      }

      if (autoIntelligence && intelligenceJobs.length) {
        pushLog(`Rodando pesquisa automatica em ${intelligenceJobs.length} lead(s)...`);
        const settled = await Promise.allSettled(intelligenceJobs);
        const intelligenceOk = settled.filter((item) => item.status === "fulfilled").length;
        const intelligenceFail = settled.length - intelligenceOk;
        pushLog(`Pesquisa IA: ${intelligenceOk} ok | ${intelligenceFail} falhas.`);
      }

      pushLog(`Salvos: ${ok} | Falhas: ${fail}`);
      if (ok > 0) showToast("ok", `Salvos no CRM: ${ok}`);
    } catch {
      setError("Falha ao salvar no Firestore.");
    } finally {
      setLoadingSalvar(false);
    }
  }

  function toggleSelectAll(v: boolean) {
    const map: Record<string, boolean> = {};
    for (const l of qualified) map[l.placeId] = v;
    setSelected(map);
  }

  function selectOnlyHeat(heat: Heat) {
    const map: Record<string, boolean> = {};
    for (const l of qualified) map[l.placeId] = l._heat === heat;
    setSelected(map);
  }

  function selectTop(n: number) {
    const map: Record<string, boolean> = {};
    const top = qualified.slice(0, clamp(n, 1, qualified.length));
    for (const l of qualified) map[l.placeId] = false;
    for (const l of top) map[l.placeId] = true;
    setSelected(map);
  }

  async function copy(text: string, okMsg = "Copiado!") {
    try { await navigator.clipboard.writeText(text); showToast("ok", okMsg); } catch { showToast("err", "Erro ao copiar"); }
  }

  const busy = loadingBuscar || loadingSalvar;

  return (
    <div className="space-y-6">
      {/* TOAST */}
      {toast && (
        <div className={cx("fixed right-5 top-5 z-50 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur", toast.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-red-500/30 bg-red-500/10 text-red-100")}>
          <div className="flex items-center gap-2">
            {toast.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link href="/admin/prospeccao" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] hover:bg-white/10 transition">
              <ArrowLeft size={14} /> Voltar ao CRM
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-100">
              <ShieldCheck className="h-4 w-4" /> Dados Ricos + Resgate
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gerador de Leads Qualificados</h1>
            <p className="mt-1 text-sm text-white/55">Controle total da aquisicao: regras de qualidade, score, selecao e envio ao CRM.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAutoIntelligence((value) => !value)}
            disabled={busy}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-50",
              autoIntelligence
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
            )}
          >
            {autoIntelligence ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            IA automatica
          </button>
          <button onClick={() => { setRawLeads([]); setQualified([]); setSelected({}); setLogs([]); setError(null); showToast("ok", "Limpo."); }} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50">
            <Trash2 size={16} /> Limpar
          </button>
          <button onClick={buscarLeads} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loadingBuscar ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} Iniciar prospeccao
          </button>
          <button onClick={salvarNoCRM} disabled={busy || selectedLeadsList.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
            {loadingSalvar ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Enviar ao CRM ({selectedLeadsList.length})
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid gap-3 lg:grid-cols-4">
        <StatCard label="Recebidos da API" value={stats.total} hint="Resultado bruto com dados ricos" icon={<RefreshCcw className="h-5 w-5" />} />
        <StatCard label="Aprovados (geral)" value={stats.approvedAll} hint={`Taxa: ${pct(stats.ratio)}`} icon={<BadgeCheck className="h-5 w-5" />} accent="blue" />
        <StatCard label="Aprovados (top)" value={stats.approved} hint={`Limitado em ${limitValid}`} icon={<Sparkles className="h-5 w-5" />} accent="green" />
        <StatCard label="Descartados" value={stats.discarded} hint="Disponiveis para resgate" icon={<AlertTriangle className="h-5 w-5" />} accent="amber" />
      </div>

      {/* CONFIG */}
      <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4">
        <SectionHeader title="Configuracao de aquisicao" subtitle="Defina alvo + regras de qualidade." icon={<Filter className="h-4 w-4" />} right={<button onClick={() => copy(queryPreview)} className="text-[11px] text-white/50 hover:text-white"><Copy className="h-3 w-3 inline mr-1"/> Copiar Query</button>} />
        <Divider />
        
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[11px] text-white/55">Preset ICP</label>
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            >
              {SEARCH_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-white/55">Bairros / zonas (opcional)</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              value={searchHintsRaw}
              onChange={(e) => setSearchHintsRaw(e.target.value)}
              placeholder="Savassi, Lourdes, Funcionarios"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1"><label className="text-[11px] text-white/55">Servico</label><input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" value={servico} onChange={(e) => setServico(e.target.value)} placeholder="Ex: clinica estetica" /></div>
          <div className="space-y-1"><label className="text-[11px] text-white/55">Nicho</label><input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="Ex: dermatologia" /></div>
          <div className="space-y-1"><label className="text-[11px] text-white/55">Cidade</label><input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: Belo Horizonte, MG" /></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <SectionHeader title="Estrategia" icon={<Zap className="h-4 w-4" />} />
            <div className="flex flex-wrap gap-2">
              <Chip label="Conservador" active={mode === "conservador"} onClick={() => setMode("conservador")} tone="blue" />
              <Chip label="Balanceado" active={mode === "balanceado"} onClick={() => setMode("balanceado")} tone="neutral" />
              <Chip label="Agressivo" active={mode === "agressivo"} onClick={() => setMode("agressivo")} tone="amber" />
            </div>
            <input type="number" min={1} max={80} value={limitValid} onChange={(e) => setLimitValid(clamp(Number(e.target.value) || 10, 1, 80))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-white/45">Paginas Google</label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={maxPages}
                  onChange={(e) => setMaxPages(clamp(Number(e.target.value) || 2, 1, 3))}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-white/45">Dedupe no CRM</label>
                <button
                  type="button"
                  onClick={() => setExcludeExistingInCrm((value) => !value)}
                  className={cx(
                    "w-full rounded-xl border px-3 py-2 text-sm transition",
                    excludeExistingInCrm
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/70"
                  )}
                >
                  {excludeExistingInCrm ? "Ativo" : "Inativo"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <SectionHeader title="Qualidade minima" icon={<ShieldCheck className="h-4 w-4" />} right={<span className="text-[10px] text-white/40">Score min: {scoreMin}</span>} />
            <div className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              Telefone obrigatorio (travado para nao desperdicar custo com lead sem contato)
            </div>
            <select
              value={requireWebsite}
              onChange={(e) => setRequireWebsite(e.target.value as "qualquer" | "sim" | "nao")}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            >
              <option value="qualquer">Site: indiferente</option>
              <option value="sim">Exigir site</option>
              <option value="nao">Somente sem site</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.1" min={0} max={5} value={minRating} onChange={(e) => setMinRating(clamp(Number(e.target.value), 0, 5))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" placeholder="Rating" />
              <input type="number" min={0} max={100} value={scoreMin} onChange={(e) => setScoreMin(clamp(Number(e.target.value), 0, 100))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" placeholder="Score" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <SectionHeader title="Palavras & Refinamento" icon={<Sparkles className="h-4 w-4" />} />
            <input value={bannedWords} onChange={(e) => setBannedWords(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" placeholder="Proibidas" />
            <input value={preferredWords} onChange={(e) => setPreferredWords(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" placeholder="Desejadas" />
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</div>}

      {/* RESULTS + CONTROLS */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* LEFT: CONTROLS */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionHeader title="Selecao" icon={<BadgeCheck className="h-4 w-4" />} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => toggleSelectAll(true)} disabled={qualified.length===0} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[11px] text-white hover:bg-white/15 transition disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Todos</button>
              <button onClick={() => toggleSelectAll(false)} disabled={qualified.length===0} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition disabled:opacity-50"><X className="h-4 w-4" /> Nada</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => selectOnlyHeat("quente")} disabled={qualified.length===0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-500 transition disabled:opacity-50"><Flame className="h-4 w-4" /> Quentes</button>
              <button onClick={() => selectTop(10)} disabled={qualified.length===0} className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-100 hover:bg-blue-500/15 transition disabled:opacity-50"><Sparkles className="h-4 w-4" /> Top 10</button>
            </div>
            <Divider />
            <button onClick={() => setShowDiscarded(v => !v)} disabled={computed.all.length===0} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition disabled:opacity-50">
              {showDiscarded ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />} {showDiscarded ? "Ocultar descartados" : "Mostrar descartados"}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionHeader title="Resumo" icon={<TrendingUp className="h-4 w-4" />} />
            <div className="grid gap-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase text-white/45">Selecionados</p><p className="mt-1 text-xl font-semibold text-white/90">{stats.selectedCount}</p></div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3"><p className="text-[10px] uppercase text-emerald-100/80">Quentes</p><p className="mt-1 text-xl font-semibold text-emerald-100">{stats.quentes}</p></div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
            <SectionHeader title="Logs" icon={<RefreshCcw className="h-4 w-4" />} right={<button onClick={() => setLogs([])}><Trash2 className="h-4 w-4 text-white/50" /></button>} />
            <div className="space-y-2 max-h-40 overflow-y-auto">{logs.map((l, i) => <div key={i} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">{l}</div>)}</div>
          </div>
        </div>

        {/* RIGHT: RESULTS */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
            <SectionHeader title="Leads aprovados" subtitle="Grid premium pronto para salvar no CRM." icon={<BadgeCheck className="h-4 w-4" />} right={<span className="text-xs text-white/45">Top: <b className="text-white/70">{qualified.length}</b></span>} />
            <Divider />

            {loadingBuscar ? (
              <div className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Prospeccionando e qualificando...</div>
            ) : qualified.length === 0 ? (
              <div className="text-sm text-white/50">Nenhum lead qualificado ainda.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {qualified.map((l) => {
                  const heat = heatBadge(l._heat);
                  const sb = scoreBadge(l._score);
                  const isSelected = !!selected[l.placeId];
                  return (
                    <div key={l.placeId} className={cx("group rounded-2xl border bg-black/20 p-4 transition", isSelected ? "border-blue-500/30 ring-1 ring-blue-500/20" : "border-white/10 hover:border-white/20")}>
                      {/* Top Row: Name + Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/90">{l.nome}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", heat.cls)}>{heat.icon} {heat.label}</span>
                            <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", sb.cls)}><Sparkles className="h-3.5 w-3.5" /> {sb.label} {l._score}</span>
                            {/* Novos Badges Ricos */}
                            {l.priceLevel && l.priceLevel >= 3 && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"><DollarSign className="h-3 w-3" /> $$$</span>}
                            {l.isOpenNow !== undefined && <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", l.isOpenNow ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200")}><Clock className="h-3 w-3" /> {l.isOpenNow ? "Aberto" : "Fechado"}</span>}
                            {l._isRescued && <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200"><Unlock className="h-3 w-3" /> Resgatado</span>}
                          </div>
                        </div>
                        <button onClick={() => setSelected(prev => ({ ...prev, [l.placeId]: !prev[l.placeId] }))} className={cx("rounded-xl border px-3 py-2 text-[11px] transition", isSelected ? "border-blue-500/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")}>
                          {isSelected ? "Selecionado" : "Selecionar"}
                        </button>
                      </div>

                      {/* Info Row */}
                      <div className="mt-3 space-y-2 text-xs text-white/70">
                        {l.endereco && <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-white/35 mt-0.5" /><p className="line-clamp-2">{l.endereco}</p></div>}
                        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-white/35" /><p className="font-medium text-white/80">{formatPhoneBR(l.telefone) || "Sem telefone"}</p></div>
                        {l.website ? <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-white/35" /><a href={safeUrl(l.website)} target="_blank" className="truncate text-white/75 hover:text-white underline decoration-white/20">{l.website}</a></div> : <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-white/25" /><span className="text-white/45">Sem site</span></div>}
                      </div>

                      {/* Reasons */}
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/45">Por que foi aprovado</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {l._reasons.slice(0, 4).map((r) => <span key={r} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-white/70"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/80" /> {r}</span>)}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => copy(l.telefone || "")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition"><Copy className="h-4 w-4" /> Copiar</button>
                        <Link href={`/admin/prospeccao/${l.placeId}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-500 transition">Abrir no CRM <ExternalLink className="h-4 w-4 opacity-90" /></Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Descartados (Zona de Resgate) */}
          {showDiscarded && (
            <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
              <SectionHeader title="Descartados (com motivo)" subtitle="Transparencia total." icon={<AlertTriangle className="h-4 w-4" />} right={<span className="text-xs text-white/45">{computed.discarded.length} itens</span>} />
              <Divider />
              {computed.discarded.length === 0 ? <p className="text-sm text-white/50">Nenhum descartado.</p> : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {computed.discarded.slice(0, 30).map((l) => (
                    <div key={l.placeId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-sm font-semibold text-white/85">{l.nome}</p>
                      <div className="mt-2 space-y-2 text-xs text-white/65">
                        <p>{formatPhoneBR(l.telefone)}</p>
                        <p className="line-clamp-1">{l.endereco}</p>
                      </div>
                      <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                        <ul className="space-y-1 text-xs text-red-100/80">
                          {l._blockedReasons.slice(0, 5).map((r) => <li key={r} className="flex items-start gap-2"><X className="h-4 w-4 mt-0.5 opacity-90" /><span>{r}</span></li>)}
                        </ul>
                      </div>
                      <button onClick={() => { setManualOverrides(prev => ({ ...prev, [l.placeId]: !prev[l.placeId] })); showToast("ok", "Lead resgatado!"); }} className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-white hover:bg-white/10 transition">
                        <Unlock className="h-3 w-3 text-emerald-400" /> Resgatar Manualmente
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="h-6" />
    </div>
  );
}
