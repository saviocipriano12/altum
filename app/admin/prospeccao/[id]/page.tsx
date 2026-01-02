"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { db } from "@/firebaseConfig";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";

import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Target,
  Timer,
  Sparkles,
  CheckCircle2,
  Loader2,
  UserPlus,
  Rocket,
  NotebookPen,
  Trash2,
  MessageCircle,
  Bot,
  ShieldCheck,
  Zap,
  Wand2,
  Tags,
  Info,
  Star,
  Flag,
  ClipboardCopy,
  ExternalLink,
  ChevronRight,
  PencilLine,
  Save,
  RefreshCcw,
  AlertTriangle,
  Check,
  X,
  MessagesSquare,
  Link2,
} from "lucide-react";

/**
 * ======================================================================
 * ALTUM — CRM Lead Detail (Prospecção)
 * Página robusta: qualificação + oferta + WhatsApp + timeline + conversão
 * ======================================================================
 *
 * Modelo de dados (sugestão — funciona mesmo se não existir tudo):
 * leads/{leadId}:
 *  - nome, telefone, email, endereco, origem, categoria
 *  - status: novo|contatado|respondido|qualificado|descartado
 *  - stage: (string) estágio do digital
 *  - stageTags: string[]
 *  - offer: { id, title, priceFrom, priceTo, pitch, deliverables[] }
 *  - owner: string (responsável)
 *  - priority: low|medium|high
 *  - notes: string
 *  - nextStep: string
 *  - lastContactAt: timestamp
 *  - updatedAt: timestamp
 *  - createdAt: timestamp
 *
 * leads/{leadId}/events/{eventId}:
 *  - type: string
 *  - title: string
 *  - detail: string
 *  - createdAt: timestamp
 *  - meta: any
 */

// ----------------------------- Types -----------------------------

type LeadStatus = "novo" | "contatado" | "respondido" | "qualificado" | "descartado";
type Priority = "low" | "medium" | "high";

interface Lead {
  id: string;
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  categoria?: string;

  status?: LeadStatus;

  // CRM fields
  stage?: string;
  stageTags?: string[];
  owner?: string;
  priority?: Priority;

  notes?: string;
  nextStep?: string;

  lastContactAt?: any;
  updatedAt?: any;
  createdAt?: any;

  // Oferta sugerida (snapshot no lead)
  offer?: {
    id: string;
    title: string;
    priceFrom: number;
    priceTo: number;
    pitch: string;
    deliverables: string[];
  };
}

interface LeadEvent {
  id: string;
  type: string;
  title: string;
  detail?: string;
  createdAt?: any;
  meta?: any;
}

// ----------------------------- UI Constants -----------------------------

const STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondido: "Respondido",
  qualificado: "Qualificado",
  descartado: "Descartado",
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  novo: "bg-blue-500/10 text-blue-200 border border-blue-500/40",
  contatado: "bg-amber-500/10 text-amber-200 border border-amber-500/40",
  respondido: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/40",
  qualificado: "bg-purple-500/10 text-purple-200 border border-purple-500/40",
  descartado: "bg-red-500/10 text-red-200 border border-red-500/40",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  low: "bg-white/5 text-white/70 border border-white/10",
  medium: "bg-amber-500/10 text-amber-200 border border-amber-500/30",
  high: "bg-red-500/10 text-red-200 border border-red-500/30",
};

// ----------------------------- Offers Matrix -----------------------------
/**
 * Aqui está o “cérebro prático” do funil:
 * Você qualifica o lead (estágio) → a tela te sugere oferta + faixa de preço + pitch.
 * Isso te dá clareza amanhã sem pensar demais.
 */

type OfferId =
  | "SITE_EXPRESS"
  | "SITE_PREMIUM"
  | "GMB_SETUP"
  | "GMB_OTIMIZACAO"
  | "TRAFEGO_INICIAL"
  | "TRAFEGO_SCALE"
  | "LP_CONVERSAO"
  | "PACK_DIGITAL"
  | "DIAGNOSTICO"
  | "AUTOMACAO_CRM"
  | "FOLLOWUP_WHATS";

type OfferDef = {
  id: OfferId;
  title: string;
  priceFrom: number;
  priceTo: number;
  pitch: string;
  deliverables: string[];
  bestFor: string[];
};

