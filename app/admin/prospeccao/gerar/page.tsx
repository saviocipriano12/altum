"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { db } from "@/firebaseConfig";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  Play,
  Save,
  RefreshCcw,
  MapPin,
  Phone,
  Globe,
  Star,
  Users,
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
} from "lucide-react";

/* ======================================================
   TIPOS
====================================================== */

type LeadStatus = "novo" | "contatado" | "respondido" | "qualificado" | "descartado";

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

  // extras se sua API já devolver (opcional)
  lat?: number;
  lng?: number;
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
};

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
  // tenta formatar 11 dígitos
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
 * Score “CEO Mode”
 * - Phone obrigatório (sem isso: bloqueia)
 * - Rating e qtd avaliações influenciam (autoridade)
 * - Website influencia (maturidade digital)
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
  if (ratingsTotal !== null && ratingsTotal < rules.minRatingsTotal) blocked.push(`Poucas avaliações (< ${rules.minRatingsTotal})`);

  if (rules.requireWebsite === "sim" && !hasWebsite) blocked.push("Sem site (exigido)");
  if (rules.requireWebsite === "nao" && hasWebsite) blocked.push("Tem site (excluído)");

  // Banned words
  const hay = `${name} ${category} ${address}`.toLowerCase();
  for (const w of rules.bannedWords) {
    const ww = w.trim().toLowerCase();
    if (!ww) continue;
    if (hay.includes(ww)) blocked.push(`Contém palavra proibida: "${ww}"`);
  }

  // Score
  let score = 0;

  // Base
  score += 10;

  // Phone is king
  if (hasPhone) {
    score += 40;
    reasons.push("Tem telefone");
  }

  // Website
  if (hasWebsite) {
    score += 10;
    reasons.push("Tem site");
  } else {
    // sem site -> oportunidade (pode ser bom)
    score += 6;
    reasons.push("Sem site (oportunidade)");
  }

  // Rating (0..5) -> 0..18
  if (rating !== null) {
    const r = clamp(rating, 0, 5);
    score += Math.round((r / 5) * 18);
    if (r >= 4.4) reasons.push("Rating alto");
  } else {
    score += 4;
  }

  // Reviews total -> 0..18 (satura em 300)
  if (ratingsTotal !== null) {
    const rt = clamp(ratingsTotal, 0, 300);
    score += Math.round((rt / 300) * 18);
    if (ratingsTotal >= 80) reasons.push("Muitas avaliações");
  } else {
    score += 2;
  }

  // Preferred words boost (0..12)
  let boost = 0;
  for (const w of rules.preferredWords) {
    const ww = w.trim().toLowerCase();
    if (!ww) continue;
    if (hay.includes(ww)) boost += 4;
  }
  if (boost > 0) reasons.push("Match em palavras desejadas");
  score += clamp(boost, 0, 12);

  // Penalty: name too short / generic
  if (name.length < 6) score -= 6;
  if (name.toLowerCase().includes("ltda")) score += 2;

  score = clamp(score, 0, 100);

  // Score min
  if (score < rules.scoreMin) blocked.push(`Score abaixo do mínimo (${rules.scoreMin})`);

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
   UI COMPONENTS
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
   PAGE
====================================================== */

