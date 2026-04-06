"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  MessageCircle,
  Sparkles,
  Target,
  LayoutTemplate,
  Bot,
  ShieldCheck,
  Zap,
  CheckCircle2,
  BarChart3,
  Layers3,
  Orbit,
} from "lucide-react";

const whatsappLink =
  "https://wa.me/5531972545430?text=Ola%20ALTUM,%20quero%20uma%20analise%20para%20meu%20projeto.";

const projects = [
  {
    name: "Clínica Estética Premium",
    niche: "Clínica • Landing Page",
    result: "+120 leads/mês",
    description:
      "Landing page criada para fortalecer autoridade, transmitir percepção premium e facilitar o agendamento comercial.",
    image: "/images/portfolio/clinica.jpg",
    href: "#",
    featured: true,
  },
  {
    name: "Advocacia Empresarial",
    niche: "Jurídico • Institucional",
    result: "Mais autoridade e contatos",
    description:
      "Projeto focado em credibilidade, clareza dos serviços e geração de contatos qualificados para reuniões.",
    image: "/images/portfolio/advogado.jpg",
    href: "#",
  },
  {
    name: "Energia Solar B2B",
    niche: "B2B • Funil Comercial",
    result: "Pipeline mais previsível",
    description:
      "Estrutura digital desenhada para captação, organização do processo comercial e avanço do lead no funil.",
    image: "/images/portfolio/solar.jpg",
    href: "#",
  },
];

const stats = [
  { value: "+120", label: "Leads/mês em estruturas bem desenhadas" },
  { value: "24/7", label: "Operação preparada para crescer com IA" },
  { value: "Premium", label: "Design, copy e percepção de alto nível" },
];

const proof = [
  {
    value: "+300%",
    label: "Potencial de aumento em geração de oportunidades com uma estrutura mais forte",
  },
  {
    value: "Alta percepção",
    label: "Projetos construídos para elevar a marca e gerar mais confiança comercial",
  },
  {
    value: "1 ecossistema",
    label: "Site hoje. Tráfego, CRM, automação e IA amanhã",
  },
];

const steps = [
  {
    title: "Diagnóstico",
    description:
      "Entendemos nicho, posicionamento, objetivo comercial e o nível de presença digital que sua empresa precisa.",
    icon: Target,
  },
  {
    title: "Direção",
    description:
      "Definimos copy, arquitetura visual, hierarquia da informação e pontos de conversão.",
    icon: Sparkles,
  },
  {
    title: "Construção",
    description:
      "Desenvolvemos a experiência com design premium, clareza comercial e identidade forte.",
    icon: LayoutTemplate,
  },
  {
    title: "Escala",
    description:
      "Depois do projeto, evoluímos para tráfego, CRM, automações, atendimento e IA.",
    icon: Bot,
  },
];

const ecosystem = [
  {
    title: "Sites premium",
    description: "Projetos pensados para autoridade, posicionamento e conversão.",
    icon: LayoutTemplate,
  },
  {
    title: "CRM e pipeline",
    description: "Organização comercial para não perder oportunidade e acelerar fechamento.",
    icon: Target,
  },
  {
    title: "Tráfego pago",
    description: "Google Ads e Meta Ads conectados ao ecossistema para gerar leads.",
    icon: Zap,
  },
  {
    title: "IA e automação",
    description: "Atendimento, triagem e próximos passos dentro de uma operação centralizada.",
    icon: Bot,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      variants={fadeUp}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55 }}
      className="max-w-3xl"
    >
      {eyebrow ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-[#F56E0F]" />
          {eyebrow}
        </div>
      ) : null}

      <h2 className="mt-5 text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.02] text-white">
        {title}
      </h2>

      <p className="mt-4 text-base md:text-lg leading-8 text-white/60">
        {subtitle}
      </p>
    </motion.div>
  );
}

