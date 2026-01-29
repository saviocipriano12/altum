// CAMINHO: /app/page.tsx
// ALTUM — Homepage Oficial (v16 - CDN FIX)
// Solução Definitiva: Usa script global para evitar erros de exportação do Next.js

"use client";

import React, { useEffect, useState } from "react";
import { 
  motion, 
  useScroll, 
  useTransform, 
  useSpring, 
  useMotionValue, 
  useMotionTemplate, 
  AnimatePresence 
} from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Filter,
  LayoutTemplate,
  Mail,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  X,
  Zap,
  Play,
  TrendingUp,
  Cpu,
  Layers,
  Globe,
  Settings,
  Rocket
} from "lucide-react";

// Importamos apenas o componente visual, sem a biblioteca quebrada
import TypebotBubble from "@/components/TypebotBubble";

/* ========================= LINKS E CONFIG ========================= */
const LINKS = {
  whatsapp: "https://wa.me/5531972545430?text=Ola%20Savio,%20quero%20uma%20analise%20do%20Metodo%20Altum.",
  email: "mailto:contato@altum.ag",
};

/* ========================= COMPONENTES VISUAIS (ATOMS) ========================= */

const cx = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

// Efeito de Ruído (Noise)
const NoiseOverlay = () => (
  <div 
    className="pointer-events-none absolute inset-0 z-0 opacity-[0.03] mix-blend-overlay"
    style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
  />
);

// Grade de Engenharia (Grid Background)
const GridPattern = () => (
  <div className="absolute inset-0 z-0 pointer-events-none" 
    style={{ 
      backgroundImage: "linear-gradient(to right, #151419 1px, transparent 1px), linear-gradient(to bottom, #151419 1px, transparent 1px)",
      backgroundSize: "60px 60px",
      opacity: 0.03
    }} 
  />
);

// Botão Premium (Atualizado com onClick)
function Button({
  href,
  children,
  variant = "primary",
  className,
  icon: Icon,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "dark";
  className?: string;
  icon?: any;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cx(
        "group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full px-8 py-4 font-bold transition-all duration-300 active:scale-95 cursor-pointer",
        variant === "primary" && "bg-[#F56E0F] text-white shadow-[0_0_40px_-10px_#F56E0F] hover:shadow-[0_0_60px_-10px_#F56E0F] border border-white/10",
        variant === "dark" && "bg-[#151419] text-white hover:bg-black border border-white/10 shadow-xl",
        variant === "outline" && "border border-[#151419]/10 text-[#151419] hover:bg-[#151419]/5 bg-white/50 backdrop-blur-sm",
        className
      )}
    >
      {variant === "primary" && (
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {Icon && <Icon size={18} />}
        {children}
      </span>
      {variant !== "ghost" && (
        <ArrowRight size={16} className="relative z-10 transition-transform group-hover:translate-x-1" />
      )}
    </a>
  );
}

// Card Bento Grid com Spotlight
function SpotlightCard({ children, className = "", noBorder = false }: { children: React.ReactNode; className?: string; noBorder?: boolean }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      className={cx(
        "group relative overflow-hidden bg-[#1B1B1E] rounded-[2rem]",
        !noBorder && "border border-white/5",
        className
      )}
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-[2rem] opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              600px circle at ${mouseX}px ${mouseY}px,
              rgba(245, 110, 15, 0.10),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative h-full z-10">{children}</div>
    </div>
  );
}

