import { NextResponse } from "next/server";
import { AGENCY_TENANT_ID } from "@/app/lib/server/whatsapp-channel";
import {
  buildCommercialContactUrl,
  getCommercialInterest,
  normalizeCommercialInterest,
} from "@/lib/commercial-contact";
import { buildWhatsappUrl } from "@/lib/public-site";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";

type Body = {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  interest?: string;
  sourcePage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  landingPage?: string;
  referrer?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    await assertPublicRateLimit(req, { scope: "contact_submit", limit: 5, windowMs: 60 * 60 * 1000 });
    const body = (await req.json()) as Body;

    const nome = clean(body.nome, 180);
    const email = clean(body.email, 180).toLowerCase();
    const telefone = clean(body.telefone, 40);
    const empresa = clean(body.empresa, 180);
    const mensagem = clean(body.mensagem, 4000);
    const interestId = normalizeCommercialInterest(body.interest);
    const interest = getCommercialInterest(interestId);
    const sourcePage = clean(body.sourcePage, 240) || buildCommercialContactUrl(interestId);
    const utmSource = clean(body.utmSource, 120);
    const utmMedium = clean(body.utmMedium, 120);
    const utmCampaign = clean(body.utmCampaign, 180);
    const utmTerm = clean(body.utmTerm, 160);
    const utmContent = clean(body.utmContent, 240);
    const gclid = clean(body.gclid, 240);
    const fbclid = clean(body.fbclid, 240);
    const landingPage = clean(body.landingPage, 500);
    const referrer = clean(body.referrer, 500);

    if (!nome || (!email && !telefone)) {
      return NextResponse.json(
        { error: "Informe pelo menos nome e telefone ou email para continuar." },
        { status: 400 }
      );
    }

    const lead = await recordInboundLead({
      tenantId: AGENCY_TENANT_ID,
      sourceType: "site_contact",
      sourceId: `contato_${interestId}`,
      sourceLabel: "Contato Altum",
      channel: "site_form",
      nome,
      email,
      telefone,
      empresa,
      mensagem,
      customFields: {
        interesse_comercial: interest.id,
        interesse_comercial_label: interest.title,
        pagina_origem: sourcePage,
        landing_page_publica: landingPage,
      },
      notes: [
        `Interesse comercial: ${interest.title}`,
        sourcePage ? `Pagina de origem: ${sourcePage}` : "",
      ].filter(Boolean),
      tags: ["contato_altum", "lead_publico", "site_form", interest.id],
      defaultPipelineStage: interest.id === "diagnostico" ? "diagnostico" : "captado",
      attribution: {
        source: utmSource || "contato_altum",
        medium: utmMedium || "site",
        campaign: utmCampaign,
        term: utmTerm,
        content: utmContent,
        formId: `contato_${interest.id}`,
        formName: `Contato Altum - ${interest.title}`,
        sourceLabel: "Contato Altum",
        channel: "site_form",
        sourceType: "site_contact",
        landingPage,
        referrer,
        gclid,
        fbclid,
      },
      submission: {
        formId: `contato_${interest.id}`,
        formName: `Contato Altum - ${interest.title}`,
        sourceLabel: "Contato Altum",
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        gclid,
        fbclid,
        landingPage,
        referrer,
      },
      automationActorId: "altum_public_contact",
      automationActorName: "ALTUM Contato",
    });

    const whatsappMessage = `Ola, preenchi o contato da Altum com interesse em ${interest.title}. Nome: ${nome}. Empresa: ${empresa || "nao informada"}.`;

    return NextResponse.json({
      ok: true,
      leadId: lead.leadId,
      interest,
      whatsappUrl: buildWhatsappUrl(whatsappMessage),
      message:
        "Contato recebido. A equipe ja pode ver esse lead no CRM da Altum com interesse comercial e origem preenchidos.",
    });
  } catch (error) {
    if (error instanceof PublicRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    console.error("Erro ao processar contato publico:", error);
    return NextResponse.json({ error: "Falha ao enviar contato." }, { status: 500 });
  }
}
