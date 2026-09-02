"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
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
  const [interestId, setInterestId] = useState(() =>
    normalizeCommercialInterest(searchParams.get("interest"))
  );
  const [contact, setContact] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    mensagem: "",
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
    [searchParams]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    } catch {
      setSubmitError("Falha ao enviar contato.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="formulario-comercial" className="bg-black px-5 pb-24 lg:px-8 lg:pb-32">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-white/10 bg-[#0b0b0b] p-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">Sua próxima etapa</p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.05em] text-white">
            Vamos entender onde a Altum pode gerar mais avanço.
          </h2>
          <p className="mt-4 text-lg leading-8 text-white/68">
            Escolha o assunto e conte brevemente como sua operação funciona. A conversa já começa com contexto para irmos direto ao que importa.
          </p>

          <div className="mt-8 space-y-3">
            {publicCommercialInterests.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setInterestId(item.id)}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                  item.id === interest.id
                    ? "border-[#e85002]/45 bg-[#e85002]/12"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-white/62">{item.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[#0b0b0b] p-6 shadow-[0_40px_120px_-48px_rgba(232,80,2,0.34)]">
          {!submitState ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff6a1f]">Contato comercial</p>
                  <h3 className="mt-4 text-3xl font-extrabold tracking-[-0.04em] text-white">{interest.title}</h3>
                </div>
                <div className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/62">
                  {interest.shortLabel}
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-white/64">{interest.description}</p>

              <form onSubmit={handleSubmit} className="mt-7 grid gap-3">
                <Field
                  label="Nome"
                  value={contact.nome}
                  onChange={(value) => setContact((current) => ({ ...current, nome: value }))}
                  placeholder="Seu nome"
                  required
                />
                <Field
                  label="WhatsApp"
                  value={contact.telefone}
                  onChange={(value) => setContact((current) => ({ ...current, telefone: value }))}
                  placeholder="+55 11 99999-9999"
                />
                <Field
                  label="Email"
                  type="email"
                  value={contact.email}
                  onChange={(value) => setContact((current) => ({ ...current, email: value }))}
                  placeholder="voce@empresa.com"
                />
                <Field
                  label="Empresa"
                  value={contact.empresa}
                  onChange={(value) => setContact((current) => ({ ...current, empresa: value }))}
                  placeholder="Nome da empresa"
                />
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/55">Contexto</span>
                  <textarea
                    value={contact.mensagem}
                    onChange={(event) =>
                      setContact((current) => ({ ...current, mensagem: event.target.value }))
                    }
                    placeholder="Conte objetivo, urgencia, ticket ou onde esta travando hoje."
                    className="min-h-[140px] w-full rounded-[20px] border border-white/12 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  />
                </label>

                <p className="text-xs leading-6 text-white/44">
                  Informe pelo menos nome e um canal de retorno: WhatsApp ou email.
                </p>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#e85002] px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-[#ff5c0b] disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar contato
                  </button>
                </div>
              </form>

              {submitError ? (
                <div className="mt-4 rounded-[20px] border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {submitError}
                </div>
              ) : null}
            </>
          ) : (
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Lead salvo no CRM
              </div>
              <h3 className="mt-5 text-4xl font-semibold text-white">{interest.title}</h3>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-white/70">{submitState.message}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/precos"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:text-white"
                >
                  Ver planos
                </Link>
              </div>

              <p className="mt-6 text-sm text-white/52">
                Lead ID: <span className="font-mono text-white/78">{submitState.leadId}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "email";
  required?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[20px] border border-white/12 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
      />
    </label>
  );
}
