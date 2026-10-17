"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { type PlatformPlan } from "@/lib/platform-plans";
import {
  PUBLIC_PLATFORM_PLANS,
  selectPublicPlatformPlans,
} from "@/lib/public-platform-plans";
import styles from "./public-site.module.css";
const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const amount = (value: number) => value.toLocaleString("pt-BR");
export function PricingPlans({ comparison = false }: { comparison?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const reduced = useReducedMotion();
  const [plans, setPlans] = useState<PlatformPlan[]>([
    ...PUBLIC_PLATFORM_PLANS,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/platform-plans", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { plans?: PlatformPlan[] }) => {
        if (payload.plans?.length)
          setPlans(selectPublicPlatformPlans(payload.plans));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const card = element.querySelector("article");
      if (!card) return;
      const step =
        card.getBoundingClientRect().width +
        parseFloat(getComputedStyle(element).columnGap || "0");
      const maximum = element.scrollWidth - element.clientWidth;
      const count = Math.max(1, Math.ceil(maximum / step) + 1);
      setPageCount(count);
      setPage(
        maximum - element.scrollLeft < 4
          ? count - 1
          : Math.min(count - 1, Math.round(element.scrollLeft / step)),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [plans]);
  const goTo = (next: number) => {
    const element = track.current;
    const card = element?.querySelector("article");
    if (!element || !card) return;
    const step =
      card.getBoundingClientRect().width +
      parseFloat(getComputedStyle(element).columnGap || "0");
    element.scrollTo({
      left: Math.min(
        element.scrollWidth - element.clientWidth,
        Math.max(0, next) * step,
      ),
      behavior: reduced ? "auto" : "smooth",
    });
  };
  const rows: { label: string; value: (plan: PlatformPlan) => string }[] = [
    { label: "Usuários", value: (plan) => amount(plan.allowances.users) },
    {
      label: "Canais WhatsApp",
      value: (plan) => amount(plan.allowances.whatsappChannels),
    },
    { label: "Contatos", value: (plan) => amount(plan.allowances.contacts) },
    {
      label: "Mensagens por mês",
      value: (plan) => amount(plan.allowances.messagesPerMonth),
    },
    {
      label: "Créditos de IA por mês",
      value: (plan) => amount(plan.allowances.aiCreditsPerMonth),
    },
    {
      label: "Automações ativas",
      value: (plan) => amount(plan.allowances.activeAutomations),
    },
    {
      label: "Implantação",
      value: (plan) =>
        plan.setupMode === "required"
          ? "Obrigatória"
          : plan.setupMode === "proposal"
            ? "Sob proposta"
            : "Opcional",
    },
  ];
  return (
    <div className={styles.pricingCarousel}>
      <div className={styles.pricingCarouselTop}>
        <span>Encontre o seu momento. Explore os planos.</span>
        <div className={styles.pricingControls}>
          <button
            type="button"
            aria-label="Ver planos anteriores"
            disabled={page === 0}
            onClick={() => goTo(page - 1)}
          >
            <ChevronLeft size={19} />
          </button>
          <button
            type="button"
            aria-label="Ver próximos planos"
            disabled={page >= pageCount - 1}
            onClick={() => goTo(page + 1)}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      <div
        ref={track}
        className={styles.pricingGrid}
        role="region"
        aria-roledescription="carrossel"
        aria-label="Planos Altum — deslize ou use as setas para explorar"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(
              Math.min(
                pageCount - 1,
                Math.max(0, page + (event.key === "ArrowRight" ? 1 : -1)),
              ),
            );
          }
        }}
      >
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={`${styles.plan} ${plan.featured ? styles.planFeatured : ""}`}
          >
            {plan.featured && (
              <span className={styles.planBadge}>Mais escolhido</span>
            )}
            <h2>{plan.name}</h2>
            <p className={styles.planPromise}>{plan.promise}</p>
            {plan.pricePrefix && (
              <small className={styles.muted}>{plan.pricePrefix}</small>
            )}
            <p className={styles.planPrice}>
              {plan.monthlyPrice ? money(plan.monthlyPrice) : "Sob consulta"}
              {plan.monthlyPrice ? <small> /mês</small> : null}
            </p>
            <p className={styles.planDescription}>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={13} />
                  {feature}
                </li>
              ))}
            </ul>
            <p className={styles.planSetup}>
              <strong>{plan.setupLabel}</strong>
              {plan.setupFee
                ? `: ${plan.pricePrefix || plan.setupMode === "proposal" ? "a partir de " : ""}${money(plan.setupFee)}`
                : ""}
            </p>
            <Link
              prefetch={false}
              href={
                plan.checkoutEnabled && plan.trialEligible
                  ? `/cadastro?plan=${plan.id}`
                  : `/contato?interest=plataforma&plan=${plan.id}#formulario-comercial`
              }
              className={plan.featured ? styles.button : styles.secondaryButton}
            >
              {plan.checkoutEnabled && plan.trialEligible
                ? "Testar grátis por 7 dias"
                : "Falar com a Altum"}
              <ArrowRight size={14} />
            </Link>
          </article>
        ))}
      </div>
      <div
        className={styles.pricingDots}
        aria-label="Posições do carrossel de planos"
      >
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Ver posição ${index + 1} de ${pageCount} dos planos`}
            aria-current={page === index}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
      <p className="sr-only" role="status">
        Posição {page + 1} de {pageCount} dos planos.
      </p>
      <p className={styles.pricingNote}>
        Teste de 7 dias nos planos elegíveis, sem cartão. Mensalidade,
        implantação e custos oficiais de provedores são apresentados
        separadamente. O valor vigente aparece antes da confirmação. Adicionais
        dependem de disponibilidade e aceite comercial.
      </p>
      {comparison && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Encontre o seu plano</p>
            <h2>Compare a capacidade de cada operação.</h2>
            <p>
              Limites do catálogo atual. Para condições específicas, converse
              com a Altum.
            </p>
          </div>
          <div
            className={styles.pricingTableWrap}
            role="region"
            aria-label="Comparação dos planos — role horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table className={styles.pricingTable}>
              <caption>Capacidade incluída em cada plano</caption>
              <thead>
                <tr>
                  <th scope="col">Recurso</th>
                  {plans.map((plan) => (
                    <th scope="col" key={plan.id}>
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {plans.map((plan) => (
                      <td key={plan.id}>{row.value(plan)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
