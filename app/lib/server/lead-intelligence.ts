type LeadResearchInput = {
  id: string;
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  website?: string;
  cnpj?: string;
  instagram?: string;
  linkedin?: string;
  categoria?: string;
  origem?: string;
  rating?: number;
  userRatingsTotal?: number;
  notes?: string;
};

type WebsiteInsights = {
  requestedUrl?: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  socialLinks: string[];
  adSignals: string[];
  cnpjDetected?: string;
  errors: string[];
};

type CnpjInsights = {
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnaeDescricao?: string;
  municipio?: string;
  uf?: string;
  ownerName?: string;
  capitalSocial?: string;
  sourceUrl?: string;
};

export type LeadProposalDraft = {
  headline: string;
  whyNow: string;
  firstContactMessage: string;
  emailSubject: string;
  suggestedServices: string[];
  nextSteps: string[];
  confidence: number;
  model: string;
};

export type LeadIntelligencePayload = {
  status: "ready";
  summary: string;
  confidence: number;
  legalName?: string;
  tradeName?: string;
  ownerName?: string;
  cnpjDetected?: string;
  segment?: string;
  city?: string;
  state?: string;
  website?: string;
  websiteTitle?: string;
  websiteDescription?: string;
  socialLinks: string[];
  adSignals: string[];
  adMaturity: "none" | "basic" | "active";
  sources: string[];
  errors?: string[];
};

export type LeadIntelligenceResult = {
  intelligence: LeadIntelligencePayload;
  proposalDraft: LeadProposalDraft;
};

type BrasilApiCnpjResponse = {
  razao_social?: string;
  nome_fantasia?: string;
  cnae_fiscal_descricao?: string;
  municipio?: string;
  uf?: string;
  capital_social?: string;
  socios?: Array<{
    nome_socio?: string;
    qualificacao_socio?: string;
  }>;
};

const WEBSITE_TIMEOUT_MS = 9_000;
const CNPJ_TIMEOUT_MS = 8_000;

function cleanText(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 8, maxLen = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUrl(url?: string) {
  const raw = cleanText(url, 600);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function normalizeCnpj(value?: string) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

function formatCnpj(digits?: string) {
  const cnpj = normalizeCnpj(digits);
  if (!cnpj) return "";
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function uniqueList(items: string[], maxItems = 12) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = cleanText(item, 500);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractByRegex(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1], 240);
    }
  }
  return "";
}

function detectCnpjInText(text: string) {
  const match = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  return normalizeCnpj(match?.[0]);
}

function detectSocialLinks(html: string) {
  const patterns = [
    /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/[A-Za-z0-9._/\-]+/gi,
    /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._/\-]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/[A-Za-z0-9._/\-?=]+/gi,
    /https?:\/\/(?:www\.)?tiktok\.com\/[A-Za-z0-9._/\-@]+/gi,
    /https?:\/\/wa\.me\/\d+/gi,
  ];

  const matches: string[] = [];
  for (const pattern of patterns) {
    const found = html.match(pattern) || [];
    matches.push(...found);
  }
  return uniqueList(matches, 10);
}

function detectAdSignals(html: string) {
  const lower = html.toLowerCase();
  const signals: string[] = [];

  const checks: Array<[string, string]> = [
    ["googletagmanager.com/gtm.js", "google_tag_manager"],
    ["gtag(", "google_analytics_or_ads"],
    ["googleadservices.com", "google_ads_conversion"],
    ["connect.facebook.net/en_us/fbevents.js", "meta_pixel"],
    ["fbq(", "meta_pixel"],
    ["analytics.tiktok.com", "tiktok_pixel"],
    ["snap.licdn.com/li.lms-analytics", "linkedin_insight_tag"],
  ];

  for (const [needle, signal] of checks) {
    if (lower.includes(needle)) {
      signals.push(signal);
    }
  }

  return uniqueList(signals, 8);
}

