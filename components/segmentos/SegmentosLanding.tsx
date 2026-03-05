"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Filter,
  Layers,
  LineChart,
  MessageSquareDashed,
  Rocket,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { verticals } from "@/lib/verticals";

type SegmentosLandingProps = {
  title: string;
  subtitle: string;
  sourceLabel: string;
};

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0 },
};

const problemItems = [
  {
    icon: TriangleAlert,
    title: "Leads sem perfil",
    text: "Volume alto de contatos sem aderencia comercial, ocupando agenda e reduzindo foco do time.",
  },
  {
    icon: Clock3,
    title: "Resposta lenta",
    text: "Sem triagem automatica, o primeiro atendimento atrasa e oportunidades quentes esfriam no processo.",
  },
  {
    icon: MessageSquareDashed,
    title: "Follow-up inconsistente",
    text: "Cada vendedor executa cadencia diferente, gerando variacao de resultado e perda de previsibilidade.",
  },
];

const solutionItems = [
  {
    icon: Filter,
    title: "Qualificacao orientada por criterio",
    text: "Regras claras para separar contatos com potencial real de compra dos curiosos.",
  },
  {
    icon: Layers,
    title: "Funil com etapas objetivas",
    text: "Processo comercial padronizado com metas e gatilhos de avanço por fase.",
  },
  {
    icon: LineChart,
    title: "Gestao por indicadores",
    text: "Monitoramento de custo por oportunidade, conversao e tempo de resposta para ajuste continuo.",
  },
];

const howItWorks = [
  { title: "Diagnostico", text: "Mapeamos gargalos de captura, triagem e fechamento da operacao." },
  { title: "Arquitetura", text: "Definimos mensagens, fluxos e pontos de handoff para o comercial." },
  { title: "Ativacao", text: "Publicamos campanhas, paginas e automacoes com controle de qualidade." },
  { title: "Escala", text: "Otimizamos por etapa com base em dados para manter previsibilidade." },
];

const faqs = [
  {
    q: "Esse modelo serve para times pequenos?",
    a: "Sim. A estrutura comeca enxuta e evolui conforme a operacao ganha volume e maturidade.",
  },
  {
    q: "Quando comeco a ver resultado?",
    a: "Normalmente em poucas semanas ja existe sinal de melhoria em tempo de resposta e taxa de lead qualificado.",
  },
  {
    q: "Preciso trocar todo o processo atual?",
    a: "Nao. A abordagem prioriza ganhos incrementais sem quebrar o que ja funciona no comercial.",
  },
];

const cardIconByIndex = [Building2, Sparkles, Rocket, ShieldCheck, BadgeCheck];

export default function SegmentosLanding({ title, subtitle, sourceLabel }: SegmentosLandingProps) {
  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <section className="relative overflow-hidden px-6 pb-20 pt-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(245,110,15,0.22),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.06),transparent_35%)]" />
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto w-full max-w-6xl"
        >
          <p className="mb-4 text-sm uppercase tracking-[0.14em] text-[#F56E0F]">{sourceLabel}</p>
          <h1 className="mb-5 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">{title}</h1>
          <p className="mb-8 max-w-3xl text-lg leading-8 text-white/75">{subtitle}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/solucoes/imobiliarias" className="rounded-full bg-[#F56E0F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#ff8e44]">
              Ver exemplos por vertical
            </Link>
            <Link href="/blog" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/90 hover:border-white">
              Explorar blog
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">Problemas que travam crescimento</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {problemItems.map((item, index) => (
              <motion.article
                key={item.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <item.icon className="mb-4 text-[#F56E0F]" size={24} />
                <h3 className="mb-2 text-xl font-semibold">{item.title}</h3>
                <p className="text-white/75">{item.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">Solucao em camadas</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {solutionItems.map((item, index) => (
              <motion.article
                key={item.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <item.icon className="mb-4 text-[#F56E0F]" size={24} />
                <h3 className="mb-2 text-xl font-semibold">{item.title}</h3>
                <p className="text-white/75">{item.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">Como funciona</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {howItWorks.map((step, index) => (
              <motion.div
                key={step.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#F56E0F]">Etapa {index + 1}</p>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-white/75">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">Casos e beneficios</h2>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45 }}
            className="mb-8 rounded-2xl border border-[#F56E0F]/35 bg-[#F56E0F]/10 p-6"
          >
            <p className="text-lg font-semibold text-white">Resultados tipicos: -30% tempo resposta, +20% leads qualificados</p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {verticals.slice(0, 6).map((vertical, index) => {
              const Icon = cardIconByIndex[index % cardIconByIndex.length];
              return (
                <motion.article
                  key={vertical.slug}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.45, delay: index * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <Icon className="mb-3 text-[#F56E0F]" size={20} />
                  <h3 className="mb-2 text-lg font-semibold">{vertical.name}</h3>
                  <p className="mb-4 text-sm text-white/75">{vertical.description}</p>
                  <Link href={`/solucoes/${vertical.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#F56E0F] hover:text-[#ff8e44]">
                    Ver detalhes <ArrowRight size={14} />
                  </Link>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">FAQ</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {faqs.map((faq, index) => (
              <motion.article
                key={faq.q}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <h3 className="mb-2 text-lg font-semibold">{faq.q}</h3>
                <p className="text-sm text-white/75">{faq.a}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 pt-10">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45 }}
          className="mx-auto w-full max-w-6xl rounded-3xl border border-[#F56E0F]/35 bg-[#F56E0F]/10 p-8 md:p-10"
        >
          <h2 className="mb-3 text-3xl font-bold">Pronto para acelerar sua operacao comercial?</h2>
          <p className="mb-6 max-w-3xl text-white/85">
            Estruturamos um plano simples para captacao, qualificacao e acompanhamento de vendas com foco em crescimento previsivel.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="rounded-full bg-[#F56E0F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#ff8e44]">
              Solicitar diagnostico
            </Link>
            <Link href="/blog" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/90 hover:border-white">
              Ler conteudo tecnico
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
