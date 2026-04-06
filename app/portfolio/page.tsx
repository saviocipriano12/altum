"use client";

import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
  useMotionValue,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementType, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
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
  Star,
  Crown,
  MousePointerClick,
  MoveRight,
} from "lucide-react";

const whatsappLink =
  "https://wa.me/5531972545430?text=Ola%20ALTUM,%20quero%20um%20site%20em%20alto%20nivel%20para%20minha%20empresa.";

type Project = {
  name: string;
  niche: string;
  result: string;
  description: string;
  image: string;
  href: string;
  featured?: boolean;
};

type Metric = {
  value: string;
  label: string;
};

type Step = {
  title: string;
  description: string;
  icon: ElementType;
};

type Feature = {
  title: string;
  description: string;
  icon: ElementType;
};

const projects: Project[] = [
  {
    name: "Clinica Estetica Premium",
    niche: "Clinica - Landing Page",
    result: "+120 leads/mes",
    description:
      "Projeto construido para transmitir autoridade, elevar percepcao de valor e facilitar o agendamento comercial.",
    image: "/images/portfolio/clinica.jpg",
    href: "#",
    featured: true,
  },
  {
    name: "Advocacia Empresarial",
    niche: "Juridico - Institucional",
    result: "Mais autoridade e contatos",
    description:
      "Estrutura digital focada em credibilidade, clareza dos servicos e geracao de contatos qualificados.",
    image: "/images/portfolio/advogado.jpg",
    href: "#",
  },
  {
    name: "Energia Solar B2B",
    niche: "B2B - Funil Comercial",
    result: "Pipeline mais previsivel",
    description:
      "Ecossistema pensado para captacao, avanco no funil e organizacao comercial com mais consistencia.",
    image: "/images/portfolio/solar.jpg",
    href: "#",
  },
];

const stats: Metric[] = [
  { value: "+120", label: "Leads/mes em estruturas bem desenhadas" },
  { value: "24/7", label: "Operacao pronta para evoluir com automacao e IA" },
  { value: "Premium", label: "Design, copy e percepcao de alto nivel" },
];

const proof: Metric[] = [
  {
    value: "+300%",
    label:
      "Potencial de aumento em percepcao de valor quando a marca transmite mais nivel",
  },
  {
    value: "Alta confianca",
    label:
      "Projetos desenhados para reduzir objecao e aumentar interesse comercial",
  },
  {
    value: "1 ecossistema",
    label:
      "Site hoje. Trafego, CRM, automacao e IA amanha",
  },
];

const steps: Step[] = [
  {
    title: "Diagnostico",
    description:
      "Entendemos seu nicho, posicionamento, momento do negocio e o nivel de presenca digital que a sua empresa precisa.",
    icon: Target,
  },
  {
    title: "Direcao",
    description:
      "Definimos a mensagem, a estrutura, a hierarquia visual e os pontos certos de conversao.",
    icon: Sparkles,
  },
  {
    title: "Construcao",
    description:
      "Desenvolvemos uma experiencia premium, estrategica e visualmente forte para valorizar sua marca.",
    icon: LayoutTemplate,
  },
  {
    title: "Escala",
    description:
      "Depois do projeto, sua empresa ja fica preparada para evoluir com trafego, CRM, automacoes e IA.",
    icon: Bot,
  },
];

const ecosystem: Feature[] = [
  {
    title: "Sites premium",
    description:
      "Projetos pensados para autoridade, posicionamento e conversao.",
    icon: LayoutTemplate,
  },
  {
    title: "CRM e pipeline",
    description:
      "Organizacao comercial para nao perder oportunidades e acelerar fechamento.",
    icon: Target,
  },
  {
    title: "Trafego pago",
    description:
      "Google Ads e Meta Ads conectados ao ecossistema para gerar demanda qualificada.",
    icon: Zap,
  },
  {
    title: "IA e automacao",
    description:
      "Atendimento, triagem e proximos passos dentro de uma operacao inteligente.",
    icon: Bot,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0 },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.96, y: 24 },
  show: { opacity: 1, scale: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 28,
    mass: 0.22,
  });

  return (
    <motion.div
      style={{ scaleX, transformOrigin: "0%" }}
      className="fixed inset-x-0 top-0 z-[100] h-[3px] bg-gradient-to-r from-[#F56E0F] via-[#ffb067] to-white"
    />
  );
}

