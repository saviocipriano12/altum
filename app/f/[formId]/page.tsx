import { notFound } from "next/navigation";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeCaptureFields } from "@/lib/capture-form";
import { normalizeCaptureLandingConfig } from "@/lib/capture-landing";
import PublicCaptureForm from "./public-capture-form";

type Props = {
  params: Promise<{ formId: string }>;
};

async function getForm(formId: string) {
  const formSnap = await adminDb.collection("capture_forms").doc(formId).get();
  if (!formSnap.exists) return null;

  const data = formSnap.data() as Record<string, unknown>;
  if (String(data.status || "draft") !== "active") return null;

  const tenantId = String(data.tenantId || "").trim();
  if (!tenantId) return null;

  const settingsSnap = await adminDb.collection("tenant_settings").doc(tenantId).get();
  const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};

  return {
    id: formSnap.id,
    tenantId,
    title: String(data.name || "Formulario"),
    description: String(data.description || ""),
    successMessage: String(data.successMessage || "Lead recebido com sucesso."),
    submitLabel: String(data.submitLabel || "Enviar"),
    widgetGreeting: String(data.widgetGreeting || "Digite sua mensagem para iniciar o atendimento."),
    requirePhone: Boolean(data.requirePhone),
    requireEmail: Boolean(data.requireEmail),
    collectCompany: data.collectCompany !== false,
    collectMessage: data.collectMessage !== false,
    fields: normalizeCaptureFields(data.fields),
    landing: normalizeCaptureLandingConfig(data.landing),
    companyName: String(settings.name || "ALTUM Client Cloud"),
    niche: String(settings.niche || ""),
  };
}

export default async function PublicFormPage({ params }: Props) {
  const { formId } = await params;
  const form = await getForm(formId);

  if (!form) notFound();

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_520px]">
          <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_28%)] p-8">
            <p className="text-[12px] font-bold italic tracking-widest text-white/78">ALTUM</p>
            <div className="mt-6 inline-flex rounded-full border border-blue-300/25 bg-blue-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-100">
              {form.landing.badge}
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {form.landing.heroTitle || form.companyName}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">
              {form.landing.heroDescription || form.description || "Preencha o formulario para entrar direto no funil comercial da operacao."}
            </p>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {form.landing.metrics.map((metric) => (
                <PublicInfo key={`${metric.label}_${metric.value}`} title={metric.label} value={metric.value} />
              ))}
            </div>
            {form.landing.highlights.length ? (
              <div className="mt-8 grid gap-3 md:grid-cols-2">
                {form.landing.highlights.map((highlight) => (
                  <div key={highlight} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/76">
                    {highlight}
                  </div>
                ))}
              </div>
            ) : null}
            {form.landing.testimonials.length ? (
              <div className="mt-8 grid gap-3">
                {form.landing.testimonials.slice(0, 2).map((item) => (
                  <div key={`${item.author}_${item.quote}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm leading-6 text-white/74">&ldquo;{item.quote}&rdquo;</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.14em] text-white/42">
                      {item.author}
                      {item.role ? ` · ${item.role}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            {form.niche ? (
              <p className="mt-6 text-sm uppercase tracking-[0.14em] text-white/42">{form.niche}</p>
            ) : null}
            <p className="mt-6 text-sm text-white/48">{form.landing.ctaNote}</p>
            {form.landing.faq.length ? (
              <div className="mt-8 space-y-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/42">FAQ rapido</p>
                {form.landing.faq.slice(0, 3).map((item) => (
                  <div key={item.question} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">{item.question}</p>
                    <p className="mt-2 text-sm leading-6 text-white/62">{item.answer}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-[32px] border border-white/10 bg-[#101010] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/42">{form.landing.formCardTitle}</p>
              <p className="mt-2 text-sm leading-6 text-white/62">{form.landing.formCardDescription}</p>
            </div>
            <PublicCaptureForm
              formId={form.id}
              title={form.title}
              description={form.description}
              successMessage={form.successMessage}
              submitLabel={form.submitLabel}
              requirePhone={form.requirePhone}
              requireEmail={form.requireEmail}
              collectCompany={form.collectCompany}
              collectMessage={form.collectMessage}
              widgetGreeting={form.widgetGreeting}
              fields={form.fields}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function PublicInfo({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/42">{title}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}
