"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, ExternalLink, X } from "lucide-react";

const STORAGE_KEY = "altum_guided_tour_v3";
const OPEN_EVENT = "altum:cliente-tour-open";

const STEPS = [
  { title: "Sua central de ativacao", description: "Aqui voce continua a configuracao exatamente de onde parou. O progresso so avanca quando a conta esta realmente preparada.", route: "/cliente/painel/onboarding", action: "Configurar minha operacao", target: "activation-control" },
  { title: "Inicio", description: "Mostra o que exige sua atencao hoje: conversas, oportunidades, agenda e o proximo passo mais importante.", route: "/cliente/painel", action: "Abrir Inicio", target: "inicio" },
  { title: "Conversas", description: "E o lugar para atender WhatsApp, Instagram e site, consultar o historico e decidir quando a IA ou uma pessoa responde.", route: "/cliente/painel/inbox", action: "Abrir Conversas", target: "conversas" },
  { title: "Clientes e oportunidades", description: "Reune contatos, negociacoes, funil, propostas e a proxima acao comercial de cada cliente.", route: "/cliente/painel/crm", action: "Abrir Clientes", target: "clientes" },
  { title: "Agenda", description: "Protege reunioes, retornos e follow-ups para nenhuma oportunidade ficar esquecida.", route: "/cliente/painel/agenda", action: "Abrir Agenda", target: "agenda" },
  { title: "Produtos e servicos", description: "Cadastre o que sua empresa vende. Essas informacoes alimentam equipe, propostas, respostas da IA e automacoes.", route: "/cliente/painel/produtos-servicos", action: "Cadastrar ofertas", target: "produtos" },
  { title: "Crescimento", description: "Campanhas mostram de onde vieram os contatos e quais acoes geraram oportunidades e vendas.", route: "/cliente/painel/campanhas", action: "Abrir Campanhas", target: "campanhas" },
  { title: "Automacao do Instagram", description: "Escolha um objetivo, selecione posts ou reels, revise a mensagem, teste e publique a automacao.", route: "/cliente/painel/automacao-instagram", action: "Criar automacao", target: "instagram" },
  { title: "Resultados", description: "Relatorios transformam conversas, oportunidades e campanhas em decisoes praticas para a operacao.", route: "/cliente/painel/metricas", action: "Abrir Relatorios", target: "relatorios" },
  { title: "Inteligencia aplicada", description: "Pergunte sobre o negocio ou prepare o Assistente Altum com conhecimento, limites e passagem para humanos.", route: "/cliente/painel/ia", action: "Preparar Assistente", target: "assistente" },
  { title: "Configuracoes", description: "Gerencie empresa, equipe, canais, integracoes, operacao e faturamento sem misturar isso com o trabalho diario.", route: "/cliente/painel/configuracoes", action: "Abrir Configuracoes", target: "configuracoes" },
] as const;
const MOBILE_STEPS = STEPS.filter((item) => item.target !== "activation-control");

type Rect = { top: number; left: number; width: number; height: number };

export function ClienteGuidedTour() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mobile, setMobile] = useState(false);
  const activeSteps = mobile ? MOBILE_STEPS : STEPS;

  useEffect(() => {
    STEPS.forEach(({ route }) => router.prefetch(route));
    const show = () => {
      const isMobile = window.innerWidth < 1024;
      setMobile(isMobile);
      setStep(0);
      setOpen(true);
      if (isMobile) window.dispatchEvent(new Event("altum:cliente-sidebar-open"));
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const current = activeSteps[step];
    let frame = 0;

    const locate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const element = document.querySelector<HTMLElement>(`[data-tour-key="${current.target}"]`) || document.querySelector<HTMLElement>("[data-tour-key=page-content]");
        if (!element) return;
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const box = element.getBoundingClientRect();
        const gap = 7;
        setRect({ top: Math.max(8, box.top - gap), left: Math.max(8, box.left - gap), width: Math.min(window.innerWidth - 16, box.width + gap * 2), height: Math.min(window.innerHeight - 16, box.height + gap * 2) });
      });
    };

    locate();
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [activeSteps, open, step]);

  function finish(value: "completed" | "dismissed") {
    window.localStorage.setItem(STORAGE_KEY, value);
    setOpen(false);
  }

  function openArea() {
    const route = activeSteps[step].route;
    window.localStorage.setItem(STORAGE_KEY, "explored");
    setOpen(false);
    router.push(route, { scroll: false });
  }

  if (!open) return null;
  const current = activeSteps[step];
  const last = step === activeSteps.length - 1;
  const tooltipTop = rect ? Math.min(window.innerHeight - 310, Math.max(16, rect.top)) : 90;
  const placeRight = rect ? rect.left + rect.width + 390 < window.innerWidth : false;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label={`Tour: ${current.title}`}>
      {rect ? <div className="pointer-events-none fixed rounded-[18px] border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.68),0_0_0_5px_rgba(96,165,250,0.2),0_16px_48px_rgba(0,0,0,0.3)] transition-[left,top,width,height] duration-300 ease-out" style={rect} /> : <div className="fixed inset-0 bg-slate-950/68 backdrop-blur-[1px]" />}
      <section className="fixed bottom-4 left-4 right-4 rounded-[22px] border border-white/15 bg-[var(--cliente-card)] p-5 text-[var(--cliente-text)] shadow-2xl transition-[left,right,top] duration-300 sm:left-auto sm:right-6 sm:w-[370px]" style={rect && window.innerWidth >= 640 ? { top: tooltipTop, bottom: "auto", ...(placeRight ? { left: rect.left + rect.width + 14, right: "auto" } : { right: 24 }) } : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Compass className="h-4 w-4" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Conheca a plataforma · {step + 1}/{activeSteps.length}</p><h2 className="mt-1 text-base font-black">{current.title}</h2></div></div>
          <button onClick={() => finish("dismissed")} className="rounded-lg p-1.5 text-[var(--cliente-text-muted)] hover:bg-[var(--cliente-panel-soft)]" aria-label="Fechar tour"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--cliente-panel-soft)]"><div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${((step + 1) / activeSteps.length) * 100}%` }} /></div>
        <p className="mt-4 text-sm leading-6 text-[var(--cliente-text-muted)]">{current.description}</p>
        <button type="button" onClick={openArea} className="mt-4 inline-flex items-center gap-2 text-xs font-black text-blue-600 hover:text-blue-700">{current.action} <ExternalLink className="h-3.5 w-3.5" /></button>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4" /> Voltar</button>
          {last ? <button onClick={() => finish("completed")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4" /> Concluir</button> : <button onClick={() => setStep((value) => value + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white">Proximo <ArrowRight className="h-4 w-4" /></button>}
        </div>
      </section>
    </div>
  );
}
