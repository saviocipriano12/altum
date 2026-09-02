"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { DEFAULT_PLATFORM_PLANS, type PlatformPlan } from "@/lib/platform-plans";

export function PricingPlans() {
  const [plans, setPlans] = useState<PlatformPlan[]>([...DEFAULT_PLATFORM_PLANS]);
  useEffect(() => {
    fetch("/api/public/platform-plans")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { plans?: PlatformPlan[] }) => payload.plans?.length && setPlans(payload.plans))
      .catch(() => undefined);
  }, []);

  return <div className="mx-auto grid max-w-[1180px] gap-4 xl:grid-cols-3">{plans.map((plan) => <article key={plan.id} className={`relative flex min-h-[34rem] flex-col rounded-[2rem] border p-7 ${plan.featured ? "border-[#e85002]/50 bg-[#111111] shadow-[0_30px_80px_rgba(232,80,2,0.12)]" : "border-white/9 bg-[#0b0b0b]"}`}>{plan.featured ? <span className="absolute right-5 top-5 rounded-full bg-[#e85002] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white">Mais escolhido</span> : null}<p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ff6a1f]">{plan.name}</p><div className="mt-8"><span className="text-5xl font-extrabold tracking-[-0.06em] text-white">{plan.monthlyPrice ? plan.monthlyPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "Sob consulta"}</span>{plan.monthlyPrice ? <span className="ml-1 text-lg font-bold text-white/36">/mes</span> : null}</div><p className="mt-5 min-h-20 text-sm leading-7 text-white/48">{plan.description}</p><div className="mt-7 space-y-3 border-t border-white/8 pt-6">{plan.features.map((feature) => <div key={feature} className="flex items-start gap-3 text-sm leading-6 text-white/68"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#e85002]" />{feature}</div>)}</div><Link href={plan.checkoutEnabled ? `/cadastro?plan=${plan.id}` : "/contato?interest=estrutura_assistida"} className={`mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-extrabold transition ${plan.featured ? "bg-[#e85002] text-white hover:bg-[#ff5c0b]" : "border border-white/12 bg-white/[0.035] text-white hover:bg-white/[0.07]"}`}>{plan.checkoutEnabled ? "Testar gratis por 7 dias" : "Falar com a Altum"} <ArrowRight className="h-4 w-4" /></Link></article>)}</div>;
}
