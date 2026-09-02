"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Settings2,
  Users,
} from "lucide-react";
import { buildCommercialContactUrl } from "@/lib/commercial-contact";

type Action = {
  href: string;
  label: string;
};

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: Action;
  secondaryAction?: Action;
  aside?: ReactNode;
};

type MetricProps = {
  items: ReadonlyArray<{ value: string; label: string }>;
};

type CardGridProps = {
  title: string;
  subtitle: string;
  items: ReadonlyArray<{
    title: string;
    description: string;
    bullets?: readonly string[];
    href?: string;
    eyebrow?: string;
    featured?: boolean;
  }>;
};

type TimelineProps = {
  title: string;
  subtitle: string;
  items: ReadonlyArray<{ title: string; description: string }>;
};

type FaqProps = {
  title: string;
  subtitle: string;
  items: ReadonlyArray<{ question: string; answer: string }>;
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

export function PageHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  aside,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,110,15,0.22),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(168,85,247,0.12),transparent_24%),linear-gradient(180deg,#0b0b0b_0%,#101010_100%)]">
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.55 }}
          className="relative z-10"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#f8a25d]">{eyebrow}</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.04] text-white sm:text-5xl md:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/72 md:text-lg md:leading-8">{description}</p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={primaryAction.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f56e0f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ff7f26] sm:w-auto"
            >
              {primaryAction.label} <ArrowRight className="h-4 w-4" />
            </Link>
            {secondaryAction ? (
              <Link
                href={secondaryAction.href}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:text-white sm:w-auto"
              >
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.55, delay: 0.12 }}
          className="relative z-10"
        >
          {aside}
        </motion.div>
      </div>
    </section>
  );
}

