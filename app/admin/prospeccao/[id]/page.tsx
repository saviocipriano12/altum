"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { TimestampLike } from "@/app/types/domain";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import {
  ArrowLeft, Phone, MapPin, Target, Sparkles, CheckCircle2,
  Loader2, UserPlus, MessageCircle,
  ShieldCheck, Zap, Star, ClipboardCopy, Check, Copy,
  ExternalLink, PencilLine, Save, RefreshCcw, AlertTriangle,
  X, DollarSign, Clock, Globe, Unlock, CreditCard, QrCode,
  Calculator, User, Building2, Map, LayoutDashboard, BrainCircuit, Grip,
  FileText, Linkedin, Instagram, Plus, Link as LinkIcon
} from "lucide-react";

/**
 * ======================================================================
 * ALTUM CRM - LEAD DETAIL (ULTIMATE EDITION v5.0 - "THE WAR ROOM")
 * ======================================================================
 * Features:
 * 1. Edicao Inline Completa (Tel, Site, CNPJ, Social).
 * 2. Modulo de Links Uteis Dinamicos.
 * 3. Dados Ricos & Inteligencia V4.
 * 4. Conversao Atomica e Gestao de Ofertas.
 */

// ----------------------------- TYPES & INTERFACES -----------------------------

type LeadStatus = "novo" | "contatado" | "respondido" | "qualificado" | "descartado";
type Priority = "low" | "medium" | "high";
type PersonaType = "dono" | "gerente" | "atendente";

interface UsefulLink {
  title: string;
  url: string;
}

interface LeadIntelligence {
  status?: "pending" | "processing" | "ready" | "failed" | "disabled";
  summary?: string;
  confidence?: number;
  legalName?: string;
  tradeName?: string;
  ownerName?: string;
  cnpjDetected?: string;
  segment?: string;
  city?: string;
  state?: string;
  website?: string;
  websiteTitle?: string;
  websiteDescription?: string;
  socialLinks?: string[];
  adSignals?: string[];
  adMaturity?: "none" | "basic" | "active";
  sources?: string[];
  error?: string;
  updatedAt?: TimestampLike | number | null;
}

interface LeadProposalDraft {
  headline?: string;
  whyNow?: string;
  firstContactMessage?: string;
  emailSubject?: string;
  suggestedServices?: string[];
  nextSteps?: string[];
  confidence?: number;
  model?: string;
  generatedAt?: TimestampLike | number | null;
}

interface Lead {
  id: string;
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  categoria?: string;
  sourceId?: string;
  sourceType?: string;
  placeId?: string;
  website?: string;
  
  // DADOS CORPORATIVOS EXTRAS (NOVO)
  cnpj?: string;
  instagram?: string;
  linkedin?: string;
  usefulLinks?: UsefulLink[]; // Array de links extras

  // DADOS RICOS (INTELLIGENZ API)
  priceLevel?: number; // 0-4 ($$$$)
  isOpenNow?: boolean;
  photos?: string[];
  rating?: number;
  userRatingsTotal?: number;
  lat?: number;
  lng?: number;
  
  // Intelligence Meta
  foiResgatado?: boolean;
  score?: number;
  heat?: string;
  
  status?: LeadStatus;
  
  // CRM Core
  stage?: StageKey;
  stageTags?: string[];
  owner?: string;
  ownerId?: string | null;
  priority?: Priority;
  pipelineStage?: string;
  kanbanIndex?: number;
  notes?: string;
  nextStep?: string;
  reasons?: string[];
  
  // Snapshot da Oferta
  offer?: {
    id: string; title: string; priceFrom: number; priceTo: number; pitch: string; deliverables: string[];
  };

  intelligence?: LeadIntelligence;
  proposalDraft?: LeadProposalDraft;

  lastContactAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
  createdAt?: TimestampLike | number | null;
}

interface LeadEvent {
  id: string;
  type: string;
  title: string;
  detail?: string;
  createdAt?: TimestampLike | number | null;
  meta?: Record<string, unknown>;
}

// ----------------------------- CONSTANTS & STYLES -----------------------------

const STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo", contatado: "Contatado", respondido: "Respondido", qualificado: "Qualificado", descartado: "Descartado",
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  novo: "bg-blue-500/10 text-blue-200 border border-blue-500/30",
  contatado: "bg-amber-500/10 text-amber-200 border border-amber-500/30",
  respondido: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/30",
  qualificado: "bg-purple-500/10 text-purple-200 border border-purple-500/30",
  descartado: "bg-red-500/10 text-red-200 border border-red-500/30",
};

// ----------------------------- MATRIZ DE OFERTAS -----------------------------

type OfferId = "SITE_EXPRESS" | "SITE_PREMIUM" | "GMB_SETUP" | "GMB_OTIMIZACAO" | "TRAFEGO_INICIAL" | "TRAFEGO_SCALE" | "LP_CONVERSAO" | "PACK_DIGITAL" | "DIAGNOSTICO" | "AUTOMACAO_CRM" | "FOLLOWUP_WHATS";

type OfferDef = { id: OfferId; title: string; priceFrom: number; priceTo: number; pitch: string; deliverables: string[]; bestFor: string[]; };

