"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import {
  groupCaptureFieldsByStep,
  isCaptureFieldVisible,
  type CaptureFieldDefinition,
} from "@/lib/capture-form";

type Props = {
  formId: string;
  title: string;
  description?: string;
  successMessage: string;
  submitLabel?: string;
  widgetGreeting?: string;
  requirePhone?: boolean;
  requireEmail?: boolean;
  collectCompany?: boolean;
  collectMessage?: boolean;
  fields?: CaptureFieldDefinition[];
};

export default function PublicCaptureForm({
  formId,
  title,
  description,
  successMessage,
  submitLabel,
  widgetGreeting,
  requirePhone,
  requireEmail,
  collectCompany,
  collectMessage,
  fields = [],
}: Props) {
  const searchParams = useSearchParams();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    mensagem: "",
  });
  const [customFields, setCustomFields] = useState<Record<string, string | number | boolean>>({});
  const [currentStep, setCurrentStep] = useState(1);

  const utm = useMemo(
    () => ({
      utmSource: searchParams.get("utm_source") || "",
      utmMedium: searchParams.get("utm_medium") || "",
      utmCampaign: searchParams.get("utm_campaign") || "",
    }),
    [searchParams]
  );
  const visibleFields = useMemo(
    () => fields.filter((field) => isCaptureFieldVisible(field, customFields)),
    [customFields, fields]
  );
  const steps = useMemo(() => {
    const groups = groupCaptureFieldsByStep(visibleFields);
    return groups.length > 0 ? groups : [];
  }, [visibleFields]);
  const totalSteps = Math.max(1, steps.length + 1);
  const currentCustomStep = steps.find((item) => item.step === currentStep - 1);

  function isBaseStepValid() {
    return Boolean(
      form.nome.trim() &&
        (!requireEmail || form.email.trim()) &&
        (!requirePhone || form.telefone.trim())
    );
  }

  function isCurrentStepValid() {
    if (currentStep === 1) return isBaseStepValid();
    if (!currentCustomStep) return true;
    return currentCustomStep.items.every((field) => {
      if (!field.required) return true;
      const value = customFields[field.id];
      if (typeof value === "boolean") return value === true;
      return String(value ?? "").trim().length > 0;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customFields,
          ...utm,
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar formulario.");
        return;
      }

      setSent(true);
      setForm({ nome: "", email: "", telefone: "", empresa: "", mensagem: "" });
      setCustomFields({});
      setCurrentStep(1);
    } catch {
      setError("Falha ao enviar formulario.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
        <div className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-500/10 p-3 text-emerald-100">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-white">Recebemos seu contato</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/62">{successMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12px] uppercase tracking-[0.16em] text-white/42">Formulario publico</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/58">
        {description || "Preencha os dados abaixo para entrar no fluxo comercial desta operacao."}
      </p>
      {widgetGreeting ? <p className="mt-2 text-xs text-white/42">{widgetGreeting}</p> : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-white/58">
          <span>Etapa {currentStep} de {totalSteps}</span>
          <span>{currentStep === 1 ? "Dados principais" : "Qualificacao"}</span>
        </div>

        {currentStep === 1 ? (
          <>
            <Field label="Nome" value={form.nome} onChange={(value) => setForm((current) => ({ ...current, nome: value }))} placeholder="Seu nome" required />
            <Field label="Telefone" value={form.telefone} onChange={(value) => setForm((current) => ({ ...current, telefone: value }))} placeholder="+55 11 99999-9999" required={Boolean(requirePhone)} />
            <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="voce@empresa.com" required={Boolean(requireEmail)} />
            {collectCompany !== false ? (
              <Field label="Empresa" value={form.empresa} onChange={(value) => setForm((current) => ({ ...current, empresa: value }))} placeholder="Nome da empresa" />
            ) : null}
            {collectMessage !== false ? (
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-white/55">Mensagem</span>
                <textarea
                  value={form.mensagem}
                  onChange={(event) => setForm((current) => ({ ...current, mensagem: event.target.value }))}
                  placeholder="Conte um pouco do seu momento, objetivo ou demanda."
                  className="min-h-[120px] w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
            ) : null}
          </>
        ) : (
          currentCustomStep?.items.map((field) => (
            <DynamicField
              key={field.id}
              field={field}
              value={customFields[field.id]}
              onChange={(value) => setCustomFields((current) => ({ ...current, [field.id]: value }))}
            />
          ))
        )}

        <div className="flex flex-wrap gap-2">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((current) => Math.max(1, current - 1))}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
            >
              Voltar
            </button>
          ) : null}

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={() => setCurrentStep((current) => Math.min(totalSteps, current + 1))}
              disabled={!isCurrentStepValid()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              Proxima etapa
            </button>
          ) : (
            <button
              type="submit"
              disabled={sending || !isCurrentStepValid()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitLabel || "Enviar"}
            </button>
          )}
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CaptureFieldDefinition;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const commonLabel = (
    <span className="text-xs uppercase tracking-[0.14em] text-white/55">
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );

  if (field.type === "textarea") {
    return (
      <label className="block space-y-1">
        {commonLabel}
        <textarea
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="min-h-[120px] w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
        />
        {field.helperText ? <p className="text-xs text-white/42">{field.helperText}</p> : null}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block space-y-1">
        {commonLabel}
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none"
        >
          <option value="">Selecione</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.helperText ? <p className="text-xs text-white/42">{field.helperText}</p> : null}
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <button
        type="button"
        onClick={() => onChange(!(value === true))}
        className={`rounded-2xl border p-4 text-left transition ${
          value === true ? "border-blue-300/30 bg-blue-400/[0.08]" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{field.label}</p>
            {field.helperText ? <p className="mt-2 text-xs leading-5 text-white/56">{field.helperText}</p> : null}
          </div>
          <ShieldCheck className={`h-4 w-4 ${value === true ? "text-emerald-200" : "text-white/30"}`} />
        </div>
      </button>
    );
  }

  return (
    <Field
      label={field.label}
      value={String(value ?? "")}
      onChange={(nextValue) => onChange(field.type === "number" ? Number(nextValue || 0) : nextValue)}
      placeholder={field.placeholder}
      type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
      required={field.required}
    />
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
      />
    </label>
  );
}
