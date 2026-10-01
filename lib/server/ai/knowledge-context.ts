export type AiKnowledgeDocument = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags?: string[];
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  currency?: string | null;
  inventoryQuantity?: number | null;
  availability?: "active" | "seasonal" | "paused";
  availabilityConfigured?: boolean;
  description?: string | null;
  benefits?: string | null;
  commonQuestions?: string | null;
  objections?: string | null;
  whenRecommend?: string | null;
  whenNotRecommend?: string | null;
  whenHuman?: string | null;
  productSpecs?: string | null;
  stockDelivery?: string | null;
  warranty?: string | null;
  serviceScope?: string | null;
  duration?: string | null;
  schedulingRules?: string | null;
  deliverables?: string | null;
  proofAndCases?: string | null;
  demonstration?: string | null;
  paymentConditions?: string | null;
  supportAndSla?: string | null;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function money(value: number | null | undefined, currency = "BRL") {
  return typeof value === "number" && Number.isFinite(value) ? `${currency} ${value}` : "";
}

function catalogContext(doc: AiKnowledgeDocument) {
  const priceFrom = money(doc.priceFrom, doc.currency || "BRL");
  const priceTo = money(doc.priceTo, doc.currency || "BRL");
  const price = priceFrom ? `${priceFrom}${priceTo && priceTo !== priceFrom ? ` a ${priceTo}` : ""}` : "nao informado";
  const fields = [
    `Oferta: ${clean(doc.productName, 160) || "sem nome"}`,
    doc.productCategory ? `Categoria: ${clean(doc.productCategory, 120)}` : "",
    doc.targetProfile ? `Publico ideal: ${clean(doc.targetProfile, 300)}` : "",
    `Preco: ${price}`,
    `Estoque: ${typeof doc.inventoryQuantity === "number" ? doc.inventoryQuantity : "nao informado"}`,
    `Disponibilidade: ${doc.availabilityConfigured ? doc.availability || "nao informado" : "nao informado"}`,
    doc.description ? `Descricao: ${clean(doc.description, 500)}` : "",
    doc.benefits ? `Beneficios: ${clean(doc.benefits, 450)}` : "",
    doc.commonQuestions ? `Duvidas frequentes: ${clean(doc.commonQuestions, 400)}` : "",
    doc.objections ? `Objecoes: ${clean(doc.objections, 400)}` : "",
    doc.whenRecommend ? `Quando recomendar: ${clean(doc.whenRecommend, 320)}` : "",
    doc.whenNotRecommend ? `Quando nao recomendar: ${clean(doc.whenNotRecommend, 320)}` : "",
    doc.whenHuman ? `Quando chamar humano: ${clean(doc.whenHuman, 320)}` : "",
    doc.productSpecs ? `Especificacoes: ${clean(doc.productSpecs, 350)}` : "",
    doc.stockDelivery ? `Estoque e entrega: ${clean(doc.stockDelivery, 350)}` : "",
    doc.warranty ? `Garantia e troca: ${clean(doc.warranty, 300)}` : "",
    doc.serviceScope ? `Escopo: ${clean(doc.serviceScope, 400)}` : "",
    doc.duration ? `Duracao: ${clean(doc.duration, 200)}` : "",
    doc.schedulingRules ? `Agenda: ${clean(doc.schedulingRules, 300)}` : "",
    doc.deliverables ? `Entregaveis: ${clean(doc.deliverables, 400)}` : "",
    doc.proofAndCases ? `Provas e casos: ${clean(doc.proofAndCases, 350)}` : "",
    doc.demonstration ? `Como demonstrar: ${clean(doc.demonstration, 300)}` : "",
    doc.paymentConditions ? `Pagamento: ${clean(doc.paymentConditions, 300)}` : "",
    doc.supportAndSla ? `Suporte e SLA: ${clean(doc.supportAndSla, 300)}` : "",
    !doc.description ? `Conteudo cadastrado: ${clean(doc.content, 900)}` : "",
  ].filter(Boolean);

  return clean(fields.join("\n"), 3600);
}

export function buildKnowledgePromptContext(documents: AiKnowledgeDocument[]) {
  const selected = documents.slice(0, 4);
  return selected
    .map((doc, index) => {
      const body = doc.type === "catalog" ? catalogContext(doc) : clean(doc.content, 1200);
      return `${index + 1}. [${doc.type}] ${body}`;
    })
    .join("\n\n");
}