const OFFERS: OfferDef[] = [
  {
    id: "DIAGNOSTICO",
    title: "Diagnóstico Premium (rápido e matador)",
    priceFrom: 97,
    priceTo: 297,
    pitch:
      "Eu te entrego um diagnóstico objetivo do seu digital (Google + site + presença), com um plano de ação claro pra gerar mais demanda.",
    deliverables: [
      "Checklist do Google/Presença Local",
      "Análise rápida do site e pontos de melhoria",
      "Plano de ação em 7 dias",
      "Recomendação de oferta ideal",
    ],
    bestFor: ["Entrada barata", "Quebra de objeção", "Abrir conversa"],
  },
  {
    id: "GMB_SETUP",
    title: "Google Meu Negócio (Setup Completo)",
    priceFrom: 397,
    priceTo: 997,
    pitch:
      "Organizo seu Google Meu Negócio do jeito certo pra você aparecer mais, receber ligações e rotas no mapa.",
    deliverables: [
      "Categorias e descrição otimizadas",
      "Serviços e áreas atendidas",
      "Padronização de dados (NAP)",
      "Checklist de fotos e posts",
      "Estrutura de avaliações e respostas",
    ],
    bestFor: ["Não aparece no Google", "Ficha desorganizada", "Negócio local"],
  },
  {
    id: "GMB_OTIMIZACAO",
    title: "Google Meu Negócio (Otimização + Ranking)",
    priceFrom: 597,
    priceTo: 1497,
    pitch:
      "Ajusto e otimizo seu perfil pra aumentar impressões, cliques e conversões no mapa — com rotina e padrão.",
    deliverables: [
      "Revisão completa do perfil",
      "Otimização de categorias/serviços",
      "Plano de conteúdo (posts semanais)",
      "Estratégia de avaliações",
      "Métricas e melhorias contínuas",
    ],
    bestFor: ["Já tem ficha", "Quer subir ranking", "Concorrência forte"],
  },
  {
    id: "SITE_EXPRESS",
    title: "Site Express (rápido e direto pra vender)",
    priceFrom: 997,
    priceTo: 2497,
    pitch:
      "Um site enxuto e bonito que passa confiança e converte: WhatsApp, prova social, serviços e mapas — pronto pra rodar tráfego.",
    deliverables: [
      "Site 1 a 3 páginas (one-page ou institucional)",
      "Botão WhatsApp e seções de conversão",
      "SEO básico + performance",
      "Integrações (Mapa / Redes / Form)",
      "Entrega rápida",
    ],
    bestFor: ["Não tem site", "Site amador", "Precisa de presença"],
  },
  {
    id: "SITE_PREMIUM",
    title: "Site Premium (autoridade + conversão)",
    priceFrom: 2497,
    priceTo: 6997,
    pitch:
      "Site premium com estrutura de copy, SEO forte e design que dá autoridade. Feito pra escalar com tráfego.",
    deliverables: [
      "Arquitetura de páginas e copy",
      "Design premium + responsivo",
      "SEO e páginas estratégicas",
      "Performance e rastreamento (Meta/GA)",
      "Base pronta pra funil e automações",
    ],
    bestFor: ["Tem orçamento", "Quer autoridade", "Quer escalar tráfego"],
  },
  {
    id: "LP_CONVERSAO",
    title: "Landing Page de Conversão",
    priceFrom: 997,
    priceTo: 2997,
    pitch:
      "Uma LP focada em gerar conversas e pedidos: headline forte, prova social, oferta e CTA agressivo.",
    deliverables: [
      "Copy e estrutura de conversão",
      "Design responsivo",
      "Integração WhatsApp/Form",
      "Rastreamento de eventos",
      "Teste A/B (opcional)",
    ],
    bestFor: ["Já tem site", "Precisa de funil", "Campanhas"],
  },
  {
    id: "TRAFEGO_INICIAL",
    title: "Tráfego Inicial (primeiros resultados)",
    priceFrom: 600,
    priceTo: 1500,
    pitch:
      "Campanha inicial com o básico bem feito: captação de leads com WhatsApp e otimização semanal.",
    deliverables: [
      "Configuração Meta Ads / Google (se aplicável)",
      "Campanha de mensagens ou leads",
      "Criativos iniciais",
      "Otimização semanal",
      "Relatório simples",
    ],
    bestFor: ["Começando", "Precisa rodar rápido", "Pequeno negócio"],
  },
  {
    id: "TRAFEGO_SCALE",
    title: "Tráfego Scale (crescer com controle)",
    priceFrom: 1500,
    priceTo: 4500,
    pitch:
      "Estrutura pra escalar: campanhas + criativos + funil. O objetivo é consistência e aumento de volume.",
    deliverables: [
      "Estrutura de funil e campanhas",
      "Rotina de testes e criativos",
      "Otimização avançada",
      "Relatório e metas",
      "Plano mensal",
    ],
    bestFor: ["Já anuncia", "Quer escala", "Tem produto/serviço validado"],
  },
  {
    id: "PACK_DIGITAL",
    title: "Pacote Digital Completo (site + GMB + tráfego inicial)",
    priceFrom: 2497,
    priceTo: 5997,
    pitch:
      "A solução completa pra colocar seu digital de pé e começar a gerar demanda: site + Google + campanha inicial.",
    deliverables: [
      "Site express ou LP",
      "Setup/otimização do Google Meu Negócio",
      "Campanha inicial de aquisição",
      "Rastreamento e ajustes",
      "Plano de evolução",
    ],
    bestFor: ["Quer tudo pronto", "Quer velocidade", "Precisa de demanda"],
  },
  {
    id: "AUTOMACAO_CRM",
    title: "Automação de Atendimento + CRM (nível agência)",
    priceFrom: 1997,
    priceTo: 9997,
    pitch:
      "Automação de funil (mensagens, follow-up, rotinas) + CRM organizado pra transformar atendimento em venda.",
    deliverables: [
      "Estrutura de pipeline e tags",
      "Rotinas de follow-up",
      "Integração WhatsApp Cloud API / n8n",
      "Registro de eventos no CRM",
      "Treino de operação",
    ],
    bestFor: ["Time crescendo", "Quer automação", "Precisa de previsibilidade"],
  },
  {
    id: "FOLLOWUP_WHATS",
    title: "Follow-up Automático no WhatsApp (n8n)",
    priceFrom: 497,
    priceTo: 1997,
    pitch:
      "Mensagens automáticas de follow-up e reativação: você para de perder venda por falta de retorno.",
    deliverables: [
      "Sequência 3 a 7 mensagens",
      "Regras por estágio",
      "Logs no CRM",
      "Bloqueios/limites (segurança)",
      "Modo manual + automático",
    ],
    bestFor: ["Não responde rápido", "Perde leads", "Quer organizar rotina"],
  },
];