/* ========================= HEADER ========================= */
function Header({ onOpenBot }: { onOpenBot: (e: React.MouseEvent) => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={cx("fixed top-0 inset-x-0 z-50 transition-all duration-500", isScrolled ? "py-4" : "py-6")}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className={cx(
          "flex items-center justify-between rounded-full px-6 py-3 transition-all duration-500 border",
          isScrolled 
            ? "bg-white/80 border-[#151419]/5 backdrop-blur-xl shadow-2xl shadow-black/5" 
            : "bg-transparent border-transparent"
        )}>
          {/* Logo com Imagem */}
          <a href="#" className="flex items-center gap-3 group">
            <img src="/logo-a.png" alt="Altum Logo" className="h-10 w-auto" />
            <span className="text-xl font-bold tracking-tight text-[#151419]">ALTUM</span>
          </a>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {[
              ["O Método", "#como-funciona"],
              ["Ecossistema", "#ecossistema"],
              ["Cases", "#portfolio"],
              ["Sobre", "#sobre"]
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-sm font-semibold text-[#151419]/70 hover:text-[#F56E0F] transition-colors">
                {label}
              </a>
            ))}
          </nav>

          {/* CTA Desktop */}
          <div className="hidden md:flex items-center gap-4">
            <Button href="#" variant="dark" className="h-10 px-6 py-0 text-sm" onClick={onOpenBot}>
              Análise de Viabilidade
            </Button>
          </div>

          <button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      
      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-24 left-4 right-4 z-50 rounded-3xl bg-[#151419] p-6 shadow-2xl origin-top"
          >
            <nav className="flex flex-col gap-4 text-white">
              {[
                ["O Método", "#como-funciona"],
                ["Ecossistema", "#ecossistema"],
                ["Cases", "#portfolio"],
                ["Sobre", "#sobre"]
              ].map(([label, href]) => (
                <a key={label} href={href} onClick={() => setMobileMenu(false)} className="text-xl font-bold p-2 hover:text-[#F56E0F]">
                  {label}
                </a>
              ))}
              <div className="h-px bg-white/10 my-2" />
              <Button href="#" variant="primary" className="w-full" onClick={(e) => { setMobileMenu(false); onOpenBot(e); }}>Iniciar Análise</Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ========================= HERO ========================= */
function Hero({ onOpenBot }: { onOpenBot: (e: React.MouseEvent) => void }) {
  return (
    <section className="relative min-h-[90vh] w-full flex items-center justify-center overflow-hidden bg-[#FBFBFB] pt-32 pb-20">
      <GridPattern />
      
      <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-[#F56E0F]/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#151419]/5 rounded-full blur-[100px]" />

      <div className="container relative z-10 px-6 mx-auto grid lg:grid-cols-12 gap-16 items-center">
        <div className="lg:col-span-7 space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full bg-white border border-[#151419]/10 px-4 py-1.5 shadow-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F56E0F] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F56E0F]"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#151419]">Engenharia de Vendas High-Ticket</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight text-[#151419] leading-[1.05]"
          >
            Instalamos a máquina que <span className="text-[#F56E0F]">filtra curiosos</span> e agenda reuniões.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-[#151419]/70 leading-relaxed max-w-2xl"
          >
            O <strong>Método ALTUM</strong> usa Inteligência Artificial para atrair, qualificar e agendar apenas quem tem orçamento aprovado. Pare de vender para quem não pode pagar.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-4 pt-4"
          >
            <Button href="#" variant="primary" icon={Bot} onClick={onOpenBot}>
              Verificar Viabilidade
            </Button>
            <Button href="#como-funciona" variant="outline" icon={Layers}>
              Ver o Ecossistema
            </Button>
          </motion.div>

          <div className="pt-10 flex gap-10 border-t border-black/5">
              <div>
                <div className="text-3xl font-black text-[#151419]">120k+</div>
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Ticket Alvo</div>
              </div>
              <div>
                <div className="text-3xl font-black text-[#151419]">24/7</div>
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Operação IA</div>
              </div>
          </div>
        </div>

        <div className="lg:col-span-5 relative">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring" }}
            className="relative z-10 bg-white rounded-3xl p-6 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] border border-black/5 rotate-1 hover:rotate-0 transition-transform duration-700"
          >
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <div className="flex gap-2">
                   <div className="w-3 h-3 rounded-full bg-red-400"/>
                   <div className="w-3 h-3 rounded-full bg-yellow-400"/>
                   <div className="w-3 h-3 rounded-full bg-green-400"/>
                </div>
                <div className="text-xs font-mono text-gray-400 uppercase">altum_filter_v3.exe</div>
              </div>

              <div className="space-y-4 font-mono text-sm">
                <div className="flex gap-3">
                   <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">👤</div>
                   <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none max-w-[85%] text-gray-600">
                      Tenho interesse. Qual o valor do investimento?
                   </div>
                </div>
                <div className="flex gap-3 flex-row-reverse">
                   <div className="w-8 h-8 rounded-full bg-[#151419] flex items-center justify-center text-[#F56E0F]"><Bot size={14}/></div>
                   <div className="bg-[#151419] text-white p-3 rounded-2xl rounded-tr-none max-w-[90%] shadow-lg">
                      Nossos projetos iniciam em R$ 5.000,00. Esse valor faz sentido para o momento da sua empresa?
                   </div>
                </div>
                <div className="flex gap-3">
                   <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">👤</div>
                   <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none max-w-[85%] text-gray-600">
                      Sim, tenho verba aprovada para marketing.
                   </div>
                </div>
                <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 1 }}
                   className="flex gap-3 flex-row-reverse"
                >
                   <div className="w-8 h-8 rounded-full bg-[#151419] flex items-center justify-center text-[#F56E0F]"><Bot size={14}/></div>
                   <div className="bg-[#F56E0F]/10 border border-[#F56E0F]/20 text-[#F56E0F] p-3 rounded-2xl rounded-tr-none max-w-[90%] flex items-center gap-2">
                      <CheckCircle2 size={16} /> Lead Qualificado. Agendando reunião...
                   </div>
                </motion.div>
              </div>

              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute -right-8 bottom-10 bg-[#151419] text-white p-4 rounded-2xl shadow-xl flex items-center gap-3"
              >
                <div className="bg-[#F56E0F] p-2 rounded-lg"><Zap size={20} className="text-white"/></div>
                <div>
                   <div className="text-xs text-gray-400">Tempo de Resposta</div>
                   <div className="font-bold">Imediato</div>
                </div>
              </motion.div>
          </motion.div>
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-[#F56E0F]/20 to-purple-500/10 blur-3xl -z-10 rounded-full" />
        </div>
      </div>
    </section>
  );
}

/* ========================= MARQUEE ANIMADO (Framer Motion) ========================= */
function Marquee() {
  return (
    <div className="bg-[#151419] py-6 overflow-hidden relative border-t border-b border-white/5">
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-r from-[#151419] via-transparent to-[#151419]" />
      
      {/* Container que move */}
      <motion.div 
        className="flex gap-16 whitespace-nowrap items-center w-max"
        animate={{ x: "-50%" }}
        transition={{ repeat: Infinity, duration: 95, ease: "linear" }}
      >
         {/* Duplicamos o conteúdo para o efeito infinito suave */}
         {[...Array(20)].map((_, i) => (
            <div key={i} className="flex items-center gap-16">
               <span className="text-sm font-bold text-white/50 uppercase tracking-[0.3em] font-mono">Alta Performance</span>
               <span className="w-1.5 h-1.5 rounded-full bg-[#F56E0F]" />
               <span className="text-sm font-bold text-white/50 uppercase tracking-[0.3em] font-mono">Previsibilidade</span>
               <span className="w-1.5 h-1.5 rounded-full bg-[#F56E0F]" />
               <span className="text-sm font-bold text-white/50 uppercase tracking-[0.3em] font-mono">Escala Real</span>
               <span className="w-1.5 h-1.5 rounded-full bg-[#F56E0F]" />
            </div>
         ))}
      </motion.div>
    </div>
  );
}

/* ========================= PROBLEM ========================= */
function Problem() {
  return (
    <section className="bg-[#151419] py-32 text-white relative overflow-hidden">
      <NoiseOverlay />
      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div>
            <h2 className="text-4xl md:text-6xl font-extrabold mb-8 leading-tight">
              O "Jeito Antigo" de vender <span className="text-[#878787]">está queimando seu dinheiro.</span>
            </h2>
            <p className="text-[#878787] text-lg mb-10 leading-relaxed">
              Você contrata uma agência. Eles fazem posts bonitos e trazem cliques. 
              Mas o seu WhatsApp enche de gente perguntando "preço" e sumindo. 
              Sua equipe comercial perde 80% do dia falando com curiosos.
            </p>
            
            <div className="space-y-6">
              {[
                "Leads desqualificados que sugam tempo.",
                "Ciclo de vendas longo e exaustivo.",
                "Site institucional que ninguém lê.",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 text-red-400/80 bg-red-900/10 p-4 rounded-2xl border border-red-500/10">
                   <X size={20} />
                   <span className="text-white font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#F56E0F] to-purple-600 opacity-20 blur-[100px]" />
              <div className="relative border border-white/10 bg-white/5 backdrop-blur-sm rounded-[2.5rem] p-10">
                <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
                  <div className="p-2 bg-[#F56E0F] rounded-lg text-white"><Target size={20} /></div>
                  O Cenário Altum
                </h3>
                <div className="space-y-8">
                  <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                         <div className="w-px h-full bg-[#F56E0F]/30" />
                      </div>
                      <div className="space-y-8 pb-4">
                        <div>
                           <div className="font-bold text-white text-xl mb-1">Filtro de Barreira</div>
                           <p className="text-[#878787] text-sm">Quem não tem orçamento nem chega no seu WhatsApp.</p>
                        </div>
                        <div>
                           <div className="font-bold text-white text-xl mb-1">Autoridade Imediata</div>
                           <p className="text-[#878787] text-sm">Seu site justifica porque você cobra caro em segundos.</p>
                        </div>
                        <div>
                           <div className="font-bold text-white text-xl mb-1">Previsibilidade</div>
                           <p className="text-[#878787] text-sm">Você sabe exatamente quanto custa colocar um cliente na mesa.</p>
                        </div>
                      </div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================= COMO FUNCIONA (Nova Seção) ========================= */
function HowItWorks() {
  const steps = [
    { 
      icon: Settings,
      title: "1. Diagnóstico & Setup", 
      desc: "Analisamos sua oferta e margem. Se houver fit, configuramos o CRM e treinamos a IA com suas regras de negócio.",
      details: ["Análise de Viabilidade", "Setup do CRM", "Treinamento da IA"]
    },
    { 
      icon: LayoutTemplate,
      title: "2. Construção do Funil", 
      desc: "Desenvolvemos a Landing Page High-Ticket e as campanhas de tráfego focadas em intenção de compra.",
      details: ["Copywriting Persuasivo", "Design Premium", "Campanhas Google/Meta"]
    },
    { 
      icon: Filter,
      title: "3. Ativação do Filtro", 
      desc: "Ligamos o tráfego. A IA começa a entrevistar cada lead em tempo real, 24/7, bloqueando curiosos.",
      details: ["Triagem Financeira", "Qualificação Automática", "Bloqueio de Desqualificados"]
    },
    { 
      icon: Rocket,
      title: "4. Escala & Agendamento", 
      desc: "Leads aprovados são agendados direto na sua equipe. Otimizamos o ROI e escalamos o investimento.",
      details: ["Agendamento Direto", "Otimização de ROI", "Escala de Verba"]
    },
  ];

  return (
    <section id="como-funciona" className="bg-[#FBFBFB] py-32 relative overflow-hidden">
      <GridPattern />
      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-extrabold text-[#151419] mb-6">
            Como Funciona a <br/> <span className="text-[#F56E0F]">Implementação.</span>
          </h2>
          <p className="text-xl text-[#878787]">
            Transformamos seu processo comercial em uma linha de produção previsível em 4 etapas claras.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 relative">
          {/* Linha de Conexão Central (Desktop) */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[#F56E0F]/50 via-[#F56E0F]/20 to-transparent -translate-x-1/2 z-0" />

          {steps.map((step, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ margin: "-100px", once: true }}
              transition={{ delay: i * 0.1 }}
              className={cx(
                "relative bg-white p-8 rounded-[2rem] border border-gray-100 shadow-xl z-10 group hover:border-[#F56E0F]/30 transition-all duration-300",
                i % 2 === 0 ? "md:mr-12" : "md:ml-12 md:mt-24" // Deslocamento para criar o zigue-zague
              )}
            >
              {/* Conector Lateral (Desktop) */}
              <div className={cx(
                "hidden md:block absolute top-12 h-px w-12 bg-[#F56E0F]/50",
                i % 2 === 0 ? "-right-12" : "-left-12"
              )} />
              
              {/* Ícone */}
              <div className="w-16 h-16 rounded-2xl bg-[#F56E0F]/10 flex items-center justify-center text-[#F56E0F] mb-6 group-hover:scale-110 transition-transform">
                <step.icon size={32} />
              </div>
              
              <h3 className="text-2xl font-bold text-[#151419] mb-4">{step.title}</h3>
              <p className="text-[#878787] leading-relaxed mb-6">{step.desc}</p>
              
              <ul className="space-y-3">
                {step.details.map((detail, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm font-medium text-[#151419]/80">
                    <CheckCircle2 size={18} className="text-[#F56E0F]" />
                    {detail}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================= ECOSYSTEM (BENTO) ========================= */
function Ecosystem() {
  return (
    <section id="ecossistema" className="py-32 bg-[#151419] relative overflow-hidden">
       <NoiseOverlay />
       <div className="mx-auto max-w-7xl px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
             <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6">
                O Ecossistema <br/> <span className="text-[#F56E0F]">Tech.</span>
             </h2>
             <p className="text-xl text-[#878787]">
                As ferramentas proprietárias que compõem a máquina de vendas da Altum.
             </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(350px,auto)]">
             {/* Main Feature - Dark */}
             <SpotlightCard className="md:col-span-2 p-10 text-white flex flex-col justify-between group">
                <div className="relative z-10">
                   <div className="w-14 h-14 rounded-2xl bg-[#F56E0F] flex items-center justify-center mb-6">
                      <Bot size={28} className="text-white" />
                   </div>
                   <h3 className="text-3xl font-bold mb-4">ALTUM-Filter (A.I.)</h3>
                   <p className="text-gray-400 text-lg max-w-md mb-8 leading-relaxed">
                      Nossa IA entrevista o lead em tempo real. Analisa orçamento, urgência e perfil. O curioso é educadamente dispensado.
                   </p>
                   <ul className="grid grid-cols-2 gap-4 mb-8">
                      <li className="flex items-center gap-2 text-sm text-gray-300"><CheckCircle2 size={16} className="text-[#F56E0F]"/> Triagem Financeira</li>
                      <li className="flex items-center gap-2 text-sm text-gray-300"><CheckCircle2 size={16} className="text-[#F56E0F]"/> Agendamento Auto</li>
                      <li className="flex items-center gap-2 text-sm text-gray-300"><CheckCircle2 size={16} className="text-[#F56E0F]"/> Anti-Spam</li>
                      <li className="flex items-center gap-2 text-sm text-gray-300"><CheckCircle2 size={16} className="text-[#F56E0F]"/> 24/7 Ativo</li>
                   </ul>
                </div>
                <div className="absolute right-[-50px] bottom-[-50px] opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                   <Bot size={300} />
                </div>
             </SpotlightCard>

             {/* Capture */}
             <SpotlightCard className="p-8 relative overflow-hidden group hover:border-[#F56E0F]/40 transition-colors">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F56E0F]/10 rounded-bl-[100px]" />
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 text-white">
                   <LayoutTemplate size={24} />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-white">ALTUM-Capture</h3>
                <p className="text-[#878787] leading-relaxed mb-6">
                   Landing Pages High-Ticket. Design minimalista, copy agressiva e gatilhos de autoridade. Não é um site, é um terminal de vendas.
                </p>
             </SpotlightCard>

             {/* Traffic */}
             <SpotlightCard className="p-8 relative overflow-hidden group hover:border-[#F56E0F]/40 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 text-white">
                   <Zap size={24} />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-white">ALTUM-Traffic</h3>
                <p className="text-[#878787] leading-relaxed mb-6">
                   Gestão de tráfego focada em intenção. Google Ads para quem busca solução, Meta Ads para criar desejo em quem tem perfil financeiro.
                </p>
             </SpotlightCard>

             {/* Data */}
             <SpotlightCard className="md:col-span-2 p-10 flex flex-col md:flex-row items-center gap-12 overflow-hidden">
                <div className="flex-1 relative z-10">
                   <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 text-white">
                      <BarChart3 size={24} />
                   </div>
                   <h3 className="text-2xl font-bold mb-4 text-white">ALTUM-Data</h3>
                   <p className="text-[#878787] leading-relaxed mb-6">
                      Você não quer saber de "cliques". Você quer saber de lucro. Nosso dashboard mostra o custo real por reunião agendada e o ROI do seu investimento.
                   </p>
                </div>
                <div className="flex-1 w-full bg-black/30 rounded-2xl p-6 aspect-video relative overflow-hidden shadow-inner group border border-white/5">
                   <div className="flex items-end justify-between h-full gap-2 px-2 pb-2">
                      {[30, 45, 35, 60, 50, 75, 65, 90].map((h, i) => (
                         <motion.div 
                           key={i}
                           initial={{ height: 0 }}
                           whileInView={{ height: `${h}%` }}
                           transition={{ duration: 1, delay: i * 0.1 }}
                           className="w-full bg-gradient-to-t from-[#F56E0F] to-[#F56E0F]/50 rounded-t-sm opacity-80 group-hover:opacity-100 transition-opacity"
                         />
                      ))}
                   </div>
                </div>
             </SpotlightCard>
          </div>
       </div>
    </section>
  );
}

/* ========================= CASES CAROUSEL ========================= */
function Cases() {
  const projects = [
    { title: "Indústria Solar", tag: "Ticket 120k", sub: "Funil B2B", bg: "bg-blue-900" },
    { title: "Clínica Estética", tag: "Ticket 25k", sub: "Implantes", bg: "bg-rose-900" },
    { title: "Advocacia", tag: "Ticket 50k", sub: "Empresarial", bg: "bg-slate-900" },
    { title: "Engenharia", tag: "Ticket 200k", sub: "Projetos", bg: "bg-emerald-900" },
  ];

  return (
    <section id="portfolio" className="py-32 bg-[#FBFBFB] overflow-hidden relative">
       <GridPattern />
       <div className="mx-auto max-w-7xl px-6 mb-16 flex items-end justify-between relative z-10">
          <div>
             <h2 className="text-4xl font-extrabold text-[#151419]">Cases Reais.</h2>
             <p className="text-[#878787] mt-2 text-lg">Estruturas que geram milhões em pipeline.</p>
          </div>
          <Button href="#contato" variant="ghost" className="hidden md:flex">
             Ver Todos <ArrowRight size={16} />
          </Button>
       </div>

       <div className="flex gap-8 overflow-x-auto px-6 pb-12 max-w-[100vw] scrollbar-hide snap-x relative z-10">
          {projects.map((p, i) => (
             <motion.div 
               key={i} 
               className="min-w-[320px] md:min-w-[450px] snap-center group cursor-pointer"
               whileHover={{ y: -10 }}
             >
                <div className={`aspect-[4/3] rounded-[2rem] relative overflow-hidden shadow-xl mb-6 ${p.bg}`}>
                   <div className="absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                   
                   <div className="absolute bottom-8 left-8">
                      <div className="flex gap-2 mb-3">
                         <span className="px-3 py-1 rounded-full bg-[#F56E0F] text-white text-xs font-bold uppercase tracking-wide">
                            {p.tag}
                         </span>
                      </div>
                      <h3 className="text-3xl font-bold text-white mb-1">{p.title}</h3>
                      <p className="text-white/60">{p.sub}</p>
                   </div>
                </div>
             </motion.div>
          ))}
       </div>
    </section>
  );
}

/* ========================= FOUNDER ========================= */
function Founder() {
  return (
    <section id="sobre" className="py-32 bg-white border-t border-gray-100 relative">
      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
           <div className="relative order-2 lg:order-1">
              <div className="aspect-[3/4] bg-[#151419] rounded-[2.5rem] overflow-hidden relative shadow-2xl rotate-3 hover:rotate-0 transition-all duration-700 group">
                 <img src="/images/founder/savio.jpg" alt="Sávio Cipriano" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                 <div className="absolute bottom-8 left-8 text-white">
                    <div className="text-2xl font-bold">Sávio Cipriano</div>
                    <div className="text-[#F56E0F] font-medium">Fundador & Estrategista</div>
                 </div>
              </div>
           </div>

           <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#151419]/5 text-[#151419] text-sm font-bold mb-6">
                 <ShieldCheck size={14} /> Diretor da Altum
              </div>
              <h2 className="text-4xl md:text-6xl font-extrabold text-[#151419] mb-8 leading-[1.1]">
                 "Eu não vendo sites. <br/> Eu vendo <span className="text-[#F56E0F]">dinheiro no caixa</span>."
              </h2>
              <div className="space-y-6 text-lg text-[#262626] leading-relaxed">
                 <p>
                    O mercado está cheio de agências que focam em "vaidade": likes, seguidores e sites bonitos que não convertem.
                 </p>
                 <p>
                    Criei a <strong>ALTUM</strong> para ser a resposta exata para empresas de Alto Ticket. 
                    Uni a rigidez da <strong>Engenharia de Software</strong> com a agressividade de <strong>Vendas</strong>.
                 </p>
                 <p>
                    Se você quer brincar de influenciador, não sou a pessoa certa. 
                    Mas se você quer previsibilidade de receita, bem-vindo.
                 </p>
              </div>
           </div>
        </div>
      </div>
    </section>
  );
}

/* ========================= CTA FINAL ========================= */
// Recebe onOpenBot para acionar no botão final
function Contact({ onOpenBot }: { onOpenBot: (e: React.MouseEvent) => void }) {
  return (
    <section id="contato" className="py-20 px-4 md:px-6 bg-[#FBFBFB] relative overflow-hidden">
       <div className="mx-auto max-w-6xl relative z-10">
          <div className="relative bg-[#151419] rounded-[3rem] p-8 md:p-24 overflow-hidden text-center shadow-2xl group">
             <NoiseOverlay />
             
             <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#F56E0F]/20 rounded-full blur-[120px] group-hover:bg-[#F56E0F]/30 transition-colors duration-700" />
             <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />

             <div className="relative z-10 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium mb-8 border border-white/5 backdrop-blur-sm">
                   <Filter size={16} /> Aplicação para o Método
                </div>
                
                <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-8 leading-tight">
                   Seu negócio tem perfil <br/> para escalar?
                </h2>
                
                <p className="text-gray-400 text-lg mb-12 leading-relaxed">
                   Não aceitamos todos os projetos. Precisamos garantir que nossa estrutura vai se pagar no primeiro mês. 
                   Faça a análise de viabilidade gratuita.
                </p>

                <div className="flex flex-col md:flex-row gap-4 justify-center">
                   <Button href="#" variant="primary" className="text-lg px-10 py-5" onClick={onOpenBot}>
                      <MessageCircle className="mr-2" /> Iniciar no WhatsApp
                   </Button>
                   <Button href={LINKS.email} variant="outline" className="text-white border-white/10 hover:bg-white/10 text-lg px-10 py-5 bg-white/5">
                      <Mail className="mr-2" /> Enviar E-mail
                   </Button>
                </div>

                <div className="mt-12 flex flex-wrap justify-center gap-8 text-sm text-gray-500">
                   <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#F56E0F]"/> Sem compromisso</span>
                   <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#F56E0F]"/> Resposta em 24h</span>
                   <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#F56E0F]"/> Sigilo Absoluto</span>
                </div>
             </div>
          </div>
       </div>
    </section>
  );
}

/* ========================= FOOTER ========================= */
function Footer() {
  return (
    <footer className="bg-white pt-20 pb-10 border-t border-gray-100 relative z-10">
       <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
             <img src="/logo-a.png" alt="Altum Logo" className="h-8 w-auto" />
             <div>
                <div className="font-bold text-[#151419] tracking-tight text-lg">ALTUM</div>
                <div className="text-xs text-gray-500 uppercase tracking-widest">High-Ticket Sales</div>
             </div>
          </div>
          <div className="flex gap-8 text-sm font-medium text-gray-500">
             <a href="#" className="hover:text-[#F56E0F] transition-colors">Instagram</a>
             <a href="#" className="hover:text-[#F56E0F] transition-colors">LinkedIn</a>
             <a href="#" className="hover:text-[#F56E0F] transition-colors">Cases</a>
          </div>
          <div className="text-sm text-gray-400">
             © 2026 Altum. Todos os direitos reservados.
          </div>
       </div>
    </footer>
  );
}

/* ========================= PAGE ROOT ========================= */
export default function Page() {
  // FUNÇÃO CORRIGIDA PARA ABRIR O CHAT
  const handleOpenBot = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Verifica se o Typebot já carregou
    // @ts-ignore
    if (window.Typebot) {
      // @ts-ignore
      window.Typebot.open(); // <--- O comando correto é esse (sem .Bubble)
    } else {
      console.log("O chat ainda está carregando...");
      // Opcional: Tenta abrir novamente em 1 segundo se a internet estiver lenta
      setTimeout(() => {
        // @ts-ignore
        if (window.Typebot) window.Typebot.open();
      }, 1000);
    }
  };
  return (
    <main className="min-h-screen bg-[#FBFBFB] selection:bg-[#F56E0F] selection:text-white font-sans overflow-x-hidden">
      <Header onOpenBot={handleOpenBot} />
      <Hero onOpenBot={handleOpenBot} />
      <Marquee />
      <Problem />
      <HowItWorks />
      <Ecosystem />
      <Cases />
      <Founder />
      <Contact onOpenBot={handleOpenBot} />
      <TypebotBubble />
      <Footer />
    </main>
  );
}