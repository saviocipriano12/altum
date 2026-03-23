import { notFound } from "next/navigation";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeCaptureFields } from "@/lib/capture-form";
import WidgetChatClient from "./widget-chat-client";

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
    title: String(data.name || "Atendimento"),
    description: String(data.description || "Fale com nossa equipe pelo chat do site."),
    successMessage: String(data.successMessage || "Mensagem enviada."),
    widgetGreeting: String(data.widgetGreeting || "Digite sua mensagem para iniciar o atendimento."),
    submitLabel: String(data.submitLabel || "Enviar"),
    requirePhone: Boolean(data.requirePhone),
    requireEmail: Boolean(data.requireEmail),
    collectCompany: data.collectCompany !== false,
    collectMessage: data.collectMessage !== false,
    fields: normalizeCaptureFields(data.fields),
  };
}

export default async function WidgetFormPage({ params }: Props) {
  const { formId } = await params;
  const form = await getForm(formId);

  if (!form) notFound();

  return (
    <main className="min-h-screen bg-transparent p-0 text-white">
      <WidgetChatClient
        formId={form.id}
        title={form.title}
        description={form.description}
        greeting={form.widgetGreeting}
        startLabel={form.submitLabel}
        requirePhone={form.requirePhone}
        requireEmail={form.requireEmail}
        collectCompany={form.collectCompany}
        collectMessage={form.collectMessage}
        fields={form.fields}
      />
    </main>
  );
}
