"use client";
import styles from "./public-site.module.css";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { trackLeadGenerated } from "@/components/analytics/track-event";
import { PUBLIC_PLATFORM_PLANS } from "@/lib/public-platform-plans";
import {
  publicCommercialInterests,
  getCommercialInterest,
  normalizeCommercialInterest,
} from "@/lib/commercial-contact";

type SubmitState = {
  leadId: string;
  message: string;
};

export function CommercialContactForm() {
  const searchParams = useSearchParams();
  const requestedPlan = PUBLIC_PLATFORM_PLANS.find(
    (plan) =>
      plan.id === (searchParams.get("plan") || searchParams.get("interest")),
  );
  const [interestId, setInterestId] = useState(() =>
    normalizeCommercialInterest(
      requestedPlan ? "plataforma" : searchParams.get("interest"),
    ),
  );
  const [contact, setContact] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    mensagem: requestedPlan
      ? `Tenho interesse no plano ${requestedPlan.name}. Gostaria de conversar sobre a proposta e a implantação.`
      : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);

  const interest = getCommercialInterest(interestId);
  const utm = useMemo(
    () => ({
      utmSource: searchParams.get("utm_source") || "",
      utmMedium: searchParams.get("utm_medium") || "",
      utmCampaign: searchParams.get("utm_campaign") || "",
      utmTerm: searchParams.get("utm_term") || "",
      utmContent: searchParams.get("utm_content") || "",
      gclid: searchParams.get("gclid") || "",
      fbclid: searchParams.get("fbclid") || "",
      landingPage: typeof window !== "undefined" ? window.location.href : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
    }),
    [searchParams],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      !contact.nome.trim() ||
      (!contact.telefone.trim() && !contact.email.trim())
    ) {
      setSubmitError(
        "Informe seu nome e um canal de retorno: WhatsApp ou e-mail.",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/public/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contact,
          interest: interest.id,
          sourcePage: searchParams.get("from") || "/contato",
          ...utm,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        leadId?: string;
        message?: string;
      };

      if (!response.ok || !payload.leadId || !payload.message) {
        setSubmitError(payload.error || "Falha ao enviar contato.");
        return;
      }

      setSubmitState({
        leadId: payload.leadId,
        message: payload.message,
      });

      trackLeadGenerated({
        lead_source: "commercial_contact_form",
        interest: interest.id,
        source_page: searchParams.get("from") || "/contato",
        utm_source: utm.utmSource || undefined,
        utm_medium: utm.utmMedium || undefined,
        utm_campaign: utm.utmCampaign || undefined,
      });
    } catch {
      setSubmitError("Falha ao enviar contato.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="formulario-comercial" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.contactGrid}>
          <div className={styles.contactIntro}>
            <p className={styles.eyebrow}>Uma conversa com contexto</p>
            <h2>Vamos entender o seu próximo passo.</h2>
            <p>
              Escolha o assunto e conte o que sua empresa precisa. Nossa equipe
              recebe o contexto para conversar sobre as possibilidades.
            </p>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Sua rotina primeiro</strong>
                  <p>Canais, equipe e como a venda acontece hoje.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Uma demonstração aplicada</strong>
                  <p>O produto conectado ao seu cenário.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Condições claras</strong>
                  <p>Plano, implantação e próximos passos.</p>
                </div>
              </li>
            </ol>
          </div>
          <div className={styles.contactForm}>
            {!submitState ? (
              <>
                <label className={styles.formField}>
                  <span>Sobre o que vamos conversar?</span>
                  <select
                    value={interestId}
                    onChange={(event) =>
                      setInterestId(
                        normalizeCommercialInterest(event.target.value),
                      )
                    }
                  >
                    {publicCommercialInterests.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={styles.formContext}>{interest.description}</p>
                <form onSubmit={handleSubmit} className={styles.formFields}>
                  {(
                    [
                      ["nome", "Nome", "Seu nome", "text"],
                      ["empresa", "Empresa", "Nome da empresa", "text"],
                      ["telefone", "WhatsApp", "+55 11 99999-9999", "tel"],
                      ["email", "E-mail", "voce@empresa.com", "email"],
                    ] as const
                  ).map(([key, label, placeholder, type]) => (
                    <label className={styles.formField} key={key}>
                      <span>
                        {label}
                        {key === "nome" ? " *" : ""}
                      </span>
                      <input
                        name={key}
                        type={type}
                        value={contact[key]}
                        autoComplete={
                          key === "nome"
                            ? "name"
                            : key === "empresa"
                              ? "organization"
                              : key === "telefone"
                                ? "tel"
                                : "email"
                        }
                        placeholder={placeholder}
                        required={key === "nome"}
                        onChange={(event) =>
                          setContact((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                  <label
                    className={styles.formField}
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <span>Como podemos ajudar?</span>
                    <textarea
                      name="mensagem"
                      value={contact.mensagem}
                      onChange={(event) =>
                        setContact((current) => ({
                          ...current,
                          mensagem: event.target.value,
                        }))
                      }
                      placeholder="Conte como sua empresa vende e o que gostaria de melhorar."
                    />
                  </label>
                  <p className={styles.formHint}>
                    Informe seu nome e pelo menos um canal de retorno: WhatsApp
                    ou e-mail. Ao enviar, os dados serão usados para responder
                    ao seu contato.{" "}
                    <Link href="/politica-de-privacidade">
                      Leia a política de privacidade.
                    </Link>
                  </p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={styles.button}
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}{" "}
                    {submitting ? "Enviando…" : "Enviar contato"}
                  </button>
                  {submitError && (
                    <p className={styles.formError} role="alert">
                      {submitError}
                    </p>
                  )}
                </form>
              </>
            ) : (
              <div role="status" className={styles.formSuccess}>
                <CheckCircle2 size={36} />
                <h2>Recebemos seu contato.</h2>
                <p>{submitState.message}</p>
                <Link href="/precos" className={styles.textLink}>
                  Conhecer os planos
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