async function inspectWebsite(rawWebsite?: string): Promise<WebsiteInsights> {
  const requestedUrl = normalizeUrl(rawWebsite);
  if (!requestedUrl) {
    return {
      socialLinks: [],
      adSignals: [],
      errors: [],
    };
  }

  try {
    const response = await fetchWithTimeout(
      requestedUrl,
      {
        method: "GET",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; AltumLeadBot/1.0; +https://altum.ag)",
          accept: "text/html,application/xhtml+xml,application/xml",
        },
        redirect: "follow",
      },
      WEBSITE_TIMEOUT_MS
    );

    if (!response.ok) {
      return {
        requestedUrl,
        finalUrl: response.url || requestedUrl,
        socialLinks: [],
        adSignals: [],
        errors: [`website_http_${response.status}`],
      };
    }

    const htmlRaw = await response.text();
    const html = htmlRaw.slice(0, 400_000);
    const title = extractByRegex(html, [/<title[^>]*>([^<]+)<\/title>/i]);
    const description = extractByRegex(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    ]);
    const socialLinks = detectSocialLinks(html);
    const adSignals = detectAdSignals(html);
    const cnpjDetected = detectCnpjInText(html);

    return {
      requestedUrl,
      finalUrl: response.url || requestedUrl,
      title,
      description,
      socialLinks,
      adSignals,
      cnpjDetected,
      errors: [],
    };
  } catch (error) {
    const message =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: string }).name || "website_fetch_error")
        : "website_fetch_error";

    return {
      requestedUrl,
      finalUrl: requestedUrl,
      socialLinks: [],
      adSignals: [],
      errors: [message],
    };
  }
}

function pickLikelyOwnerName(data: BrasilApiCnpjResponse) {
  if (!Array.isArray(data.socios) || !data.socios.length) return "";

  const admins = data.socios.filter((socio) =>
    cleanText(socio.qualificacao_socio, 80).toLowerCase().includes("administr")
  );
  const first = admins[0] || data.socios[0];
  return cleanText(first?.nome_socio, 120);
}

async function inspectCnpj(rawCnpj?: string): Promise<CnpjInsights | null> {
  const cnpj = normalizeCnpj(rawCnpj);
  if (!cnpj) return null;

  const endpoint = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  try {
    const response = await fetchWithTimeout(
      endpoint,
      { method: "GET", headers: { accept: "application/json" } },
      CNPJ_TIMEOUT_MS
    );

    if (!response.ok) return null;

    const data = (await response.json()) as BrasilApiCnpjResponse;
    return {
      cnpj: formatCnpj(cnpj),
      razaoSocial: cleanText(data.razao_social, 200),
      nomeFantasia: cleanText(data.nome_fantasia, 200),
      cnaeDescricao: cleanText(data.cnae_fiscal_descricao, 180),
      municipio: cleanText(data.municipio, 120),
      uf: cleanText(data.uf, 20),
      ownerName: pickLikelyOwnerName(data),
      capitalSocial: cleanText(data.capital_social, 60),
      sourceUrl: endpoint,
    };
  } catch {
    return null;
  }
}

function inferAdMaturity(adSignals: string[]) {
  if (!adSignals.length) return "none" as const;
  if (adSignals.length === 1) return "basic" as const;
  return "active" as const;
}

function computeConfidence(input: {
  hasWebsite: boolean;
  hasWebsiteMetadata: boolean;
  hasCnpj: boolean;
  hasOwner: boolean;
  hasSocial: boolean;
  hasAdSignals: boolean;
  hasPhone: boolean;
  hasRating: boolean;
}) {
  let score = 28;
  if (input.hasWebsite) score += 10;
  if (input.hasWebsiteMetadata) score += 10;
  if (input.hasCnpj) score += 18;
  if (input.hasOwner) score += 12;
  if (input.hasSocial) score += 8;
  if (input.hasAdSignals) score += 7;
  if (input.hasPhone) score += 4;
  if (input.hasRating) score += 3;
  return clamp(score, 0, 100);
}

function suggestServices(input: {
  hasWebsite: boolean;
  adMaturity: "none" | "basic" | "active";
  hasSocial: boolean;
}) {
  const suggestions: string[] = [];
  if (!input.hasWebsite) {
    suggestions.push("Site de alta conversao com WhatsApp e SEO local");
  }
  if (input.adMaturity === "none") {
    suggestions.push("Setup de trafego pago (Google + Meta) com pixel e eventos");
  } else if (input.adMaturity === "basic") {
    suggestions.push("Otimizar campanhas atuais com funil e criativos");
  } else {
    suggestions.push("Escala de campanhas com foco em CPL e taxa de fechamento");
  }
  if (!input.hasSocial) {
    suggestions.push("Padronizacao de presenca social e ativos comerciais");
  }
  if (!suggestions.length) {
    suggestions.push("Diagnostico de crescimento com plano de 90 dias");
  }
  return suggestions.slice(0, 3);
}