function AmbientStage() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[#050507]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_10%_0%,rgba(245,110,15,.12),transparent_24%),radial-gradient(circle_at_90%_10%,rgba(114,76,255,.10),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(245,110,15,.06),transparent_28%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] [background-image:radial-gradient(circle_at_center,white_0.7px,transparent_0.7px)] [background-size:18px_18px]" />

      <motion.div
        animate={{ opacity: [0.06, 0.12, 0.06], scale: [1, 1.08, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none fixed left-[-8rem] top-12 z-0 h-[28rem] w-[28rem] rounded-full bg-[#F56E0F]/12 blur-[140px]"
      />

      <motion.div
        animate={{ opacity: [0.06, 0.14, 0.06], x: [0, 20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none fixed right-[-8rem] top-0 z-0 h-[25rem] w-[25rem] rounded-full bg-violet-500/12 blur-[140px]"
      />
    </>
  );
}

function MouseGlow() {
  const reduceMotion = useReducedMotion();
  const [position, setPosition] = useState({ x: -200, y: -200 });

  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      const { clientX, clientY } = e;
      raf = window.requestAnimationFrame(() => {
        setPosition({ x: clientX, y: clientY });
        raf = 0;
      });
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [reduceMotion]);

  if (reduceMotion) return null;

  return (
    <div
      className="pointer-events-none fixed z-[1] h-[22rem] w-[22rem] rounded-full bg-[#F56E0F]/[0.09] blur-[120px] transition-transform duration-150"
      style={{
        left: position.x - 176,
        top: position.y - 176,
      }}
    />
  );
}

function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      transition={{ duration: 0.6 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  align?: "left" | "center";
}) {
  return (
    <Reveal
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center"
      )}
    >
      {eyebrow ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/75 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-[#F56E0F]" />
          {eyebrow}
        </div>
      ) : null}

      <h2 className="mt-5 text-3xl font-extrabold leading-[1.02] tracking-tight text-white md:text-5xl">
        {title}
      </h2>

      <p className="mt-4 text-base leading-8 text-white/60 md:text-lg">
        {subtitle}
      </p>
    </Reveal>
  );
}

function MagneticButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const ref = useRef<HTMLAnchorElement | null>(null);

  const onMouseMove = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * 0.08}px, ${y * 0.08}px)`;
  };

  const onMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "translate(0px, 0px)";
  };

  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={cn(
        "group inline-flex items-center gap-2 rounded-2xl px-6 py-4 font-bold transition duration-300 will-change-transform",
        variant === "primary" &&
          "bg-white text-black shadow-[0_18px_50px_rgba(255,255,255,0.10)] hover:scale-[1.02]",
        variant === "secondary" &&
          "border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.08]"
      )}
    >
      {children}
    </a>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050507]/70 backdrop-blur-2xl">
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
              Premium Web Agency
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {[
            ["Projetos", "#projetos"],
            ["Processo", "#processo"],
            ["Impacto", "#impacto"],
            ["Ecossistema", "#ecossistema"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="text-sm font-semibold text-white/50 transition hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        <MagneticButton href={whatsappLink} variant="secondary">
          <MessageCircle className="h-4 w-4" />
          Falar no WhatsApp
        </MagneticButton>
      </div>
    </header>
  );
}

function HeroHeadline() {
  const words = useMemo(
    () => ["O", "site", "da", "sua", "empresa", "nao", "pode", "parecer", "comum."],
    []
  );

  return (
    <div className="mt-6">
      <div className="text-5xl font-extrabold leading-[0.92] tracking-tight text-white md:text-7xl xl:text-[5.6rem]">
        {words.map((word, index) => (
          <motion.span
            key={`${word}-${index}`}
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.05 * index }}
            className="mr-[0.22em] inline-block"
          >
            {word}
          </motion.span>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, delay: 0.55 }}
        className="mt-3 text-5xl font-extrabold leading-[0.92] tracking-tight md:text-7xl xl:text-[5.6rem]"
      >
        <span className="bg-gradient-to-r from-white via-[#ffbf87] to-[#F56E0F] bg-clip-text text-transparent">
          Ele precisa vender sua marca
        </span>
      </motion.div>
    </div>
  );
}

function FloatingOrb({
  children,
  className,
  duration = 10,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={reduceMotion ? { y: 0, x: 0 } : { y: [0, -14, 0], x: [0, 8, 0] }}
      transition={reduceMotion ? undefined : { duration, repeat: Infinity, ease: "easeInOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function HeroPreviewCard() {
  const { scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();
  const rotate = useTransform(scrollYProgress, [0, 0.2], [0, -3]);
  const y = useTransform(scrollYProgress, [0, 0.2], [0, -24]);

  return (
    <motion.div
      style={reduceMotion ? undefined : { rotate, y }}
      initial={{ opacity: 0, scale: 0.96, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="relative"
    >
      <div className="absolute inset-0 rounded-[2.8rem] bg-[radial-gradient(circle_at_30%_10%,rgba(245,110,15,.18),transparent_36%)] blur-3xl" />

      <div className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_35px_120px_rgba(0,0,0,.48)] backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            <Orbit className="h-3.5 w-3.5" />
            ALTUM Experience
          </div>
        </div>

        <div className="relative min-h-[560px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,#16161d,#0a0a0f)] p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(245,110,15,.16),transparent_35%),radial-gradient(circle_at_100%_0%,rgba(124,58,237,.14),transparent_35%)]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:40px_40px]" />

          <div className="relative">
            <div className="inline-flex rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
              Presenca digital premium
            </div>

            <h3 className="mt-6 max-w-lg text-3xl font-extrabold leading-[1.02] text-white">
              Design, posicionamento e conversao no mesmo projeto
            </h3>

            <p className="mt-3 max-w-md leading-7 text-white/60">
              Um site forte nao serve apenas para existir. Ele precisa gerar
              percepcao, desejo, confianca e movimento comercial.
            </p>

            <div className="mt-10 grid grid-cols-6 items-end gap-2">
              {[28, 42, 51, 66, 79, 93].map((height, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.85, delay: 0.25 + i * 0.08 }}
                  className="h-44 rounded-t-2xl bg-gradient-to-t from-[#F56E0F] via-[#ff944d] to-[#ffd3af]"
                />
              ))}
            </div>

            <FloatingOrb
              duration={5.4}
              className="absolute right-0 top-8 w-52 rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-md"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                Resultado percebido
              </div>
              <div className="mt-2 text-2xl font-extrabold text-white">
                Mais autoridade
              </div>
              <p className="mt-1 text-xs leading-5 text-white/55">
                Uma marca que transmite mais nivel desde os primeiros segundos.
              </p>
            </FloatingOrb>

            <FloatingOrb
              duration={6.2}
              className="absolute bottom-4 left-0 w-56 rounded-2xl bg-white p-4 text-black shadow-2xl"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">
                Conversao
              </div>
              <div className="mt-2 text-xl font-extrabold">
                Mais contatos qualificados
              </div>
              <p className="mt-2 text-sm text-black/65">
                Estrutura desenhada para reduzir friccao e aumentar interesse real.
              </p>
            </FloatingOrb>

            <FloatingOrb
              duration={7}
              className="absolute bottom-28 right-10 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur-md"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                UX + estrategia
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                Visual que convence
              </div>
            </FloatingOrb>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(245,110,15,.18),transparent_28%),radial-gradient(circle_at_88%_10%,rgba(124,58,237,.16),transparent_26%),linear-gradient(180deg,#050507_0%,#09090d_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:68px_68px]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-24 md:pb-32 md:pt-32">
        <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr]">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="max-w-3xl"
          >
            <motion.div
              variants={fadeScale}
              transition={{ duration: 0.55 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 backdrop-blur-md"
            >
              <Crown className="h-3.5 w-3.5 text-[#F56E0F]" />
              Sites que elevam percepcao e geram desejo
            </motion.div>

            <HeroHeadline />

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.65, delay: 0.25 }}
              className="mt-7 max-w-2xl text-lg leading-8 text-white/62 md:text-xl"
            >
              A ALTUM cria experiencias digitais para empresas que precisam
              parecer maiores, mais valiosas, mais confiaveis e muito mais
              memoraveis.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65, delay: 0.35 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <MagneticButton href={whatsappLink} variant="primary">
                <MousePointerClick className="h-4 w-4" />
                Quero um site nesse nivel
              </MagneticButton>

              <a
                href="#projetos"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 font-bold text-white transition hover:bg-white/[0.08]"
              >
                Ver projetos
                <MoveRight className="h-4 w-4" />
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65, delay: 0.45 }}
              className="mt-10 grid gap-4 sm:grid-cols-3"
            >
              {stats.map((item) => (
                <div
                  key={item.value}
                  className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
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

          <HeroPreviewCard />
        </div>
      </div>
    </section>
  );
}

function PremiumStatement() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 md:py-20">
      <Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Bonito nao basta",
              text: "Seu site precisa convencer. Precisa elevar valor percebido e gerar conversa comercial.",
              icon: Star,
            },
            {
              title: "Premium se sente",
              text: "As pessoas decidem em segundos se sua empresa parece comum ou diferenciada.",
              icon: Sparkles,
            },
            {
              title: "Design que vende",
              text: "Cada detalhe visual precisa reforcar autoridade, clareza e desejo de contato.",
              icon: Crown,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
              >
                <div className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_top,rgba(245,110,15,.12),transparent_42%)]" />
                <div className="relative">
                  <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-[#F56E0F]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    {item.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function ProjectsShowcase() {
  type PortfolioProject = {
    name: string;
    badge: string;
    niche: string;
    result: string;
    description: string;
    image: string;
    href: string;
  };

  type PortfolioCategory = {
    slug: string;
    label: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    benefits: string[];
    cta: string;
    projects: PortfolioProject[];
  };

  const portfolioCategories: PortfolioCategory[] = [
    {
      slug: "lojas-virtuais",
      label: "Lojas Virtuais",
      eyebrow: "Lojas Virtuais",
      title: "Lojas virtuais pensadas para vender com forca, percepcao e escala",
      subtitle:
        "Cases ALTUM e referencias de alto nivel reunidos em uma experiencia mais editorial, premium e memoravel.",
      benefits: [
        "Mais conversao",
        "Melhor experiencia de compra",
        "Base para trafego e escala",
      ],
      cta: "Quero uma loja virtual de alto nivel",
      projects: [
        {
          name: "Clube Farm",
          badge: "Case ALTUM",
          niche: "E-commerce - Decoracao",
          result: "Shopify - identidade, operacao e trafego - +R$ 900 mil em 2 anos",
          description:
            "Loja criada do zero para uma marca de decoracao com estetica farmhouse, posicionamento emocional e estrutura pensada para desejo, recorrencia e crescimento comercial.",
          image: "/images/portfolio/clube-farm.jpg",
          href: "https://www.clubefarm.com.br/",
        },
        {
          name: "Auer Store",
          badge: "Case ALTUM",
          niche: "E-commerce - Streetwear",
          result: "Nuvemshop - branding, banners e estrutura visual",
          description:
            "Marca streetwear estruturada com identidade visual, logo, banners e organizacao de loja para parecer mais forte, mais profissional e mais pronta para escalar.",
          image: "/images/portfolio/auer-store.jpg",
          href: "https://auerstore.com.br/",
        },
        {
          name: "Linus",
          badge: "Referencia",
          niche: "E-commerce - Lifestyle sustentavel",
          result: "Minimalismo, produto forte e posicionamento de marca",
          description:
            "Referencia de loja que mostra como design limpo e narrativa de sustentabilidade transformam um produto simples em desejo de lifestyle.",
          image: "/images/portfolio/linus.jpg",
          href: "https://uselinus.com.br/",
        },
        {
          name: "Basico",
          badge: "Referencia",
          niche: "E-commerce - Moda essencial",
          result: "Marca atemporal com percepcao premium",
          description:
            "Referencia importante para entender como uma loja pode vender o simples com sofisticacao, clareza e experiencia premium.",
          image: "/images/portfolio/basico.jpg",
          href: "https://basico.com/",
        },
      ],
    },
    {
      slug: "institucionais",
      label: "Institucionais",
      eyebrow: "Sites Institucionais",
      title: "Sites institucionais criados para autoridade, posicionamento e confianca",
      subtitle:
        "Projetos pensados para empresas que precisam parecer maiores, mais solidas e mais valiosas desde os primeiros segundos.",
      benefits: [
        "Mais autoridade",
        "Mais clareza comercial",
        "Mais contatos qualificados",
      ],
      cta: "Quero um site institucional premium",
      projects: [
        {
  name: "Erika Viana Advocacia",
  badge: "Projeto ALTUM",
  niche: "Institucional - Jurídico",
  result: "Mais autoridade e mais contatos qualificados",
  description:
    "Site institucional desenvolvido para posicionar a advogada como referência, com foco em autoridade, clareza na comunicação e geração de contatos diretos via WhatsApp.",
  image: "/images/portfolio/erika.jpg",
  href: "https://erikaviana.adv.br/",
},
{
  name: "Brenda Prinsk Advocacia",
  badge: "Projeto ALTUM",
  niche: "Institucional - Jurídico",
  result: "Mais percepção de valor e mais conversões",
  description:
    "Estrutura premium com foco em captação de leads, combinando design sofisticado, copy estratégica e formulário otimizado para geração de oportunidades.",
  image: "/images/portfolio/brenda.jpg",
  href: "https://brendaprinskadvogada.com/",
},
{
  name: "Thaise Germano Advocacia",
  badge: "Projeto ALTUM",
  niche: "Institucional - Jurídico",
  result: "Mais posicionamento e presença digital",
  description:
    "Projeto criado para fortalecer marca pessoal e transmitir excelência jurídica, com uma experiência visual elegante e comunicação focada em confiança.",
  image: "/images/portfolio/thaise.jpg",
  href: "https://thaisegermanoadvocacia.com.br/",
},
{
  name: "Lumax Gessos e Ferragens",
  badge: "Projeto ALTUM",
  niche: "Institucional - Construção",
  result: "Mais pedidos de orçamento e presença local",
  description:
    "Site estruturado para destacar produtos, fortalecer presença regional e facilitar solicitações de orçamento com clareza e rapidez.",
  image: "/images/portfolio/lumax.jpg",
  href: "https://lumax.acaos.com.br/",
},
{
  name: "4D Soluções em TI",
  badge: "Projeto ALTUM",
  niche: "Institucional - Tecnologia",
  result: "Mais geração de leads e autoridade técnica",
  description:
    "Projeto focado em posicionamento B2B, com comunicação clara, prova social e estrutura voltada para geração de oportunidades comerciais.",
  image: "/images/portfolio/4d.jpg",
  href: "https://sitev4.4d.bsb.br/",
},
{
  name: "MOV Mobilidade Urbana",
  badge: "Projeto ALTUM",
  niche: "Institucional - Mobilidade",
  result: "Mais engajamento e clareza de produto",
  description:
    "Plataforma desenvolvida para apresentar soluções de mobilidade urbana com linguagem acessível, design dinâmico e foco em experiência do usuário.",
  image: "/images/portfolio/mov.jpg",
  href: "https://mov1.com.br/",
},
{
  name: "João Vitor Barbosa Psicologia",
  badge: "Projeto ALTUM",
  niche: "Institucional - Saúde",
  result: "Mais agendamentos e conexão com pacientes",
  description:
    "Site pensado para transmitir acolhimento e profissionalismo, facilitando o agendamento e fortalecendo a confiança desde o primeiro contato.",
  image: "/images/portfolio/psicologo.jpg",
  href: "https://psijoaovitorbarbosa.com/",
},
      ],
    },
  ];

  const [activeCategory, setActiveCategory] = useState(portfolioCategories[0].slug);

  const currentCategory =
    portfolioCategories.find((category) => category.slug === activeCategory) ||
    portfolioCategories[0];

  return (
    <section id="projetos" className="relative mx-auto max-w-7xl px-6 py-24">
      <SectionTitle
        eyebrow="Portfolio"
        title="Projetos pensados para objetivos diferentes"
        subtitle="A ALTUM aplica a mesma linguagem premium em diferentes tipos de estrutura digital: e-commerce, institucional, landing pages e sites para servicos."
      />

      <div className="mt-10 flex flex-wrap gap-3">
        {portfolioCategories.map((category) => {
          const active = category.slug === currentCategory.slug;

          return (
            <button
              key={category.slug}
              type="button"
              onClick={() => setActiveCategory(category.slug)}
              className={`rounded-full border px-5 py-3 text-sm font-bold transition ${
                active
                  ? "border-[#F56E0F]/40 bg-[#F56E0F]/12 text-[#ffd3b1]"
                  : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={currentCategory.slug}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mt-14"
      >
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
              {currentCategory.eyebrow}
            </div>

<h3 className="mt-5 text-[2.2rem] font-extrabold leading-[0.98] text-white md:text-5xl">
                {currentCategory.title}
            </h3>

            <p className="mt-4 text-sm leading-7 text-white/60 md:text-lg md:leading-8">
              {currentCategory.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-white/65">
            {currentCategory.benefits.map((benefit) => (
              <div
                key={benefit}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"
              >
                {benefit}
              </div>
            ))}
          </div>
        </div>

        <OpenBookCarousel items={currentCategory.projects} />

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:opacity-95"
          >
            {currentCategory.cta}
          </a>

          <div className="text-sm text-white/45">
            A ALTUM desenvolve estruturas com foco em percepcao, posicionamento e resultado comercial.
          </div>
        </div>
      </motion.div>
    </section>
  );
}
function OpenBookCarousel({
  items,
}: {
  items: {
    name: string;
    badge: string;
    niche: string;
    result: string;
    description: string;
    image: string;
    href: string;
  }[];
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isMobile || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isMobile, items.length, reduceMotion]);

  const prev = () => setIndex((prev) => (prev - 1 + items.length) % items.length);
  const next = () => setIndex((prev) => (prev + 1) % items.length);

  if (isMobile) {
    return (
      <div className="md:hidden">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#060608] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#060608] to-transparent" />

          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => (
              <div
                key={item.name}
                className="min-w-[86%] snap-center first:ml-2 last:mr-10"
              >
                <MobileCaseCard item={item} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {items.map((_, i) => {
            const active = i === index;
            return (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Ir para o projeto ${i + 1}`}
                className={`h-2.5 rounded-full transition-all ${
                  active ? "w-8 bg-[#F56E0F]" : "w-2.5 bg-white/20 hover:bg-white/35"
                }`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const prevIndex = (index - 1 + items.length) % items.length;
  const nextIndex = (index + 1) % items.length;

  return (
    <div className="relative hidden md:block">
      <button
        aria-label="Anterior"
        onClick={prev}
        className="absolute left-0 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.06] p-3 text-white backdrop-blur-md transition hover:bg-white/[0.12]"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        aria-label="Proximo"
        onClick={next}
        className="absolute right-0 top-1/2 z-20 translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.06] p-3 text-white backdrop-blur-md transition hover:bg-white/[0.12]"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="relative h-[620px] overflow-hidden rounded-[2.6rem]">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#060608] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#060608] to-transparent" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-full w-full max-w-[1260px]">
            <DesktopSideCard item={items[prevIndex]} side="left" onClick={prev} />
            <DesktopCenterCard item={items[index]} />
            <DesktopSideCard item={items[nextIndex]} side="right" onClick={next} />
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {items.map((_, i) => {
          const active = i === index;
          return (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Ir para o projeto ${i + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                active ? "w-8 bg-[#F56E0F]" : "w-2.5 bg-white/20 hover:bg-white/35"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
function DesktopCenterCard({
  item,
}: {
  item: {
    name: string;
    badge: string;
    niche: string;
    result: string;
    description: string;
    image: string;
    href: string;
  };
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-120, 120], [6, -6]), { damping: 18, stiffness: 90 });
  const rotateY = useSpring(useTransform(x, [-120, 120], [-8, 8]), { damping: 18, stiffness: 90 });

  const handleMove = (e: ReactMouseEvent) => {
    if (reduceMotion) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - (rect.left + rect.width / 2));
    y.set(e.clientY - (rect.top + rect.height / 2));
  };

  const handleLeave = () => {
    if (reduceMotion) return;
    x.set(0);
    y.set(0);
  };

  return (
    <motion.article
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={
        reduceMotion
          ? { transformStyle: "preserve-3d" }
          : { rotateX, rotateY, transformStyle: "preserve-3d" }
      }
      className="absolute left-1/2 top-1/2 z-10 h-[560px] w-[720px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#121216] shadow-[0_35px_120px_rgba(0,0,0,.45)]"
    >
      <Image
        src={item.image}
        alt={item.name}
        fill
        sizes="720px"
        className="object-cover transition duration-700"
      />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.24)_28%,rgba(0,0,0,0.84)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_78%,rgba(0,0,0,0.34),transparent_36%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(245,110,15,.10)_0%,transparent_36%,transparent_64%,rgba(245,110,15,.08)_100%)] mix-blend-screen" />

      <div className="absolute left-6 top-6 inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">
        {item.badge} - {item.niche}
      </div>

      <div className="absolute bottom-7 left-7 max-w-[72%]">
        <div className="text-sm font-bold text-emerald-300">{item.result}</div>

        <h4 className="mt-2 text-4xl font-extrabold leading-[0.98] text-white">
          {item.name}
        </h4>

        <p className="mt-4 text-base leading-7 text-white/78">
          {item.description}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-95"
          >
            Ver projeto <ArrowRight className="h-4 w-4" />
          </a>

          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.10]"
          >
            Quero um projeto assim
          </a>
        </div>
      </div>
    </motion.article>
  );
}

function DesktopSideCard({
  item,
  side,
  onClick,
}: {
  item: {
    name: string;
    badge: string;
    niche: string;
    result: string;
    description: string;
    image: string;
    href: string;
  };
  side: "left" | "right";
  onClick: () => void;
}) {
  const isLeft = side === "left";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 z-0 h-[420px] w-[360px] -translate-y-1/2 overflow-hidden rounded-[2rem] border border-white/10 bg-[#121216] text-left shadow-[0_25px_90px_rgba(0,0,0,.28)] transition duration-500 hover:scale-[1.02] ${
        isLeft ? "left-8" : "right-8"
      }`}
    >
      <div className={`absolute inset-0 ${isLeft ? "origin-right" : "origin-left"} scale-[0.98]`}>
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes="360px"
          className="object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.32)_28%,rgba(0,0,0,0.88)_100%)]" />
      </div>

      <div className={`absolute inset-0 ${isLeft ? "bg-gradient-to-r from-[#060608]/16 to-[#060608]/50" : "bg-gradient-to-l from-[#060608]/16 to-[#060608]/50"}`} />

      <div className="absolute left-4 top-4 inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">
        {item.badge}
      </div>

      <div className="absolute bottom-5 left-5 right-5">
        <div className="text-[11px] font-bold text-emerald-300">{item.result}</div>
        <h4 className="mt-2 text-2xl font-extrabold leading-[1.02] text-white">
          {item.name}
        </h4>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/72">
          {item.description}
        </p>

        <div className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-white/90">
          Ver projeto <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function MobileCaseCard({
  item,
}: {
  item: {
    name: string;
    badge: string;
    niche: string;
    result: string;
    description: string;
    image: string;
    href: string;
  };
}) {
  return (
    <article className="group relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#121216] shadow-[0_24px_80px_rgba(0,0,0,.30)]">
      <div className="relative aspect-[4/5] overflow-hidden">
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes="86vw"
          className="object-cover transition duration-700 group-hover:scale-[1.03]"
        />

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.22)_28%,rgba(0,0,0,0.88)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_78%,rgba(0,0,0,0.32),transparent_36%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(245,110,15,.08)_0%,transparent_36%,transparent_64%,rgba(245,110,15,.06)_100%)] mix-blend-screen" />

        <div className="absolute left-4 top-4 inline-flex max-w-[85%] rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90">
          {item.badge} - {item.niche}
        </div>

        <div className="absolute bottom-6 left-5 right-5">
          <div className="text-[11px] font-bold text-emerald-300">
            {item.result}
          </div>

          <h4 className="mt-2 text-[2.2rem] font-extrabold leading-[0.94] text-white">
            {item.name}
          </h4>

          <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/78">
            {item.description}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-black"
            >
              Ver projeto <ArrowRight className="h-4 w-4" />
            </a>

            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white"
            >
              Quero um projeto assim
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

function ImpactSection() {
  return (
    <section id="impacto" className="mx-auto max-w-7xl px-6 py-10">
      <SectionTitle
        eyebrow="Impacto"
        title="O cliente nao compra pixels. Ele compra percepcao, confianca e valor."
        subtitle="Quando a sua presenca digital parece forte, o mercado tende a tratar sua marca em outro patamar."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeScale}
          viewport={{ once: true, margin: "-80px" }}
          className="rounded-[2.2rem] border border-white/10 bg-[#131318] p-8 lg:sticky lg:top-28 lg:self-start"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
            Valor percebido
          </div>
          <div className="mt-6 text-6xl font-extrabold leading-none text-white md:text-7xl">
            +300%
          </div>
          <p className="mt-5 max-w-md text-base leading-8 text-white/60">
            Potencial de aumento em percepcao de valor quando a presenca digital
            deixa de ser comum e passa a transmitir nivel, clareza e confianca.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          {proof.map((item, index) => (
            <motion.div
              key={item.value}
              initial="hidden"
              whileInView="show"
              variants={fadeUp}
              transition={{ duration: 0.55, delay: index * 0.08 }}
              viewport={{ once: true, margin: "-80px" }}
              className="rounded-[2rem] border border-white/10 bg-[#18181d] p-6 even:md:translate-y-10"
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

function BeforeAfterSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <SectionTitle
        eyebrow="Antes vs depois"
        title="A diferenca entre parecer amador e parecer referencia"
        subtitle="Em muitos mercados, o cliente decide primeiro pela sensacao de confianca - e so depois compara proposta, preco ou detalhes."
        align="center"
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeScale}
          viewport={{ once: true, margin: "-80px" }}
          className="rounded-[2.2rem] border border-white/10 bg-white/[0.03] p-8"
        >
          <div className="inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
            Antes
          </div>

          <ul className="mt-8 space-y-4 text-white/65">
            {[
              "Site generico e sem identidade forte",
              "Visual que nao transmite autoridade real",
              "Pouca emocao e pouca diferenciacao",
              "Baixa percepcao de valor da marca",
              "Estrutura que nao conduz para o contato",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="leading-7">{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeScale}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,110,15,.12),rgba(255,255,255,.04))] p-8"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,110,15,.12),transparent_36%)]" />

          <div className="relative">
            <div className="inline-flex rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
              Depois
            </div>

            <ul className="mt-8 space-y-4 text-white/80">
              {[
                "Presenca digital memoravel e premium",
                "Marca percebida com mais valor e mais forca",
                "Experiencia que gera desejo e atencao",
                "Mais confianca para iniciar conversa comercial",
                "Site pronto para virar base de crescimento",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#F56E0F]" />
                  <span className="leading-7">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ProcessTimeline() {
  return (
    <section id="processo" className="mx-auto max-w-7xl px-6 py-24">
      <SectionTitle
        eyebrow="Processo"
        title="Como a ALTUM transforma estetica em percepcao de valor"
        subtitle="Mais do que layout bonito: existe direcao, posicionamento, estrutura e intencao comercial por tras de cada detalhe."
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4"
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
    </section>
  );
}

function EcosystemSection() {
  return (
    <section id="ecossistema" className="mx-auto max-w-7xl px-6 py-10">
      <SectionTitle
        eyebrow="Ecossistema"
        title="Mais do que um site: uma base para escalar marketing, vendas e operacao"
        subtitle="O projeto comeca como presenca digital premium e ja deixa o caminho pronto para evoluir com trafego, CRM, automacao e inteligencia artificial."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-12">
        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeScale}
          viewport={{ once: true, margin: "-80px" }}
          className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#121216] p-8 lg:col-span-7"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(245,110,15,.10),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(124,58,237,.10),transparent_30%)]" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
              <Layers3 className="h-3.5 w-3.5" />
              Ecossistema ALTUM
            </div>

            <h3 className="mt-6 max-w-2xl text-3xl font-extrabold leading-[1.02] text-white md:text-4xl">
              Hoje voce entra por um projeto premium.
              <br />
              Amanha pode operar com um sistema inteiro.
            </h3>

            <p className="mt-4 max-w-2xl text-base leading-8 text-white/60 md:text-lg">
              A ALTUM constroi a base visual e comercial agora e deixa a empresa
              pronta para crescer com mais inteligencia, mais previsibilidade e
              mais clareza operacional.
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

        <motion.div
          initial="hidden"
          whileInView="show"
          variants={fadeScale}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#121216] p-8 lg:col-span-5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(245,110,15,.08),transparent_30%)]" />

          <div className="relative">
            <div className="inline-flex rounded-full border border-[#F56E0F]/20 bg-[#F56E0F]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffd3b1]">
              O que muda para sua empresa
            </div>

            <h3 className="mt-6 text-3xl font-extrabold leading-[1.04] text-white">
              Seu site precisa gerar
              <br />
              movimento no negocio.
            </h3>

            <p className="mt-4 text-base leading-8 text-white/60">
              O objetivo nao e apenas colocar no ar. E criar uma presenca que
              valorize a marca, aumente o interesse e facilite novas vendas.
            </p>

            <div className="mt-8 space-y-4">
              {[
                {
                  title: "Mais autoridade",
                  description:
                    "Sua empresa passa a transmitir mais nivel, mais confianca e mais valor desde o primeiro acesso.",
                },
                {
                  title: "Mais oportunidades",
                  description:
                    "A estrutura e pensada para facilitar contato, captar interesse e transformar visitas em conversas reais.",
                },
                {
                  title: "Base para crescer",
                  description:
                    "Depois do projeto, a empresa ja fica preparada para trafego, CRM, automacao e IA.",
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
        title="Por que esse tipo de projeto muda a decisao do cliente"
        subtitle="Empresas nao crescem so por estarem online. Crescem quando a presenca transmite forca, clareza e confianca comercial."
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
            title: "Percepcao premium",
            text: "Design e posicionamento para negocios que precisam transmitir nivel, seguranca e autoridade.",
            icon: ShieldCheck,
          },
          {
            title: "Estrategia comercial",
            text: "Cada pagina e pensada para facilitar contato, aumentar conversao e preparar crescimento.",
            icon: BarChart3,
          },
          {
            title: "Pronto para evoluir",
            text: "A base certa hoje permite escalar para trafego, CRM, automacao e IA amanha.",
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

function FinalCTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <motion.div
        initial="hidden"
        whileInView="show"
        variants={fadeScale}
        viewport={{ once: true, margin: "-80px" }}
        className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,110,15,.20),rgba(255,255,255,.05))] px-6 py-14 text-center shadow-[0_30px_90px_rgba(0,0,0,.35)] md:px-12 md:py-20"
      >
        <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-[#F56E0F]/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-violet-500/10 blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:60px_60px]" />

        <div className="relative mx-auto max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">
            <span className="h-2 w-2 rounded-full bg-[#F56E0F]" />
            Proximo passo
          </div>

          <h2 className="mt-6 text-4xl font-extrabold leading-[0.96] tracking-tight text-white md:text-6xl">
            Se sua empresa quer parecer pequena,
            <br />
            um site comum resolve.
          </h2>

          <h3 className="mt-4 text-2xl font-bold text-[#ffd3af] md:text-3xl">
            Se quer parecer referencia, fale com a ALTUM.
          </h3>

          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/65 md:text-lg">
            Criamos paginas premium com foco em percepcao, posicionamento e
            conversao - e deixamos a base pronta para sua empresa crescer com mais
            autoridade, mais clareza e mais resultado.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <MagneticButton href={whatsappLink} variant="primary">
              <MessageCircle className="h-5 w-5" />
              Quero elevar minha marca
            </MagneticButton>

            <MagneticButton href={whatsappLink} variant="secondary">
              Falar no WhatsApp
            </MagneticButton>
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
        <div>ALTUM - sites premium, operacao e crescimento.</div>
        <div>Presenca digital em outro nivel.</div>
      </div>
    </footer>
  );
}

export default function PortfolioPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050507] text-white">
      <ScrollProgress />
      <AmbientStage />
      <MouseGlow />

      <div className="relative z-10">
        <TopNav />
        <Hero />
        <PremiumStatement />
        <ProjectsShowcase />
        <ImpactSection />
        <BeforeAfterSection />
        <ProcessTimeline />
        <EcosystemSection />
        <TrustBand />
        <FinalCTA />
        <Footer />
      </div>
    </main>
  );
}
