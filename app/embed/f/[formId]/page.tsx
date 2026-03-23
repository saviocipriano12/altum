import { notFound } from "next/navigation";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeCaptureFields } from "@/lib/capture-form";
import PublicCaptureForm from "@/app/f/[formId]/public-capture-form";

type Props = {
  params: Promise<{ formId: string }>;
};

async function getForm(formId: string) {
  const formSnap = await adminDb.collection("capture_forms").doc(formId).get();
  if (!formSnap.exists) return null;

  const data = formSnap.data() as Record<string, unknown>;
  if (String(data.status || "draft") !== "active") return null;

  return {
    id: formSnap.id,
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
  };
}

export default async function EmbeddedFormPage({ params }: Props) {
  const { formId } = await params;
  const form = await getForm(formId);

  if (!form) notFound();

  return (
    <main className="min-h-screen bg-transparent p-0 text-white">
      <div className="rounded-[28px] border border-white/10 bg-[#101010] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
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
      </div>
    </main>
  );
}