function buildSummary(args: {
  lead: LeadResearchInput;
  website: WebsiteInsights;
  cnpj: CnpjInsights | null;
  adMaturity: "none" | "basic" | "active";
}) {
  const name = cleanText(args.lead.nome, 140) || "Empresa";
  const websitePart = args.website.finalUrl
    ? `Site identificado (${args.website.finalUrl}).`
    : "Nao foi encontrado site oficial valido.";
  const socialPart = args.website.socialLinks.length
    ? `Redes detectadas: ${args.website.socialLinks.length}.`
    : "Nao detectamos redes sociais no site.";
  const adsPart =
    args.adMaturity === "none"
      ? "Sem sinais claros de pixel/tags de anuncios."
      : args.adMaturity === "basic"
      ? "Ha sinais basicos de medicao de anuncios."
      : "Ha sinais ativos de stack de anuncios.";
  const legalPart = args.cnpj?.razaoSocial
    ? `Base legal encontrada: ${args.cnpj.razaoSocial}.`
    : "Sem validacao legal completa por CNPJ.";

  return `${name}: ${websitePart} ${socialPart} ${adsPart} ${legalPart}`;
}

function buildFallbackProposal(args: {
  lead: LeadResearchInput;
  intelligence: Omit<LeadIntelligencePayload, "status">;
}): LeadProposalDraft {
  const company = cleanText(args.lead.nome, 120) || "sua empresa";
  const services = suggestServices({
    hasWebsite: Boolean(args.intelligence.website),
    adMaturity: args.intelligence.adMaturity,
    hasSocial: args.intelligence.socialLinks.length > 0,
  });
  const firstService = services[0] || "Diagnostico de crescimento";

  return {
    headline: `Plano inicial para ${company}`,
    whyNow:
      args.intelligence.adMaturity === "none"
        ? "Seu lead tem potencial, mas ainda sem base de aquisicao previsivel."
        : "Ja existe estrutura, com espaco claro para ganho rapido de performance.",
    firstContactMessage: `Oi, tudo bem? Analisei rapidamente a presenca digital de ${company}. Posso te mostrar em 10 minutos como aplicar ${firstService.toLowerCase()} para gerar mais conversas qualificadas ainda este mes?`,
    emailSubject: `${company}: proposta inicial para acelerar captacao de leads`,
    suggestedServices: services,
    nextSteps: [
      "Validar objetivo comercial e ticket medio da operacao",
      "Apresentar plano de 30 dias com entregas e metas",
      "Iniciar setup tecnico e primeira campanha",
    ],
    confidence: clamp(Math.round(args.intelligence.confidence * 0.92), 0, 100),
    model: "fallback_rules_v1",
  };
}

async function buildAiProposal(args: {
  lead: LeadResearchInput;
  intelligence: Omit<LeadIntelligencePayload, "status">;
}): Promise<LeadProposalDraft | null> {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
  const apiKey = openAiApiKey || openRouterApiKey;
  if (!apiKey) return null;

  const model =
    cleanText(process.env.OPENAI_MODEL, 80) ||
    (openAiApiKey ? "gpt-4.1-mini" : "openai/gpt-4.1-mini");
  const endpoint = openAiApiKey
    ? "https://api.openai.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const promptPayload = {
    lead: {
      nome: cleanText(args.lead.nome, 140),
      categoria: cleanText(args.lead.categoria, 120),
      origem: cleanText(args.lead.origem, 80),
      endereco: cleanText(args.lead.endereco, 200),
      rating: args.lead.rating || null,
      userRatingsTotal: args.lead.userRatingsTotal || null,
    },
    intelligence: args.intelligence,
  };

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(openAiApiKey
          ? {}
          : {
              "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://altum.ag",
              "X-Title": "ALTUM OS",
            }),
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Voce e um SDR senior B2B. Gere um rascunho comercial objetivo em portugues do Brasil. Responda apenas JSON com as chaves: headline, whyNow, firstContactMessage, emailSubject, suggestedServices, nextSteps, confidence.",
          },
          {
            role: "user",
            content: `Dados do lead e pesquisa:\n${JSON.stringify(promptPayload)}`,
          },
        ],
      }),
    },
    12_000
  );

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    const message = cleanText(data.error?.message, 240) || "openai_error";
    throw new Error(message);
  }

  const content = data.choices?.[0]?.message?.content || "";
  if (!content) return null;

  const parsed = JSON.parse(content) as Partial<LeadProposalDraft>;
  const suggestedServices = cleanList(parsed.suggestedServices, 4, 120);
  const nextSteps = cleanList(parsed.nextSteps, 4, 120);

  return {
    headline: cleanText(parsed.headline, 180) || "Plano inicial comercial",
    whyNow: cleanText(parsed.whyNow, 320) || "Existe oportunidade de ganho rapido no canal digital.",
    firstContactMessage:
      cleanText(parsed.firstContactMessage, 1000) ||
      "Oi, tudo bem? Fiz uma analise inicial da sua presenca digital e tenho algumas recomendacoes objetivas para aumentar o volume de oportunidades.",
    emailSubject:
      cleanText(parsed.emailSubject, 180) ||
      "Proposta inicial para acelerar sua captacao de leads",
    suggestedServices:
      suggestedServices.length > 0
        ? suggestedServices
        : suggestServices({
            hasWebsite: Boolean(args.intelligence.website),
            adMaturity: args.intelligence.adMaturity,
            hasSocial: args.intelligence.socialLinks.length > 0,
          }),
    nextSteps:
      nextSteps.length > 0
        ? nextSteps
        : [
            "Validar metas e prioridade comercial",
            "Apresentar plano de 30 dias",
            "Iniciar setup e operacao",
          ],
    confidence: clamp(Number(parsed.confidence) || args.intelligence.confidence, 0, 100),
    model,
  };
}

