"use client";

import Image from "next/image";
import React, { useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Leaf,
  Heart,
  Flame,
  Droplets,
  Brain,
  Sparkles,
  ShieldCheck,
  Star,
  CheckCircle2,
  BadgeCheck,
} from "lucide-react";
import type { Variants } from "framer-motion";
/**
 * Vitta Prime — LP de Emagrecimento (CASE)
 * Página única para /app/cases/vitta.tsx (Next.js App Router)
 * Tecnologias: React + Tailwind + Framer Motion + Lucide
 * Visual: tema claro premium (branco, verde, dourado sutil)
 * Observação: totalmente autocontida (sem dependência de componentes externos)
 */

/* ===================== Utilidades de Animação ===================== */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

function useParallax(ref: React.RefObject<HTMLElement>, distance = 80) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return y;
}

/* ===================== Componentes ===================== */
const Container: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = "", children }) => (
  <div className={`mx-auto w-full max-w-7xl px-6 ${className}`}>{children}</div>
);

const Pill: React.FC<React.PropsWithChildren<{ icon?: React.ReactNode; className?: string }>> = ({ icon, className = "", children }) => (
  <span className={`inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50/60 px-4 py-2 text-sm text-emerald-700 ${className}`}>
    {icon}
    {children}
  </span>
);

type PrimaryButtonProps = {
  className?: string;
  children: React.ReactNode;
};

const PrimaryButton: React.FC<PrimaryButtonProps> = ({ className = "", children }) => (
  <motion.button
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.98 }}
    className={`group relative inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-medium text-white shadow-lg shadow-emerald-600/20 ${className}`}
  >
    {children}
    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
  </motion.button>
);

const CheckItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-3 text-gray-700">
    <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
    <span>{children}</span>
  </li>
);

