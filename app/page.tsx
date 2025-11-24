"use client";

import { useMotionValue, useSpring } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight, CheckCircle2, Star, Zap, Bot, Link as LinkIcon, Sparkles, Rocket, Cpu, BarChart4, Shield,
  Mail, Phone, MessageCircle, PlayCircle, Palette, Trophy, Layers, Cog, Globe, Video, Search, X, Wand2,
  MousePointer2, Timer, Percent, Menu
} from "lucide-react";
import CasesShowcaseCinematic from "@/components/CasesShowcaseCinematic";

// ---- Polyfill "process" para o preview/cliente ----
if (typeof (globalThis as any).process === "undefined") {
  (globalThis as any).process = { env: { NODE_ENV: "production" } } as any;
}

/**
 * ALTUM — LP Cinematográfica (v4 DISRUPTIVA)
 * Single-file React + Tailwind + Framer Motion.
 */

/* ------------------------------ Utils ------------------------------ */
const cx = (...c: any[]) => c.filter(Boolean).join(" ");
const WHATSAPP = "https://wa.me/55XXXXXXXXXXX?text=Quero%20um%20projeto%20ALTUM";
const EMAIL = "mailto:contato@altum.ag";

function useParallax(ref: React.RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({ target: ref as any, offset: ["start start", "end start"] });
  return {
    ySmall: useTransform(scrollYProgress, [0, 1], [0, -30]),
    yMedium: useTransform(scrollYProgress, [0, 1], [0, -60]),
    fade: useTransform(scrollYProgress, [0, 1], [1, 0.85])
  };
}

/* --- Accent: realça a palavra com gradiente animado e sublinhado sutil --- */
const Accent = ({ children }: { children: React.ReactNode }) => (
  <span className="relative bg-clip-text text-transparent
    [background-image:linear-gradient(90deg,#f7e9c0,#c9a45c,#f7e9c0)]
    [background-size:200%_100%] animate-[sheen_3.5s_linear_infinite]">
    {children}
    <span
      aria-hidden
      className="absolute left-0 right-0 -bottom-1 h-[2px]
      bg-gradient-to-r from-transparent via-[#c9a45c80] to-transparent"
    />
    <style>{`@keyframes sheen { 0%{background-position:0 0} 100%{background-position:-200% 0} }`}</style>
  </span>
);

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70 backdrop-blur-sm hover:bg-white/10 transition">{children}</span>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[color:var(--gold)] ring-1 ring-[color:var(--gold)]/25 bg-[color:var(--gold)]/10">{children}</span>
);

/* ------------------------------ Brand Hero Art (SVG imagem) ------------------------------ */
function HeroArt() {
  return (
    <svg className="w-full h-full" viewBox="0 0 600 420" role="img" aria-label="Arte tecnológica Altum">
      <defs>
        <linearGradient id="line" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c9a45c" />
          <stop offset="100%" stopColor="#c9a45c22" />
        </linearGradient>
        <radialGradient id="glow" cx="70%" cy="20%" r="0.9">
          <stop offset="0%" stopColor="#c9a45c2e" />
          <stop offset="100%" stopColor="#0000" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#glow)" />
      {[...Array(9)].map((_, i) => (
        <path key={i}
          d={`M20 ${360 - i * 26} C 160 ${300 - i * 22}, 260 ${390 - i * 38}, 580 ${230 - i * 20}`}
          fill="none" stroke="url(#line)" strokeWidth={2} opacity={0.9 - i * 0.09}>
          <animate attributeName="stroke-dasharray" values="1,300; 200,300; 1,300" dur={`${6 + i}s`} repeatCount="indefinite" />
          <animate attributeName="stroke-dashoffset" values="0; -400" dur={`${5 + i}s`} repeatCount="indefinite" />
        </path>
      ))}
    </svg>
  );
}

/* --- GlowField: partículas leves com cap de FPS e DPI --- */
function GlowField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let w = 0, h = 0, raf = 0;
    let last = 0;
    const FPS = 30; // cap
    const frameInterval = 1000 / FPS;

    const DPR = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      w = clientWidth; h = clientHeight;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    // densidade adaptativa ao tamanho
    const baseCount = 42;
    const points: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

    const seed = () => {
      points.length = 0;
      const count = Math.round(baseCount * Math.max(1, Math.min(1.8, w / 1200)));
      for (let i = 0; i < count; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 0.7 + Math.random() * 1.1,
        });
      }
    };

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (t - last < frameInterval) return;
      last = t;

      ctx.clearRect(0, 0, w, h);

      // glow suave
      const g = ctx.createRadialGradient(
        w * 0.72, h * 0.22, 0,
        w * 0.72, h * 0.22, Math.max(w, h) * 0.65
      );
      g.addColorStop(0, "rgba(201,164,92,.14)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // move
      for (const p of points) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10 || p.x > w + 10) p.vx *= -1;
        if (p.y < -10 || p.y > h + 10) p.vy *= -1;
      }

      // conexões
      const maxDist = Math.min(130, Math.max(90, w * 0.08));
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(255,225,185,.22)";
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i], b = points[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < maxDist) {
            ctx.globalAlpha = 1 - d / maxDist;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // nós
      ctx.fillStyle = "rgba(255,235,200,.9)";
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onResize = () => { resize(); seed(); };
    resize(); seed();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // reduz movimento para quem prefere menos animação
  return (
    <>
      <canvas
        ref={ref}
        className="absolute inset-0 [contain:strict] will-change-transform"
        style={{ transform: "translateZ(0)" }}
        aria-hidden
      />
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          canvas { display:none; }
        }
      `}</style>
    </>
  );
}


/* --- NebulaLines: linhas sutis e estáveis, sem serrilhado --- */
function NebulaLines() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ contain: "strict" }}
      aria-hidden
    >
      <svg
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] max-w-none"
        viewBox="0 0 1400 420"
        role="img"
        aria-label="Malha tecnológica"
      >
        <defs>
          <linearGradient id="nl-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#c9a45c" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#c9a45c" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#c9a45c" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="nl-glow" cx="80%" cy="30%" r="0.8">
            <stop offset="0%" stopColor="#c9a45c22" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <rect width="1400" height="420" fill="url(#nl-glow)" />

        {[...Array(7)].map((_, i) => {
          const y = 60 + i * 44;
          const dash = 220 + i * 20;
          const dur = 12 + i * 1.5;
          return (
            <path
              key={i}
              d={`M 0 ${y} C 320 ${y - 46}, 780 ${y + 58}, 1400 ${y - 18}`}
              fill="none"
              stroke="url(#nl-line)"
              strokeWidth={1.6}
              style={{
                filter: "drop-shadow(0 0 6px rgba(201,164,92,.15))",
                opacity: 0.9 - i * 0.1,
              }}
            >
              <animate
                attributeName="stroke-dasharray"
                values={`0,1600; ${dash},1600; 0,1600`}
                dur={`${dur}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-dashoffset"
                values="0; -1600"
                dur={`${dur - 2}s`}
                repeatCount="indefinite"
              />
            </path>
          );
        })}
      </svg>

      {/* reduz animação para usuários com motion reduzido */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          svg path { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------ Magnetic Button ------------------------------ */
function MagneticButton({ children, href = "#", variant = "primary" }: any) {
  const ref = useRef<HTMLAnchorElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return; const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * 0.12; const y = (e.clientY - (r.top + r.height / 2)) * 0.12;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  const onLeave = () => { const el = ref.current; if (!el) return; el.style.transform = `translate(0,0)`; };
  return (
    <a ref={ref} href={href} onMouseMove={onMove} onMouseLeave={onLeave}
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold transition will-change-transform",
        variant === "primary"
          ? "bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110 shadow-[0_8px_24px_rgba(201,164,92,.25)]"
          : "border border-white/20 text-white hover:bg-white/10"
      )}
    >{children}</a>
  );
}

