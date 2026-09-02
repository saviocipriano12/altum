"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import {
  buildDiagnosticSummary,
  classifyDiagnosticLead,
  diagnosticQuestions,
  getDiagnosticAnswerDetails,
  type DiagnosticAnswerMap,
} from "@/lib/diagnostic";

type SubmitState = {
  leadId: string;
  message: string;
  whatsappUrl: string;
};

type ContactState = {
  nome: string;
  empresa: string;
  telefone: string;
  email: string;
};

const TOTAL_STEPS = 6;

export function DiagnosticWizard() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticAnswerMap>({});
  const [contact, setContact] = useState<ContactState>({
    nome: "",
    empresa: "",
    telefone: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);

  const utm = useMemo(
    () => ({
      entry: searchParams.get("entry") || "",
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

  const classification = useMemo(() => classifyDiagnosticLead(answers), [answers]);
  const recommendation = classification.recommendation;
  const completed = step >= TOTAL_STEPS;
  const answerDetails = useMemo(() => getDiagnosticAnswerDetails(answers), [answers]);
  function updateContact<K extends keyof ContactState>(key: K, value: ContactState[K]) {
    setContact((current) => ({ ...current, [key]: value }));
  }

  function updateAnswer(key: keyof DiagnosticAnswerMap, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function canContinueCurrentStep() {
    if (step === 0) {
      return contact.nome.trim().length >= 3 && contact.empresa.trim().length >= 2;
    }

    if (step === 1) {
      return contact.telefone.trim().length >= 8 && contact.email.trim().length >= 5;
    }

    if (step === 2) {
      return Boolean(answers.revenue && answers.segment);
    }

    if (step === 3) {
      return Boolean(answers.role);
    }

    if (step === 4) {
      return Boolean(answers.timeline);
    }

    if (step === 5) {
      return Boolean(answers.budget);
    }

    return false;
  }

  function goNext() {
    if (!canContinueCurrentStep()) return;
    setStep((current) => current + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/public/diagnostic/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contact,
          answers,
          ...utm,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        leadId?: string;
        message?: string;
        whatsappUrl?: string;
      };

      if (!response.ok || !payload.leadId || !payload.message || !payload.whatsappUrl) {
        setSubmitError(payload.error || "Falha ao enviar quiz.");
        return;
      }

      setSubmitState({
        leadId: payload.leadId,
        message: payload.message,
        whatsappUrl: payload.whatsappUrl,
      });
    } catch {
      setSubmitError("Falha ao enviar quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[#111111]/95 shadow-[0_40px_120px_-48px_rgba(245,110,15,0.32)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,110,15,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#f8a25d]">Quiz estrategico Altum</p>
            <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
              Um diagnóstico rápido para entender sua operação e indicar o melhor ponto de entrada na Altum.
            </h2>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/64">
            {completed ? "Resumo final" : `Etapa ${step + 1} de ${TOTAL_STEPS}`}
          </div>
        </div>

        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#f8a25d_0%,#f56e0f_55%,#fff2e6_100%)] transition-all duration-300"
            style={{ width: `${Math.min(((step + 1) / (TOTAL_STEPS + 1)) * 100, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="px-6 py-6 md:px-8 md:py-8">
          {submitState ? (
            <SuccessState leadId={submitState.leadId} message={submitState.message} whatsappUrl={submitState.whatsappUrl} />
          ) : completed ? (
            <ReviewStep
              contact={contact}
              recommendationTitle={recommendation.title}
              recommendationDescription={recommendation.description}
              answerDetails={answerDetails}
              summary={buildDiagnosticSummary(answers)}
              submitError={submitError}
              submitting={submitting}
              onBack={() => setStep(TOTAL_STEPS - 1)}
              onSubmit={handleSubmit}
            />
          ) : (
            <StepRenderer
              step={step}
              contact={contact}
              answers={answers}
              canContinue={canContinueCurrentStep()}
              onContactChange={updateContact}
              onAnswerChange={updateAnswer}
              onBack={step > 0 ? () => setStep((current) => current - 1) : null}
              onNext={goNext}
              onQuickAdvance={(key, value) => {
                updateAnswer(key, value);
                setStep((current) => current + 1);
              }}
            />
          )}
        </div>

        <aside className="border-t border-white/10 bg-black/20 px-6 py-6 lg:border-l lg:border-t-0">
          <p className="text-xs uppercase tracking-[0.22em] text-[#f8a25d]">Como isso entra na Altum</p>
          <div className="mt-5 space-y-4">
            <SideCard
              title="Lead com contexto"
              description="Nome, empresa, segmento, cargo, prazo e verba entram juntos no CRM da Altum."
            />
            <SideCard
              title="Rota sugerida"
              description={`O diagnóstico já aponta um caminho provável: ${recommendation.title}.`}
            />
            <SideCard
              title="Fila comercial"
              description={
                classification.isPrimaryIcp
                  ? "Leads acima do ICP principal seguem com prioridade comercial conforme temperatura e pagina de entrada."
                  : "Leads abaixo de R$ 30 mil continuam entrando e ficam organizados como contato frio para servicos de entrada."
              }
            />
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f56e0f]/15 bg-[#f56e0f]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f8a25d]">
              <Sparkles className="h-3.5 w-3.5" />
              Logica comercial
            </div>
            <p className="mt-4 text-sm leading-7 text-white/68">
              O cliente responde rapido. A Altum recebe o lead com contexto, rota sugerida e entrada da pagina ja registrada.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepRenderer({
  step,
  contact,
  answers,
  canContinue,
  onContactChange,
  onAnswerChange,
  onBack,
  onNext,
  onQuickAdvance,
}: {
  step: number;
  contact: ContactState;
  answers: DiagnosticAnswerMap;
  canContinue: boolean;
  onContactChange: <K extends keyof ContactState>(key: K, value: ContactState[K]) => void;
  onAnswerChange: (key: keyof DiagnosticAnswerMap, value: string) => void;
  onBack: (() => void) | null;
  onNext: () => void;
  onQuickAdvance: (key: keyof DiagnosticAnswerMap, value: string) => void;
}) {
  if (step === 0) {
    return (
      <StepLayout
        eyebrow="Etapa 1"
        title="Vamos comecar pelo basico para te atender do jeito certo."
        description="Nada burocratico. Em poucos minutos a Altum ja entende quem esta do outro lado."
        onBack={onBack}
        onNext={onNext}
        canContinue={canContinue}
        nextLabel="Continuar"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Seu nome e sobrenome"
            value={contact.nome}
            onChange={(value) => onContactChange("nome", value)}
            placeholder="Ex: Maria Souza"
            required
          />
          <Field
            label="Nome da empresa"
            value={contact.empresa}
            onChange={(value) => onContactChange("empresa", value)}
            placeholder="Ex: Studio Prime"
            required
          />
        </div>
      </StepLayout>
    );
  }

  if (step === 1) {
    return (
      <StepLayout
        eyebrow="Etapa 2"
        title="Agora me passa os melhores canais para seguirmos essa conversa."
        description="Esses dados entram no CRM da Altum junto com o quiz, para o comercial nao precisar voltar ao zero."
        onBack={onBack}
        onNext={onNext}
        canContinue={canContinue}
        nextLabel="Continuar"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Qual o melhor WhatsApp para falarmos com voce?"
            value={contact.telefone}
            onChange={(value) => onContactChange("telefone", value)}
            placeholder="+55 11 99999-9999"
            required
          />
          <Field
            label="Qual e seu melhor e-mail?"
            type="email"
            value={contact.email}
            onChange={(value) => onContactChange("email", value)}
            placeholder="voce@empresa.com"
            required
          />
        </div>
      </StepLayout>
    );
  }

  if (step === 2) {
    const revenueQuestion = diagnosticQuestions.find((item) => item.id === "revenue");
    const segmentQuestion = diagnosticQuestions.find((item) => item.id === "segment");

    return (
      <StepLayout
        eyebrow="Etapa 3"
        title="Isso ajuda a Altum a entender o nivel da estrutura que faz sentido para voce."
        description="Aqui entram duas respostas rapidas. A ideia e ajustar a conversa para o seu momento real."
        onBack={onBack}
        onNext={onNext}
        canContinue={canContinue}
        nextLabel="Continuar"
      >
        <div className="space-y-6">
          <ChoiceGroup
            title={revenueQuestion?.title || ""}
            description={revenueQuestion?.description || ""}
            options={revenueQuestion?.options || []}
            value={answers.revenue || ""}
            onChange={(value) => onAnswerChange("revenue", value)}
          />
          <ChoiceGroup
            title={segmentQuestion?.title || ""}
            description={segmentQuestion?.description || ""}
            options={segmentQuestion?.options || []}
            value={answers.segment || ""}
            onChange={(value) => onAnswerChange("segment", value)}
          />
        </div>
      </StepLayout>
    );
  }

  if (step === 3) {
    const question = diagnosticQuestions.find((item) => item.id === "role");
    return (
      <QuestionStep
        eyebrow="Etapa 4"
        title={question?.title || ""}
        description={question?.description || ""}
        options={question?.options || []}
        value={answers.role || ""}
        onBack={onBack}
        onSelect={(value) => onQuickAdvance("role", value)}
      />
    );
  }

  if (step === 4) {
    const question = diagnosticQuestions.find((item) => item.id === "timeline");
    return (
      <QuestionStep
        eyebrow="Etapa 5"
        title={question?.title || ""}
        description={question?.description || ""}
        options={question?.options || []}
        value={answers.timeline || ""}
        onBack={onBack}
        onSelect={(value) => onQuickAdvance("timeline", value)}
      />
    );
  }

  const question = diagnosticQuestions.find((item) => item.id === "budget");
  return (
    <QuestionStep
      eyebrow="Etapa 6"
      title={question?.title || ""}
      description={question?.description || ""}
      options={question?.options || []}
      value={answers.budget || ""}
      onBack={onBack}
      onSelect={(value) => onQuickAdvance("budget", value)}
    />
  );
}

function StepLayout({
  eyebrow,
  title,
  description,
  children,
  onBack,
  onNext,
  canContinue,
  nextLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  onBack: (() => void) | null;
  onNext: () => void;
  canContinue: boolean;
  nextLabel: string;
}) {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-[#f8a25d]">{eyebrow}</p>
      <h3 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-4xl">{title}</h3>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 md:text-base">{description}</p>

      <div className="mt-8">{children}</div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white/78 transition hover:border-white/22 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </button>
        ) : null}

        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="inline-flex items-center gap-2 rounded-full bg-[#f56e0f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#ff7f26] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function QuestionStep({
  eyebrow,
  title,
  description,
  options,
  value,
  onBack,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  description: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onBack: (() => void) | null;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-[#f8a25d]">{eyebrow}</p>
      <h3 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-4xl">{title}</h3>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 md:text-base">{description}</p>

      <div className="mt-8 grid gap-3">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={`rounded-[22px] border px-5 py-4 text-left transition ${
                active
                  ? "border-[#f56e0f]/40 bg-[#f56e0f]/12"
                  : "border-white/10 bg-white/[0.03] hover:border-[#f56e0f]/25 hover:bg-[#f56e0f]/8"
              }`}
            >
              <span className="text-base font-semibold text-white">{option.label}</span>
            </button>
          );
        })}
      </div>

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white/78 transition hover:border-white/22 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
      ) : null}
    </>
  );
}

function ReviewStep({
  contact,
  recommendationTitle,
  recommendationDescription,
  answerDetails,
  summary,
  submitError,
  submitting,
  onBack,
  onSubmit,
}: {
  contact: ContactState;
  recommendationTitle: string;
  recommendationDescription: string;
  answerDetails: Array<{ id: string; title: string; label: string }>;
  summary: string;
  submitError: string | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
        <CheckCircle2 className="h-4 w-4" />
        Quiz montado
      </div>

      <h3 className="mt-5 text-3xl font-semibold text-white md:text-4xl">{recommendationTitle}</h3>
      <p className="mt-4 max-w-3xl text-base leading-8 text-white/72">{recommendationDescription}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#f8a25d]">Resumo enviado para a Altum</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <SummaryItem label="Contato" value={contact.nome} />
            <SummaryItem label="Empresa" value={contact.empresa} />
            <SummaryItem label="WhatsApp" value={contact.telefone} />
            <SummaryItem label="E-mail" value={contact.email} />
          </div>

          <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
            {answerDetails.map((item) => (
              <SummaryLine key={item.id} label={item.title} value={item.label} />
            ))}
          </div>
        </div>

        <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#f8a25d]">Antes de enviar</p>
          <p className="mt-4 text-sm leading-7 text-white/68">
            Seu lead vai entrar na base da Altum com contexto, rota sugerida e dados suficientes para o comercial agir sem retrabalho.
          </p>
          <p className="mt-4 text-xs leading-6 text-white/40">{summary}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white/78 transition hover:border-white/22 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-[#f56e0f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#ff7f26] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar diagnóstico
        </button>
      </form>

      {submitError ? (
        <div className="mt-4 rounded-[20px] border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {submitError}
        </div>
      ) : null}
    </div>
  );
}

function SuccessState({
  leadId,
  message,
  whatsappUrl,
}: {
  leadId: string;
  message: string;
  whatsappUrl: string;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
        <CheckCircle2 className="h-4 w-4" />
        Lead salvo no CRM da Altum
      </div>

      <h3 className="mt-5 text-3xl font-semibold text-white md:text-4xl">Quiz enviado com sucesso.</h3>
      <p className="mt-4 max-w-3xl text-base leading-8 text-white/72">{message}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={whatsappUrl}
          className="inline-flex items-center gap-2 rounded-full bg-[#f56e0f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ff7f26]"
        >
          Abrir WhatsApp com contexto <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/precos"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:text-white"
        >
          Ver planos
        </Link>
      </div>

      <p className="mt-6 text-sm text-white/52">
        Lead ID: <span className="font-mono text-white/78">{leadId}</span>
      </p>
    </div>
  );
}

function ChoiceGroup({
  title,
  description,
  options,
  value,
  onChange,
}: {
  title: string;
  description: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-white/56">{description}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-[22px] border px-4 py-4 text-left transition ${
                active
                  ? "border-[#f56e0f]/40 bg-[#f56e0f]/12"
                  : "border-white/10 bg-white/[0.03] hover:border-[#f56e0f]/25 hover:bg-[#f56e0f]/8"
              }`}
            >
              <span className="text-sm font-semibold text-white">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
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

function SideCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-white/64">{description}</p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value || "-"}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 border-b border-white/8 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[0.92fr_1.08fr]">
      <p className="text-xs uppercase tracking-[0.14em] text-white/42">{label}</p>
      <p className="text-sm leading-7 text-white/74">{value}</p>
    </div>
  );
}
