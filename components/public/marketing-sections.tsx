"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  PublicHero,
  PublicSectionHeading,
  PublicFaq,
} from "./shared/public-sections";
import styles from "./public-site.module.css";
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
    <>
      <PublicHero eyebrow={eyebrow} title={title} description={description}>
        <div className={styles.actions}>
          <Link href={primaryAction.href} className={styles.button}>
            {primaryAction.label}
            <span>
              <ArrowRight size={18} />
            </span>
          </Link>
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className={styles.secondaryButton}
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      </PublicHero>
      {aside && <div className={styles.container}>{aside}</div>}
    </>
  );
}

export function MetricStrip({ items }: MetricProps) {
  return (
    <section className="border-b border-slate-200 bg-[#faf9f7]">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-6 md:grid-cols-3 lg:px-8">
        {items.map((item, index) => (
          <motion.div
            key={`${item.value}_${index}`}
            variants={fadeUp}
            initial={false}
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className="rounded-[24px] border border-slate-200 bg-white px-5 py-5"
          >
            <p className="text-2xl font-semibold text-[#292a2d]">
              {item.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {item.label}
            </p>
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
    <PublicSectionHeading
      eyebrow={eyebrow || "Conheça a Altum"}
      title={title}
      description={subtitle}
    />
  );
}

export function CardGrid({ title, subtitle, items }: CardGridProps) {
  return (
    <section className="bg-[#faf9f7] px-5 py-18 lg:px-8">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mx-auto mt-10 grid w-full max-w-7xl gap-5 lg:grid-cols-3">
        {items.map((item, index) => (
          <motion.article
            key={`${item.title}_${index}`}
            variants={fadeUp}
            initial={false}
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className={`rounded-[28px] border px-6 py-6 ${
              item.featured
                ? "border-[#ed782f]/40 bg-[linear-gradient(180deg,rgba(37,99,235,0.16),rgba(255,255,255,0.04))]"
                : "border-slate-200 bg-white"
            }`}
          >
            {item.eyebrow ? (
              <p className="text-xs uppercase tracking-[0.24em] text-[#292a2d]">
                {item.eyebrow}
              </p>
            ) : null}
            <h3 className="mt-4 text-2xl font-semibold text-[#292a2d]">
              {item.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {item.description}
            </p>

            {item.bullets?.length ? (
              <div className="mt-5 space-y-3">
                {item.bullets.map((bullet) => (
                  <div
                    key={bullet}
                    className="flex items-start gap-3 text-sm leading-6 text-slate-600"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#292a2d]" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {item.href ? (
              <Link
                href={item.href}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#292a2d] transition hover:text-[#a34f1c]"
              >
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
    <section className="border-y border-slate-200 bg-[#faf9f7] px-5 py-18 lg:px-8">
      <SectionHeader
        eyebrow="Operacao assistida"
        title={title}
        subtitle={subtitle}
      />
      <div className="mx-auto mt-12 grid w-full max-w-7xl gap-5 lg:grid-cols-4">
        {items.map((item, index) => (
          <motion.article
            key={`${item.title}_${index}`}
            variants={fadeUp}
            initial={false}
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.07 }}
            className="rounded-[26px] border border-slate-200 bg-white px-5 py-6"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ed782f]/14 text-sm font-semibold text-[#292a2d]">
              0{index + 1}
            </div>
            <h3 className="mt-5 text-xl font-semibold text-[#292a2d]">
              {item.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {item.description}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export function FaqSection({ title, subtitle, items }: FaqProps) {
  return (
    <>
      <p className="sr-only">{subtitle}</p>
      <PublicFaq
        title={title}
        items={items.map((item) => [item.question, item.answer] as const)}
      />
    </>
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
    <section className="bg-[#faf9f7] px-5 py-18 lg:px-8">
      <div className="mx-auto w-full max-w-6xl rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(37,99,235,0.12),rgba(255,255,255,0.04))] px-6 py-10 md:px-10">
        <p className="text-xs uppercase tracking-[0.28em] text-[#292a2d]">
          Proximo passo
        </p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold text-[#292a2d] md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg md:leading-8">
          {description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={primaryAction.href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#292a2d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#424346] sm:w-auto"
          >
            {primaryAction.label} <ArrowRight className="h-4 w-4" />
          </Link>
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-200 hover:text-[#292a2d] sm:w-auto"
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
    <div className="rounded-[34px] border border-slate-200 bg-[#faf9f7]/95 p-4 shadow-[0_40px_120px_-48px_rgba(78,53,33,0.16)]">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-[26px] border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-600">
            Operacao diaria
          </p>
          <div className="mt-5 space-y-2">
            {rails.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 rounded-[16px] px-3 py-3 ${item.label === "Conversas" ? "bg-[#f97316]/12 text-[#292a2d]" : "text-slate-600"}`}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(255,255,255,0.04))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#292a2d]">
                  Resumo da operacao
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-[#292a2d]">
                  A equipe entra e entende o que precisa fazer em minutos.
                </h3>
              </div>
              <div className="rounded-full border border-[#ed782f]/20 bg-[#ed782f]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#292a2d]">
                Fluxo com IA
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {primaryCards.map((item) => (
              <div
                key={item.label}
                className="rounded-[22px] border border-slate-200 bg-white p-4"
              >
                <item.icon className="h-4 w-4 text-[#292a2d]" />
                <p className="mt-4 text-3xl font-semibold text-[#292a2d]">
                  {item.value}
                </p>
                <p className="mt-2 text-sm text-slate-600">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-[#292a2d]">
                Prioridades sugeridas
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#292a2d]" />
                  <span>
                    Responder as 3 conversas com sinal de proposta e sem retorno
                    nas ultimas 2 horas.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-[#292a2d]" />
                  <span>
                    Revisar regra de handoff da IA para conversas com pedido de
                    valor final.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#292a2d]" />
                  <span>
                    Alertar sobre proximo vencimento e manter o admin no
                    controle de acesso.
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-[#292a2d]">
                Operacao Altum
              </p>
              <div className="mt-4 space-y-4 text-sm text-slate-600">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                  Conversas, CRM, agenda e campanhas falam a mesma lingua.
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                  A IA sugere proximos passos sem jogar o usuario numa tela
                  tecnica.
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
    <section className="border-y border-slate-200 bg-[#faf9f7] px-5 py-18 lg:px-8">
      <SectionHeader eyebrow="Prova visual" title={title} subtitle={subtitle} />
      <div className="mx-auto mt-10 grid w-full max-w-7xl gap-5 lg:grid-cols-3">
        {items.map((item, index) => (
          <motion.article
            key={`${item.title}_${index}`}
            variants={fadeUp}
            initial={false}
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white"
          >
            <div className="relative aspect-[16/11]">
              <Image
                src={item.image}
                alt={item.title}
                fill
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-5">
              <h3 className="text-2xl font-semibold text-[#292a2d]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {item.description}
              </p>
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
      description:
        "Para quem ja tem operacao e quer contratar o SaaS com clareza de plano e setup.",
      href: buildCommercialContactUrl("plataforma", "/contato"),
    },
    {
      title: "Quero passar pelo quiz",
      description:
        "Para quem quer entender qual caminho faz mais sentido antes de fechar.",
      href: "/diagnostico",
    },
    {
      title: "Quero proposta mais completa",
      description:
        "Para quem precisa unir agencia, captacao, WhatsApp, plataforma e implantacao.",
      href: buildCommercialContactUrl("estrutura_digital", "/contato"),
    },
    {
      title: "Quero ir para o WhatsApp",
      description:
        "Para quem quer chegar no WhatsApp com o contexto certo ja salvo no CRM.",
      href: "/diagnostico?entry=route_card_whatsapp",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((item) => (
        <div
          key={item.title}
          className="rounded-[24px] border border-slate-200 bg-white p-5"
        >
          <h3 className="text-xl font-semibold text-[#292a2d]">{item.title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {item.description}
          </p>
          <Link
            href={item.href}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#a34f1c] hover:text-[#292a2d]"
          >
            Seguir por aqui <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