const OFFERS: OfferDef[] = [
  { id: "DIAGNOSTICO", title: "Diagnostico Premium", priceFrom: 97, priceTo: 297, pitch: "Eu te entrego um diagnostico objetivo do seu digital.", deliverables: ["Checklist Google", "Analise site", "Plano de acao"], bestFor: ["Entrada"] },
  { id: "GMB_SETUP", title: "Google Meu Negocio (Setup)", priceFrom: 397, priceTo: 997, pitch: "Organizo seu Google Meu Negocio do jeito certo.", deliverables: ["Categorias otimizadas", "Servicos", "Padronizacao"], bestFor: ["Sem Google"] },
  { id: "GMB_OTIMIZACAO", title: "Google Meu Negocio (Ranking)", priceFrom: 597, priceTo: 1497, pitch: "Ajusto e otimizo seu perfil pra aumentar impressoes.", deliverables: ["Revisao completa", "Otimizacao", "Plano posts"], bestFor: ["Ja tem ficha"] },
  { id: "SITE_EXPRESS", title: "Site Express", priceFrom: 997, priceTo: 2497, pitch: "Um site enxuto e bonito que converte.", deliverables: ["Site One-Page", "Botao WhatsApp", "SEO Basico"], bestFor: ["Sem site"] },
  { id: "SITE_PREMIUM", title: "Site Premium", priceFrom: 2497, priceTo: 6997, pitch: "Site robusto com estrutura de copy e design high-end.", deliverables: ["Design Exclusivo", "Copywriting", "SEO Tecnico"], bestFor: ["High Ticket"] },
  { id: "LP_CONVERSAO", title: "LP de Conversao", priceFrom: 997, priceTo: 2997, pitch: "Uma LP focada em gerar conversas e pedidos.", deliverables: ["Copy conversao", "Design responsivo", "Integracao"], bestFor: ["Campanhas"] },
  { id: "TRAFEGO_INICIAL", title: "Trafego Inicial", priceFrom: 600, priceTo: 1500, pitch: "Campanha inicial focada em trazer mensagens.", deliverables: ["Setup Meta Ads", "Criativos basicos", "Otimizacao"], bestFor: ["Comecando"] },
  { id: "TRAFEGO_SCALE", title: "Trafego Scale", priceFrom: 1500, priceTo: 4500, pitch: "Estrutura pra escalar: campanhas + criativos + funil.", deliverables: ["Estrutura de funil", "Rotina de testes", "Relatorios"], bestFor: ["Escala"] },
  { id: "PACK_DIGITAL", title: "Pacote Digital", priceFrom: 2497, priceTo: 5997, pitch: "A solucao completa: site + Google + Ads.", deliverables: ["Site Express", "GMB", "Trafego (1 mes)"], bestFor: ["Tudo pronto"] },
  { id: "AUTOMACAO_CRM", title: "Automacao + CRM", priceFrom: 1997, priceTo: 9997, pitch: "Automacao de atendimento e organizacao comercial.", deliverables: ["Implantacao CRM", "Bot WhatsApp", "Regua Follow-up"], bestFor: ["Volume alto"] },
  { id: "FOLLOWUP_WHATS", title: "Follow-up Automatico", priceFrom: 497, priceTo: 1997, pitch: "Mensagens automaticas de reativacao.", deliverables: ["Sequencia msgs", "Regras estagio", "Logs CRM"], bestFor: ["Perde leads"] },
];

type StageKey = "INVISIVEL" | "PRESENTE_FRACO" | "SITE_RUIM" | "SITE_OK" | "TRAFEGO_ZERO" | "TRAFEGO_FRACO" | "TRAFEGO_OK" | "OPERACAO_ATIVA";

const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: "INVISIVEL", label: "Invisivel Digital", hint: "Nao existe no Google ou Maps." },
  { key: "PRESENTE_FRACO", label: "Presenca Fraca", hint: "Existe mas nao passa confianca." },
  { key: "SITE_RUIM", label: "Site Ruim/Amador", hint: "Site lento, feio ou nao converte." },
  { key: "SITE_OK", label: "Site OK", hint: "Tem base, falta trafego." },
  { key: "TRAFEGO_ZERO", label: "Sem Trafego", hint: "Depende so do organico." },
  { key: "TRAFEGO_FRACO", label: "Trafego Fraco", hint: "Anuncia sem estrategia." },
  { key: "TRAFEGO_OK", label: "Trafego OK", hint: "Ja anuncia bem, quer escalar." },
  { key: "OPERACAO_ATIVA", label: "Operacao Ativa", hint: "Maquina rodando, foco em CRM." },
];

function recommendOffer(stage: StageKey | null | undefined): OfferDef {
  if (!stage) return OFFERS.find((o) => o.id === "DIAGNOSTICO")!;
  switch (stage) {
    case "INVISIVEL": return OFFERS.find((o) => o.id === "PACK_DIGITAL")!;
    case "PRESENTE_FRACO": return OFFERS.find((o) => o.id === "GMB_SETUP")!;
    case "SITE_RUIM": return OFFERS.find((o) => o.id === "SITE_EXPRESS")!;
    case "SITE_OK": return OFFERS.find((o) => o.id === "LP_CONVERSAO")!;
    case "TRAFEGO_ZERO": return OFFERS.find((o) => o.id === "TRAFEGO_INICIAL")!;
    case "TRAFEGO_FRACO": return OFFERS.find((o) => o.id === "TRAFEGO_INICIAL")!;
    case "TRAFEGO_OK": return OFFERS.find((o) => o.id === "TRAFEGO_SCALE")!;
    case "OPERACAO_ATIVA": return OFFERS.find((o) => o.id === "AUTOMACAO_CRM")!;
    default: return OFFERS.find((o) => o.id === "DIAGNOSTICO")!;
  }
}

// --- HELPERS ---

function safeUrl(u?: string) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

