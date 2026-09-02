"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  MessageCircleMore,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";

const views = [
  {
    id: "operacao",
    label: "Visão da operação",
    icon: BarChart3,
    eyebrow: "Comece o dia sabendo onde agir",
    title: "A operação inteira responde em uma única tela.",
    description:
      "Conversas, agenda, pipeline, campanhas e alertas de IA deixam de competir por atenção. A Altum organiza o que importa agora.",
    image: "/images/platform/marketing/platform-dashboard.png",
    alt: "Painel da operação comercial na Altum",
    stats: [
      ["Prioridade", "3 conversas quentes"],
      ["Pipeline", "46 oportunidades"],
      ["Agenda", "17 ações hoje"],
    ],
    insight: "A IA identificou propostas sem retorno e sugere agir primeiro nas oportunidades com maior intenção.",
  },
  {
    id: "conversas",
    label: "Conversas",
    icon: MessageCircleMore,
    eyebrow: "Atendimento conectado à venda",
    title: "Quem responde já sabe quem é o cliente e o que precisa acontecer.",
    description:
      "O histórico comercial vive ao lado da conversa. A equipe atende, cria oportunidade, agenda retorno e envia proposta sem reconstruir o contexto.",
    image: "/images/platform/marketing/platform-conversations.png",
    alt: "Inbox unificada e contexto comercial da Altum",
    stats: [
      ["Canais", "WhatsApp + Instagram"],
      ["Contexto", "Cliente e oportunidade"],
      ["Controle", "IA + humano"],
    ],
    insight: "A Altum resume a conversa, identifica intenção e chama uma pessoa com todo o contexto quando necessário.",
  },
  {
    id: "crm",
    label: "CRM e receita",
    icon: Target,
    eyebrow: "Da mensagem ao fechamento",
    title: "O funil se atualiza enquanto a venda acontece.",
    description:
      "Etapa, valor, responsável, proposta, tarefas e próxima ação deixam de ser controles separados e passam a refletir a operação real.",
    image: "/images/platform/marketing/platform-crm-pipeline.png",
    alt: "CRM e pipeline de receita da Altum",
    stats: [
      ["Funil", "Etapa e responsável"],
      ["Venda", "Proposta e financeiro"],
      ["Ritmo", "Follow-up automático"],
    ],
    insight: "O gestor enxerga onde o dinheiro está parado e qual ação tem mais chance de gerar avanço.",
  },
  {
    id: "assistente",
    label: "Inteligência",
    icon: Bot,
    eyebrow: "Pergunte à sua própria operação",
    title: "A IA não responde só clientes. Ela responde o gestor.",
    description:
      "Pergunte sobre campanhas, conversas, oportunidades, receita e risco. O Assistente Altum lê os dados da conta e devolve uma decisão prática.",
    image: "/images/platform/marketing/platform-ai-assistant.png",
    alt: "Assistente Altum analisando dados comerciais",
    stats: [
      ["Leitura", "Dados da operação"],
      ["Resposta", "Direta e contextual"],
      ["Saída", "Próxima melhor ação"],
    ],
    insight: "Pergunta: onde estamos perdendo vendas? Resposta: o gargalo está entre proposta enviada e primeiro retorno.",
  },
] as const;

type ViewId = (typeof views)[number]["id"];

export function AltumLiveDemo() {
  const [activeId, setActiveId] = useState<ViewId>("operacao");
  const active = views.find((view) => view.id === activeId) ?? views[0];

  return (
    <section className="border-b border-white/8 bg-[#050505] px-5 py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">
              Produto ao vivo
            </p>
            <h2 className="mt-5 max-w-[11ch] text-[clamp(2.9rem,5.8vw,5.8rem)] font-extrabold leading-[0.93] tracking-[-0.065em] text-white">
              Veja a Altum trabalhar como um sistema.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-white/50 lg:justify-self-end">
            Não é uma coleção de módulos. É um fluxo contínuo em que cada conversa alimenta o CRM, cada ação alimenta a gestão e a IA enxerga o todo.
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a] shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
          <div className="grid xl:grid-cols-[260px_1fr]">
            <aside className="border-b border-white/8 p-3 xl:border-b-0 xl:border-r">
              <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible">
                {views.map((view) => {
                  const Icon = view.icon;
                  const selected = view.id === active.id;
                  return (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setActiveId(view.id)}
                      aria-pressed={selected}
                      className={`flex min-w-48 items-center gap-3 rounded-xl border px-4 py-4 text-left transition xl:w-full ${
                        selected
                          ? "border-[#e85002]/35 bg-[#e85002]/12 text-white"
                          : "border-transparent text-white/42 hover:border-white/8 hover:bg-white/[0.025] hover:text-white"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${selected ? "text-[#ff6a1f]" : ""}`} />
                      <span className="text-sm font-bold">{view.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 hidden rounded-xl border border-white/8 bg-white/[0.025] p-4 xl:block">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/30">
                  <Sparkles className="h-3.5 w-3.5 text-[#ff6a1f]" /> Operação conectada
                </div>
                <div className="mt-4 space-y-3 text-xs font-semibold text-white/45">
                  <div className="flex items-center gap-2"><UsersRound className="h-3.5 w-3.5" /> Atendimento</div>
                  <div className="flex items-center gap-2"><CircleDollarSign className="h-3.5 w-3.5" /> Comercial</div>
                  <div className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" /> Agenda</div>
                </div>
              </div>
            </aside>

            <div className="min-w-0 p-4 md:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24 }}
                  className="grid gap-6 2xl:grid-cols-[0.72fr_1.28fr] 2xl:items-center"
                >
                  <div className="2xl:py-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ff6a1f]">{active.eyebrow}</p>
                    <h3 className="mt-4 max-w-[12ch] text-[clamp(2rem,4vw,3.65rem)] font-extrabold leading-[0.98] tracking-[-0.055em] text-white">{active.title}</h3>
                    <p className="mt-5 max-w-xl text-base leading-7 text-white/48">{active.description}</p>

                    <div className="mt-6 grid gap-2 sm:grid-cols-3 2xl:grid-cols-1">
                      {active.stats.map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/26">{label}</p>
                          <p className="mt-1 text-sm font-bold text-white/74">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-xl border border-[#e85002]/20 bg-[#e85002]/8 p-4">
                      <div className="flex items-start gap-3">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#ff6a1f]" />
                        <p className="text-sm leading-6 text-white/62">{active.insight}</p>
                      </div>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black p-2.5">
                    <div className="absolute inset-x-10 top-0 h-28 bg-[#e85002]/14 blur-[70px]" />
                    <Image
                      src={active.image}
                      alt={active.alt}
                      width={1586}
                      height={992}
                      sizes="(min-width: 1536px) 56vw, 94vw"
                      className="relative h-auto w-full rounded-[1rem]"
                    />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-5 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#e85002]" />
            <p className="max-w-3xl text-sm leading-6 text-white/52">
              Esta demonstração usa telas reais da plataforma. Recursos e integrações podem variar por plano e configuração da operação.
            </p>
          </div>
          <Link href="/plataforma" className="inline-flex shrink-0 items-center gap-2 text-sm font-extrabold text-white hover:text-[#ff6a1f]">
            Explorar o produto <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
