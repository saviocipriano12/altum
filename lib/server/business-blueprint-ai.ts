const ONBOARDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, segment: { type: "string" }, location: { type: "string" }, description: { type: "string" }, audience: { type: "string" }, businessHours: { type: "string" }, toneOfVoice: { type: "string" }, businessProfileId: { type: "string", enum: ["generic", "imobiliaria", "clinica", "agencia"] } }, required: ["name", "segment", "location", "description", "audience", "businessHours", "toneOfVoice", "businessProfileId"] },
    offer: { type: "object", additionalProperties: false, properties: { offeringType: { type: "string", enum: ["products", "services", "both"] }, summary: { type: "string" }, paymentMethods: { type: "string" }, deliveryPolicy: { type: "string" }, exchangePolicy: { type: "string" }, warrantyPolicy: { type: "string" } }, required: ["offeringType", "summary", "paymentMethods", "deliveryPolicy", "exchangePolicy", "warrantyPolicy"] },
    sales: { type: "object", additionalProperties: false, properties: { salesMotion: { type: "string", enum: ["consultative", "appointment", "store_visit", "assisted_purchase", "direct_checkout", "digital_delivery"] }, salesCycle: { type: "string" }, averageTicket: { type: "string" }, leadSources: { type: "array", items: { type: "string" }, maxItems: 10 }, serviceStyle: { type: "string", enum: ["human", "ai_assisted", "ai_first"] }, goals: { type: "array", items: { type: "string" }, maxItems: 8 }, commonQuestions: { type: "array", items: { type: "string" }, maxItems: 16 }, specialRules: { type: "array", items: { type: "string" }, maxItems: 16 } }, required: ["salesMotion", "salesCycle", "averageTicket", "leadSources", "serviceStyle", "goals", "commonQuestions", "specialRules"] },
    assumptions: { type: "array", items: { type: "string" }, maxItems: 10 },
    missingInformation: { type: "array", items: { type: "string" }, maxItems: 10 },
  },
  required: ["company", "offer", "sales", "assumptions", "missingInformation"],
} as const;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function currentText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function detectFromList(brief: string, values: string[]) {
  return values.filter((value) => brief.includes(value));
}

export function interpretBusinessBriefWithRules(input: { brief: string; current?: unknown }) {
  const current = record(input.current);
  const currentCompany = record(current.company);
  const currentOffer = record(current.offer);
  const currentSales = record(current.sales);
  const normalized = input.brief.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const segments = ["barbearia", "clinica", "imobiliaria", "ecommerce", "e-commerce", "loja", "agencia", "consultoria", "restaurante", "academia", "escola", "pet shop", "oficina"];
  const detectedSegment = segments.find((item) => normalized.includes(item)) || "";
  const salesMotion = /barbearia|clinica|consulta|horario|agenda|reserva/.test(normalized)
    ? "appointment"
    : /imobiliaria|imovel|visita|showroom/.test(normalized)
      ? "store_visit"
      : /ebook|e-book|curso online|produto digital|acesso/.test(normalized)
        ? "digital_delivery"
        : /checkout|ecommerce|e-commerce|loja online|carrinho/.test(normalized)
          ? "direct_checkout"
          : /proposta|orcamento|reuniao|consultoria|projeto/.test(normalized)
            ? "consultative"
            : "assisted_purchase";
  const sources = detectFromList(normalized, ["whatsapp", "instagram", "google", "indicacao", "site", "facebook"]);
  const payments = detectFromList(normalized, ["pix", "cartao", "boleto", "dinheiro"]);
  const offeringType = /produto/.test(normalized) && /servico/.test(normalized) ? "both" : /produto|loja|ecommerce|e-commerce/.test(normalized) ? "products" : "services";
  const name = currentText(currentCompany.name);
  const segment = currentText(currentCompany.segment) || detectedSegment;
  const offerSummary = currentText(currentOffer.summary) || input.brief.slice(0, 700);
  const missingInformation = [!name ? "nome da empresa" : "", !segment ? "segmento" : "", !payments.length && !currentText(currentOffer.paymentMethods) ? "formas de pagamento" : "", !currentText(currentSales.averageTicket) ? "ticket médio" : ""].filter(Boolean);
  return {
    company: {
      name,
      segment,
      location: currentText(currentCompany.location),
      description: currentText(currentCompany.description) || input.brief.slice(0, 1200),
      audience: currentText(currentCompany.audience),
      businessHours: currentText(currentCompany.businessHours),
      toneOfVoice: currentText(currentCompany.toneOfVoice) || "claro, humano e objetivo",
      businessProfileId: /imobiliaria|imovel/.test(normalized) ? "imobiliaria" : /clinica|consulta/.test(normalized) ? "clinica" : /agencia/.test(normalized) ? "agencia" : "generic",
    },
    offer: {
      offeringType,
      summary: offerSummary,
      paymentMethods: currentText(currentOffer.paymentMethods) || payments.join(", "),
      deliveryPolicy: currentText(currentOffer.deliveryPolicy),
      exchangePolicy: currentText(currentOffer.exchangePolicy),
      warrantyPolicy: currentText(currentOffer.warrantyPolicy),
    },
    sales: {
      salesMotion,
      salesCycle: currentText(currentSales.salesCycle),
      averageTicket: currentText(currentSales.averageTicket),
      leadSources: Array.isArray(currentSales.leadSources) && currentSales.leadSources.length ? currentSales.leadSources : sources,
      serviceStyle: /ia (pode|vai|atende|responde)/.test(normalized) ? "ai_assisted" : currentText(currentSales.serviceStyle) || "ai_assisted",
      goals: Array.isArray(currentSales.goals) ? currentSales.goals : [],
      commonQuestions: Array.isArray(currentSales.commonQuestions) ? currentSales.commonQuestions : [],
      specialRules: Array.isArray(currentSales.specialRules) ? currentSales.specialRules : [],
    },
    assumptions: [`Modelo de fechamento identificado como ${salesMotion}; confirme antes de aplicar.`],
    missingInformation,
  };
}

type OpenAiResponse = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };

function outputText(payload: OpenAiResponse) {
  return payload.output_text || (payload.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("\n");
}

export async function interpretBusinessBrief(input: { brief: string; current?: unknown }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model = String(process.env.OPENAI_BLUEPRINT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        "Você estrutura a operação comercial de pequenas e médias empresas brasileiras para o onboarding da Altum.",
        "Extraia somente informações ditas ou inferências seguras. Nunca invente preço, prazo, estoque, política, garantia ou integração.",
        "Quando não souber, use string ou lista vazia e registre a pergunta em missingInformation.",
        "Escolha salesMotion pelo modo real de concluir a venda: horário, visita, checkout, compra assistida, entrega digital ou venda consultiva.",
        "Preserve dados atuais fornecidos; use o relato para completar e corrigir apenas quando houver evidência clara.",
      ].join("\n"),
      input: [{ role: "user", content: [{ type: "input_text", text: `RELATO DA EMPRESA:\n${input.brief.slice(0, 8000)}\n\nDADOS JÁ PREENCHIDOS:\n${JSON.stringify(input.current || {}).slice(0, 8000)}` }] }],
      text: { format: { type: "json_schema", name: "altum_business_intake", strict: true, schema: ONBOARDING_SCHEMA } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI respondeu com status ${response.status}.`);
  const raw = outputText(payload);
  if (!raw) throw new Error("A IA não retornou uma leitura utilizável.");
  return { result: JSON.parse(raw) as Record<string, unknown>, model };
}