type StageKey =
  | "INVISIVEL"
  | "PRESENTE_FRACO"
  | "SITE_RUIM"
  | "SITE_OK"
  | "TRAFEGO_ZERO"
  | "TRAFEGO_FRACO"
  | "TRAFEGO_OK"
  | "OPERACAO_ATIVA";

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

function recommendOffer(stage: StageKey | null): OfferDef {
  // Regra “CEO”: oferecer o que dá resultado mais rápido e fácil de vender.
  // Você pode ajustar depois, mas isso já funciona muito bem como padrão.
  if (!stage) return OFFERS.find((o) => o.id === "DIAGNOSTICO")!;
  switch (stage) {
    case "INVISIVEL":
      return OFFERS.find((o) => o.id === "PACK_DIGITAL")!;
    case "PRESENTE_FRACO":
      return OFFERS.find((o) => o.id === "SITE_EXPRESS")!;
    case "SITE_RUIM":
      return OFFERS.find((o) => o.id === "SITE_EXPRESS")!;
    case "SITE_OK":
      return OFFERS.find((o) => o.id === "LP_CONVERSAO")!;
    case "TRAFEGO_ZERO":
      return OFFERS.find((o) => o.id === "TRAFEGO_INICIAL")!;
    case "TRAFEGO_FRACO":
      return OFFERS.find((o) => o.id === "TRAFEGO_INICIAL")!;
    case "TRAFEGO_OK":
      return OFFERS.find((o) => o.id === "TRAFEGO_SCALE")!;
    case "OPERACAO_ATIVA":
      return OFFERS.find((o) => o.id === "AUTOMACAO_CRM")!;
    default:
      return OFFERS.find((o) => o.id === "DIAGNOSTICO")!;
  }
}

// ----------------------------- Helpers -----------------------------

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

function formatBRDateTime(ts: any): string {
  const d = safeToDate(ts);
  if (!d) return "—";
  return d.toLocaleString("pt-BR");
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function normalizePhoneToE164BR(raw: string): string | null {
  // Espera BR: +55DDDNÚMERO (celular normalmente 11 dígitos com 9)
  const digits = onlyDigits(raw);
  if (!digits) return null;

  // Se já vier com 55 na frente
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }

  // Se vier com DDD + número (10/11 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Caso venha gigante/estranho
  if (digits.length > 11 && !digits.startsWith("55")) {
    return `+55${digits.slice(-11)}`;
  }

  return null;
}

function buildWhatsAppLink(phoneRaw: string, text: string) {
  const e164 = normalizePhoneToE164BR(phoneRaw);
  if (!e164) return null;

  // wa.me pede sem "+"
  const waNumber = e164.replace("+", "");
  const encoded = encodeURIComponent(text || "");
  return `https://wa.me/${waNumber}?text=${encoded}`;
}