function SEOJsonLD() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ALTUM",
    "url": "https://altum.ag",
    "logo": "https://altum.ag/og-altum.jpg",
    "sameAs": ["https://www.linkedin.com/company/altum", "https://www.instagram.com/altum"]
  };
  const site = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "ALTUM",
    "url": "https://altum.ag",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://altum.ag/?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(site) }} />
    </>
  );
}

/* ------------------------------ Root ------------------------------ */
export default function App() {
  const [openCmd, setOpenCmd] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpenCmd((s) => !s); }
      if (e.key === "/") { setOpenCmd(true); }
      if (e.key === "Escape") setOpenCmd(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen text-white selection:bg-[color:var(--gold)]/30 bg-[color:var(--blue-900)] [--blue-900:#0B1220] [--blue:#0f2451] [--gold:#C9A45C]">
      <Header />
      <Hero />
      <TechMarquee />
      <ClientsStrip />
      <Solutions />
      <Features />
      <Metrics />
      <Products />
      <Process />
      <CaseScroller />
      <BeforeAfter />
      <VideoSection />
      <AgentDemo />
      <ROISimulator />
      <CasesShowcaseCinematic />
      <Testimonials />
      <Pricing />
      <Insights />
      <FAQ />
      <Contact />
      <CTASection />
      <Footer />
      <StickyBar />
      <SEOJsonLD />
      <CommandPalette open={openCmd} onClose={() => setOpenCmd(false)} />
    </div>
  );
}

/* ------------------------------ Header ------------------------------ */
/* ------------------------------ Header ------------------------------ */
const LOGO_SRC = "/logo-altum.svg"; // coloque o arquivo em /public

function Header() {
  const [open, setOpen] = useState(false);

  // trava o scroll quando o menu mobile está aberto
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const NavLinks = () => (
    <>
      {[["Serviços", "#servicos"], ["Processo", "#processo"], ["Cases", "#cases"], ["Vídeo", "#video"], ["Contato", "#contato"]]
        .map(([t, href]) => (
          <a key={t} href={href as string} className="hover:text-white transition">
            {t}
          </a>
        ))}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[color:var(--blue-900)]/70 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--blue-900)]/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
       
<a href="#inicio" className="flex items-center gap-2 md:gap-3">
  <img
    src="/logo-altum.svg"
    alt="Símbolo Altum"
    className="h-6 w-auto md:h-7"
    loading="eager"
    decoding="async"
  />
  <span className="font-extrabold tracking-wide text-white text-base md:text-lg leading-none">
    ALTUM
  </span>
