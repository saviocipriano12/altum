"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  CircleHelp,
  Instagram,
  MessageCircle,
  Rocket,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useTenantReadiness } from "@/app/cliente/painel/hooks/use-tenant-readiness";

const OPEN_EVENT = "altum:cliente-activation-open";
const SEEN_KEY = "altum_activation_center_seen_v1";

const STEP_PRESENTATION = {
  profile_setup: {
    shortTitle: "Conte sobre sua empresa",
    outcome: "A Altum adapta o funil, a linguagem e as sugestoes ao seu negocio.",
    icon: Building2,
    href: "/cliente/painel/onboarding",
    action: "Preencher operacao",
  },
  channel_ready: {
    shortTitle: "Conecte seu primeiro canal",
    outcome: "As conversas passam a chegar em um unico lugar.",
    icon: MessageCircle,
    href: "/cliente/painel/configuracoes/canais",
    action: "Conectar canal",
  },
  ai_guardrails: {
    shortTitle: "Prepare o Assistente Altum",
    outcome: "Defina conhecimento, limites e quando chamar uma pessoa.",
    icon: Bot,
    href: "/cliente/painel/ia",
    action: "Configurar e testar IA",
  },
  crm_followup_ops: {
    shortTitle: "Organize equipe e atendimento",
    outcome: "Cada oportunidade ganha responsavel e prazo de resposta.",
    icon: Users,
    href: "/cliente/painel/configuracoes/operacao",
    action: "Configurar operacao",
  },
} as const;

type JourneyStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
  icon: typeof Building2;
};

export function ClienteActivationCenter() {
  const pathname = usePathname();
  const { tenant } = useClienteTenant();
  const { readiness, loading } = useTenantReadiness(tenant?.tenantId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const steps = useMemo<JourneyStep[]>(() => {
    const source = new Map((readiness?.onboarding?.steps || []).map((step) => [step.id, step]));
    const guided: JourneyStep[] = Object.entries(STEP_PRESENTATION).map(([id, presentation]) => ({
      id,
      title: presentation.shortTitle,
      description: presentation.outcome,
      href: presentation.href,
      action: presentation.action,
      done: source.get(id)?.done === true,
      icon: presentation.icon,
    }));
    guided.push({
      id: "first_automation",
      title: "Publique sua primeira automacao",
      description: "Escolha um objetivo, revise a mensagem e teste antes de ativar.",
      href: "/cliente/painel/automacao-instagram",
      action: "Criar automacao",
      done: Number(readiness?.summary?.activeAutomations || 0) > 0,
      icon: Instagram,
    });
    guided.push({
      id: "start_operation",
      title: "Comece a operar",
      description: "Receba uma conversa, acompanhe a oportunidade e registre a proxima acao.",
      href: "/cliente/painel",
      action: "Ir para o Inicio",
      done: readiness?.summary?.pilotReady === true,
      icon: Rocket,
    });
    return guided;
  }, [readiness]);

  const completed = steps.filter((step) => step.done).length;
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const nextStep = steps.find((step) => !step.done) || steps.at(-1);

  useEffect(() => {
    if (loading || progress >= 100 || window.localStorage.getItem(SEEN_KEY)) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [loading, progress]);

  function close() {
    window.localStorage.setItem(SEEN_KEY, "true");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[180]" role="dialog" aria-modal="true" aria-label="Central de ativacao">
      <button className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={close} aria-label="Fechar central de ativacao" />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[460px] flex-col border-l border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-text)] shadow-2xl">
        <header className="border-b border-[var(--cliente-border)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/20">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-600">Sua jornada na Altum</p>
                <h2 className="mt-1 text-xl font-black">Coloque sua operacao para funcionar</h2>
                <p className="mt-2 text-sm leading-5 text-[var(--cliente-text-muted)]">Avance no seu ritmo. O progresso vem das configuracoes reais da conta.</p>
              </div>
            </div>
            <button type="button" onClick={close} className="rounded-xl p-2 text-[var(--cliente-text-muted)] hover:bg-[var(--cliente-panel-soft)]" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{loading ? "Atualizando progresso..." : `${completed} de ${steps.length} etapas concluidas`}</span>
              <span className="text-blue-600">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--cliente-panel-soft)]">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {nextStep && !nextStep.done ? (
            <div className="mb-4 rounded-[20px] border border-blue-200 bg-blue-50 p-4 text-slate-900">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Proximo passo recomendado</p>
              <p className="mt-2 font-black">{nextStep.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">{nextStep.description}</p>
              <Link href={nextStep.href} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white">
                {nextStep.action} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}

          <ol className="space-y-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.id}>
                  <Link href={step.href} className="group flex items-start gap-3 rounded-2xl border border-transparent p-3 transition hover:border-[var(--cliente-border)] hover:bg-[var(--cliente-panel-soft)]">
                    <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-[var(--cliente-panel-soft)] text-[var(--cliente-text-muted)]"}`}>
                      {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--cliente-text-muted)]">Etapa {index + 1}</span>
                        {step.done ? <span className="text-[10px] font-black uppercase text-emerald-600">Concluida</span> : null}
                      </span>
                      <span className="mt-1 block text-sm font-black">{step.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--cliente-text-muted)]">{step.description}</span>
                    </span>
                    <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-[var(--cliente-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        <footer className="border-t border-[var(--cliente-border)] p-4 sm:p-5">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              window.setTimeout(() => window.dispatchEvent(new Event("altum:cliente-tour-open")), 80);
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-sm font-bold hover:border-blue-300"
          >
            <CircleHelp className="h-4 w-4 text-blue-600" /> Conhecer a interface primeiro
          </button>
        </footer>
      </aside>
    </div>
  );
}