function moneyBR(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function short(s: string, max = 80) {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ----------------------------- Small UI Components -----------------------------

function SectionTitle({
  title,
  icon,
  right,
  subtitle,
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-white/60">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-white/50">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Pill({
  children,
  className,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "rounded-full px-3 py-1 text-[11px] border transition",
        active ? "bg-blue-600 text-white border-blue-400/60" : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10",
        className
      )}
    >
      {children}
    </button>
  );
}

function Badge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", className)}>
      {label}
    </span>
  );
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

// ----------------------------- Page -----------------------------

export default function LeadDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const leadId = params?.id;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // CRM local edits
  const [statusDraft, setStatusDraft] = useState<LeadStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const [ownerDraft, setOwnerDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<Priority>("medium");
  const [notesDraft, setNotesDraft] = useState("");
  const [nextStepDraft, setNextStepDraft] = useState("");

  const [stageDraft, setStageDraft] = useState<StageKey | null>(null);

  const [savingCRM, setSavingCRM] = useState(false);

  const [convertingClient, setConvertingClient] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ type: "ok" | "warn" | "err"; msg: string } | null>(null);
  const toastTimerRef = useRef<any>(null);

  function showToast(type: "ok" | "warn" | "err", msg: string) {
    setToast({ type, msg });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }

  // ----------------------------- Firestore subscriptions -----------------------------

  useEffect(() => {
    if (!leadId) return;

    setLoading(true);
    setNotFound(false);

    const ref = doc(db, "leads", leadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLead(null);
          setNotFound(true);
          setLoading(false);
          return;
        }

        // MUITO IMPORTANTE: evitar bug "id duplicado"
        const data = snap.data() as any;
        const { id: possibleIdInData, ...rest } = data || {};

        const nextLead: Lead = {
          id: snap.id,
          ...rest,
        };

        setLead(nextLead);
        setLoading(false);
      },
      (err) => {
        console.error("Erro ao carregar lead:", err);
        setLoading(false);
        showToast("err", "Erro ao carregar lead.");
      }
    );

    return () => unsub();
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;

    setEventsLoading(true);

    const q = query(
      collection(db, "leads", leadId, "events"),
      orderBy("createdAt", "desc"),
      limit(25)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LeadEvent, "id">),
        }));
        setEvents(docs);
        setEventsLoading(false);
      },
      (err) => {
        console.error("Erro ao carregar eventos:", err);
        setEventsLoading(false);
      }
    );

    return () => unsub();
  }, [leadId]);

  // ----------------------------- Sync drafts when lead changes -----------------------------

  useEffect(() => {
    if (!lead) return;

    setOwnerDraft(lead.owner || "");
    setPriorityDraft((lead.priority as Priority) || "medium");
    setNotesDraft(lead.notes || "");
    setNextStepDraft(lead.nextStep || "");

    setStageDraft((lead.stage as StageKey) || null);
    setStatusDraft(null);
  }, [lead?.id]); // apenas quando trocar de lead

  // ----------------------------- Computed values -----------------------------

  const createdAtFormatted = useMemo(() => formatBRDateTime(lead?.createdAt), [lead?.createdAt]);
  const updatedAtFormatted = useMemo(() => formatBRDateTime(lead?.updatedAt), [lead?.updatedAt]);
  const lastContactFormatted = useMemo(() => formatBRDateTime(lead?.lastContactAt), [lead?.lastContactAt]);

  const stageInfo = useMemo(() => STAGES.find((s) => s.key === stageDraft) || null, [stageDraft]);
  const recommended = useMemo(() => recommendOffer(stageDraft), [stageDraft]);

  const effectiveStatus: LeadStatus = (lead?.status || "novo") as LeadStatus;

  const waMessage = useMemo(() => {
  const empresa = lead?.nome || "tudo bem";
  const cidade = lead?.endereco ? short(lead.endereco, 50) : null;

  // 1. Introdução
  const intro = `Olá, ${empresa}! Tudo bem?\n\nMe chamo Sávio, sou fundador da ALTUM.`;

  // 2. O que é a ALTUM (autoridade leve)
  const about = `A ALTUM ajuda empresas a organizarem e melhorarem sua presença digital (Google, site e canais online).`;

  // 3. Observações PERSONALIZADAS (sem julgamento)
  const observations: string[] = [];

  if (stageDraft === "INVISIVEL") {
    observations.push("Percebi que hoje a empresa quase não aparece nas buscas do Google.");
  }

  if (stageDraft === "SITE_RUIM") {
    observations.push("Vi que vocês têm site, mas ele ainda não está ajudando tanto na geração de contatos.");
  }

  if (stageDraft === "SITE_OK") {
    observations.push("O site de vocês é bom, mas ainda dá pra extrair mais resultados dele.");
  }

  if (stageDraft === "TRAFEGO_ZERO") {
    observations.push("Também não identifiquei campanhas ativas trazendo demanda de forma previsível.");
  }

  if (stageDraft === "TRAFEGO_FRACO") {
    observations.push("As campanhas parecem existir, mas ainda sem constância.");
  }

  const observationBlock =
    observations.length > 0
      ? `\n\nDei uma olhada rápida e notei alguns pontos:\n• ${observations.join("\n• ")}`
      : "";

  // 4. Convite SEM VENDA
  const invite = `\n\nSe fizer sentido pra você, posso te enviar um diagnóstico gratuito mostrando:
• onde a empresa aparece hoje  
• o que está limitando mais resultados  
• e caminhos simples de melhoria  

Sem compromisso, só informação.
Posso te mandar?`;

  // 5. Localização (humaniza)
  const location = cidade ? `\n\nEncontrei vocês em ${cidade}.` : "";

  return `${intro}\n${about}${location}${observationBlock}${invite}`;
}, [lead?.nome, lead?.endereco, stageDraft]);

  const waLink = useMemo(() => {
    if (!lead?.telefone) return null;
    return buildWhatsAppLink(lead.telefone, waMessage);
  }, [lead?.telefone, waMessage]);

  // ----------------------------- Firestore actions -----------------------------

  async function addEvent(e: Omit<LeadEvent, "id">) {
    if (!leadId) return;
    try {
      await addDoc(collection(db, "leads", leadId, "events"), {
        ...e,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Erro ao criar evento:", err);
    }
  }

  async function updateLead(patch: Partial<Lead>, event?: { type: string; title: string; detail?: string; meta?: any }) {
    if (!leadId) return;
    try {
      await updateDoc(doc(db, "leads", leadId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });

      if (event) {
        await addEvent({
          type: event.type,
          title: event.title,
          detail: event.detail || "",
          meta: event.meta || {},
        });
      }
    } catch (err) {
      console.error("Erro ao atualizar lead:", err);
      showToast("err", "Falha ao salvar alterações.");
    }
  }

  async function applyStatus(newStatus: LeadStatus) {
    if (!leadId) return;
    setSavingStatus(true);
    try {
      await updateLead(
        { status: newStatus },
        { type: "status", title: "Status atualizado", detail: `Status definido para: ${STATUS_LABELS[newStatus]}` }
      );
      setStatusDraft(null);
      showToast("ok", "Status atualizado.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveCRM() {
    if (!leadId) return;
    setSavingCRM(true);

    try {
      const offerSnapshot = {
        id: recommended.id,
        title: recommended.title,
        priceFrom: recommended.priceFrom,
        priceTo: recommended.priceTo,
        pitch: recommended.pitch,
        deliverables: recommended.deliverables,
      };

      await updateLead(
        {
          owner: ownerDraft.trim(),
          priority: priorityDraft,
          notes: notesDraft,
          nextStep: nextStepDraft,
          stage: stageDraft || "",
          stageTags: stageDraft ? [stageDraft] : [],
          offer: offerSnapshot,
        },
        {
          type: "crm",
          title: "CRM atualizado",
          detail: `Stage: ${stageDraft || "—"} • Oferta: ${recommended.title}`,
          meta: { stage: stageDraft, offerId: recommended.id },
        }
      );

      showToast("ok", "CRM salvo com sucesso.");
    } finally {
      setSavingCRM(false);
    }
  }

  async function markContacted() {
    if (!leadId) return;

    await updateLead(
      {
        status: "contatado",
        lastContactAt: serverTimestamp(),
      },
      {
        type: "contact",
        title: "Contato iniciado",
        detail: "Lead marcado como contatado e lastContactAt atualizado.",
      }
    );
    showToast("ok", "Lead marcado como contatado.");
  }

  async function openWhatsApp() {
    if (!waLink) {
      showToast("warn", "Telefone inválido ou ausente.");
      return;
    }

    // Evento antes de abrir (pra registrar)
    await addEvent({
      type: "whatsapp",
      title: "WhatsApp aberto",
      detail: `Mensagem preparada: "${short(waMessage, 140)}"`,
      meta: { url: waLink },
    });

    // Marcar como contatado automaticamente (melhor prática)
    if (effectiveStatus === "novo") {
      await markContacted();
    }

    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  async function copyToClipboard(text: string, okMsg = "Copiado!") {
    try {
      await navigator.clipboard.writeText(text);
      showToast("ok", okMsg);
    } catch {
      showToast("err", "Não consegui copiar.");
    }
  }

  async function convertToClient() {
    if (!lead) return;
    setConvertingClient(true);

    try {
      await addDoc(collection(db, "clientes"), {
        name: lead.nome || "Cliente sem nome",
        telefone: lead.telefone || "",
        email: lead.email || "",
        endereco: lead.endereco || "",
        origem: lead.origem || "",
        createdAt: serverTimestamp(),
      });

      await updateLead(
        { status: "qualificado" },
        { type: "convert", title: "Convertido em cliente", detail: "Lead virou cliente (coleção clientes)." }
      );

      showToast("ok", "Cliente criado com sucesso.");
      router.push("/admin/clientes");
    } catch (err) {
      console.error("Erro ao converter lead em cliente:", err);
      showToast("err", "Erro ao criar cliente.");
    } finally {
      setConvertingClient(false);
    }
  }

  async function convertToProject() {
    if (!lead) return;
    setCreatingProject(true);

    try {
      const projetoRef = await addDoc(collection(db, "projetos"), {
        titulo: `Projeto - ${lead.nome || "Lead"}`,
        status: "Onboarding",
        clientName: lead.nome || "Cliente",
        canalPrincipal: lead.origem || "Indefinido",
        servicos: [],
        createdAt: serverTimestamp(),
      });

      await updateLead(
        { status: "qualificado" },
        { type: "convert", title: "Projeto criado", detail: `Projeto criado a partir do lead: ${projetoRef.id}` }
      );

      showToast("ok", "Projeto criado com sucesso.");
      router.push(`/admin/projetos/${projetoRef.id}`);
    } catch (err) {
      console.error("Erro ao criar projeto a partir do lead:", err);
      showToast("err", "Erro ao criar projeto.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function refreshSnapshot() {
    // Em alguns casos você quer forçar recomputar oferta e salvar no lead
    if (!leadId) return;

    setSavingCRM(true);
    try {
      const offerSnapshot = {
        id: recommended.id,
        title: recommended.title,
        priceFrom: recommended.priceFrom,
        priceTo: recommended.priceTo,
        pitch: recommended.pitch,
        deliverables: recommended.deliverables,
      };

      await updateLead(
        {
          offer: offerSnapshot,
          stage: stageDraft || "",
          stageTags: stageDraft ? [stageDraft] : [],
        },
        {
          type: "offer",
          title: "Oferta recalculada",
          detail: `Oferta atual: ${recommended.title} (${moneyBR(recommended.priceFrom)}–${moneyBR(recommended.priceTo)})`,
        }
      );

      showToast("ok", "Oferta recalculada e salva.");
    } finally {
      setSavingCRM(false);
    }
  }

  async function deleteLead() {
    if (!leadId) return;
    setDeleting(true);

    try {
      // Deleta doc principal (subcoleções não são deletadas automaticamente).
      // CEO mode: por enquanto ok (não polui seu CRM principal).
      await deleteDoc(doc(db, "leads", leadId));

      showToast("ok", "Lead removido.");
      router.push("/admin/prospeccao");
    } catch (err) {
      console.error("Erro ao deletar lead:", err);
      showToast("err", "Erro ao deletar lead.");
    } finally {
      setDeleting(false);
      setDangerOpen(false);
    }
  }

  // ----------------------------- UI States -----------------------------

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando lead...
        </div>
      </div>
    );
  }

  if (notFound || !lead) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/prospeccao")}
          className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para prospecção
        </button>

        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          Lead não encontrado.
        </div>
      </div>
    );
  }

  // ----------------------------- Render -----------------------------

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={cx(
            "fixed right-5 top-5 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
            toast.type === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
            toast.type === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-100",
            toast.type === "err" && "border-red-500/30 bg-red-500/10 text-red-100"
          )}
        >
          <div className="flex items-center gap-2">
            {toast.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : null}
            {toast.type === "warn" ? <AlertTriangle className="h-4 w-4" /> : null}
            {toast.type === "err" ? <XCircleIcon /> : null}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/admin/prospeccao")}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <ArrowLeft size={14} /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDangerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-200 hover:bg-red-500/15 transition"
            >
              <Trash2 className="h-4 w-4" />
              Remover lead
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-wide">{lead.nome || "Lead sem nome"}</h1>

            <Badge
              label={STATUS_LABELS[effectiveStatus]}
              className={STATUS_STYLE[effectiveStatus]}
            />

            <Badge
              label={PRIORITY_LABELS[priorityDraft]}
              className={PRIORITY_STYLE[priorityDraft]}
            />

            {stageDraft ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-200">
                <Tags className="h-3.5 w-3.5" />
                {STAGES.find((s) => s.key === stageDraft)?.label || stageDraft}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                <Info className="h-3.5 w-3.5" />
                Sem estágio definido
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => copyToClipboard(waMessage, "Mensagem copiada!")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition"
            >
              <ClipboardCopy className="h-4 w-4" />
              Copiar mensagem
            </button>

            <button
              onClick={openWhatsApp}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-500 transition"
            >
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp
              <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
          <span className="inline-flex items-center gap-1">
            <Timer className="h-4 w-4 text-white/30" />
            Captado em: {createdAtFormatted}
          </span>
          <span className="inline-flex items-center gap-1">
            <RefreshCcw className="h-4 w-4 text-white/30" />
            Atualizado: {updatedAtFormatted}
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-4 w-4 text-white/30" />
            Último contato: {lastContactFormatted}
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT (2 cols): Lead + CRM + Status + Timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Lead Data */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Dados do lead"
              icon={<ShieldCheck className="h-4 w-4" />}
              subtitle="Informações captadas (Google Places / base)."
              right={
                <div className="flex items-center gap-2">
                  {lead.telefone ? (
                    <button
                      onClick={() => copyToClipboard(lead.telefone || "", "Telefone copiado!")}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 transition"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      Copiar telefone
                    </button>
                  ) : null}
                </div>
              }
            />

            <Divider />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 text-xs text-white/75">
                <Row icon={<Phone className="h-4 w-4 text-white/40" />} label="Telefone" value={lead.telefone || "—"} />
                <Row icon={<Mail className="h-4 w-4 text-white/40" />} label="E-mail" value={lead.email || "—"} />
                <Row icon={<MapPin className="h-4 w-4 text-white/40" />} label="Endereço" value={lead.endereco || "—"} />
              </div>

              <div className="space-y-2 text-xs text-white/75">
                <Row icon={<Target className="h-4 w-4 text-white/40" />} label="Origem" value={lead.origem || "—"} />
                <Row icon={<Sparkles className="h-4 w-4 text-white/40" />} label="Categoria" value={lead.categoria || "—"} />
                <Row icon={<Star className="h-4 w-4 text-white/40" />} label="Lead ID" value={lead.id} mono />
              </div>
            </div>
          </div>

          {/* Diagnóstico + Oferta */}
          <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-[#111111] to-[#111111] p-4 space-y-4">
            <SectionTitle
              title="Diagnóstico & Oferta"
              icon={<Wand2 className="h-4 w-4" />}
              subtitle="Você define o estágio → o sistema sugere a oferta e o pitch (pra você não travar no WhatsApp)."
              right={
                <button
                  onClick={refreshSnapshot}
                  disabled={savingCRM}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-100 hover:bg-blue-500/15 transition disabled:opacity-60"
                >
                  {savingCRM ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Recalcular oferta
                </button>
              }
            />

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-white/70">
                  <span className="font-semibold text-white/80">Estágio</span>
                  <span className="ml-2 text-white/50">(clique para selecionar)</span>
                </div>
                {stageInfo ? <span className="text-[11px] text-white/50">{stageInfo.hint}</span> : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <Pill
                    key={s.key}
                    active={stageDraft === s.key}
                    onClick={() => setStageDraft(s.key)}
                    title={s.hint}
                  >
                    {s.label}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {/* Offer card */}
              <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/50">Oferta recomendada</p>
                    <h3 className="mt-1 text-lg font-semibold text-white/90">{recommended.title}</h3>
                    <p className="mt-1 text-xs text-white/60">
                      Faixa: <span className="text-white/80 font-medium">{moneyBR(recommended.priceFrom)}</span> –{" "}
                      <span className="text-white/80 font-medium">{moneyBR(recommended.priceTo)}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70">
                    <Zap className="h-4 w-4" />
                  </div>
                </div>

                <Divider />

                <p className="mt-3 text-xs text-white/70 leading-relaxed">{recommended.pitch}</p>

                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">Entregáveis</p>
                  <ul className="mt-2 space-y-1 text-xs text-white/70">
                    {recommended.deliverables.map((d) => (
                      <li key={d} className="flex items-start gap-2">
                        <ChevronRight className="h-4 w-4 text-white/30 mt-[-1px]" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${recommended.title}\nFaixa: ${moneyBR(recommended.priceFrom)}–${moneyBR(recommended.priceTo)}\n\nPitch:\n${recommended.pitch}\n\nEntregáveis:\n- ${recommended.deliverables.join("\n- ")}`,
                        "Oferta copiada!"
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    Copiar oferta
                  </button>

                  <button
                    onClick={() => {
                      // “Aplicar recomendação” = salva CRM completo
                      saveCRM();
                    }}
                    disabled={savingCRM}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-[11px] text-white hover:bg-blue-500 transition disabled:opacity-60"
                  >
                    {savingCRM ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar CRM + oferta
                  </button>
                </div>
              </div>

              {/* WhatsApp composer */}
              <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/50">Mensagem WhatsApp</p>
                    <h3 className="mt-1 text-sm font-semibold text-white/85">Pronta pra enviar (personalizada)</h3>
                    <p className="mt-1 text-xs text-white/60">
                      Você abre no WhatsApp com 1 clique. Se o status estiver “Novo”, marca como “Contatado”.
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-100">
                    <MessagesSquare className="h-4 w-4" />
                  </div>
                </div>

                <Divider />

                <textarea
                  value={waMessage}
                  readOnly
                  className="mt-3 h-44 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80 outline-none"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => copyToClipboard(waMessage, "Mensagem copiada!")}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    Copiar
                  </button>

                  <button
                    onClick={openWhatsApp}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-500 transition"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enviar no WhatsApp
                    <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                  </button>

                  <button
                    onClick={markContacted}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 hover:bg-amber-500/15 transition"
                  >
                    <Flag className="h-4 w-4" />
                    Marcar contatado
                  </button>
                </div>

                {!lead.telefone ? (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Este lead não tem telefone — sem WhatsApp.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* CRM Controls */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-4">
            <SectionTitle
              title="CRM do lead"
              icon={<NotebookPen className="h-4 w-4" />}
              subtitle="Responsável, prioridade, observações e próximo passo. Isso te dá controle amanhã."
              right={
                <button
                  onClick={saveCRM}
                  disabled={savingCRM}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[11px] text-white hover:bg-white/15 transition disabled:opacity-60"
                >
                  {savingCRM ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar CRM
                </button>
              }
            />

            <Divider />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Responsável</label>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <PencilLine className="h-4 w-4 text-white/30" />
                  <input
                    value={ownerDraft}
                    onChange={(e) => setOwnerDraft(e.target.value)}
                    placeholder="ex: Sávio"
                    className="w-full bg-transparent text-xs text-white/80 outline-none placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Prioridade</label>
                <div className="flex flex-wrap gap-2">
                  {(["low", "medium", "high"] as Priority[]).map((p) => (
                    <Pill key={p} active={priorityDraft === p} onClick={() => setPriorityDraft(p)}>
                      {PRIORITY_LABELS[p]}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Atalhos</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setNextStepDraft("Enviar mensagem no WhatsApp e coletar 2 informações (site + objetivo).");
                      showToast("ok", "Próximo passo sugerido aplicado.");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition"
                  >
                    <Zap className="h-4 w-4" />
                    Próximo passo sugerido
                  </button>

                  <button
                    onClick={() => {
                      setNotesDraft(
                        `Diagnóstico rápido:\n- Presença no Google: \n- Site: \n- Tráfego: \n- Oferta ideal: ${recommended.title}\n- Faixa: ${moneyBR(recommended.priceFrom)}–${moneyBR(recommended.priceTo)}`
                      );
                      showToast("ok", "Modelo de observação aplicado.");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition"
                  >
                    <NotebookPen className="h-4 w-4" />
                    Modelo de observação
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Observações</label>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Ex: ligou hoje, pediu orçamento, disse que não tem site..."
                  className="h-40 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/80 outline-none placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Próximo passo</label>
                <textarea
                  value={nextStepDraft}
                  onChange={(e) => setNextStepDraft(e.target.value)}
                  placeholder="Ex: mandar proposta do pacote digital completo amanhã às 10h."
                  className="h-40 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/80 outline-none placeholder:text-white/30"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      await addEvent({
                        type: "note",
                        title: "Observação registrada (manual)",
                        detail: short(notesDraft || "", 200),
                      });
                      showToast("ok", "Evento criado no histórico.");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition"
                  >
                    <NotebookPen className="h-4 w-4" />
                    Registrar no histórico
                  </button>

                  <button
                    onClick={async () => {
                      await updateLead(
                        { lastContactAt: serverTimestamp() },
                        { type: "contact", title: "Contato atualizado", detail: "lastContactAt atualizado manualmente." }
                      );
                      showToast("ok", "Último contato atualizado.");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100 hover:bg-emerald-500/15 transition"
                  >
                    <Phone className="h-4 w-4" />
                    Atualizar último contato
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Atualizar status"
              icon={<CheckCircle2 className="h-4 w-4" />}
              subtitle="Organize seu funil. Isso guia follow-ups no n8n depois."
            />

            <Divider />

            <div className="flex flex-wrap gap-2 text-xs">
              {(["novo", "contatado", "respondido", "qualificado", "descartado"] as LeadStatus[]).map((s) => (
                <button
                  key={s}
                  disabled={savingStatus}
                  onClick={() => setStatusDraft(s)}
                  className={cx(
                    "px-3 py-1.5 rounded-lg border transition",
                    statusDraft === s
                      ? "bg-blue-600 text-white border-blue-400/50"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10",
                    savingStatus && "opacity-60"
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {statusDraft && statusDraft !== effectiveStatus && (
              <button
                disabled={savingStatus}
                onClick={() => applyStatus(statusDraft)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] hover:bg-emerald-500 transition disabled:opacity-60"
              >
                {savingStatus ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Aplicar status
                  </>
                )}
              </button>
            )}

            <p className="text-[11px] text-white/40">
              Regra prática: <b>Novo</b> → <b>Contatado</b> (abriu WhatsApp) → <b>Respondido</b> (respondeu algo) →{" "}
              <b>Qualificado</b> (pedido de proposta / interesse real) → <b>Descartado</b> (sem perfil).
            </p>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Histórico do lead (Timeline)"
              icon={<Link2 className="h-4 w-4" />}
              subtitle="Tudo que você faz vira evento. No futuro o n8n/IA alimenta isso automaticamente."
              right={
                <button
                  onClick={async () => {
                    await addEvent({
                      type: "manual",
                      title: "Checkpoint manual",
                      detail: "Você marcou um checkpoint na timeline.",
                    });
                    showToast("ok", "Checkpoint criado.");
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 transition"
                >
                  <PlusIcon />
                  Checkpoint
                </button>
              }
            />

            <Divider />

            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando eventos...
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-white/50">Nenhum evento ainda. Quando você salvar/contatar, isso aparece aqui.</p>
            ) : (
              <div className="space-y-2">
                {events.map((e) => (
                  <div key={e.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                            {e.type}
                          </span>
                          <p className="text-xs font-semibold text-white/80">{e.title}</p>
                        </div>
                        {e.detail ? <p className="text-xs text-white/60 leading-relaxed">{e.detail}</p> : null}
                      </div>
                      <p className="text-[11px] text-white/40">{formatBRDateTime(e.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Logs / automação (pronto pra n8n depois) */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Logs da automação (preparado para n8n)"
              icon={<Bot className="h-4 w-4" />}
              subtitle="Hoje: você opera manual. Amanhã: o n8n registra eventos aqui."
              right={
                <button
                  onClick={async () => {
                    await addEvent({
                      type: "n8n",
                      title: "Simulação de log n8n",
                      detail: "Este evento simula um log de automação. Serve pra validar o painel.",
                      meta: { simulated: true },
                    });
                    showToast("ok", "Log simulado criado.");
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-100 hover:bg-blue-500/15 transition"
                >
                  <Bot className="h-4 w-4" />
                  Simular log
                </button>
              }
            />

            <Divider />

            <p className="text-xs text-white/60 leading-relaxed">
              Quando você plugar o n8n, cada mensagem enviada, falha, follow-up e resposta automática vai virar um evento
              aqui. Isso te dá auditoria total.
            </p>
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="space-y-4">
          {/* Converter */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Converter lead"
              icon={<UserPlus className="h-4 w-4" />}
              subtitle="Quando ele demonstrar interesse real."
            />

            <Divider />

            <button
              disabled={convertingClient}
              onClick={convertToClient}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 transition disabled:opacity-60"
            >
              {convertingClient ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando cliente...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Criar cliente
                </>
              )}
            </button>

            <button
              disabled={creatingProject}
              onClick={convertToProject}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm hover:bg-purple-500 transition disabled:opacity-60"
            >
              {creatingProject ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando projeto...
                </>
              ) : (
                <>
                  <Rocket size={16} />
                  Criar projeto
                </>
              )}
            </button>

            <p className="text-[11px] text-white/40">
              Hoje é manual. Depois o n8n/IA pode qualificar e converter sozinho (com regras).
            </p>
          </div>

          {/* Ações rápidas */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Ações rápidas"
              icon={<Zap className="h-4 w-4" />}
              subtitle="Atalhos pra operar rápido amanhã."
            />

            <Divider />

            <div className="space-y-2 text-xs">
              <button
                onClick={openWhatsApp}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 hover:bg-emerald-500 transition"
              >
                <MessageCircle size={14} /> Iniciar conversa (WhatsApp)
              </button>

              <button
                onClick={async () => {
                  await addEvent({
                    type: "sdr",
                    title: "IA SDR (modo manual)",
                    detail:
                      "Você marcou a execução da SDR. Por enquanto, isso só registra evento e organiza o lead. Depois plugamos IA/n8n.",
                    meta: { mode: "manual" },
                  });
                  showToast("ok", "Executado (modo manual).");
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20 transition"
              >
                <Bot size={14} /> Rodar IA SDR (modo manual)
              </button>

              <button
                onClick={async () => {
                  await updateLead(
                    { status: "descartado" },
                    { type: "discard", title: "Lead descartado", detail: "Status alterado para descartado (manual)." }
                  );
                  showToast("ok", "Lead descartado.");
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 hover:bg-red-500/15 transition"
              >
                <Trash2 size={14} /> Descartar lead
              </button>
            </div>

            <p className="text-[11px] text-white/40">
              Sua rotina: qualifica estágio → oferta aparece → manda WhatsApp → registra observações → converte.
            </p>
          </div>

          {/* Oferta em “1 tela” */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <SectionTitle
              title="Oferta na cara"
              icon={<Target className="h-4 w-4" />}
              subtitle="Pra você não travar no pitch."
              right={
                <button
                  onClick={() => copyToClipboard(`${recommended.title} — ${moneyBR(recommended.priceFrom)}–${moneyBR(recommended.priceTo)}`, "Resumo copiado!")}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 transition"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copiar
                </button>
              }
            />

            <Divider />

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
              <p className="text-xs font-semibold text-blue-100">{recommended.title}</p>
              <p className="mt-1 text-xs text-white/70">
                Faixa: <span className="text-white/90 font-medium">{moneyBR(recommended.priceFrom)}</span> –{" "}
                <span className="text-white/90 font-medium">{moneyBR(recommended.priceTo)}</span>
              </p>
              <p className="mt-2 text-xs text-white/70 leading-relaxed">{recommended.pitch}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger modal */}
      {dangerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white/90">Remover lead</h3>
                <p className="mt-1 text-xs text-white/60">
                  Isso remove o documento do lead. Subcoleções (events) podem permanecer no Firestore se você não limpar manualmente.
                </p>
              </div>
              <button
                onClick={() => setDangerOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Divider />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDangerOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70 hover:bg-white/10 transition"
              >
                Cancelar
              </button>

              <button
                disabled={deleting}
                onClick={deleteLead}
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200 hover:bg-red-500/15 transition disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------- Small internal components (icons/rows) -----------------------------

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
        <p className={cx("text-xs text-white/80", mono && "font-mono text-[11px] text-white/70 break-all")}>{value}</p>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path
        d="M15 9l-6 6M9 9l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
