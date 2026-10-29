import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  MessageCircleMore,
  Route,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Chatbot WhatsApp com IA para Vendas e Atendimento",
  description:
    "Chatbot para WhatsApp com IA, contexto comercial, qualificação e handoff humano. Entenda como funciona e veja como a ALTUM conecta conversa, CRM e vendas.",
  path: "/chatbot-whatsapp",
});

const faqs = [
  {
    question: "O que é um chatbot para WhatsApp?",
    answer:
      "Um chatbot para WhatsApp é um assistente automatizado que recebe e responde mensagens no canal. Ele pode seguir regras predefinidas ou usar inteligência artificial para entender contexto, responder dúvidas, fazer triagem, coletar informações e encaminhar a conversa para uma pessoa quando necessário.",
  },
  {
    question: "Como ter um chatbot no WhatsApp da empresa?",
    answer:
      "A empresa precisa conectar o WhatsApp a uma plataforma compatível, definir objetivos, conhecimento, regras de atendimento e momentos de transferência para humanos. Na ALTUM, o chatbot pode trabalhar conectado ao CRM, pipeline, qualificação e histórico comercial.",
  },
  {
    question: "Chatbot para WhatsApp pode vender?",
    answer:
      "Sim. Um chatbot pode responder dúvidas, identificar interesse, coletar informações, qualificar oportunidades e encaminhar o lead para o vendedor com contexto. O resultado depende do processo comercial, da qualidade das informações e das regras definidas para a operação.",
  },
  {
    question: "Qual a diferença entre chatbot tradicional e chatbot com IA?",
    answer:
      "O chatbot tradicional costuma seguir menus, palavras-chave e fluxos fixos. Um chatbot com IA consegue interpretar linguagem mais livre e contexto. Mesmo com IA, é importante definir limites, base de conhecimento e critérios claros para escalar a conversa para uma pessoa.",
  },
  {
    question: "Quanto custa um chatbot para WhatsApp?",
    answer:
      "O custo varia conforme provedor do WhatsApp, volume de conversas, recursos de IA, número de atendentes e nível de automação. A implantação também pode variar conforme integrações, CRM, base de conhecimento e complexidade do processo comercial.",
  },
  {
    question: "O chatbot substitui o vendedor ou atendente?",
    answer:
      "Não precisa substituir. Na ALTUM, a automação pode cuidar de etapas repetitivas, triagem e organização de contexto, enquanto pessoas assumem quando existe negociação, exceção ou momento comercial que exige intervenção humana.",
  },
];

const capabilities = [
  [
    MessageCircleMore,
    "Resposta imediata",
    "O contato recebe uma primeira resposta mesmo fora do horário ou quando a equipe está ocupada.",
  ],
  [
    Sparkles,
    "IA com contexto",
    "A conversa pode usar informações da empresa e do histórico para produzir respostas mais úteis.",
  ],
  [
    Bot,
    "Qualificação",
    "O assistente pode identificar intenção, coletar dados importantes e preparar a oportunidade para o comercial.",
  ],
  [
    UserRoundCheck,
    "Handoff humano",
    "Quando a conversa exige negociação ou decisão, uma pessoa assume sem perder o histórico.",
  ],
  [
    Route,
    "CRM e pipeline",
    "A conversa pode continuar como oportunidade, tarefa e próxima ação dentro do processo comercial.",
  ],
  [
    ShieldCheck,
    "Regras e limites",
    "A operação define conhecimento, guardrails, escalonamento e nível de autonomia da IA.",
  ],
] as const;