</a>


        {/* Navegação Desktop */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
          <NavLinks />
        </nav>

        {/* CTA Desktop */}
        <a
          href="#contato"
          className="hidden md:inline-flex rounded-full px-4 py-2 text-sm font-semibold bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110"
        >
          Fale Conosco
        </a>

        {/* Botão Mobile */}
        <button
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10"
          onClick={() => setOpen(v => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Menu Mobile (overlay) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-auto mt-20 w-[92%] max-w-md rounded-2xl border border-white/10 bg-[color:var(--blue-900)] p-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <ul className="flex flex-col gap-2 text-white/90 text-base">
              {[
                ["Serviços", "#servicos"],
                ["Processo", "#processo"],
                ["Cases", "#cases"],
                ["Vídeo", "#video"],
                ["Contato", "#contato"],
              ].map(([t, href]) => (
                <li key={t}>
                  <a
                    href={href as string}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 hover:bg-white/10"
                  >
                    {t}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="#contato"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex w-full items-center justify-center rounded-full px-5 py-3 font-semibold bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110"
            >
              Fale com um especialista
            </a>
          </div>
        </div>
      )}
    </header>
  );
}


/* ------------------------------ Hero (com KPIs + Code Panel) ------------------------------ */
function FloatingKPI({ k, v, pos }: { k: string; v: string; pos: string }) {
  return (
    <div className={`
      absolute ${pos} rounded-2xl border border-white/10 bg-white/5
      backdrop-blur px-4 py-3 text-sm shadow-[0_8px_30px_rgba(0,0,0,.25)]
      ring-1 ring-white/5
    `}>
      <div className="text-white/60">{k}</div>
      <div className="mt-0.5 font-semibold text-white">{v}</div>
    </div>
  );
}

function CodePanel() {
  return (
    <div className="absolute right-6 bottom-6 w-[360px] max-w-[70vw] rounded-2xl border border-white/10 bg-[#0E182B]/80 backdrop-blur p-4">
      <div className="flex gap-2 mb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
      </div>
      <pre className="text-[12px] leading-5 text-white/80 font-mono">
        <code>
{`// n8n -> WhatsApp (pedido enviado)
onOrderCreated(({ customer, orderId }) => {
  sendWhatsApp(customer.phone, \`Seu pedido #\${orderId} foi recebido.\`);
});`}
        </code>
      </pre>
    </div>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { fade } = useParallax(ref);

  return (
    <section ref={ref} id="inicio" className="relative overflow-hidden min-h-[96vh] flex items-center">
      {/* grid de pontinhos */}
      <div className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(circle at 12px 12px, rgba(255,255,255,.06) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      {/* brilho suave */}
      <motion.div style={{ opacity: fade }} className="pointer-events-none absolute -right-24 -top-24 h-[720px] w-[720px] rounded-full blur-2xl">
        <div className="h-full w-full rounded-full" style={{ background: "radial-gradient(closest-side, rgba(201,164,92,.22), transparent 70%)" }} />
      </motion.div>

      {/* malha tech cobrindo tudo */}
      <NebulaLines />

      {/* partículas (leves) */}
      <GlowField />

      {/* Conteúdo */}
      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-12">
        {/* Esquerda */}
        <div className="lg:col-span-6">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
            className="text-4xl font-extrabold leading-tight md:text-6xl">
            Do Alto nasce a <Accent>inovação</Accent>.
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7 }}
            className="mt-5 max-w-xl text-lg text-white/80">
            Sites e LPs premium, automações com n8n/WhatsApp e agentes de IA que <span className="font-semibold text-white">vendem</span>.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7 }} className="mt-8 flex flex-wrap gap-4">
            <MagneticButton href="#servicos" variant="primary">Ver serviços <ArrowRight className="h-4 w-4" /></MagneticButton>
            <MagneticButton href="#video" variant="outline">Assistir vídeo</MagneticButton>
            <MagneticButton href="#roi" variant="outline">Simular ROI</MagneticButton>
          </motion.div>
        </div>

        {/* Direita — conteúdo tech */}
        <div className="relative lg:col-span-6 h-[520px]">
          {/* KPIs flutuantes */}
          <FloatingKPI k="Core Web Vitals" v="A+ (CWV)" pos="top-10 right-10" />
          <FloatingKPI k="TTFB médio" v="~35 ms" pos="top-40 left-6" />
          <FloatingKPI k="Leads qualificados" v="+2.1×" pos="top-[260px] right-16" />

          {/* Mini painel de código */}
          <CodePanel />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-xs flex items-center gap-2">
        <Search className="h-3.5 w-3.5"/> Pressione <kbd className="rounded border border-white/30 px-1">⌘</kbd>+<kbd className="rounded border border-white/30 px-1">K</kbd> para ações
      </div>
    </section>
  );
}