export function MetricStrip({ items }: MetricProps) {
  return (
    <section className="border-b border-white/10 bg-[#061521]">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-6 md:grid-cols-3 lg:px-8">
        {items.map((item, index) => (
          <motion.div
            key={`${item.value}_${index}`}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5"
          >
            <p className="text-2xl font-semibold text-white">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-white/62">{item.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? <p className="text-xs uppercase tracking-[0.28em] text-[#f8a25d]">{eyebrow}</p> : null}
      <h2 className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-white/68 md:text-lg md:leading-8">{subtitle}</p>
    </div>
  );
}

export function CardGrid({ title, subtitle, items }: CardGridProps) {
  return (
    <section className="bg-[#04131f] px-5 py-18 lg:px-8">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mx-auto mt-10 grid w-full max-w-7xl gap-5 lg:grid-cols-3">
        {items.map((item, index) => (
          <motion.article
            key={`${item.title}_${index}`}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className={`rounded-[28px] border px-6 py-6 ${
              item.featured
                ? "border-[#f56e0f]/40 bg-[linear-gradient(180deg,rgba(245,110,15,0.16),rgba(255,255,255,0.04))]"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            {item.eyebrow ? <p className="text-xs uppercase tracking-[0.24em] text-[#f8a25d]">{item.eyebrow}</p> : null}
            <h3 className="mt-4 text-2xl font-semibold text-white">{item.title}</h3>
            <p className="mt-3 text-sm leading-7 text-white/66">{item.description}</p>

            {item.bullets?.length ? (
              <div className="mt-5 space-y-3">
                {item.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3 text-sm leading-6 text-white/74">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f56e0f]" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {item.href ? (
              <Link href={item.href} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:text-[#7dd3fc]">
                Abrir pagina <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export function TimelineSection({ title, subtitle, items }: TimelineProps) {
  return (
    <section className="border-y border-white/10 bg-[#061521] px-5 py-18 lg:px-8">
      <SectionHeader eyebrow="Operacao assistida" title={title} subtitle={subtitle} />
      <div className="mx-auto mt-12 grid w-full max-w-7xl gap-5 lg:grid-cols-4">
        {items.map((item, index) => (
          <motion.article
            key={`${item.title}_${index}`}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.07 }}
            className="rounded-[26px] border border-white/10 bg-white/[0.03] px-5 py-6"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f56e0f]/14 text-sm font-semibold text-[#f8a25d]">
              0{index + 1}
            </div>
            <h3 className="mt-5 text-xl font-semibold text-white">{item.title}</h3>
            <p className="mt-3 text-sm leading-7 text-white/66">{item.description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export function FaqSection({ title, subtitle, items }: FaqProps) {
  return (
    <section className="bg-[#04131f] px-5 py-18 lg:px-8">
      <SectionHeader eyebrow="Perguntas comuns" title={title} subtitle={subtitle} />
      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-4">
        {items.map((item, index) => (
          <motion.details
            key={`${item.question}_${index}`}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5"
          >
            <summary className="cursor-pointer list-none text-lg font-semibold text-white">
              {item.question}
            </summary>
            <p className="mt-4 text-sm leading-7 text-white/68">{item.answer}</p>
          </motion.details>
        ))}
      </div>
    </section>
  );
}

export function CalloutPanel({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  primaryAction: Action;
  secondaryAction?: Action;
}) {
  return (
    <section className="bg-[#061521] px-5 py-18 lg:px-8">
      <div className="mx-auto w-full max-w-6xl rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(249,115,22,0.12),rgba(255,255,255,0.04))] px-6 py-10 md:px-10">
        <p className="text-xs uppercase tracking-[0.28em] text-[#f8a25d]">Proximo passo</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold text-white md:text-4xl">{title}</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/72 md:text-lg md:leading-8">{description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={primaryAction.href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f56e0f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ff7f26] sm:w-auto"
          >
            {primaryAction.label} <ArrowRight className="h-4 w-4" />
          </Link>
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:text-white sm:w-auto"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PlatformStage() {
  const primaryCards = [
    { label: "Conversas abertas", value: "11", icon: MessageSquare },
    { label: "Oportunidades", value: "34", icon: Users },
    { label: "Agenda de hoje", value: "7", icon: CalendarDays },
    { label: "Campanhas ativas", value: "4", icon: Megaphone },
  ];

  const rails = [
    { icon: LayoutGrid, label: "Inicio" },
    { icon: MessageSquare, label: "Conversas" },
    { icon: Users, label: "Clientes & Oportunidades" },
    { icon: CalendarDays, label: "Agenda" },
    { icon: Megaphone, label: "Campanhas" },
    { icon: Bot, label: "Assistente Altum" },
  ];

  return (
    <div className="rounded-[34px] border border-white/10 bg-[#111111]/95 p-4 shadow-[0_40px_120px_-48px_rgba(245,110,15,0.32)]">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-white/40">Operacao diaria</p>
          <div className="mt-5 space-y-2">
            {rails.map((item) => (
              <div key={item.label} className={`flex items-center gap-3 rounded-[16px] px-3 py-3 ${item.label === "Conversas" ? "bg-[#f97316]/12 text-white" : "text-white/70"}`}>
                <item.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(255,255,255,0.04))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#f8a25d]">Resumo da operacao</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">A equipe entra e entende o que precisa fazer em minutos.</h3>
              </div>
              <div className="rounded-full border border-[#f56e0f]/20 bg-[#f56e0f]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f8a25d]">
                Fluxo com IA
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {primaryCards.map((item) => (
              <div key={item.label} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <item.icon className="h-4 w-4 text-[#f8a25d]" />
                <p className="mt-4 text-3xl font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-sm text-white/62">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white">Prioridades sugeridas</p>
              <div className="mt-4 space-y-3 text-sm text-white/72">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f56e0f]" />
                  <span>Responder as 3 conversas com sinal de proposta e sem retorno nas ultimas 2 horas.</span>
                </div>
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f8a25d]" />
                  <span>Revisar regra de handoff da IA para conversas com pedido de valor final.</span>
                </div>
                <div className="flex items-start gap-3">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#f8a25d]" />
                  <span>Alertar sobre proximo vencimento e manter o admin no controle de acesso.</span>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white">Operacao Altum</p>
              <div className="mt-4 space-y-4 text-sm text-white/68">
                <div className="rounded-[16px] border border-white/10 bg-black/20 p-4">
                  Conversas, CRM, agenda e campanhas falam a mesma lingua.
                </div>
                <div className="rounded-[16px] border border-white/10 bg-black/20 p-4">
                  A IA sugere proximos passos sem jogar o usuario numa tela tecnica.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CaseGallery({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ReadonlyArray<{ title: string; image: string; description: string }>;
}) {
  return (
    <section className="border-y border-white/10 bg-[#061521] px-5 py-18 lg:px-8">
      <SectionHeader eyebrow="Prova visual" title={title} subtitle={subtitle} />
      <div className="mx-auto mt-10 grid w-full max-w-7xl gap-5 lg:grid-cols-3">
        {items.map((item, index) => (
          <motion.article
            key={`${item.title}_${index}`}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]"
          >
            <div className="relative aspect-[16/11]">
              <Image src={item.image} alt={item.title} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
            </div>
            <div className="p-5">
              <h3 className="text-2xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/66">{item.description}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export function ContactRouteCards() {
  const cards = [
    {
      title: "Quero a plataforma",
      description: "Para quem ja tem operacao e quer contratar o SaaS com clareza de plano e setup.",
      href: buildCommercialContactUrl("plataforma", "/contato"),
    },
    {
      title: "Quero passar pelo quiz",
      description: "Para quem quer entender qual caminho faz mais sentido antes de fechar.",
      href: "/diagnostico",
    },
    {
      title: "Quero proposta mais completa",
      description: "Para quem precisa unir agencia, captacao, WhatsApp, plataforma e implantacao.",
      href: buildCommercialContactUrl("estrutura_digital", "/contato"),
    },
    {
      title: "Quero ir para o WhatsApp",
      description: "Para quem quer chegar no WhatsApp com o contexto certo ja salvo no CRM.",
      href: "/diagnostico?entry=route_card_whatsapp",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((item) => (
        <div key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-xl font-semibold text-white">{item.title}</h3>
          <p className="mt-3 text-sm leading-7 text-white/66">{item.description}</p>
          <Link href={item.href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#7dd3fc] hover:text-white">
            Seguir por aqui <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