export default function ChatbotWhatsappPage() {
  const faqSchema = buildFaqSchema(faqs);

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#292a2d]">
            Chatbot WhatsApp com IA
          </p>
          <h1 className="mt-6 max-w-[19ch] text-[clamp(2.7rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-[#292a2d]">
            Automatize o WhatsApp sem transformar seu atendimento em uma
            conversa robótica.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
            A ALTUM conecta chatbot, inteligência artificial, CRM e equipe
            humana para responder, qualificar e fazer a oportunidade continuar
            depois da primeira mensagem.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contato?interest=demonstracao"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#292a2d] px-6 py-3.5 text-sm font-semibold text-white"
            >
              Ver em ação <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/crm-para-whatsapp"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-6 py-3.5 text-sm font-semibold text-slate-600"
            >
              Conhecer CRM para WhatsApp
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#f4f8fc] px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap gap-3 text-sm text-slate-600">
          {[
            "WhatsApp",
            "IA",
            "Triagem",
            "Qualificação",
            "CRM",
            "Handoff humano",
          ].map((item) => (
            <span
              key={item}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <Check className="h-3.5 w-3.5 text-[#292a2d]" />
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[980px] rounded-[1.6rem] border border-slate-200 bg-white p-7 md:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#292a2d]">
            Resposta rápida
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#292a2d] md:text-4xl">
            O que é um chatbot para WhatsApp?
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Um chatbot para WhatsApp é um assistente automatizado que recebe e
            responde mensagens no canal. Ele pode seguir regras ou usar
            inteligência artificial para interpretar contexto, tirar dúvidas,
            fazer triagem, coletar informações e encaminhar a conversa para uma
            pessoa quando necessário.
          </p>
          <p className="mt-5 text-sm leading-7 text-slate-600">
            Em uma operação comercial, o valor aumenta quando essa conversa
            também alimenta CRM, pipeline, tarefas e próxima ação — em vez de
            terminar dentro do próprio WhatsApp.
          </p>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#292a2d]">
              Além de respostas automáticas
            </p>
            <h2 className="mt-5 text-[clamp(2.6rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-[#292a2d]">
              O chatbot é mais útil quando faz o comercial avançar.
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              A ALTUM combina automação e IA com contexto comercial,
              conhecimento da empresa e transferência humana para reduzir
              tarefas repetitivas sem perder a oportunidade.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {capabilities.map(([Icon, title, text]) => (
              <article
                key={title}
                className="rounded-[1.3rem] border border-slate-200 bg-white p-6"
              >
                <Icon className="h-5 w-5 text-[#292a2d]" />
                <h3 className="mt-5 text-xl font-semibold text-[#292a2d]">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#e9f0f7] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#292a2d]">
              Como funciona na operação
            </p>
            <h2 className="mt-5 text-[clamp(2.7rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.04em]">
              Uma conversa entra. O processo comercial continua.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              O objetivo não é criar um robô isolado. É usar a conversa como
              entrada para qualificação, CRM, responsável, pipeline e próxima
              ação.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(20,20,20,0.08)]">
            <div className="space-y-3">
              {[
                "Cliente inicia a conversa no WhatsApp",
                "Chatbot ou IA entende a intenção",
                "Informações relevantes são coletadas",
                "Lead pode ser qualificado e ligado ao CRM",
                "Pessoa assume quando necessário",
                "Pipeline e follow-up mantêm a oportunidade ativa",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-4 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <span className="text-xs font-bold text-[#292a2d]">
                    0{index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[980px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#292a2d]">
            Perguntas frequentes
          </p>
          <h2 className="mt-5 text-[clamp(2.5rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-[#292a2d]">
            Respostas para quem está avaliando chatbot no WhatsApp.
          </h2>
          <div className="mt-10 space-y-3">
            {faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <h3 className="text-lg font-semibold text-[#292a2d]">
                  {faq.question}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-slate-200 bg-[#f4f8fc] p-8 md:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#292a2d]">
            WhatsApp + IA + operação
          </p>
          <h2 className="mt-5 max-w-[19ch] text-[clamp(2.6rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-[#292a2d]">
            Veja como a ALTUM transforma atendimento automático em continuidade
            comercial.
          </h2>
          <div className="mt-7 flex flex-wrap gap-5 text-sm font-semibold">
            <Link href="/crm-para-whatsapp" className="text-[#292a2d]">
              CRM para WhatsApp
            </Link>
            <Link
              href="/qualificacao-de-leads-com-ia"
              className="text-[#292a2d]"
            >
              Qualificação com IA
            </Link>
            <Link href="/inbox" className="text-[#292a2d]">
              Inbox
            </Link>
          </div>
          <Link
            href="/contato?interest=demonstracao"
            className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#292a2d] px-6 py-3.5 text-sm font-semibold text-white"
          >
            Agendar demonstração <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={toJsonLdScript(faqSchema)}
      />
    </SiteShell>
  );
}