/* ------------------------------ Marquee ------------------------------ */
function TechMarquee() {
  const items = ["Next.js", "Tailwind", "Framer", "n8n", "OpenAI", "Vercel", "Shopify", "Stripe", "Firebase"];
  return (
    <section aria-label="Tecnologias" className="relative py-10">
      <div className="mx-auto max-w-6xl overflow-hidden px-6 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex animate-[scroll_28s_linear_infinite] whitespace-nowrap gap-6 text-white/70">
          {[...Array(2)].map((_, loop) => (
            <ul key={loop} className="flex items-center gap-6">
              {items.map((t) => <li key={t} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm">{t}</li>)}
            </ul>
          ))}
        </div>
      </div>
      <style>{`@keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%);} }`}</style>
    </section>
  );
}

/* ------------------------------ Clients Strip ------------------------------ */
function ClientsStrip() {
  const items = ["E-commerce", "Indústria", "Serviços", "Educação", "SaaS", "Finanças"];
  return (
    <section className="relative py-6">
      <div className="mx-auto max-w-6xl px-6 grid grid-cols-2 md:grid-cols-6 gap-3">
        {items.map((t) => <div key={t} className="rounded-xl border border-white/10 bg-white/5 py-3 text-center text-white/70">{t}</div>)}
      </div>
    </section>
  );
}

/* ------------------------------ Soluções ------------------------------ */
function Solutions() {
  const data = [
    { icon: <Cpu className="h-5 w-5" />, title: "Sites & Lps", desc: "Design Figma/Framer, Next.js, SEO e obsessão por conversão." },
    { icon: <Bot className="h-5 w-5" />, title: "Automações n8n", desc: "Orquestração com WhatsApp, CRMs, ERPs e fluxos 24/7." },
    { icon: <BarChart4 className="h-5 w-5" />, title: "Analytics", desc: "Atribuição, painéis e insights para decisões." },
    { icon: <LinkIcon className="h-5 w-5" />, title: "Integrações & APIs", desc: "HubSpot, RD, Pipe, Sheets, Mercado Pago e mais." },
  ];
  return (
    <section id="servicos" className="relative py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 flex items-center gap-3"><Pill><Zap className="h-4 w-4" /> Produtos & Soluções Altum</Pill></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {data.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur hover:bg-white/10 transition">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--gold)] ring-1 ring-[color:var(--gold)]/25 bg-[color:var(--gold)]/10">{c.icon}</div>
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-white/70 text-sm">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Diferenciais ------------------------------ */
function Features() {
  const items = [
    { icon: <Palette className="h-5 w-5" />, t: "Design Signature", d: "Estética premium inspirada em Framer + usabilidade real." },
    { icon: <Layers className="h-5 w-5" />, t: "Arquitetura Modular", d: "Páginas e módulos plugáveis para crescer sem dor." },
    { icon: <Cog className="h-5 w-5" />, t: "Automação Total", d: "n8n, WhatsApp, CRMs e agentes de IA em orquestração." },
    { icon: <Globe className="h-5 w-5" />, t: "SEO & Performance", d: "Core Web Vitals, schema, sitemaps e conteúdo certo." },
    { icon: <Trophy className="h-5 w-5" />, t: "CRO Obsessivo", d: "Copy, micro-interações e testes constantes." },
    { icon: <Shield className="h-5 w-5" />, t: "Qualidade & SLA", d: "Rotina de QA, checklists e suporte dedicado." },
  ];
  return (
    <section className="relative py-12">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="mb-6 text-3xl font-bold">Por que a Altum</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--gold)] ring-1 ring-[color:var(--gold)]/20 bg-[color:var(--gold)]/10">{f.icon}</div>
              <div className="font-semibold">{f.t}</div>
              <div className="text-sm text-white/70">{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Métricas ------------------------------ */
function Metrics() {
  const items = [ { kpi: "98%", label: "Satisfação média" }, { kpi: "120+", label: "Projetos & automações" }, { kpi: "24/7", label: "Agentes em produção" }, { kpi: "35ms", label: "TTFB médio (Next)" } ];
  return (
    <section className="relative py-14">
      <div className="mx-auto max-w-6xl px-6 grid gap-4 md:grid-cols-4">
        {items.map((m) => (
          <div key={m.label} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <div className="text-3xl font-extrabold text-white">{m.kpi}</div>
            <div className="mt-1 text-white/70 text-sm">{m.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Nossos Produtos ------------------------------ */
function Products() {
  const items = [
    { t: "LP Turbo", d: "Landing pages ultra rápidas com CRO e SEO.", bul: ["Hero cinematográfico", "Seções ricas", "Testes A/B"] },
    { t: "Agente de IA", d: "Vendas 24/7 integrado ao WhatsApp.", bul: ["Qualificação automática", "Propostas", "Follow-up"] },
    { t: "Automações n8n", d: "Fluxos entre WhatsApp, CRM, ERP, e-commerce.", bul: ["Disparos transacionais", "Webhooks", "Relatórios"] },
    { t: "Analytics+", d: "Medição confiável e painéis executivos.", bul: ["ETL leve", "Data Studio", "Atribuição"] },
  ];
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="mb-8 text-3xl font-bold">Nossos Produtos</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {items.map((p, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition">
              <div className="mb-2 text-lg font-semibold">{p.t}</div>
              <div className="text-sm text-white/70">{p.d}</div>
              <ul className="mt-3 space-y-2 text-sm text-white/80">
                {p.bul.map((b) => <li key={b} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[color:var(--gold)]" /> {b}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Processo (resumo rápido) ------------------------------ */
function Process() {
  const steps = [
    { icon:<Sparkles className="h-5 w-5"/>, title:"Diagnóstico", desc:"Metas, restrições e mapa do valor."},
    { icon:<Star className="h-5 w-5"/>, title:"Design", desc:"UX/UI premium, copy e arquitetura."},
    { icon:<Rocket className="h-5 w-5"/>, title:"Dev & Integrações", desc:"Next.js, APIs e automações."},
    { icon:<Shield className="h-5 w-5"/>, title:"Lançamento & Escala", desc:"SEO, testes, otimizações e novos módulos."},
  ];
  return (
    <section id="processo" className="relative py-16">
      <div className="mx-auto max-w-6xl px-6 grid gap-6 md:grid-cols-4">
        {steps.map((s,i)=>(
          <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">{s.icon}</div>
            <div className="font-semibold">{s.title}</div>
            <div className="text-sm text-white/70">{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Case Scroller (pinned) ------------------------------ */
function CaseScroller() {
  const steps = [
    { t: "Diagnóstico rápido", d: "Mapeamos gargalos e oportunidades em 72h.", k: "+38% conversão" },
    { t: "Hero que explica em 5s", d: "Story + visual tech com CTA claro.", k: "-27% bounce" },
    { t: "Automação WhatsApp", d: "Leads respondidos em 30s, 24/7.", k: "+2.1× MQL" },
    { t: "Analytics confiável", d: "Painéis e atribuição que guiam decisões.", k: "+19% ROAS" },
  ];
  return (
    <section id="cases" className="relative py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="mb-10 text-3xl font-bold">Como transformamos um case</h2>
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="sticky top-24 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="aspect-[16/10] rounded-xl bg-[linear-gradient(135deg,#0F1D34,#0C1524_50%,#132544)] ring-1 ring-white/10 grid place-items-center">
              <Wand2 className="h-10 w-10 text-[color:var(--gold)]"/>
            </div>
          </div>
          <div className="space-y-6">
            {steps.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-20% 0px -20% 0px" }} transition={{ delay: i * 0.06 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{s.t}</div>
                  <span className="text-sm text-[color:var(--gold)] font-medium">{s.k}</span>
                </div>
                <div className="text-sm text-white/70">{s.d}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Before/After ------------------------------ */
function BeforeAfter() {
  const [v, setV] = useState(50);
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Antes e Depois (demo visual)</h2>
          <div className="text-sm text-white/60 flex items-center gap-2"><MousePointer2 className="h-4 w-4"/> Arraste para comparar</div>
        </div>
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="absolute inset-0 grid place-items-center text-white/60">Antes</div>
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${v}%` }}>
            <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#0F1D34,#0C1524_50%,#132544)] text-white/80">Depois (Altum)</div>
          </div>
          <input aria-label="Slider antes/depois" type="range" min={0} max={100} value={v} onChange={(e) => setV(parseInt(e.target.value))}
                 className="absolute bottom-4 left-1/2 -translate-x-1/2 w-1/2 accent-[color:var(--gold)]" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Vídeo (abas) ------------------------------ */
function VideoSection() {
  const TABS = [ { k: "manifesto", label: "Manifesto", url: "" }, { k: "demo", label: "Demonstração", url: "" }, { k: "clientes", label: "Clientes", url: "" } ];
  const [tab, setTab] = useState(TABS[0].k); const current = TABS.find((t) => t.k === tab)!;
  return (
    <section id="video" className="relative py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Vídeo — O que é a Altum</h2>
          <div className="hidden md:flex items-center gap-2 text-sm text-white/60"><Video className="h-4 w-4"/> Cole a URL do seu vídeo no componente.</div>
        </div>
        <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={cx("px-4 py-2 rounded-full text-sm", tab === t.k ? "bg-[color:var(--gold)] text-[color:var(--blue-900)]" : "text-white/80 hover:bg-white/10")}>{t.label}</button>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          {current.url ? (
            <div className="aspect-video w-full overflow-hidden rounded-xl"><iframe className="h-full w-full" src={current.url} allow="autoplay; encrypted-media" allowFullScreen /></div>
          ) : (
            <div className="aspect-video w-full rounded-xl bg-[linear-gradient(135deg,#0F1D34,#0C1524_50%,#132544)] ring-1 ring-white/10 grid place-items-center text-white/70">
              <div className="text-center"><PlayCircle className="mx-auto mb-2 h-10 w-10 text-[color:var(--gold)]" /><div>Vídeo aqui em breve.</div><div className="text-xs text-white/60">Suporta YouTube/Vimeo (iframe) ou MP4 público.</div></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Agent Demo (micro-chat) ------------------------------ */
function AgentDemo() {
  const [msgs, setMsgs] = useState<{ from: "user" | "agent"; text: string }[]>([
    { from: "user", text: "Oi! Preciso de um site que converta mais." },
  ]);
  useEffect(() => {
    const timeouts: any[] = [];
    timeouts.push(setTimeout(() => setMsgs((m) => [...m, { from: "agent", text: "Sou o Agente Altum. Posso te ajudar agora mesmo 🚀" }]), 800));
    timeouts.push(setTimeout(() => setMsgs((m) => [...m, { from: "agent", text: "Qual seu segmento e meta para os próximos 30 dias?" }]), 1800));
    timeouts.push(setTimeout(() => setMsgs((m) => [...m, { from: "user", text: "E-commerce de moda. Quero dobrar o ROAS." }]), 3000));
    timeouts.push(setTimeout(() => setMsgs((m) => [...m, { from: "agent", text: "Perfeito. Montarei um plano com LP Turbo + automação WhatsApp + Analytics+" }]), 4200));
    return () => timeouts.forEach(clearTimeout);
  }, []);
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="mb-4 text-3xl font-bold">Como o Agente Altum conversa</h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={cx("max-w-[90%] rounded-xl px-3 py-2", m.from === "agent" ? "bg-[color:var(--gold)]/15 text-white" : "bg-white/10 text-white/90 ml-auto")}>{m.text}</div>
            ))}
          </div>
          <div className="mt-3 text-xs text-white/60 flex items-center gap-2"><Timer className="h-3.5 w-3.5"/> *Demonstração simulada — na entrega real conectamos com WhatsApp/CRM.*</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ ROI Simulator ------------------------------ */
function ROISimulator() {
  const [trafego, setT] = useState(5000);
  const [conv, setC] = useState(2.0);
  const [ticket, setTk] = useState(250);
  const uplift = 0.35;

  const baseLeads = useMemo(() => trafego * (conv / 100), [trafego, conv]);
  const baseReceita = useMemo(() => baseLeads * ticket, [baseLeads, ticket]);
  const altumReceita = useMemo(() => baseReceita * (1 + uplift), [baseReceita]);
  const ganho = altumReceita - baseReceita;

  return (
    <section id="roi" className="relative py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Simulador de ROI</h2>
          <div className="text-sm text-white/60 flex items-center gap-2"><Percent className="h-4 w-4"/> Estime ganhos com Altum</div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <label className="text-sm text-white/70">Tráfego mensal (visitas)</label>
            <input type="range" min={1000} max={100000} step={500} value={trafego} onChange={(e) => setT(parseInt(e.target.value))} className="w-full accent-[color:var(--gold)]" />
            <div className="text-white/80">{trafego.toLocaleString()} visitas</div>
            <label className="mt-4 block text-sm text-white/70">Taxa de conversão (%)</label>
            <input type="range" min={0.2} max={10} step={0.1} value={conv} onChange={(e) => setC(parseFloat(e.target.value))} className="w-full accent-[color:var(--gold)]" />
            <div className="text-white/80">{conv.toFixed(1)}%</div>
            <label className="mt-4 block text-sm text-white/70">Ticket médio (R$)</label>
            <input type="range" min={50} max={3000} step={10} value={ticket} onChange={(e) => setTk(parseInt(e.target.value))} className="w-full accent-[color:var(--gold)]" />
            <div className="text-white/80">R$ {ticket.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-xl border border-white/10 p-4">
                <div className="text-sm text-white/60">Receita atual/mês</div>
                <div className="mt-1 text-2xl font-extrabold">R$ {Math.round(baseReceita).toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-white/10 p-4">
                <div className="text-sm text-white/60">com Altum (+35%)</div>
                <div className="mt-1 text-2xl font-extrabold text-[color:var(--gold)]">R$ {Math.round(altumReceita).toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 p-4 text-center">
              <div className="text-sm text-white/60">Ganho estimado/mês</div>
              <div className="mt-1 text-3xl font-extrabold">R$ {Math.round(ganho).toLocaleString()}</div>
              <a href="#contato" className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110">
                <Rocket className="h-4 w-4"/> Quero esse aumento
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================== CASES SHOWCASE PRO =========================== */
/* ---------- Tipos ---------- */
type CaseItem = {
  slug: string;
  title: string;
  url: string;
  domain: string;
  imgJpg: string;         // ex: /cases/pedraum-1600.jpg
  imgWebp?: string;       // ex: /cases/pedraum-1600.webp (opcional)
  imgSrcSet?: string;     // "…-800.jpg 800w, …-1600.jpg 1600w"
  imgSrcSetWebp?: string; // "…-800.webp 800w, …-1600.webp 1600w"
  logo?: string;          // /cases/pedraum-logo.svg (opcional)
  tags: string[];
  kpi: string;
  bullets: string[];
};

/* ---------- Card Prime com Parallax + Tilt 3D ---------- */
function CaseCardPrime({ item }: { item: CaseItem }) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Tilt 3D
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 150, damping: 12 });
  const sy = useSpring(ry, { stiffness: 150, damping: 12 });

  const onMove = (e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rx.set(py * -8); // rotação X
    ry.set(px * 10); // rotação Y
  };
  const onLeave = () => { rx.set(0); ry.set(0); };

  return (
    <motion.article
      ref={cardRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: sx, rotateY: sy, transformStyle: "preserve-3d" }}
      className="
        group relative overflow-hidden rounded-[28px]
        bg-[#0B1220]/70 backdrop-blur-md
        shadow-[0_12px_36px_rgba(0,0,0,.45)]
        transition-transform duration-300 will-change-transform
        border border-transparent
      "
    >
      {/* Borda gradiente ouro */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[28px]"
        style={{
          padding: 1,
          background:
            "linear-gradient(140deg, rgba(201,164,92,.5), rgba(201,164,92,.12) 35%, rgba(255,255,255,.08) 55%, rgba(201,164,92,.28))",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />

      {/* BACKGROUND: imagem real + máscara + noise + parallax leve */}
      <div className="absolute inset-0 -z-10 will-change-transform">
        <motion.div
          className="absolute inset-0"
          style={{ translateZ: 0 }}
          animate={{ scale: 1.02 }}
          transition={{ ease: "easeOut", duration: 0.6 }}
        >
          <picture>
            {item.imgSrcSetWebp && (
              <source srcSet={item.imgSrcSetWebp} type="image/webp" />
            )}
            {item.imgSrcSet && (
              <source srcSet={item.imgSrcSet} type="image/jpeg" />
            )}
            <img
              src={item.imgJpg}
              alt={item.title}
              className="
                h-full w-full object-cover
                [filter:contrast(1.06)_saturate(1.02)]
                opacity-85 transition-all duration-700
                group-hover:opacity-95
              "
              loading="lazy"
              decoding="async"
            />
          </picture>

          {/* máscara: topo nítido → base escura p/ legibilidade */}
          <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_0%,black_45%,rgba(0,0,0,.85)_70%,transparent_100%)]">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#0B1220_5%,#0B1220c0_55%,#0B1220f2_100%)]" />
            {/* brilho ouro */}
            <div
              className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-2xl opacity-25 group-hover:opacity-35 transition-opacity"
              style={{ background: "radial-gradient(closest-side, rgba(201,164,92,.4), rgba(201,164,92,0) 70%)" }}
            />
          </div>

          {/* noise sutil */}
          <div
            className="absolute inset-0 opacity-[.06] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0.9'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            }}
          />
        </motion.div>
      </div>

      {/* CONTEÚDO */}
      <div className="relative p-5 md:p-6 lg:p-7">
        {/* top row */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {item.logo ? (
              <img
                src={item.logo}
                alt=""
                className="h-7 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,.45)]"
                loading="lazy"
              />
            ) : (
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] text-white/85">
                Live
              </span>
            )}
            <span className="hidden sm:inline rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] text-white/70 backdrop-blur">
              {item.domain}
            </span>
          </div>

          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-[color:var(--gold)] bg-[color:var(--gold)]/12 ring-1 ring-[color:var(--gold)]/30">
            {item.kpi}
          </span>
        </div>

        {/* title + tags */}
        <div className="space-y-2">
          <h3 className="text-[20px] md:text-[22px] font-semibold leading-snug text-white">
            {item.title}
          </h3>
          <div className="flex flex-wrap gap-2">
            {item.tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-2.5 py-1 text-[11px] text-white/90 bg-white/10 border border-white/15"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* bullets + CTAs */}
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-white/92">
            {item.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-sm bg-[color:var(--gold)] text-[#0B1220] hover:brightness-110 shadow-[0_10px_24px_rgba(201,164,92,.28)]"
            >
              Visitar site <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#contato"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white border border-white/16 bg-white/6 hover:bg-white/10"
            >
              Quero um projeto assim
            </a>
          </div>
        </div>
      </div>

      {/* reduce motion: desativa tilt */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          article[style] { transform: none !important; }
        }
      `}</style>
    </motion.article>
  );
}

/* ---------- Carousel Pro (1 mobile / 2 desktop) + autoplay + dots ---------- */
export function CasesShowcasePro() {
  const items: CaseItem[] = [
    {
      slug: "pedraum",
      title: "Pedraum — Marketplace B2B de Britagem",
      url: "https://pedraum.com.br",
      domain: "pedraum.com.br",
      imgJpg: "/cases/pedraum-1600.jpg",
      imgWebp: "/cases/pedraum-1600.webp",
      imgSrcSet: "/cases/pedraum-800.jpg 800w, /cases/pedraum-1600.jpg 1600w",
      imgSrcSetWebp: "/cases/pedraum-800.webp 800w, /cases/pedraum-1600.webp 1600w",
      logo: "/cases/pedraum-logo.svg",
      tags: ["Marketplace", "Next.js", "Firestore", "CRO"],
      kpi: "+34% ofertas aceitas",
      bullets: [
        "Objetivo: aumentar conversão e velocidade de resposta.",
        "Entrega: LP/UX premium + integrações WhatsApp/CRM.",
        "Resultado: +34% ofertas aceitas em 30–60 dias.",
      ],
    },
    {
      slug: "clube-farm",
      title: "Clube Farm — E-commerce Coleção Fazenda",
      url: "https://clubefarm.com.br",
      domain: "clubefarm.com.br",
      imgJpg: "/cases/clubefarm-1600.jpg",
      imgWebp: "/cases/clubefarm-1600.webp",
      imgSrcSet: "/cases/clubefarm-800.jpg 800w, /cases/clubefarm-1600.jpg 1600w",
      imgSrcSetWebp: "/cases/clubefarm-800.webp 800w, /cases/clubefarm-1600.webp 1600w",
      logo: "/cases/clubefarm-logo.svg",
      tags: ["Shopify", "LP de Lançamento", "Analytics", "WhatsApp"],
      kpi: "ROAS 6x no drop",
      bullets: [
        "Objetivo: maximizar conversão no lançamento sazonal.",
        "Entrega: LP/UX premium + WhatsApp transacional + métricas.",
        "Resultado: ROAS 6x sem queda no pico.",
      ],
    },
    // adicione mais cases aqui
  ];

  const isCarousel = items.length >= 3;
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0); // índice do primeiro card visível
  const [isHover, setIsHover] = useState(false);

  // configurações
  const gapPx = 24; // gap-6
  const cardsPerView = 2; // desktop
  const step = 1; // avança 1 card por vez

  // autoplay (pausa no hover e quando fora de viewport)
  useEffect(() => {
    if (!trackRef.current) return;
    let id: any;
    const el = trackRef.current;

    const play = () => {
      id = setInterval(() => {
        if (isHover) return;
        const total = items.length;
        setIndex((i) => (i + step) % total);
      }, 4500);
    };

    // pause when not visible
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) { clearInterval(id); }
        else { clearInterval(id); play(); }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    play();

    return () => { clearInterval(id); obs.disconnect(); };
  }, [isHover, items.length]);

  // scroll efeito
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card-width]");
    const cardW = card ? card.offsetWidth : 560;
    el.scrollTo({ left: (cardW + gapPx) * index, behavior: "smooth" });
  }, [index]);

  const scrollBy = (dir: "left" | "right") => {
    const total = items.length;
    setIndex((i) =>
      dir === "left" ? (i - step + total) % total : (i + step) % total
    );
  };

  return (
    <section id="cases" className="relative py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Cases Reais</h2>
          <p className="text-sm text-white/60">Projetos em produção — desempenho e escala.</p>
        </div>

        {/* <=2: grid lado a lado */}
        {!isCarousel ? (
          <div className="grid gap-6 md:grid-cols-2">
            {items.map((it) => <CaseCardPrime key={it.slug} item={it} />)}
          </div>
        ) : (
          <div
            className="relative"
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
          >
            {/* setas desktop */}
            <button
              aria-label="Anterior"
              onClick={() => scrollBy("left")}
              className="absolute -left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-white/15 bg-white/10 p-2 backdrop-blur hover:bg-white/20 md:inline-flex"
            >
              ‹
            </button>
            <button
              aria-label="Próximo"
              onClick={() => scrollBy("right")}
              className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-white/15 bg-white/10 p-2 backdrop-blur hover:bg-white/20 md:inline-flex"
            >
              ›
            </button>

            {/* gradientes laterais */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#0B1220] to-transparent md:block" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0B1220] to-transparent md:block" />

            {/* faixa rolável */}
            <div
              ref={trackRef}
              className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ scrollBehavior: "smooth" }}
            >
              <style>{`.snap-mandatory::-webkit-scrollbar{display:none}`}</style>

              {items.map((it, i) => (
                <div key={it.slug} className="snap-start" style={{ flex: "0 0 auto" }}>
                  {/* 1 por tela no mobile; 2 no desktop */}
                  <div
                    data-card-width
                    className="w-[92vw] min-w-[92vw] md:w-[calc((100vw-5rem)/2)] md:min-w-[calc((100vw-5rem)/2)] lg:w-[560px] lg:min-w-[560px]"
                  >
                    <CaseCardPrime item={it} />
                  </div>
                </div>
              ))}
            </div>

            {/* dots */}
            <div className="mt-4 flex justify-center gap-2">
              {items.map((_, i) => {
                const active = i === index % items.length;
                return (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    className={`h-2.5 rounded-full transition-all ${active ? "w-6 bg-[color:var(--gold)]" : "w-2.5 bg-white/25"}`}
                    aria-label={`Ir para slide ${i + 1}`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}


function Testimonials() {
  const items = [ { q: "A Altum triplicou nosso ritmo de testes e o ROAS subiu junto.", a: "Marina — E-commerce" }, { q: "O agente de IA fecha orçamentos enquanto dormimos.", a: "Rafael — Serviços" }, { q: "Integrações e métricas que mostram o que importa.", a: "Daniel — SaaS" } ];
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-6xl px-6"><h2 className="mb-6 text-3xl font-bold">O que falam da Altum</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((t, i) => (
            <motion.blockquote key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-white/90">“{t.q}”</p>
              <footer className="mt-3 text-sm text-white/60">— {t.a}</footer>
            </motion.blockquote>
          ))}
        </div></div>
    </section>
  );
}

function Pricing() {
  const tiers = [ { name: "Essencial", price: "R$ 2.900", popular: false, perks: ["LP premium", "Integrações básicas", "Entrega em 7–10 dias"] }, { name: "Growth", price: "R$ 5.900", popular: true, perks: ["Site completo", "n8n + WhatsApp", "Métricas e SEO"] }, { name: "Scale", price: "Sob consulta", popular: false, perks: ["Agentes de IA", "Integrações avançadas", "SLA dedicado"] } ];
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-6xl px-6"><h2 className="mb-8 text-3xl font-bold">Planos e formatos</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.name} className={cx("rounded-2xl border p-6 backdrop-blur", t.popular? "border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10" : "border-white/10 bg-white/5") }>
              <div className="mb-1 text-sm uppercase tracking-wide text-white/60">{t.popular ? "Mais vendido" : " "}</div>
              <div className="text-xl font-semibold">{t.name}</div>
              <div className="mt-2 text-3xl font-extrabold">{t.price}</div>
              <ul className="mt-4 space-y-2 text-white/80">{t.perks.map(p=> <li key={p} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[color:var(--gold)]"/> {p}</li>)}</ul>
              <a href="#contato" className={cx("mt-6 inline-flex w-full items-center justify-center rounded-full px-5 py-3 font-semibold", t.popular? "bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110" : "border border-white/20 hover:bg-white/10")}>Quero esse</a>
            </div>
          ))}
        </div></div>
    </section>
  );
}

function Insights() {
  const posts = [ { t: "Checklist de uma LP que converte", k: "CRO", read: "6 min" }, { t: "Automação com n8n: 5 ideias práticas", k: "n8n", read: "7 min" }, { t: "Analytics confiável sem complicar", k: "Métricas", read: "5 min" } ];
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-6xl px-6"><h2 className="mb-6 text-3xl font-bold">Insights</h2>
        <div className="grid gap-6 md:grid-cols-3">{posts.map((p, i) => <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5"><div className="text-xs text-white/60">{p.k} • {p.read}</div><div className="mt-2 font-semibold">{p.t}</div><p className="mt-1 text-sm text-white/70">Práticas que usamos nas entregas reais da Altum.</p></div>)}</div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [ { q: "Vocês também hospedam e mantêm?", a: "Podemos hospedar na Vercel e configurar pipelines. Manutenção sob demanda." }, { q: "Quanto tempo para lançar?", a: "De 7 a 21 dias, dependendo do escopo e integrações." }, { q: "Integram com meu CRM/ERP?", a: "Sim. HubSpot, RD, Pipe, Sheets, Mercado Pago e APIs custom." }, { q: "Posso começar pequeno e escalar?", a: "Sim — arquitetura modular." } ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-4xl px-6"><h2 className="mb-6 text-center text-3xl font-bold">Perguntas frequentes</h2>
        <div className="space-y-3">{faqs.map((f,i)=> (
          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <button onClick={()=> setOpen(open===i? null : i)} className="flex w-full items-center justify-between px-4 py-3 text-left font-medium">{f.q}<span className="text-white/50">{open===i? "–" : "+"}</span></button>
            <div className={cx("grid transition-all duration-300", open===i? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0") }>
              <div className="overflow-hidden px-4 pb-4 text-white/70">{f.a}</div>
            </div>
          </div>))}
        </div></div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contato" className="relative py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Vamos decolar seu projeto?</h2>
            <p className="mt-3 text-white/80">Receba um diagnóstico rápido e um plano claro de execução.</p>
            <div className="mt-6 space-y-3 text-white/80">
              <div className="flex items-center gap-3"><MessageCircle className="h-5 w-5 text-[color:var(--gold)]"/> WhatsApp: <a className="underline/50 hover:underline" href="#">(00) 00000-0000</a></div>
              <div className="flex items-center gap-3"><Mail className="h-5 w-5 text-[color:var(--gold)]"/> E-mail: <a className="underline/50 hover:underline" href="#">contato@altum.ag</a></div>
              <div className="flex items-center gap-3"><Phone className="h-5 w-5 text-[color:var(--gold)]"/> Ligação: <a className="underline/50 hover:underline" href="#">(00) 0000-0000</a></div>
            </div>
          </div>
          <form className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="text-sm text-white/70">Nome</label><input className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none placeholder:text-white/40" placeholder="Seu nome"/></div>
              <div><label className="text-sm text-white/70">E-mail</label><input type="email" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none placeholder:text-white/40" placeholder="voce@exemplo.com"/></div>
              <div className="md:col-span-2"><label className="text-sm text-white/70">Mensagem</label><textarea rows={4} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none placeholder:text-white/40" placeholder="Conte um pouco do seu objetivo"/></div>
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110"><Rocket className="h-4 w-4"/> Enviar</button>
          </form>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#0F1D34,#0C1524_50%,#132544)] p-8 text-center">
          <h3 className="text-2xl font-bold">Pronto para subir de nível?</h3>
          <p className="mt-2 text-white/70">Montamos um plano em 48h com prazos, custos e caminhos de crescimento.</p>
          <a href="#contato" className="mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110"><Rocket className="h-4 w-4"/> Começar agora</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-white/5 py-10">
      <div className="flex items-center gap-2 md:gap-3">
  <img src="/logo-altum.svg" alt="Símbolo Altum" className="h-6 w-auto md:h-7" />
  <span className="font-bold tracking-wide">ALTUM</span>
</div>
  
        <div className="text-white/60 text-sm">© {new Date().getFullYear()} Altum — Do Alto nasce a inovação.</div>
     
    </footer>
  );
}

function StickyBar() {
  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
        <span className="hidden text-sm text-white/80 md:inline">Fale com um especialista Altum</span>
        <a href="#contato" className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold bg-[color:var(--gold)] text-[color:var(--blue-900)] hover:brightness-110"><MessageCircle className="h-4 w-4"/> Iniciar conversa</a>
      </div>
    </div>
  );
}

/* ------------------------------ Command Palette ------------------------------ */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actions = [
    { k: "servicos", label: "Ir para Serviços", href: "#servicos" },
    { k: "processo", label: "Ir para Processo", href: "#processo" },
    { k: "cases", label: "Ir para Cases", href: "#cases" },
    { k: "video", label: "Abrir Vídeo", href: "#video" },
    { k: "roi", label: "Simular ROI", href: "#roi" },
    { k: "contato", label: "Falar com a Altum", href: "#contato" },
  ];
  const [q, setQ] = useState("");
  const results = useMemo(() => actions.filter(a => a.label.toLowerCase().includes(q.toLowerCase())), [q]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto mt-28 w-full max-w-xl px-6" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-white/10 bg-[color:var(--blue-900)] p-3 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <Search className="h-4 w-4 text-white/60"/>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque ações ou seções (ex: vídeo, ROI, contato)" className="w-full bg-transparent outline-none placeholder:text-white/40"/>
            <button onClick={onClose} className="rounded-md p-1 text-white/60 hover:bg-white/10"><X className="h-4 w-4"/></button>
          </div>
          <ul className="max-h-60 overflow-auto py-2">
            {results.length ? results.map((a) => (
              <li key={a.k}>
                <a href={a.href} onClick={onClose} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-white/10">
                  <span>{a.label}</span>
                  <ArrowRight className="h-4 w-4 text-white/50"/>
                </a>
              </li>
            )) : <li className="px-3 py-2 text-white/60">Nada encontrado…</li>}
          </ul>
          <div className="border-t border-white/10 pt-2 text-xs text-white/50">Dica: pressione <kbd className="rounded border border-white/30 px-1">⌘</kbd>+<kbd className="rounded border border-white/30 px-1">K</kbd> para abrir rapidamente.</div>
        </div>
      </div>
    </div>
  );
}