function BackgroundSystem() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(245,110,15,.20),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(124,58,237,.14),transparent_28%),linear-gradient(180deg,#060608_0%,#09090d_100%)]" />

      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="pointer-events-none absolute left-[-140px] top-16 h-[360px] w-[360px] rounded-full bg-[#F56E0F]/12 blur-[130px]" />
      <div className="pointer-events-none absolute right-[-120px] top-0 h-[340px] w-[340px] rounded-full bg-violet-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-[-180px] left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[140px]" />
    </>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#060608]/60 backdrop-blur-2xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-[#F56E0F] font-black text-white shadow-[0_14px_40px_rgba(245,110,15,0.35)]">
            <div className="absolute inset-0 rounded-2xl bg-[#F56E0F]/30 blur-md" />
            <span className="relative">A</span>
          </div>

          <div>
            <div className="text-lg font-extrabold tracking-[0.16em] text-white">
              ALTUM
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/30">
              Portfolio
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {[
            ["Projetos", "#projetos"],
            ["Impacto", "#resultados"],
            ["Processo", "#como-funciona"],
            ["Ecossistema", "#ecossistema"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="relative text-sm font-semibold text-white/50 transition hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        <a
          href={whatsappLink}
          className="inline-flex items-center gap-2 rounded-full bg-[#F56E0F] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(245,110,15,0.3)] transition hover:scale-[1.02] hover:opacity-95"
        >
          Falar no WhatsApp
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <BackgroundSystem />

      <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-24 md:pb-28 md:pt-32">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="max-w-3xl"
          >
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 backdrop-blur-md"
            >
              <span className="h-2 w-2 rounded-full bg-[#F56E0F]" />
              Projetos digitais premium
            </motion.div>

            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="mt-6 text-5xl font-extrabold tracking-tight leading-[0.9] text-white md:text-7xl"
            >
              Presença digital no
              <br />
              <span className="bg-gradient-to-r from-white via-[#ffbc7c] to-[#F56E0F] bg-clip-text text-transparent">
                nível da sua empresa
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="mt-6 max-w-2xl text-lg leading-8 text-white/60 md:text-xl"
            >
              A ALTUM cria experiências digitais para empresas que precisam
              transmitir mais autoridade, gerar mais oportunidades e crescer
              com uma estrutura visual e comercial muito mais forte.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <a
                href="#projetos"
                className="rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:opacity-90"
              >
                Ver projetos
              </a>

              <a
                href={whatsappLink}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 font-bold text-white transition hover:bg-white/[0.08]"
              >
                Solicitar análise
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="mt-10 grid gap-4 sm:grid-cols-3"
            >
              {stats.map((item) => (
                <div
                  key={item.value}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
                >
                  <div className="text-3xl font-extrabold text-white">
                    {item.value}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    {item.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.15 }}
            className="relative"
          >
            <div className="absolute inset-0 rounded-[2.8rem] bg-[radial-gradient(circle_at_20%_0%,rgba(245,110,15,.18),transparent_40%)] blur-2xl" />

            <div className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_30px_100px_rgba(0,0,0,.48)] backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  <Orbit className="h-3.5 w-3.5" />
                  ALTUM Interface
                </div>
              </div>

              <div className="relative min-h-[520px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,#17171e,#0c0c10)] p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(245,110,15,.12),transparent_35%),radial-gradient(circle_at_100%_0%,rgba(124,58,237,.12),transparent_35%)]" />
                <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px]" />

                <div className="relative">
                  <div className="inline-flex rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
                    Landing Page Premium
                  </div>

                  <h3 className="mt-6 max-w-lg text-3xl font-extrabold leading-[1.02] text-white">
                    Estrutura feita para impressionar, posicionar e converter
                  </h3>

                  <p className="mt-3 max-w-md leading-7 text-white/60">
                    Design refinado, copy estratégica e uma presença digital
                    preparada para gerar confiança desde os primeiros segundos.
                  </p>

                  <div className="mt-10 grid grid-cols-6 items-end gap-2">
                    {[34, 46, 53, 66, 76, 92].map((height, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.85, delay: 0.28 + i * 0.08 }}
                        className="h-40 rounded-t-2xl bg-gradient-to-t from-[#F56E0F] to-[#ffb067]"
                      />
                    ))}
                  </div>

                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute right-0 top-8 w-48 rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-md"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                      Performance
                    </div>
                    <div className="mt-2 text-2xl font-extrabold text-white">
                      +120
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      Oportunidades em uma estrutura mais forte e mais clara.
                    </p>
                  </motion.div>

                  <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute bottom-4 left-0 w-56 rounded-2xl bg-white p-4 text-black shadow-2xl"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">
                      Resultado esperado
                    </div>
                    <div className="mt-2 text-xl font-extrabold">
                      Mais autoridade
                    </div>
                    <p className="mt-2 text-sm text-black/65">
                      Uma presença digital que valoriza a marca e acelera o contato.
                    </p>
                  </motion.div>

                  <motion.div
                    animate={{ x: [0, 8, 0] }}
                    transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute bottom-28 right-10 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur-md"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                      UX + Estratégia
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      Percepção premium
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ProjectsShowcase() {
  const featured = projects.find((p) => p.featured) || projects[0];
  const secondary = projects.filter((p) => p.name !== featured.name);

  return (
    <section id="projetos" className="mx-auto max-w-7xl px-6 py-24">
      <SectionTitle
        eyebrow="Projetos"
        title="Projetos que mostram o padrão visual e estratégico da ALTUM"
        subtitle="Não se trata apenas de design. Cada projeto é construído para fortalecer marca, facilitar o contato e preparar o crescimento digital da empresa."
      />

      {/* mobile carousel */}
      <div className="mt-12 md:hidden">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {projects.map((project) => (
            <motion.article
              key={project.name}
              variants={fadeUp}
              className="min-w-[88%] snap-center overflow-hidden rounded-[2rem] border border-white/10 bg-[#121216] shadow-2xl shadow-black/30"
            >
              <div className="relative aspect-[16/12] overflow-hidden">
                <Image
                  src={project.image}
                  alt={project.name}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                <div className="absolute left-4 top-4 inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
                  {project.niche}
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-sm font-bold text-emerald-300">
                    {project.result}
                  </div>
                  <h3 className="mt-2 text-2xl font-extrabold text-white">
                    {project.name}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-white/65">
                    {project.description}
                  </p>

                  <Link
                    href={project.href}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-white"
                  >
                    Ver projeto <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>

      {/* desktop editorial layout */}
      <div className="mt-12 hidden gap-6 md:grid md:grid-cols-12">
        <motion.article
          initial="hidden"
          whileInView="show"
          variants={fadeUp}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="group col-span-12 overflow-hidden rounded-[2.3rem] border border-white/10 bg-[#121216] shadow-[0_30px_80px_rgba(0,0,0,.35)] lg:col-span-7"
        >
          <div className="relative aspect-[16/11] overflow-hidden">
            <Image
              src={featured.image}
              alt={featured.name}
              fill
              className="object-cover transition duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />

            <div className="absolute left-6 top-6 inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
              {featured.niche}
            </div>

            <div className="absolute bottom-6 left-6 right-6">
              <div className="text-sm font-bold text-emerald-300">
                {featured.result}
              </div>
              <h3 className="mt-2 text-3xl font-extrabold text-white">
                {featured.name}
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-7 text-white/65">
                {featured.description}
              </p>

              <Link
                href={featured.href}
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white transition group-hover:translate-x-1"
              >
                Ver projeto <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </motion.article>

        <div className="col-span-12 grid gap-6 lg:col-span-5">
          {secondary.map((project) => (
            <motion.article
              key={project.name}
              initial="hidden"
              whileInView="show"
              variants={fadeUp}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55 }}
              className="group overflow-hidden rounded-[2rem] border border-white/10 bg-[#121216] shadow-[0_24px_70px_rgba(0,0,0,.28)]"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={project.image}
                  alt={project.name}
                  fill
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />

                <div className="absolute left-5 top-5 inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
                  {project.niche}
                </div>

                <div className="absolute bottom-5 left-5 right-5">
                  <div className="text-sm font-bold text-emerald-300">
                    {project.result}
                  </div>
                  <h3 className="mt-2 text-2xl font-extrabold text-white">
                    {project.name}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-white/65">
                    {project.description}
                  </p>

                  <Link
                    href={project.href}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-white transition group-hover:translate-x-1"
                  >
                    Ver projeto <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ImpactSection() {
  return (
    <section id="resultados" className="mx-auto max-w-7xl px-6 py-10">
      <SectionTitle
        eyebrow="Impacto"
        title="O que realmente importa é resultado percebido"
        subtitle="A ALTUM não constrói páginas para apenas existir. Cada projeto precisa fortalecer a marca, elevar percepção e facilitar novas oportunidades."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-12">
        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeUp}
          viewport={{ once: true, margin: "-80px" }}
          className="rounded-[2.2rem] border border-white/10 bg-[#131318] p-8 lg:col-span-5"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
            Valor percebido
          </div>
          <div className="mt-6 text-6xl font-extrabold leading-none text-white md:text-7xl">
            +300%
          </div>
          <p className="mt-5 max-w-md text-base leading-8 text-white/60">
            Potencial de aumento em geração de oportunidades quando a presença
            digital deixa de ser comum e passa a transmitir mais nível, mais
            clareza e mais confiança.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:col-span-7 md:grid-cols-2">
          {proof.map((item) => (
            <motion.div
              key={item.value}
              initial="hidden"
              whileInView="show"
              variants={fadeUp}
              viewport={{ once: true, margin: "-80px" }}
              className="rounded-[2rem] border border-white/10 bg-[#18181d] p-6"
            >
              <div className="text-3xl font-extrabold text-white">
                {item.value}
              </div>
              <p className="mt-3 text-sm leading-7 text-white/55">
                {item.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProcessTimeline() {
  return (
    <section id="como-funciona" className="mx-auto max-w-7xl px-6 py-24">
      <SectionTitle
        eyebrow="Processo"
        title="Como a ALTUM desenvolve um projeto no nível certo"
        subtitle="Mais do que layout bonito: existe estratégia, direção e uma lógica de crescimento por trás de cada decisão."
      />

      <div className="relative mt-14">
        <div className="absolute left-5 top-0 hidden h-full w-px bg-gradient-to-b from-[#F56E0F]/40 via-white/10 to-transparent md:block" />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                variants={fadeUp}
                className="relative rounded-[2rem] border border-white/10 bg-[#121216] p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#F56E0F]/20 bg-[#F56E0F]/10 text-[#ffd3b1]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-black text-white/15">
                    0{index + 1}
                  </div>
                </div>

                <h3 className="mt-5 text-2xl font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/60">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function EcosystemSection() {
  return (
    <section id="ecossistema" className="mx-auto max-w-7xl px-6 py-10">
      <SectionTitle
        eyebrow="Ecossistema"
        title="Mais do que um site: uma base para crescer com consistência"
        subtitle="Seu projeto pode começar como presença digital premium e evoluir para uma operação muito mais inteligente, com tráfego, CRM, automação e IA."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-12">
        {/* coluna esquerda */}
        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeUp}
          viewport={{ once: true, margin: "-80px" }}
          className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#121216] p-8 lg:col-span-7"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(245,110,15,.10),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(124,58,237,.10),transparent_30%)]" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
              <Layers3 className="h-3.5 w-3.5" />
              Ecossistema ALTUM
            </div>

            <h3 className="mt-6 max-w-2xl text-3xl md:text-4xl font-extrabold leading-[1.02] text-white">
              Hoje você entra por um projeto premium.
              <br />
              Amanhã pode operar com um sistema inteiro.
            </h3>

            <p className="mt-4 max-w-2xl text-base md:text-lg leading-8 text-white/60">
              A ALTUM constrói a base visual e comercial agora — e deixa o
              caminho pronto para evoluir com tráfego pago, CRM, automações,
              atendimento estruturado e inteligência artificial.
            </p>

            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              className="mt-8 grid gap-4 md:grid-cols-2"
            >
              {ecosystem.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    variants={fadeUp}
                    className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
                  >
                    <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[#F56E0F]">
                      <Icon className="h-5 w-5" />
                    </div>

                    <h4 className="mt-4 text-lg font-bold text-white">
                      {item.title}
                    </h4>
                    <p className="mt-2 text-sm leading-7 text-white/55">
                      {item.description}
                    </p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </motion.div>

        {/* coluna direita */}
        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeUp}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#121216] p-8 lg:col-span-5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(245,110,15,.08),transparent_30%)]" />

          <div className="relative">
            <div className="inline-flex rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
              Como a ALTUM ajuda sua empresa
            </div>

            <h3 className="mt-6 text-3xl font-extrabold leading-[1.04] text-white">
              Um projeto bonito não basta.
              <br />
              Sua presença digital precisa gerar movimento no negócio.
            </h3>

            <p className="mt-4 text-base leading-8 text-white/60">
              A ALTUM desenvolve projetos com foco em posicionamento,
              autoridade e geração de oportunidades reais. O objetivo não é só
              colocar sua empresa no ar — é criar uma presença que valorize sua
              marca e facilite novas vendas.
            </p>

            <div className="mt-8 space-y-4">
              {[
                {
                  title: "Mais autoridade",
                  description:
                    "Seu negócio passa a transmitir mais nível, mais confiança e mais valor desde o primeiro acesso.",
                },
                {
                  title: "Mais oportunidades",
                  description:
                    "A estrutura é pensada para facilitar contato, captar interesse e transformar visitas em oportunidades reais.",
                },
                {
                  title: "Base para crescer",
                  description:
                    "Depois do projeto, sua empresa já fica pronta para evoluir com tráfego, CRM, automação e IA.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
                >
                  <h4 className="text-lg font-bold text-white">{item.title}</h4>
                  <p className="mt-2 text-sm leading-7 text-white/55">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function TrustBand() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <SectionTitle
        eyebrow="Valor percebido"
        title="Por que esse tipo de projeto muda a percepção do cliente"
        subtitle="Empresas não crescem só com presença online. Crescem quando a presença transmite força, clareza e confiança comercial."
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-12 grid gap-5 md:grid-cols-3"
      >
        {[
          {
            title: "Percepção premium",
            text: "Design e posicionamento para negócios que precisam transmitir nível, segurança e autoridade.",
            icon: ShieldCheck,
          },
          {
            title: "Estratégia comercial",
            text: "Cada página é pensada para facilitar contato, aumentar conversão e preparar crescimento.",
            icon: BarChart3,
          },
          {
            title: "Pronto para evoluir",
            text: "A base certa hoje permite escalar para tráfego, CRM, automação e IA amanhã.",
            icon: CheckCircle2,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              variants={fadeUp}
              className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
            >
              <div className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_top,rgba(245,110,15,.10),transparent_40%)]" />

              <div className="relative">
                <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[#F56E0F]">
                  <Icon className="h-5 w-5" />
                </div>

                <h3 className="mt-5 text-2xl font-bold text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/60">
                  {item.text}
                </p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

function StatementSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <motion.div
        initial="hidden"
        whileInView="show"
        variants={fadeUp}
        viewport={{ once: true, margin: "-80px" }}
        className="relative overflow-hidden rounded-[2.6rem] border border-white/10 bg-[linear-gradient(135deg,#0f0f14,rgba(245,110,15,.10))] px-8 py-16 text-center md:px-14"
      >
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:54px_54px]" />

        <div className="relative mx-auto max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
            <span className="h-2 w-2 rounded-full bg-[#F56E0F]" />
            Posicionamento ALTUM
          </div>

          <h2 className="mt-6 text-4xl md:text-6xl font-extrabold leading-[0.96] tracking-tight text-white">
            Não é só um site.
            <br />
            É uma base de crescimento para a sua empresa.
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-base md:text-lg leading-8 text-white/60">
            A ALTUM combina design, clareza comercial e visão estratégica para
            transformar presença digital em percepção de valor, confiança e
            geração de oportunidades.
          </p>
        </div>
      </motion.div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <motion.div
        initial="hidden"
        whileInView="show"
        variants={fadeUp}
        viewport={{ once: true, margin: "-80px" }}
        className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,110,15,.18),rgba(255,255,255,.04))] px-6 py-14 text-center shadow-[0_30px_90px_rgba(0,0,0,.35)] md:px-12 md:py-20"
      >
        <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-[#F56E0F]/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-violet-500/10 blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:60px_60px]" />

        <div className="relative mx-auto max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">
            <span className="h-2 w-2 rounded-full bg-[#F56E0F]" />
            Próximo passo
          </div>

          <h2 className="mt-6 text-4xl md:text-6xl font-extrabold tracking-tight leading-[0.96] text-white">
            Quer um projeto no nível real do seu negócio?
          </h2>

          <p className="mx-auto mt-5 max-w-3xl text-base md:text-lg leading-8 text-white/60">
            A ALTUM cria páginas premium com foco em percepção, posicionamento
            e conversão — e prepara a estrutura para sua empresa crescer com mais
            clareza, mais autoridade e mais resultado.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href={whatsappLink}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:opacity-95"
            >
              <span className="relative z-10 flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Solicitar análise
              </span>
              <div className="absolute inset-0 bg-black/5 opacity-0 transition group-hover:opacity-100" />
            </a>

            <a
              href={whatsappLink}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 font-bold text-white transition hover:bg-white/[0.08]"
            >
              <span className="relative z-10">Falar no WhatsApp</span>
              <div className="absolute inset-0 bg-white/5 opacity-0 transition group-hover:opacity-100" />
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-white/45 md:flex-row md:items-center md:justify-between">
        <div>ALTUM — Projetos digitais, operação e crescimento.</div>
        <div>Portfólio premium</div>
      </div>
    </footer>
  );
}

export default function PortfolioPage() {
  return (
    <main className="min-h-screen bg-[#060608] text-white">
      <TopNav />
      <Hero />
      <ProjectsShowcase />
      <ImpactSection />
      <ProcessTimeline />
      <EcosystemSection />
      <TrustBand />
      <StatementSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