export default function GerarLeadsPremiumPage() {
  // Core inputs
  const [servico, setServico] = useState("restaurante");
  const [nicho, setNicho] = useState("restaurante");
  const [cidade, setCidade] = useState("Belo Horizonte, MG");

  // Acquisition controls
  const [limitValid, setLimitValid] = useState(15); // quantos válidos você quer
  const [mode, setMode] = useState<"conservador" | "balanceado" | "agressivo">("balanceado");

  // Quality rules
  const [requirePhone, setRequirePhone] = useState(true); // o que você pediu
  const [minRating, setMinRating] = useState(4.0);
  const [minRatingsTotal, setMinRatingsTotal] = useState(15);
  const [requireWebsite, setRequireWebsite] = useState<"qualquer" | "sim" | "nao">("qualquer");
  const [scoreMin, setScoreMin] = useState(55);

  // Keyword controls
  const [bannedWords, setBannedWords] = useState("delivery, ifood, atacado, distribuidora");
  const [preferredWords, setPreferredWords] = useState("premium, boutique, clínica, estética, dermatologia");

  // Run state
  const [loadingBuscar, setLoadingBuscar] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);

  // Results
  const [rawLeads, setRawLeads] = useState<LeadFromAPI[]>([]);
  const [qualified, setQualified] = useState<LeadQualified[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showDiscarded, setShowDiscarded] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: "ok" | "warn" | "err"; msg: string } | null>(null);
  const toastRef = useRef<any>(null);

  function pushLog(m: string) {
    setLogs((prev) => [`${new Date().toLocaleTimeString("pt-BR")} — ${m}`, ...prev].slice(0, 30));
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

  // mode affects defaults
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
    // requirePhone stays true (seu pedido)
  }, [mode]);

  const rules = useMemo(() => {
    return {
      requirePhone,
      minRating,
      minRatingsTotal,
      requireWebsite,
      bannedWords: bannedWords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      preferredWords: preferredWords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      scoreMin,
    };
  }, [requirePhone, minRating, minRatingsTotal, requireWebsite, bannedWords, preferredWords, scoreMin]);

  const computed = useMemo(() => {
    const q = rawLeads.map((l) => computeQualification(l, rules));

    // aprovados = sem blockedReasons
    const approved = q.filter((x) => x._blockedReasons.length === 0);

    // descartados
    const discarded = q.filter((x) => x._blockedReasons.length > 0);

    // sort by score desc
    approved.sort((a, b) => b._score - a._score);

    // cortar nos válidos desejados
    const topApproved = approved.slice(0, clamp(limitValid, 1, 100));

    return { all: q, approved: topApproved, discarded, approvedAll: approved };
  }, [rawLeads, rules, limitValid]);

  // keep qualified in sync
  useEffect(() => {
    setQualified(computed.approved);
    // auto select all approved (default)
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

    return {
      total,
      approved,
      approvedAll,
      discarded,
      quentes,
      mornos,
      frios,
      withSite,
      selectedCount,
      ratio,
    };
  }, [computed, selected]);

  const selectedLeadsList = useMemo(() => {
    return qualified.filter((l) => selected[l.placeId]);
  }, [qualified, selected]);

  async function buscarLeads() {
    setError(null);
    setLogs([]);
    setRawLeads([]);
    setQualified([]);
    setSelected({});

    // validações
    if (!servico.trim() || !cidade.trim()) {
      setError("Preencha serviço e cidade.");
      return;
    }

    setLoadingBuscar(true);
    pushLog("Iniciando prospecção no Google Places...");

    try {
      // 🔥 IMPORTANTE: Forçamos includePhone porque você quer telefone obrigatório
      // E passamos requirePhone para a API, se você aplicar o patch.
      const res = await fetch("/api/prospeccao/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: nicho.trim(),
          cidade: cidade.trim(),
          servico: servico.trim(),

          // O seu "limit" aqui deve ser interpretado pela API como:
          // "quantos resultados vou tentar buscar" OU (melhor) "quantos válidos quero"
          // No patch eu explico como deixar isso perfeito.
          limit: clamp(limitValid, 1, 40),

          includePhone: true, // sempre true
          requirePhone: true, // para API otimizar (precisa patch)
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao buscar leads.");
        pushLog(`Erro: ${data?.error || "Falha desconhecida"}`);
        return;
      }

      const items: LeadFromAPI[] = data?.leads || [];
      setRawLeads(items);

      pushLog(`Busca finalizada. ${items.length} leads recebidos da API.`);
      pushLog(`Aplicando regras de qualidade (telefone obrigatório + score mínimo)...`);

      // Só pra deixar explícito:
      const noPhoneCount = items.filter((x) => !onlyDigits(x.telefone || "")).length;
      if (noPhoneCount > 0) {
        pushLog(`Aviso: ${noPhoneCount} leads vieram sem telefone. Eles serão descartados aqui.`);
        pushLog(`(Para NÃO gastar token nisso, aplique o patch na API.)`);
      }

      showToast("ok", "Prospecção concluída. Leads qualificados prontos.");
    } catch (e: any) {
      console.error(e);
      setError("Falha ao conectar na API de prospecção.");
      pushLog("Falha de rede ao chamar /api/prospeccao/gerar.");
      showToast("err", "Falha de rede na prospecção.");
    } finally {
      setLoadingBuscar(false);
    }
  }

  async function salvarNoCRM() {
    setError(null);

    const list = selectedLeadsList;

    if (!list.length) {
      setError("Nenhum lead selecionado para salvar.");
      showToast("warn", "Selecione pelo menos 1 lead.");
      return;
    }

    setLoadingSalvar(true);
    pushLog("Salvando leads selecionados no Firestore (coleção leads)...");

    try {
      let ok = 0;
      let fail = 0;

      // docId = placeId => idempotente
      for (const l of list) {
        try {
          const ref = doc(db, "leads", l.placeId);
          await setDoc(
            ref,
            {
              placeId: l.placeId,
              nome: l.nome || "Lead sem nome",
              telefone: l.telefone || "",
              endereco: l.endereco || "",
              email: "",
              website: l.website || "",
              categoria: l.categoria || "",
              origem: l.origem || "google_places",
              status: "novo" as LeadStatus,

              // extras pro CRM ficar mais rico
              rating: typeof l.rating === "number" ? l.rating : null,
              userRatingsTotal: typeof l.userRatingsTotal === "number" ? l.userRatingsTotal : null,

              // Qualificação (pra filtrar no CRM)
              score: l._score,
              heat: l._heat,
              qualificadoEm: serverTimestamp(),

              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          ok++;
        } catch (err) {
          console.error("Erro salvando lead:", l, err);
          fail++;
        }
      }

      pushLog(`Salvamento concluído. OK: ${ok} | Falhas: ${fail}`);
      if (ok > 0) showToast("ok", `Salvos no CRM: ${ok}`);
      if (fail > 0) showToast("warn", `Falhas: ${fail}`);
    } catch (e: any) {
      console.error(e);
      setError("Falha ao salvar no Firestore.");
      pushLog("Falha geral ao salvar no Firestore.");
      showToast("err", "Falha ao salvar no CRM.");
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
    try {
      await navigator.clipboard.writeText(text);
      showToast("ok", okMsg);
    } catch {
      showToast("err", "Não consegui copiar.");
    }
  }

  const busy = loadingBuscar || loadingSalvar;

  return (
    <div className="space-y-6">
      {/* TOAST */}
      {toast && (
        <div
          className={cx(
            "fixed right-5 top-5 z-50 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
            toast.type === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
            toast.type === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-100",
            toast.type === "err" && "border-red-500/30 bg-red-500/10 text-red-100"
          )}
        >
          <div className="flex items-center gap-2">
            {toast.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : null}
            {toast.type === "warn" ? <AlertTriangle className="h-4 w-4" /> : null}
            {toast.type === "err" ? <X className="h-4 w-4" /> : null}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link
              href="/admin/prospeccao"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] hover:bg-white/10 transition"
            >
              <ArrowLeft size={14} />
              Voltar ao CRM
            </Link>

            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              Telefone obrigatório
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
              <Sparkles className="h-4 w-4" />
              Aquisição premium
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gerador de Leads Qualificados</h1>
            <p className="mt-1 text-sm text-white/55">
              Controle total da aquisição: regras de qualidade, score, seleção e envio ao CRM.
              <span className="ml-2 text-white/35">
                (Aprovados entram; descartados ficam com motivo.)
              </span>
            </p>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setRawLeads([]);
              setQualified([]);
              setSelected({});
              setLogs([]);
              setError(null);
              showToast("ok", "Painel limpo.");
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
          >
            <Trash2 size={16} />
            Limpar
          </button>

          <button
            onClick={buscarLeads}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingBuscar ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            Iniciar prospecção
          </button>

          <button
            onClick={salvarNoCRM}
            disabled={busy || selectedLeadsList.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {loadingSalvar ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Enviar ao CRM ({selectedLeadsList.length})
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid gap-3 lg:grid-cols-4">
        <StatCard label="Recebidos da API" value={stats.total} hint="Resultado bruto do endpoint" icon={<RefreshCcw className="h-5 w-5" />} />
        <StatCard label="Aprovados (geral)" value={stats.approvedAll} hint={`Taxa: ${pct(stats.ratio)}`} icon={<BadgeCheck className="h-5 w-5" />} accent="blue" />
        <StatCard label="Aprovados (top)" value={stats.approved} hint={`Limitado em ${limitValid} válidos`} icon={<Sparkles className="h-5 w-5" />} accent="green" />
        <StatCard label="Descartados" value={stats.discarded} hint="Motivo disponível no painel" icon={<AlertTriangle className="h-5 w-5" />} accent="amber" />
      </div>

      {/* CONFIG */}
      <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4">
        <SectionHeader
          title="Configuração de aquisição"
          subtitle="Defina alvo + regras de qualidade. O sistema filtra e pontua automaticamente."
          icon={<Filter className="h-4 w-4" />}
          right={
            <button
              onClick={() => copy(queryPreview, "Query copiada!")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition"
            >
              <Copy className="h-4 w-4" />
              Copiar query
            </button>
          }
        />

        <Divider />

        {/* Inputs */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] text-white/55">Serviço / Palavra-chave</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/25"
              value={servico}
              onChange={(e) => setServico(e.target.value)}
              placeholder="Ex: clínica estética"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-white/55">Nicho (refinamento)</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/25"
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              placeholder="Ex: dermatologia"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-white/55">Cidade / Estado</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/25"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Ex: Belo Horizonte, MG"
            />
          </div>
        </div>

        {/* Query preview */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          <span className="text-white/45">Query:</span> {queryPreview}
        </div>

        {/* Strategy + rules */}
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Strategy */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <SectionHeader
              title="Estratégia"
              subtitle="Defina agressividade e volume de válidos."
              icon={<Zap className="h-4 w-4" />}
            />
            <div className="flex flex-wrap gap-2">
              <Chip label="Conservador" active={mode === "conservador"} onClick={() => setMode("conservador")} tone="blue" />
              <Chip label="Balanceado" active={mode === "balanceado"} onClick={() => setMode("balanceado")} tone="neutral" />
              <Chip label="Agressivo" active={mode === "agressivo"} onClick={() => setMode("agressivo")} tone="amber" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-white/55">Limite (leads válidos)</label>
              <input
                type="number"
                min={1}
                max={40}
                value={limitValid}
                onChange={(e) => setLimitValid(clamp(Number(e.target.value) || 10, 1, 40))}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <p className="text-[10px] text-white/35">Recomendado: 10–20 por rodada.</p>
            </div>
          </div>

          {/* Quality rules */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <SectionHeader
              title="Qualidade mínima"
              subtitle="Hard rules. Se não bater, é descartado."
              icon={<ShieldCheck className="h-4 w-4" />}
              right={
                <span className="text-[10px] text-white/40">
                  Score mínimo: <b className="text-white/70">{scoreMin}</b>
                </span>
              }
            />

            {/* Phone mandatory */}
            <button
              type="button"
              onClick={() => setRequirePhone(true)}
              className={cx(
                "w-full flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              )}
              title="Telefone obrigatório (bloqueia sem telefone)"
            >
              <span className="flex items-center gap-2">
                {requirePhone ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                Telefone obrigatório (ativo)
              </span>
              <span className="text-[11px] text-emerald-100/80">HARD RULE</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-white/55">Rating mínimo</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={5}
                  value={minRating}
                  onChange={(e) => setMinRating(clamp(Number(e.target.value) || 0, 0, 5))}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-white/55">Avaliações mínimas</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={minRatingsTotal}
                  onChange={(e) => setMinRatingsTotal(clamp(Number(e.target.value) || 0, 0, 999))}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-white/55">Website</label>
              <select
                value={requireWebsite}
                onChange={(e) => setRequireWebsite(e.target.value as any)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              >
                <option value="qualquer">Tanto faz</option>
                <option value="sim">Exigir que tenha site</option>
                <option value="nao">Exigir que NÃO tenha site</option>
              </select>
              <p className="text-[10px] text-white/35">
                “Não ter site” pode ser oportunidade (Site Express / Pack Digital).
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-white/55">Score mínimo</label>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreMin}
                onChange={(e) => setScoreMin(clamp(Number(e.target.value) || 0, 0, 100))}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          {/* Keywords */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <SectionHeader
              title="Palavras & Refinamento"
              subtitle="Corte lixo, favoreça perfil desejado."
              icon={<Sparkles className="h-4 w-4" />}
            />

            <div className="space-y-1">
              <label className="text-[11px] text-white/55">Proibidas (descarta)</label>
              <input
                value={bannedWords}
                onChange={(e) => setBannedWords(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/25"
                placeholder="ex: atacado, distribuidora, ifood"
              />
              <p className="text-[10px] text-white/35">Separar por vírgula.</p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-white/55">Desejadas (boost de score)</label>
              <input
                value={preferredWords}
                onChange={(e) => setPreferredWords(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/25"
                placeholder="ex: premium, clínica, estética"
              />
              <p className="text-[10px] text-white/35">Separar por vírgula.</p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div className="leading-relaxed">
                  <b>Importante:</b> esta tela descarta sem telefone.  
                  Para <b>não gastar token</b> com isso, aplique o patch na API (abaixo).
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}
      </div>

      {/* RESULTS + CONTROLS */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Left: controls */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionHeader
              title="Seleção inteligente"
              subtitle="Escolha só os melhores para salvar."
              icon={<BadgeCheck className="h-4 w-4" />}
            />
            <Divider />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={qualified.length === 0}
                onClick={() => toggleSelectAll(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[11px] text-white hover:bg-white/15 transition disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Selecionar todos
              </button>

              <button
                type="button"
                disabled={qualified.length === 0}
                onClick={() => toggleSelectAll(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Limpar
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={qualified.length === 0}
                onClick={() => selectOnlyHeat("quente")}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-500 transition disabled:opacity-50"
              >
                <Flame className="h-4 w-4" />
                Só quentes
              </button>

              <button
                type="button"
                disabled={qualified.length === 0}
                onClick={() => selectOnlyHeat("morno")}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-[11px] text-white hover:bg-amber-500 transition disabled:opacity-50"
              >
                <TrendingUp className="h-4 w-4" />
                Só mornos
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={qualified.length === 0}
                onClick={() => selectTop(5)}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-100 hover:bg-blue-500/15 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Top 5
              </button>

              <button
                type="button"
                disabled={qualified.length === 0}
                onClick={() => selectTop(10)}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-100 hover:bg-blue-500/15 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Top 10
              </button>
            </div>

            <Divider />

            <button
              type="button"
              onClick={() => setShowDiscarded((v) => !v)}
              disabled={computed.all.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition disabled:opacity-50"
            >
              {showDiscarded ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              {showDiscarded ? "Ocultar descartados" : "Mostrar descartados"}
            </button>

            <p className="text-[11px] text-white/40 leading-relaxed">
              Dica: comece salvando só os <b>quentes</b>. Depois rode outra rodada no mesmo nicho.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionHeader
              title="Resumo desta rodada"
              subtitle="O que você tem pronto agora."
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <Divider />

            <div className="grid gap-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/45">Selecionados</p>
                <p className="mt-1 text-xl font-semibold text-white/90">{stats.selectedCount}</p>
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <p className="text-[10px] uppercase tracking-wide text-emerald-100/80">Quentes (top)</p>
                <p className="mt-1 text-xl font-semibold text-emerald-100">{stats.quentes}</p>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-[10px] uppercase tracking-wide text-amber-100/80">Mornos (top)</p>
                <p className="mt-1 text-xl font-semibold text-amber-100">{stats.mornos}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/45">Com site (top)</p>
                <p className="mt-1 text-xl font-semibold text-white/90">{stats.withSite}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
            <SectionHeader
              title="Leads aprovados"
              subtitle="Grid premium pronto para salvar no CRM."
              icon={<BadgeCheck className="h-4 w-4" />}
              right={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/45">
                    Top: <b className="text-white/70">{qualified.length}</b>
                  </span>
                </div>
              }
            />
            <Divider />

            {loadingBuscar ? (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Prospeccionando e qualificando...
              </div>
            ) : qualified.length === 0 ? (
              <div className="text-sm text-white/50">
                Nenhum lead qualificado ainda. Configure e clique em <b>Iniciar prospecção</b>.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {qualified.map((l) => {
                  const heat = heatBadge(l._heat);
                  const sb = scoreBadge(l._score);
                  const isSelected = !!selected[l.placeId];

                  return (
                    <div
                      key={l.placeId}
                      className={cx(
                        "group rounded-2xl border bg-black/20 p-4 transition",
                        isSelected ? "border-blue-500/30 ring-1 ring-blue-500/20" : "border-white/10 hover:border-white/20"
                      )}
                    >
                      {/* top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/90">{l.nome}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", heat.cls)}>
                              {heat.icon}
                              {heat.label}
                            </span>

                            <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", sb.cls)}>
                              <Sparkles className="h-3.5 w-3.5" />
                              Score {l._score} • {sb.label}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelected((prev) => ({ ...prev, [l.placeId]: !prev[l.placeId] }))}
                          className={cx(
                            "rounded-xl border px-3 py-2 text-[11px] transition",
                            isSelected
                              ? "border-blue-500/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          )}
                        >
                          {isSelected ? "Selecionado" : "Selecionar"}
                        </button>
                      </div>

                      {/* info */}
                      <div className="mt-3 space-y-2 text-xs text-white/70">
                        {l.endereco ? (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-white/35 mt-0.5" />
                            <p className="line-clamp-2">{l.endereco}</p>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-white/35" />
                          <p className="font-medium text-white/80">{formatPhoneBR(l.telefone)}</p>
                        </div>

                        {l.website ? (
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-white/35" />
                            <a
                              href={safeUrl(l.website)}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-white/75 hover:text-white underline decoration-white/20"
                              title={l.website}
                            >
                              {l.website}
                            </a>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-white/25" />
                            <span className="text-white/45">Sem site</span>
                          </div>
                        )}
                      </div>

                      {/* badges */}
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        {typeof l.rating === "number" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">
                            <Star size={14} />
                            {l.rating.toFixed(1)}
                          </span>
                        ) : null}

                        {typeof l.userRatingsTotal === "number" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-200">
                            <Users size={14} />
                            {l.userRatingsTotal}
                          </span>
                        ) : null}

                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/70">
                          {l.categoria || "categoria"}
                        </span>
                      </div>

                      {/* reasons */}
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/45">Por que foi aprovado</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(l._reasons.length ? l._reasons : ["Qualificado por regras + score"]).slice(0, 4).map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-white/70"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/80" />
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* actions */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copy(l.telefone || "", "Telefone copiado!")}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition"
                        >
                          <Copy className="h-4 w-4" />
                          Copiar telefone
                        </button>

                        <Link
                          href={`/admin/prospeccao/${l.placeId}`}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-500 transition"
                        >
                          Abrir no CRM <ExternalLink className="h-4 w-4 opacity-90" />
                        </Link>
                      </div>

                      <p className="mt-3 text-[10px] text-white/35">
                        placeId: <span className="font-mono">{l.placeId}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DISCARDED */}
          {showDiscarded ? (
            <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
              <SectionHeader
                title="Descartados (com motivo)"
                subtitle="Transparência total. Você vê exatamente por que caiu."
                icon={<AlertTriangle className="h-4 w-4" />}
                right={<span className="text-xs text-white/45">{computed.discarded.length} itens</span>}
              />
              <Divider />

              {computed.discarded.length === 0 ? (
                <p className="text-sm text-white/50">Nenhum descartado nesta rodada.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {computed.discarded.slice(0, 30).map((l) => (
                    <div key={l.placeId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-sm font-semibold text-white/85">{l.nome}</p>

                      <div className="mt-2 space-y-2 text-xs text-white/65">
                        {l.endereco ? (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-white/35 mt-0.5" />
                            <p className="line-clamp-2">{l.endereco}</p>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-white/25" />
                          <span className="text-white/45">{l.telefone ? formatPhoneBR(l.telefone) : "Sem telefone"}</span>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-red-200/80">Motivos</p>
                        <ul className="mt-2 space-y-1 text-xs text-red-100/80">
                          {l._blockedReasons.slice(0, 5).map((r) => (
                            <li key={r} className="flex items-start gap-2">
                              <X className="h-4 w-4 mt-0.5 opacity-90" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <p className="mt-3 text-[10px] text-white/35 font-mono">placeId: {l.placeId}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* LOGS */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
            <SectionHeader
              title="Logs de operação"
              subtitle="Auditoria da rodada (debug rápido estilo SaaS)."
              icon={<RefreshCcw className="h-4 w-4" />}
              right={
                <button
                  onClick={() => setLogs([])}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Limpar logs
                </button>
              }
            />
            <Divider />

            {logs.length === 0 ? (
              <p className="text-sm text-white/45">Nenhum log ainda.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((l, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70"
                  >
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FOOTER NOTE */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5 text-sm text-blue-100">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 mt-0.5" />
              <div className="leading-relaxed">
                <b>Operação recomendada:</b> rode 10–20 válidos por cidade, salve só os <b>quentes</b>, faça diagnóstico e mande as mensagens manualmente.
                <div className="mt-1 text-blue-100/80">
                  Depois nós plugamos o n8n para disparos automáticos usando os campos <b>score</b> e <b>heat</b>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* bottom spacing */}
      <div className="h-6" />
    </div>
  );
}