/* ===================== Página ===================== */
export default function VittaCasePage() {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const yParallax = useParallax(heroRef as React.RefObject<HTMLElement>, 60);


  const benefits = useMemo(
    () => [
      { icon: <Flame className="h-7 w-7 text-emerald-600" />, title: "Queima de gordura natural", text: "Ative o metabolismo com compostos termogênicos seguros." },
      { icon: <Heart className="h-7 w-7 text-emerald-600" />, title: "Energia e disposição", text: "Recupere a vitalidade e produtividade do seu dia." },
      { icon: <Droplets className="h-7 w-7 text-emerald-600" />, title: "Menos inchaço", text: "Apoio à digestão e redução de retenção hídrica." },
      { icon: <Brain className="h-7 w-7 text-emerald-600" />, title: "Foco e clareza", text: "Equilíbrio corpo-mente para performance mental." },
      { icon: <Sparkles className="h-7 w-7 text-emerald-600" />, title: "Sono reparador", text: "Recuperação noturna que acelera resultados." },
      { icon: <Leaf className="h-7 w-7 text-emerald-600" />, title: "100% natural", text: "Sem glúten, sem lactose, sem aditivos artificiais." },
    ],
    []
  );

  const faqs = useMemo(
    () => [
      { q: "Em quanto tempo vejo resultados?", a: "Geralmente entre 10 e 20 dias, variando de pessoa para pessoa." },
      { q: "O produto é natural?", a: "Sim. A composição foca ingredientes de origem natural com estudos de eficácia." },
      { q: "Posso usar com outros suplementos?", a: "Pode, mas recomendamos acompanhamento profissional para necessidades específicas." },
      { q: "Existe garantia?", a: "Este case demonstra uma oferta com garantia de 30 dias — modelo replicável." },
    ],
    []
  );

  const testimonials = useMemo(
    () => [
      { name: "Camila S.", text: "Em 3 semanas, minha energia mudou. Voltei a me sentir viva.", stars: 5 },
      { name: "Juliana R.", text: "Perdi 6kg sem radicalizar a dieta. Confiança voltou.", stars: 4 },
      { name: "Fernanda L.", text: "Sono melhor, pele melhor — experiência surreal.", stars: 5 },
      { name: "Paula D.", text: "Rotina simples e resultados consistentes.", stars: 5 },
    ],
    []
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-emerald-50 text-gray-800 [--ring:theme(colors.emerald.500)]">
      {/* ========================= HERO ========================= */}
      <section ref={heroRef} className="relative overflow-hidden">
        {/* Fundo visual */}
        <motion.div style={{ y: yParallax }} className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-emerald-200 blur-3xl opacity-60" />
          <div className="absolute -right-24 top-32 h-[28rem] w-[28rem] rounded-full bg-yellow-200 blur-3xl opacity-50" />
          <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(16,185,129,0.08),transparent)]" />
        </motion.div>

        <Container className="flex min-h-[86vh] flex-col items-center justify-center py-28 text-center">
          <Pill icon={<BadgeCheck className="h-4 w-4" />}>Case fictício — Saúde & Bem-estar</Pill>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-6 max-w-4xl text-balance text-5xl font-bold leading-tight md:text-6xl"
          >
            Transforme seu corpo e sua energia em <span className="text-emerald-600">30 dias</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.15 }}
            className="mt-6 max-w-2xl text-pretty text-lg text-gray-600 md:text-xl"
          >
            Vitta Prime une ciência e naturalidade para resultados reais — um exemplo de LP de alta conversão para o seu portfólio.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <PrimaryButton>Quero Começar Agora</PrimaryButton>
            <button className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-6 py-3 font-medium text-emerald-700 hover:bg-emerald-50">Ver Como Funciona</button>
          </motion.div>

          {/* Mock visual do produto */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.35 }}
            className="relative mt-16 w-full max-w-4xl overflow-hidden rounded-3xl shadow-xl ring-1 ring-emerald-100"
          >
            <Image
              alt="hero"
              className="h-[420px] w-full object-cover"
              src="https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=1600&auto=format&fit=crop"
              width={1600}
              height={900}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-6 text-left text-white">
              <p className="text-sm opacity-90">Plano nutricional + acompanhamento</p>
              <p className="text-lg font-semibold">Resultados que você sente e vê</p>
            </div>
          </motion.div>
        </Container>
      </section>

      {/* ========================= BENEFÍCIOS ========================= */}
      <section className="py-24">
        <Container>
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="text-4xl font-bold text-emerald-700"
          >
            Benefícios comprovados
          </motion.h2>
          <p className="mt-3 max-w-2xl text-gray-600">
            Uma proposta clara de valor: saúde real, rotina simples e sustentabilidade a longo prazo.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.4 }}
                className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-white p-7 shadow-sm transition hover:shadow-xl"
              >
                <div className="mb-4 inline-flex rounded-xl bg-emerald-50 p-3">{b.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900">{b.title}</h3>
                <p className="mt-2 text-gray-600">{b.text}</p>
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-100 opacity-0 blur-2xl transition group-hover:opacity-100" />
              </motion.div>
            ))}
          </div>

          <ul className="mt-10 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
            <CheckItem>Metodologia sustentável — sem dietas radicais</CheckItem>
            <CheckItem>Rotina em 3 passos com acompanhamento</CheckItem>
            <CheckItem>Copy orientada a conversão com CTA visível</CheckItem>
            <CheckItem>Design leve, performance e SEO friendly</CheckItem>
          </ul>
        </Container>
      </section>

      {/* ========================= CIÊNCIA ========================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-700 to-emerald-800 py-24 text-white">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        </div>
        <Container>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
              <ShieldCheck className="h-4 w-4" /> Baseado na ciência
            </div>
            <h2 className="mt-5 text-4xl font-bold">Atuação em múltiplas camadas</h2>
            <p className="mt-4 text-white/90">
              Vitta Prime combina maca, moringa, gengibre e spirulina — ingredientes investigados por sua ação no metabolismo e
              equilíbrio hormonal. A proposta: mais energia, queima inteligente e bem‑estar perceptível.
            </p>
          </motion.div>

          {/* Grid "molecular" */}
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { title: "Metabolismo", text: "Termogênese natural e oxidação de gordura." },
              { title: "Equilíbrio", text: "Resposta hormonal e controle de apetite." },
              { title: "Bem‑estar", text: "Sono, foco e humor mais estáveis." },
            ].map((c, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.4 }}
                className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10"
              >
                <h3 className="text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-white/80">{c.text}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* ========================= DEPOIMENTOS (carrossel arrastável) ========================= */}
      <section className="py-24">
        <Container>
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="text-4xl font-bold text-emerald-700"
          >
            Resultados reais
          </motion.h2>
          <p className="mt-3 max-w-2xl text-gray-600">Prova social com carrossel arrastável no toque/mouse.</p>

          <div className="mt-10 overflow-x-hidden">
            <motion.div drag="x" dragConstraints={{ left: -600, right: 0 }} className="flex gap-6">
              {testimonials.map((t, i) => (
                <div key={i} className="min-w-[320px] flex-1 rounded-2xl border border-emerald-100 bg-white p-7 shadow-sm">
                  <div className="mb-3 flex gap-1">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="italic text-gray-700">“{t.text}”</p>
                  <p className="mt-3 font-semibold text-emerald-700">{t.name}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </Container>
      </section>

      {/* ========================= COMO FUNCIONA ========================= */}
      <section className="bg-emerald-50 py-24">
        <Container>
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="text-4xl font-bold text-emerald-700"
          >
            Como funciona
          </motion.h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { step: "1", title: "Inicie", text: "Receba seu plano simples e personalizado." },
              { step: "2", title: "Transforme", text: "Sinta mudanças nas primeiras semanas." },
              { step: "3", title: "Mantenha", text: "Acompanhe e prolongue resultados." },
            ].map((s, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.4 }}
                className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-emerald-100"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">{s.step}</div>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-gray-600">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* ========================= OFERTA ========================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-yellow-400 to-yellow-500 py-24 text-center text-white">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(600px_300px_at_50%_0%,rgba(255,255,255,0.25),transparent)]" />
        <Container>
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="text-4xl font-bold"
          >
            30% OFF + Garantia de 30 dias
          </motion.h2>
          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            className="mx-auto mt-3 max-w-xl text-lg"
          >
            Experimente sem riscos. Se não sentir resultados, devolvemos seu investimento.
          </motion.p>
          <PrimaryButton className="mt-10 bg-white text-yellow-700 hover:bg-yellow-50">Garantir meu desconto</PrimaryButton>
        </Container>
      </section>

      {/* ========================= FAQ ========================= */}
      <section className="py-24">
        <Container>
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="text-4xl font-bold text-emerald-700"
          >
            Perguntas frequentes
          </motion.h2>
          <div className="mt-10 divide-y rounded-2xl border border-emerald-100 bg-white">
            {faqs.map((f, i) => (
              <details key={i} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="text-lg font-medium text-gray-900">{f.q}</span>
                  <span className="ml-6 inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* ========================= FOOTER ========================= */}
      <footer className="bg-emerald-900 py-10 text-center text-white">
        <Container>
          <p className="font-medium">© 2025 Vitta Prime — Case fictício para demonstração.</p>
          <p className="mt-2 text-sm text-white/80">Design, animações e copy otimizadas para conversão.</p>
        </Container>
      </footer>
    </main>
  );
}