function moneyBR(v?: number) {
  if (typeof v !== "number") return "-";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toDate(value?: TimestampLike | number | null) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function googleMapsLink(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function heatBadgeClass(heat?: string) {
  const normalized = (heat || "").toLowerCase();
  if (normalized === "quente") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
  if (normalized === "morno") return "border-amber-500/30 bg-amber-500/15 text-amber-100";
  if (normalized === "frio") return "border-blue-500/30 bg-blue-500/15 text-blue-100";
  return "border-white/10 bg-white/5 text-white/70";
}

function intelligenceStatusClass(status?: string) {
  if (status === "ready") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
  if (status === "processing") return "border-blue-500/30 bg-blue-500/15 text-blue-100";
  if (status === "failed") return "border-red-500/30 bg-red-500/15 text-red-100";
  if (status === "disabled") return "border-white/10 bg-white/5 text-white/55";
  return "border-amber-500/30 bg-amber-500/15 text-amber-100";
}

function sourceTypeLabel(sourceType?: string) {
  const normalized = (sourceType || "").toLowerCase();
  if (normalized.includes("google_places")) return "Google Places";
  if (normalized.includes("webhook")) return "Webhook";
  if (normalized.includes("manual")) return "Manual";
  return sourceType || "-";
}

// --- COMPONENTES VISUAIS ---

function SectionTitle({
  title,
  icon,
  right,
}: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
      <div className="flex items-center gap-2 text-white/90 font-bold tracking-wide text-sm uppercase">
        <span className="text-blue-500">{icon}</span> {title}
      </div>
      {right}
    </div>
  );
}

// ============================================================================
// COMPONENTES DE INTELIGENCIA
// ============================================================================

// 1. CALCULADORA DE PERDA
function RevenueLossCard({ lead }: { lead: Lead }) {
  const ticketMedio = lead.priceLevel ? lead.priceLevel * 200 : 150; 
  const perdaVisitas = lead.website ? 50 : 300; 
  const conversao = 0.05; 
  const perdaReais = perdaVisitas * conversao * ticketMedio;
  const isGood = lead.website && (lead.rating || 0) > 4.2;

  return (
    <div className={cx("rounded-xl border p-5 relative overflow-hidden group transition-all duration-500", isGood ? "bg-gradient-to-br from-emerald-900/30 to-emerald-600/10 border-emerald-500/30" : "bg-gradient-to-br from-red-900/30 to-red-600/10 border-red-500/30")}>
      <div className={cx("absolute -right-12 -top-12 w-40 h-40 rounded-full blur-3xl transition", isGood ? "bg-emerald-500/20" : "bg-red-500/20")}></div>
      <div className="flex items-start gap-4 relative z-10">
        <div className={cx("p-3 rounded-xl shadow-lg", isGood ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200")}><Calculator size={24} /></div>
        <div>
          <h4 className={cx("font-black text-sm uppercase tracking-widest", isGood ? "text-emerald-200" : "text-red-200")}>{isGood ? "Potencial de Escala" : "Dinheiro na Mesa"}</h4>
          <p className={cx("text-xs mt-1 font-medium opacity-80", isGood ? "text-emerald-100" : "text-red-100")}>
            {isGood ? "Com trafego pago, este lead pode gerar:" : "Sem estrutura digital, estima-se que perca:"}
          </p>
          <div className="flex items-baseline gap-2 mt-2">
             <p className="text-3xl font-black text-white">{moneyBR(perdaReais)}</p>
             <span className="text-xs font-normal text-white/50">/mes</span>
          </div>
          <p className="text-[10px] text-white/30 mt-2 italic">*Estimativa baseada em Ticket Medio de {moneyBR(ticketMedio)} e volume local.</p>
        </div>
      </div>
    </div>
  );
}

// 2. GERADOR DE SCRIPT INTELIGENTE
function SmartScriptGenerator({ lead, onSend }: { lead: Lead, onSend: (msg: string) => void }) {
  const [persona, setPersona] = useState<PersonaType>("dono");

  const script = useMemo(() => {
    const nome = lead.nome || "Tudo bem?";
    const saudacao = `Ola ${nome}, aqui e o Savio da Altum.`;
    
    let dor = "";
    if (!lead.website) dor = "Vi que voces tem uma reputacao excelente na regiao, mas nao encontrei o site oficial para facilitar o agendamento/compra.";
    else if ((lead.rating || 0) < 4.0) dor = `Notei que a nota de voces no Google esta ${lead.rating}, e infelizmente isso pode estar entregando clientes para a concorrencia.`;
    else if (lead.priceLevel && lead.priceLevel >= 3) dor = "Percebi que voces tem um posicionamento premium, mas o digital ainda nao reflete essa autoridade de High Ticket.";
    else dor = `Estou selecionando as melhores empresas de ${lead.categoria || "sua area"} para um projeto de Growth.`;

    let cta = "";
    if (persona === "dono") cta = "Como dono, voce sabe que esta deixando dinheiro na mesa sem esse canal. Posso te mandar uma estimativa de quanto?";
    if (persona === "gerente") cta = "Temos uma solucao que organiza o atendimento e facilita sua gestao comercial. Posso te enviar um video curto?";
    if (persona === "atendente") cta = "Poderia me passar o contato do responsavel pelo marketing ou o proprietario? Tenho um material importante sobre a presenca online de voces.";

    return `${saudacao}\n\n${dor}\n\n${cta}`;
  }, [lead, persona]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#151515] p-5 space-y-4 shadow-xl">
      <div className="flex justify-between items-center border-b border-white/5 pb-3">
        <div className="flex items-center gap-2 text-xs font-black tracking-widest text-emerald-400 uppercase">
          <BrainCircuit size={16} /> Gerador de Ataque
        </div>
        <div className="flex bg-black/40 rounded-lg p-1 border border-white/5">
          {(["dono", "gerente", "atendente"] as PersonaType[]).map((p) => (
            <button key={p} onClick={() => setPersona(p)} className={cx("px-3 py-1 text-[10px] uppercase rounded-md transition font-bold", persona === p ? "bg-white/20 text-white" : "text-white/30 hover:text-white/60")}>
              {p}
            </button>
          ))}
        </div>
      </div>
      
      <div className="relative">
        <textarea 
            readOnly 
            value={script} 
            className="w-full h-36 bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white/80 resize-none focus:outline-none focus:border-emerald-500/50 leading-relaxed font-sans shadow-inner"
        />
        <button onClick={() => navigator.clipboard.writeText(script)} className="absolute top-2 right-2 p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition" title="Copiar"><ClipboardCopy size={14}/></button>
      </div>

      <button onClick={() => onSend(script)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/50 transform hover:-translate-y-0.5">
          <Zap size={16} fill="currentColor" /> ENVIAR NO WHATSAPP (API)
      </button>
    </div>
  );
}

// ----------------------------- MODULO FINANCEIRO (POS MULTIMEIOS) -----------------------------

interface CheckoutResult {
  chargeId?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: string;
  pix?: {
    encodedImage?: string;
    payload?: string;
  };
}

function FinanceCheckoutModule({ lead, onSendMessage, onPaymentSuccess }: { lead: Lead, onSendMessage: (msg: string) => void, onPaymentSuccess: () => void }) {
  const [amount, setAmount] = useState(lead.offer?.priceFrom || 1000);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"PIX" | "BOLETO" | "CREDIT_CARD">("PIX");
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await authedFetch('/api/finance/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          dueDate,
          billingType: method,
          customerInfo: {
            name: lead.nome || "Cliente",
            email: lead.email || "financeiro@cliente.com",
            phone: lead.telefone || "",
            cpfCnpj: lead.cnpj || ""
          },
          leadId: lead.id,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      const message =
        typeof e === "object" && e && "message" in e
          ? String((e as { message?: string }).message)
          : "erro desconhecido";
      alert("Erro Asaas: " + message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClip = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // SINTONIA TOTAL: Formata e dispara no Chat
  const sendToWhatsApp = () => {
    if (!result) return;
    let msg = `*ALTUM DIGITAL - PAGAMENTO*\n\n`;
    msg += `Ola ${lead.nome}! Para seguirmos com o seu projeto, aqui estao os detalhes para pagamento de *${moneyBR(amount)}*:\n\n`;

    if (method === "PIX") {
      msg += `- *PIX COPIA E COLA:*\n\`${result.pix?.payload || ""}\`\n\n`;
    } else if (method === "BOLETO") {
      msg += `- *LINK DO BOLETO:*\n${result.bankSlipUrl}\n\n`;
    } else {
      msg += `- *LINK CARTAO (Ate 12x):*\n${result.invoiceUrl}\n\n`;
    }
    
    msg += `_Assim que o pagamento for confirmado, nosso sistema liberara o Onboarding automaticamente._`;
    onSendMessage(msg);
  };

  return (
    <div className="bg-[#0f0f0f] border border-white/10 rounded-[2rem] p-6 mb-6 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity"><DollarSign size={40}/></div>
      
      <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
        <h3 className="text-xs font-black text-white/50 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500"/> Checkout Master Altum
        </h3>
        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20 font-bold tracking-tighter">API V3 ATIVA</span>
      </div>

      <div className="space-y-4">
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 transition-all focus-within:border-blue-500/30">
          <p className="text-[10px] uppercase font-black text-white/20 mb-1 tracking-widest">Valor da Venda</p>
          <div className="flex items-center gap-2">
             <span className="text-emerald-500 font-black text-xl">R$</span>
             <input 
                type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} 
                className="bg-transparent text-white font-mono text-2xl font-black w-full outline-none"
             />
          </div>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 transition-all focus-within:border-blue-500/30">
          <p className="text-[10px] uppercase font-black text-white/20 mb-2 tracking-widest">Vencimento</p>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
          />
        </div>

        {!result ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "PIX", icon: <QrCode size={18}/>, label: "PIX" },
                { id: "BOLETO", icon: <FileText size={18}/>, label: "Boleto" },
                { id: "CREDIT_CARD", icon: <CreditCard size={18}/>, label: "Cartao" }
              ].map((m) => (
                <button key={m.id} onClick={() => setMethod(m.id as "PIX" | "BOLETO" | "CREDIT_CARD")} className={cx("flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all font-black text-[10px] uppercase tracking-tighter", method === m.id ? "bg-blue-600/10 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "bg-white/5 border-white/5 text-white/30 hover:bg-white/10")}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            <button onClick={handleGenerate} disabled={loading} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/20 uppercase tracking-widest">
              {loading ? <Loader2 className="animate-spin" size={16}/> : <Zap size={16} fill="white"/>} GERAR COBRANCA {method}
            </button>
          </>
        ) : (
          <div className="space-y-3 animate-in zoom-in duration-300">
            {method === "PIX" && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                    {/* QR PIX em data URI; next/image nao agrega aqui. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`data:image/png;base64,${result.pix?.encodedImage || ""}`} alt="QR code Pix" className="w-40 h-40 mx-auto rounded-xl mb-4 border-4 border-white shadow-2xl"/>
                    <button onClick={() => copyToClip(result.pix?.payload || "")} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black text-white/60 flex items-center justify-center gap-2 border border-white/5 transition">
                        {copied ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>} {copied ? "COPIADO!" : "COPIAR PIX COPIA E COLA"}
                    </button>
                </div>
            )}

            <button onClick={sendToWhatsApp} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-blue-900/40 uppercase tracking-widest">
              <MessageCircle size={18} fill="white"/> ENVIAR PARA O CLIENTE
            </button>

            <div className="flex gap-2">
                <button onClick={() => setResult(null)} className="flex-1 py-2 text-white/20 hover:text-white transition text-[10px] font-black uppercase border border-white/5 rounded-xl">Cancelar</button>
                <button onClick={onPaymentSuccess} className="flex-1 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase">Forcar Aprovacao</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ----------------------------- PAGINA PRINCIPAL -----------------------------


interface PageToast {
  type: "ok" | "warn" | "err";
  msg: string;
}

export default function LeadDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = params?.id;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<PageToast | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);

  // Estados de Edicao CRM
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [stageDraft, setStageDraft] = useState<StageKey | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [runningIntelligence, setRunningIntelligence] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  // Estados de Edicao de Dados (Perfil)
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
      nome: "", endereco: "", telefone: "", website: "", cnpj: "", instagram: "", linkedin: ""
  });
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Firestore Sub
  useEffect(() => {
    if (!leadId) return;
    const unsub = onSnapshot(doc(db, "leads", leadId), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as Lead;
        setLead({ ...d, id: snap.id });
        setOwner(d.owner || "");
        setNotes(d.notes || "");
        setStageDraft((d.stage as StageKey | undefined) || undefined);
        
        // Populate edit form
        setEditForm({
            nome: d.nome || "",
            endereco: d.endereco || "",
            telefone: d.telefone || "",
            website: d.website || "",
            cnpj: d.cnpj || "",
            instagram: d.instagram || "",
            linkedin: d.linkedin || ""
        });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [leadId]);

  // Events Sub
  useEffect(() => {
    if (!leadId) return;
    const q = query(collection(db, "leads", leadId, "events"), orderBy("createdAt", "desc"), limit(20));
    const unsub = onSnapshot(q, (snap) => {
       setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeadEvent)));
    });
    return () => unsub();
  }, [leadId]);

  useEffect(() => {
    if (!lead?.photos?.length) {
      setPhotoUrls([]);
      return;
    }

    const resolved = lead.photos
      .filter((item) => typeof item === "string" && item.trim())
      .slice(0, 8)
      .map((item) => {
        const value = item.trim();
        if (value.startsWith("http://") || value.startsWith("https://")) {
          return value;
        }
        return `/api/prospeccao/photos?ref=${encodeURIComponent(value)}&maxWidth=1200`;
      });

    setPhotoUrls(resolved);
  }, [lead?.photos]);

  function showToast(type: "ok" | "warn" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  // --- ACTIONS ---

  async function requestApi<T>(path: string, body: Record<string, unknown>) {
    const res = await authedFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(data?.error || "Falha na API");
    return data;
  }

  async function setLeadStatus(status: LeadStatus, withContactTimestamp = false) {
    if (!leadId) return;
    await requestApi("/api/leads/update", {
      leadId,
      patch: {
        status,
        lastContactAtNow: withContactTimestamp,
      },
    });
  }

  async function saveCRM() {
    if (!leadId || !lead) return;
    setSaving(true);

    const recOffer = recommendOffer(stageDraft);
    const offerSnapshot = {
      id: recOffer.id,
      title: recOffer.title,
      priceFrom: recOffer.priceFrom,
      priceTo: recOffer.priceTo,
      pitch: recOffer.pitch,
      deliverables: recOffer.deliverables,
    };

    try {
      await requestApi("/api/leads/update", {
        leadId,
        patch: {
          owner,
          notes,
          stage: stageDraft,
          stageTags: stageDraft ? [stageDraft] : [],
          offer: offerSnapshot,
        },
      });
      showToast("ok", "CRM atualizado!");
    } catch (error) {
      console.error(error);
      showToast("err", "Erro ao salvar CRM.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!leadId) return;
    try {
      await requestApi("/api/leads/update", {
        leadId,
        patch: {
          ...editForm,
        },
      });
      setEditingProfile(false);
      showToast("ok", "Dados do lead atualizados!");
    } catch (error) {
      console.error(error);
      showToast("err", "Erro ao salvar perfil.");
    }
  }

  async function runLeadIntelligence(force = true) {
    if (!leadId) return;
    setRunningIntelligence(true);
    try {
      await requestApi("/api/leads/intelligence/run", {
        leadId,
        force,
        trigger: "lead_detail_manual",
      });
      showToast("ok", "Pesquisa automatica atualizada.");
    } catch (error) {
      console.error(error);
      showToast("err", "Erro ao rodar pesquisa automatica.");
    } finally {
      setRunningIntelligence(false);
    }
  }

  async function applyProposalToCRM() {
    if (!leadId || !lead?.proposalDraft) return;
    setApplyingProposal(true);
    try {
      const suggested = lead.proposalDraft.suggestedServices || [];
      const mergedNotes = [
        notes,
        "",
        "[IA] Rascunho comercial aplicado",
        `Headline: ${lead.proposalDraft.headline || "-"}`,
        `Urgencia: ${lead.proposalDraft.whyNow || "-"}`,
        `Mensagem inicial: ${lead.proposalDraft.firstContactMessage || "-"}`,
        `Servicos: ${suggested.join(", ") || "-"}`,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4800);

      await requestApi("/api/leads/update", {
        leadId,
        patch: {
          notes: mergedNotes,
          offer: {
            id: "PROPOSTA_IA",
            title: (lead.proposalDraft.headline || "Proposta inicial IA").slice(0, 150),
            priceFrom: recommended.priceFrom,
            priceTo: recommended.priceTo,
            pitch: (lead.proposalDraft.whyNow || recommended.pitch).slice(0, 1100),
            deliverables:
              (suggested.length ? suggested : recommended.deliverables).slice(0, 8),
          },
        },
      });

      setNotes(mergedNotes);
      showToast("ok", "Proposta da IA aplicada ao CRM.");
    } catch (error) {
      console.error(error);
      showToast("err", "Falha ao aplicar proposta da IA.");
    } finally {
      setApplyingProposal(false);
    }
  }

  async function addUsefulLink() {
    if (!leadId || !newLinkTitle || !newLinkUrl) return;
    try {
      const currentLinks = lead?.usefulLinks || [];
      const updatedLinks = [...currentLinks, { title: newLinkTitle, url: newLinkUrl }];
      await requestApi("/api/leads/update", {
        leadId,
        patch: { usefulLinks: updatedLinks },
      });
      setNewLinkTitle("");
      setNewLinkUrl("");
      showToast("ok", "Link adicionado!");
    } catch (error) {
      console.error(error);
      showToast("err", "Erro ao adicionar link.");
    }
  }

  async function removeUsefulLink(idx: number) {
    if (!leadId || !lead?.usefulLinks) return;
    try {
      const updated = lead.usefulLinks.filter((_, i) => i !== idx);
      await requestApi("/api/leads/update", {
        leadId,
        patch: { usefulLinks: updated },
      });
    } catch (error) {
      console.error(error);
      showToast("err", "Erro ao remover link.");
    }
  }

  async function handleWhatsApp(msg: string) {
    if (!lead?.telefone) return showToast("err", "Sem telefone.");
    if (!leadId) return;

    try {
      await requestApi("/api/leads/events/add", {
        leadId,
        type: "whatsapp",
        title: "Ataque enviado",
        detail: msg,
      });

      if (lead.status === "novo") {
        await setLeadStatus("contatado", true);
      }

      await requestApi("/api/whatsapp/send", {
        leadId,
        text: msg,
      });

      showToast("ok", "Mensagem enviada via WhatsApp oficial.");
    } catch (error) {
      console.error(error);
      showToast("err", "Falha no envio do WhatsApp.");
    }
  }

  async function convertToClient() {
    if (!leadId) return;
    setConverting(true);
    try {
      const data = await requestApi<{ projectId?: string }>("/api/leads/convert", { leadId });
      showToast("ok", "Lead convertido com sucesso!");
      if (data.projectId) {
        router.push(`/admin/projetos/${data.projectId}`);
      }
    } catch (error) {
      console.error(error);
      showToast("err", "Erro ao converter lead.");
    } finally {
      setConverting(false);
    }
  }

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (!lead) return <div className="p-10 text-white">Lead nao encontrado.</div>;

  const isHighTicket = (lead.priceLevel && lead.priceLevel >= 3);
  const recommended = recommendOffer(stageDraft);
  const intelligenceStatus = lead.intelligence?.status || "pending";
  const intelligenceStatusLabel =
    intelligenceStatus === "ready"
      ? "Pronto"
      : intelligenceStatus === "processing"
      ? "Processando"
      : intelligenceStatus === "failed"
      ? "Falhou"
      : intelligenceStatus === "disabled"
      ? "Desativado"
      : "Pendente";
  const intelligenceBadgeClass = intelligenceStatusClass(intelligenceStatus);
  const adMaturityLabel =
    lead.intelligence?.adMaturity === "active"
      ? "Ads ativos"
      : lead.intelligence?.adMaturity === "basic"
      ? "Ads basicos"
      : "Sem sinais de ads";
  const qualificationGrade =
    typeof lead.score === "number" && lead.score >= 85
      ? "A+"
      : typeof lead.score === "number" && lead.score >= 75
      ? "A"
      : typeof lead.score === "number" && lead.score >= 65
      ? "B"
      : typeof lead.score === "number" && lead.score >= 55
      ? "C"
      : "D";

  return (
    <div className="min-h-screen pb-24 space-y-8 bg-[#050505]">
      {/* TOAST */}
      {toast && (
        <div className={cx("fixed top-5 right-5 px-6 py-4 rounded-2xl border backdrop-blur-xl z-[100] text-sm font-bold flex items-center gap-3 animate-in slide-in-from-right shadow-2xl", toast.type === "ok" ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-100" : "border-red-500/50 bg-red-500/20 text-red-100")}>
          {toast.type === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} {toast.msg}
        </div>
      )}

      {/* --- HEADER HERO --- */}
      <div className="relative border-b border-white/10 bg-[#0f0f0f] shadow-2xl pb-10 pt-6 px-6 lg:px-12">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-b from-blue-900/40 via-[#0f0f0f] to-[#0f0f0f]" />
             <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px', opacity: 0.05 }}></div>
        </div>
        
        <div className="relative z-10 max-w-[1600px] mx-auto">
          <button onClick={() => router.push("/admin/prospeccao")} className="flex items-center gap-2 text-[10px] uppercase font-bold text-white/40 hover:text-white transition bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg mb-6 w-fit backdrop-blur-md">
            <ArrowLeft size={12} /> Voltar ao CRM
          </button>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
            <div className="space-y-4 flex-1">
              {editingProfile ? (
                 <div className="space-y-2">
                    <input value={editForm.nome} onChange={e => setEditForm({...editForm, nome: e.target.value})} className="text-4xl font-black bg-white/10 border-b border-white/20 text-white w-full outline-none px-2" />
                    <input value={editForm.endereco} onChange={e => setEditForm({...editForm, endereco: e.target.value})} className="text-sm bg-white/10 border-b border-white/20 text-white/70 w-full outline-none px-2" placeholder="Endereco"/>
                 </div>
              ) : (
                <div className="flex items-center gap-4 group">
                    <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-2xl">{lead.nome}</h1>
                    <button onClick={() => setEditingProfile(true)} className="opacity-0 group-hover:opacity-100 transition p-2 hover:bg-white/10 rounded-full"><PencilLine size={16}/></button>
                    {isHighTicket && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse"><DollarSign size={14} /> HIGH TICKET</span>}
                    {lead.foiResgatado && <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 shadow-[0_0_15px_rgba(59,130,246,0.3)]"><Unlock size={14} /> MANUAL</span>}
                </div>
              )}
              
              <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-white/70">
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5"><Target size={16} className="text-blue-400"/> {lead.categoria || "Geral"}</span>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5"><MapPin size={16} className="text-red-400"/> {lead.endereco}</span>
                {lead.rating && <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-amber-200"><Star size={16} fill="currentColor" className="text-amber-400"/> {lead.rating} <span className="opacity-50">({lead.userRatingsTotal})</span></span>}
                {lead.isOpenNow !== undefined && <span className={cx("flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold", lead.isOpenNow ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400")}><Clock size={16}/> {lead.isOpenNow ? "Aberto Agora" : "Fechado"}</span>}
              </div>
            </div>

            <div className="flex gap-3">
               <Link href={googleMapsLink(lead.nome + " " + lead.endereco)} target="_blank" className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 text-white/70 transition hover:scale-105 active:scale-95 shadow-xl" title="Ver no Maps">
                 <Map size={24} />
               </Link>
               {lead.website && (
                 <Link href={safeUrl(lead.website)} target="_blank" className="p-4 bg-blue-600/10 border border-blue-500/30 text-blue-400 rounded-2xl hover:bg-blue-600/20 transition hover:scale-105 active:scale-95 shadow-xl shadow-blue-500/10" title="Ver Site">
                   <Globe size={24} />
                 </Link>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* --- GRID PRINCIPAL --- */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12 grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* COLUNA ESQUERDA: PERFIL COMPLETO (30%) */}
        <div className="xl:col-span-4 space-y-6">
           <div className="bg-[#111] border border-white/10 rounded-3xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                 <SectionTitle title="Perfil Corporativo" icon={<Building2 size={18}/>} />
                 <button onClick={() => { if(editingProfile) saveProfile(); else setEditingProfile(true); }} className="text-xs font-bold text-blue-400 hover:text-blue-300">
                    {editingProfile ? "SALVAR" : "EDITAR"}
                 </button>
              </div>

              <div className="space-y-4">
                 {/* WhatsApp */}
                 <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition group">
                    <div className="flex items-center gap-4 flex-1">
                       <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl"><Phone size={18}/></div>
                       <div className="w-full">
                          <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">WhatsApp / Tel</p>
                          {editingProfile ? (
                              <input value={editForm.telefone} onChange={e => setEditForm({...editForm, telefone: e.target.value})} className="bg-white/10 text-white w-full rounded p-1 text-sm outline-none border border-white/20"/>
                          ) : (
                              <p className="text-base font-mono text-white/90">{lead.telefone || "Sem numero"}</p>
                          )}
                       </div>
                    </div>
                 </div>

                 {/* Website */}
                 <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 hover:border-blue-500/30 transition group">
                    <div className="flex items-center gap-4 flex-1">
                       <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><Globe size={18}/></div>
                       <div className="w-full">
                          <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Site Oficial</p>
                          {editingProfile ? (
                              <input value={editForm.website} onChange={e => setEditForm({...editForm, website: e.target.value})} className="bg-white/10 text-white w-full rounded p-1 text-sm outline-none border border-white/20"/>
                          ) : (
                              <p className="text-sm text-white/90 max-w-[200px] truncate">{lead.website || "Nao possui"}</p>
                          )}
                       </div>
                    </div>
                    {!editingProfile && lead.website && <Link href={safeUrl(lead.website)} target="_blank" className="text-white/20 hover:text-white transition p-2 hover:bg-white/10 rounded-lg"><ExternalLink size={16}/></Link>}
                 </div>

                 {/* Dados Extras (CNPJ/Social) */}
                 <div className="pt-4 border-t border-white/5 space-y-3">
                     <div className="grid grid-cols-1 gap-2">
                        <label className="text-[10px] uppercase font-bold text-white/30">CNPJ</label>
                        {editingProfile ? (
                           <input value={editForm.cnpj} onChange={e => setEditForm({...editForm, cnpj: e.target.value})} className="bg-white/5 border border-white/10 rounded p-2 text-sm text-white w-full outline-none" placeholder="00.000.000/0001-00"/>
                        ) : (
                           <p className="text-sm font-mono text-white/70">{lead.cnpj || "-"}</p>
                        )}
                     </div>
                     
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                           <label className="text-[10px] uppercase font-bold text-white/30 flex items-center gap-1"><Instagram size={10}/> Instagram</label>
                           {editingProfile ? (
                               <input value={editForm.instagram} onChange={e => setEditForm({...editForm, instagram: e.target.value})} className="bg-white/5 border border-white/10 rounded p-2 text-sm text-white w-full outline-none mt-1" placeholder="@usuario"/>
                           ) : (
                               <p className="text-xs text-white/70 mt-1">{lead.instagram || "-"}</p>
                           )}
                        </div>
                        <div>
                           <label className="text-[10px] uppercase font-bold text-white/30 flex items-center gap-1"><Linkedin size={10}/> LinkedIn</label>
                           {editingProfile ? (
                               <input value={editForm.linkedin} onChange={e => setEditForm({...editForm, linkedin: e.target.value})} className="bg-white/5 border border-white/10 rounded p-2 text-sm text-white w-full outline-none mt-1" placeholder="in/usuario"/>
                           ) : (
                               <p className="text-xs text-white/70 mt-1">{lead.linkedin || "-"}</p>
                           )}
                        </div>
                     </div>
                 </div>

                 {/* Links Uteis */}
                 <div className="pt-4 border-t border-white/5">
                     <p className="text-[10px] uppercase font-bold text-white/30 mb-2 flex items-center gap-1"><LinkIcon size={12}/> Links Uteis (Drive, Docs)</p>
                     <div className="space-y-2">
                         {lead.usefulLinks?.map((link, idx) => (
                             <div key={idx} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                                 <a href={safeUrl(link.url)} target="_blank" className="text-xs text-blue-400 hover:underline truncate max-w-[200px]">{link.title}</a>
                                 <button onClick={() => removeUsefulLink(idx)} className="text-red-400/50 hover:text-red-400"><X size={12}/></button>
                             </div>
                         ))}
                         <div className="flex gap-2 mt-2">
                             <input value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} className="bg-black/30 text-xs text-white p-2 rounded-lg border border-white/10 flex-1 outline-none" placeholder="Titulo (ex: Drive)"/>
                             <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} className="bg-black/30 text-xs text-white p-2 rounded-lg border border-white/10 flex-1 outline-none" placeholder="URL"/>
                             <button onClick={addUsefulLink} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"><Plus size={14}/></button>
                         </div>
                     </div>
                 </div>
              </div>
           </div>

           <div className="bg-[#111] border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
              <SectionTitle title="Captura e Qualificacao" icon={<Target size={18} />} />

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Origem</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">{lead.origem || "-"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Canal</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">{sourceTypeLabel(lead.sourceType)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Pipeline</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">{lead.pipelineStage || "-"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Kanban</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">{lead.kanbanIndex ?? 0}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={cx("rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide", heatBadgeClass(lead.heat))}>
                  Heat: {lead.heat || "-"}
                </span>
                <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/70">
                  Score: {typeof lead.score === "number" ? Math.round(lead.score) : 0} ({qualificationGrade})
                </span>
                <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/70">
                  Source ID: {lead.sourceId || lead.placeId || "-"}
                </span>
              </div>

              {!!lead.reasons?.length && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Motivos de qualificacao</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lead.reasons.slice(0, 8).map((reason) => (
                      <span key={reason} className="rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[10px] text-white/75">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Criado em</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">{toDate(lead.createdAt)?.toLocaleString("pt-BR") || "-"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Atualizado em</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">{toDate(lead.updatedAt)?.toLocaleString("pt-BR") || "-"}</p>
                </div>
              </div>
           </div>

           <div className="bg-[#111] border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
              <SectionTitle title="Ativos Google e Midia" icon={<Map size={18} />} />

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Rating</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">
                    {typeof lead.rating === "number" ? lead.rating.toFixed(1) : "-"} ({lead.userRatingsTotal || 0})
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/40">Ticket aparente</p>
                  <p className="mt-1 text-xs font-semibold text-white/85">
                    {typeof lead.priceLevel === "number" ? "$".repeat(Math.max(1, lead.priceLevel)) : "-"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={cx("rounded-lg border px-2.5 py-1 text-[10px] uppercase tracking-wide", lead.isOpenNow ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100" : "border-red-500/30 bg-red-500/15 text-red-100")}>
                  {lead.isOpenNow ? "Aberto agora" : "Fechado agora"}
                </span>
                <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/70">
                  Lat/Lng: {lead.lat ?? "-"}, {lead.lng ?? "-"}
                </span>
              </div>

              {photoUrls.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {photoUrls.map((photo, index) => (
                    <a
                      key={`${photo}-${index}`}
                      href={photo}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30"
                    >
                      {/* URL externa dinamica de fotos do lead; manter img evita configuracoes excessivas de dominios. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt={`Foto do negocio ${index + 1}`}
                        className="h-28 w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/75">
                        Foto {index + 1}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/60">
                  Sem fotos do Google Places para este lead.
                </p>
              )}
           </div>

           <RevenueLossCard lead={lead} />
        </div>

        {/* COLUNA CENTRAL: CEREBRO & FUNIL (40%) */}
<div className="xl:col-span-5 space-y-6">
  <SmartScriptGenerator lead={lead} onSend={handleWhatsApp} />

  <div className="bg-[#111] border border-white/10 rounded-3xl p-6 shadow-xl">
    <SectionTitle title="Funil & Conversao" icon={<RefreshCcw size={18}/>}  />
    
    <div className="grid grid-cols-4 gap-2 mb-6 bg-black/30 p-2 rounded-xl border border-white/5">
        {["novo", "contatado", "respondido", "qualificado"].map((s) => (
          <button key={s} onClick={() => void setLeadStatus(s as LeadStatus)} className={cx("py-2 rounded-lg text-[10px] font-black uppercase transition tracking-wide text-center", lead.status === s ? STATUS_STYLE[s as LeadStatus] : "text-white/20 hover:text-white hover:bg-white/5")}>
            {STATUS_LABELS[s as LeadStatus]}
          </button>
        ))}
    </div>

    {/* --- SINTONIA FINANCEIRA --- */}
    <FinanceCheckoutModule 
      lead={lead} 
      onSendMessage={handleWhatsApp} // Envia a mensagem formatada para o seu disparador de WhatsApp
      onPaymentSuccess={async () => {
        showToast("ok", "Pagamento aprovado!");
        await setLeadStatus("qualificado");
      }} 
    />
    {/* --------------------------- */}

    <button onClick={convertToClient} disabled={converting} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition shadow-xl shadow-blue-900/20 mb-3 disabled:opacity-50 hover:scale-[1.02] active:scale-95">
      {converting ? <Loader2 className="animate-spin" size={18}/> : <UserPlus size={18} />} CONVERTER EM CLIENTE
    </button>
    
    <button onClick={() => void setLeadStatus("descartado")} className="w-full py-2 text-red-400/40 hover:text-red-400 text-[10px] font-black uppercase transition hover:bg-red-500/5 rounded-lg">DESCARTAR LEAD</button>
  </div>
</div>

        {/* COLUNA DIREITA: DIAGNOSTICO (30%) */}
        <div className="xl:col-span-3 space-y-6">
           <div className="bg-[#111] border border-white/10 rounded-3xl p-6 shadow-xl h-fit">
              <SectionTitle
                title="Pesquisa IA"
                icon={<BrainCircuit size={18} />}
                right={
                  <button
                    onClick={() => void runLeadIntelligence(true)}
                    disabled={runningIntelligence}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-blue-100 disabled:opacity-50"
                  >
                    {runningIntelligence ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
                    Rodar agora
                  </button>
                }
              />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide", intelligenceBadgeClass)}>
                    {intelligenceStatusLabel}
                  </span>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/70">
                    Confianca: {Math.round(Number(lead.intelligence?.confidence || 0))}%
                  </span>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/70">
                    {adMaturityLabel}
                  </span>
                </div>

                <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-white/80">
                  {lead.intelligence?.summary || "Ainda sem pesquisa automatica. Clique em 'Rodar agora' para gerar analise, enriquecimento e proposta inicial."}
                </p>

                {lead.intelligence?.error ? (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                    Erro da pesquisa: {lead.intelligence.error}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Razao social</p>
                    <p className="mt-1 text-xs text-white/85">{lead.intelligence?.legalName || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Dono identificado</p>
                    <p className="mt-1 text-xs text-white/85">{lead.intelligence?.ownerName || "-"}</p>
                  </div>
                </div>

                {!!lead.intelligence?.socialLinks?.length && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Redes detectadas</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lead.intelligence.socialLinks.slice(0, 5).map((link) => (
                        <a
                          key={link}
                          href={safeUrl(link)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[10px] text-blue-300 hover:text-blue-200"
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {!!lead.intelligence?.adSignals?.length && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Sinais de anuncios</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lead.intelligence.adSignals.slice(0, 6).map((signal) => (
                        <span key={signal} className="rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[10px] text-white/75">
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!!lead.intelligence?.sources?.length && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Fontes rastreadas</p>
                    <div className="mt-2 space-y-1">
                      {lead.intelligence.sources.slice(0, 5).map((source) => (
                        <p key={source} className="truncate text-[11px] text-white/70">
                          {source}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {lead.proposalDraft?.firstContactMessage ? (
                  <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">
                        Proposta inicial
                      </p>
                      <button
                        onClick={() => navigator.clipboard.writeText(lead.proposalDraft?.firstContactMessage || "")}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/80 hover:bg-black/40"
                      >
                        <Copy size={11} /> Copiar
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-white">{lead.proposalDraft?.headline || "Plano inicial sugerido"}</p>
                    <p className="text-xs text-white/80">{lead.proposalDraft?.whyNow || ""}</p>
                    <textarea
                      readOnly
                      value={lead.proposalDraft.firstContactMessage}
                      className="h-32 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-white/85 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void applyProposalToCRM()}
                        disabled={applyingProposal}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-[11px] font-bold text-emerald-100 disabled:opacity-50"
                      >
                        {applyingProposal ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        Aplicar no CRM
                      </button>
                      <button
                        onClick={() => void handleWhatsApp(lead.proposalDraft?.firstContactMessage || "")}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-[11px] font-bold text-blue-100"
                      >
                        <MessageCircle size={13} />
                        Enviar no WhatsApp
                      </button>
                    </div>
                    {!!lead.proposalDraft?.suggestedServices?.length && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {lead.proposalDraft.suggestedServices.slice(0, 3).map((service) => (
                          <span key={service} className="rounded-full border border-white/15 bg-black/30 px-2 py-1 text-[10px] text-white/75">
                            {service}
                          </span>
                        ))}
                      </div>
                    )}
                    {!!lead.proposalDraft?.nextSteps?.length && (
                      <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                        <p className="text-[10px] uppercase tracking-widest text-white/45">Proximos passos</p>
                        <ul className="mt-1 space-y-1">
                          {lead.proposalDraft.nextSteps.slice(0, 3).map((step) => (
                            <li key={step} className="text-[11px] text-white/75">
                              - {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
           </div>

           <div className="bg-[#111] border border-white/10 rounded-3xl p-6 shadow-xl h-fit">
              <SectionTitle title="Diagnostico Comercial" icon={<LayoutDashboard size={18}/>} />
              
              <div className="space-y-6">
                 <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                    <label className="text-[10px] text-white/40 uppercase font-black block mb-3 tracking-widest">Estagio de Maturidade</label>
                    <div className="flex flex-wrap gap-2">
                       {STAGES.map(s => (
                          <button key={s.key} onClick={() => setStageDraft(s.key)} className={cx("px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold border transition", stageDraft === s.key ? "bg-white/20 border-white/40 text-white shadow-inner" : "border-white/5 text-white/30 hover:border-white/20 hover:text-white")}>
                            {s.label}
                          </button>
                       ))}
                    </div>
                 </div>

                 {/* OFERTA SUGERIDA */}
                 <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-900/10 to-blue-900/5 p-5 relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-blue-500 opacity-20"><Zap size={48}/></div>
                    <p className="text-[9px] uppercase font-black text-blue-400 tracking-widest mb-2 flex items-center gap-1"><Sparkles size={10}/> Oferta Recomendada</p>
                    <h3 className="text-xl font-bold text-white mb-2 leading-tight">{recommended.title}</h3>
                    <p className="text-xs text-white/60 mb-4 italic leading-relaxed">&quot;{recommended.pitch}&quot;</p>
                    <div className="space-y-2 mb-4">
                       {recommended.deliverables.slice(0,3).map(d => (<div key={d} className="flex items-start gap-2 text-[10px] text-blue-200/80 font-medium"><CheckCircle2 size={12} className="mt-0.5 text-blue-500 shrink-0"/> {d}</div>))}
                    </div>
                    <div className="flex justify-between items-end border-t border-blue-500/10 pt-3">
                       <div><p className="text-[9px] text-white/40 uppercase font-bold">Investimento</p><p className="font-mono text-base text-blue-300 font-bold tracking-tight">{moneyBR(recommended.priceFrom)} - {moneyBR(recommended.priceTo)}</p></div>
                    </div>
                 </div>

                 {/* Notas & Responsavel */}
                 <div className="grid grid-cols-2 gap-3">
                    <div>
                       <label className="text-[10px] text-white/40 uppercase font-black block mb-1 tracking-widest">Dono</label>
                       <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl p-2.5">
                          <User size={14} className="text-white/30"/>
                          <input value={owner} onChange={e => setOwner(e.target.value)} className="bg-transparent w-full text-xs outline-none text-white placeholder:text-white/20 font-medium" placeholder="Responsavel"/>
                       </div>
                    </div>
                    <button onClick={saveCRM} disabled={saving} className="bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition border border-white/10 mt-auto h-[38px] hover:border-white/20">
                      {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} SALVAR
                    </button>
                 </div>
                 <div>
                    <label className="text-[10px] text-white/40 uppercase font-black block mb-1 tracking-widest">Notas de Negociacao</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full h-32 bg-black/30 border border-white/5 rounded-xl p-3 text-xs text-white/80 resize-none outline-none focus:border-blue-500/30 transition" placeholder="Resumo da call, dores citadas..."/>
                 </div>
              </div>
           </div>

           {/* Timeline (Mini) */}
           <div className="mt-6 pt-6 border-t border-white/5 pl-2">
              <p className="text-[10px] text-white/30 uppercase font-black mb-4 flex items-center gap-2 tracking-widest"><Grip size={12}/> Ultimos Eventos</p>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                 {events.length === 0 && <p className="text-xs text-white/20 italic">Nenhum evento registrado.</p>}
                 {events.map(e => (
                    <div key={e.id} className="text-[10px] text-white/50 border-l-2 border-white/10 pl-3 py-1 hover:border-blue-500/50 transition duration-300">
                       <span className="text-white/80 font-bold block">{e.title}</span> 
                       <span className="block mt-0.5 opacity-70 leading-relaxed">{e.detail}</span>
                       <span className="opacity-30 text-[9px] mt-1 block font-mono">{toDate(e.createdAt)?.toLocaleString() || "sem data"}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}

