"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { DEFAULT_PLATFORM_PLANS, type PlatformPlan } from "@/lib/platform-plans";

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function PricingPlans() {
  const [plans, setPlans] = useState<PlatformPlan[]>([...DEFAULT_PLATFORM_PLANS]);

  useEffect(() => {
    fetch("/api/public/platform-plans")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { plans?: PlatformPlan[] }) => payload.plans?.length && setPlans(payload.plans))
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-[1380px]">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
        <article
          key={plan.id}
          className={`relative flex min-h-[38rem] flex-col rounded-[2rem] border p-7 ${plan.featured ? "border-[#2563eb]/50 bg-[#111111] shadow-[0_30px_80px_rgba(37,99,235,0.12)]" : "border-white/9 bg-[#0b0b0b]"}`}
        >
          {plan.featured ? (
            <span className="absolute right-5 top-5 rounded-full bg-[#2563eb] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white">
              Mais escolhido
            </span>
          ) : null}
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#60a5fa]">{plan.name}</p>
          <p className="mt-5 min-h-14 text-base font-extrabold leading-6 text-white">{plan.promise}</p>
          <div className="mt-6">
            {plan.pricePrefix ? <p className="mb-1 text-xs font-bold text-white/42">{plan.pricePrefix}</p> : null}
            <span className="text-4xl font-extrabold tracking-[-0.06em] text-white">
              {plan.monthlyPrice ? money(plan.monthlyPrice) : "Sob consulta"}
            </span>
            {plan.monthlyPrice ? <span className="ml-1 text-sm font-bold text-white/36">/mes</span> : null}
          </div>
          <p className="mt-4 min-h-24 text-sm leading-6 text-white/48">{plan.description}</p>
          <div className="mt-6 space-y-3 border-t border-white/8 pt-6">
            {plan.features.map((feature) => (
              <div key={feature} className="flex items-start gap-3 text-sm leading-6 text-white/68">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                {feature}
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs leading-5 text-white/48">
            <strong className="text-white/72">{plan.setupLabel}</strong>
            {plan.setupFee ? `: ${plan.pricePrefix || plan.setupMode === "proposal" ? "a partir de " : ""}${money(plan.setupFee)}` : ""}
          </div>
          <Link
            href={plan.checkoutEnabled && plan.trialEligible ? `/cadastro?plan=${plan.id}` : `/contato?interest=${plan.id}`}
            className={`mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-sm font-extrabold transition ${plan.featured ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]" : "border border-white/12 bg-white/[0.035] text-white hover:bg-white/[0.07]"}`}
          >
            {plan.checkoutEnabled && plan.trialEligible ? "Testar gratis por 7 dias" : "Falar com a Altum"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
        ))}
      </div>
      <div className="mt-6 grid gap-4 rounded-[1.5rem] border border-white/8 bg-[#0b0b0b] p-6 text-white lg:grid-cols-2">
        <div><p className="text-sm font-extrabold">Teste completo, cobranca clara</p><p className="mt-2 text-sm leading-6 text-white/48">Use todos os modulos por 7 dias, com limites controlados e sem cartao. Mensalidade, implantacao obrigatoria e custos oficiais de provedores sao apresentados separadamente.</p></div>
        <div><p className="text-sm font-extrabold">Capacidade adicional com confirmacao</p><p className="mt-2 text-sm leading-6 text-white/48">Usuarios, canais, contatos, IA e automacoes adicionais sao contratados somente apos confirmacao de disponibilidade e aceite comercial. Nenhum adicional e incluido automaticamente no checkout.</p></div>
      </div>
    </div>
  );
}