export async function generateLeadIntelligence(
  lead: LeadResearchInput
): Promise<LeadIntelligenceResult> {
  const website = await inspectWebsite(lead.website);
  const cnpjCandidate = normalizeCnpj(lead.cnpj) || normalizeCnpj(website.cnpjDetected);
  const cnpjData = await inspectCnpj(cnpjCandidate);

  const socialFromLead = [lead.instagram, lead.linkedin]
    .map((item) => cleanText(item, 280))
    .filter(Boolean);
  const socialLinks = uniqueList([...website.socialLinks, ...socialFromLead], 10);
  const adSignals = uniqueList(website.adSignals, 8);
  const adMaturity = inferAdMaturity(adSignals);

  const sources = uniqueList(
    [
      website.finalUrl || website.requestedUrl || "",
      cnpjData?.sourceUrl || "",
      lead.origem ? `lead_source:${cleanText(lead.origem, 80)}` : "",
      lead.rating ? "google_places_snapshot" : "",
    ],
    8
  );

  const confidence = computeConfidence({
    hasWebsite: Boolean(website.finalUrl),
    hasWebsiteMetadata: Boolean(website.title || website.description),
    hasCnpj: Boolean(cnpjData?.cnpj),
    hasOwner: Boolean(cnpjData?.ownerName),
    hasSocial: socialLinks.length > 0,
    hasAdSignals: adSignals.length > 0,
    hasPhone: Boolean(cleanText(lead.telefone, 40)),
    hasRating: typeof lead.rating === "number" && Number.isFinite(lead.rating),
  });

  const intelligenceBase = {
    summary: buildSummary({ lead, website, cnpj: cnpjData, adMaturity }),
    confidence,
    legalName: cleanText(cnpjData?.razaoSocial, 200) || undefined,
    tradeName: cleanText(cnpjData?.nomeFantasia, 200) || undefined,
    ownerName: cleanText(cnpjData?.ownerName, 140) || undefined,
    cnpjDetected: cleanText(cnpjData?.cnpj, 30) || undefined,
    segment:
      cleanText(cnpjData?.cnaeDescricao, 180) ||
      cleanText(lead.categoria, 120) ||
      undefined,
    city: cleanText(cnpjData?.municipio, 120) || undefined,
    state: cleanText(cnpjData?.uf, 20) || undefined,
    website: website.finalUrl || website.requestedUrl || undefined,
    websiteTitle: cleanText(website.title, 200) || undefined,
    websiteDescription: cleanText(website.description, 280) || undefined,
    socialLinks,
    adSignals,
    adMaturity,
    sources,
    errors: website.errors.length ? website.errors : undefined,
  };

  let proposalDraft: LeadProposalDraft | null = null;
  try {
    proposalDraft = await buildAiProposal({
      lead,
      intelligence: intelligenceBase,
    });
  } catch {
    proposalDraft = null;
  }

  if (!proposalDraft) {
    proposalDraft = buildFallbackProposal({
      lead,
      intelligence: intelligenceBase,
    });
  }

  return {
    intelligence: {
      status: "ready",
      ...intelligenceBase,
    },
    proposalDraft,
  };
}
