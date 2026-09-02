import { normalizeCatalogImportItem, type CatalogImportItem } from "@/lib/catalog-import";

const CATALOG_IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["produto", "servico", "plano", "pacote"] },
          name: { type: "string" },
          category: { type: "string" },
          priceFrom: { type: ["number", "null"] },
          priceTo: { type: ["number", "null"] },
          targetProfile: { type: "string" },
          description: { type: "string" },
          benefits: { type: "array", items: { type: "string" }, maxItems: 10 },
          commonQuestions: { type: "array", items: { type: "string" }, maxItems: 10 },
          objections: { type: "array", items: { type: "string" }, maxItems: 10 },
          whenRecommend: { type: "string" },
          whenHuman: { type: "string" },
          tags: { type: "array", items: { type: "string" }, maxItems: 12 },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          warnings: { type: "array", items: { type: "string" }, maxItems: 8 },
        },
        required: [
          "kind", "name", "category", "priceFrom", "priceTo", "targetProfile", "description",
          "benefits", "commonQuestions", "objections", "whenRecommend", "whenHuman", "tags",
          "confidence", "warnings",
        ],
      },
    },
  },
  required: ["summary", "items"],
} as const;

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  error?: { message?: string };
};

function responseText(payload: OpenAiResponse) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n");
}

function dataUrl(file: File, bytes: Buffer) {
  return `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

export async function extractCatalogWithAi(input: {
  file: File;
  tenantContext?: string;
}): Promise<{ summary: string; items: CatalogImportItem[]; model: string }> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = String(process.env.OPENAI_CATALOG_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        "Você extrai catálogos comerciais para um CRM brasileiro.",
        "Retorne somente itens realmente presentes no arquivo; não invente preço, estoque ou política.",
        "Quando uma informação não existir, use string vazia, array vazio ou null e registre um aviso curto.",
        "Converta preços para números em BRL sem símbolos. Preserve nomes e diferenças entre variações relevantes.",
        "Enriqueça descrição, benefícios, FAQ, objeções e recomendação apenas quando houver base clara no arquivo.",
        "Não inclua cabeçalhos, rodapés, contatos ou condições gerais como produtos.",
        input.tenantContext ? `Contexto informado pela empresa: ${input.tenantContext}` : "",
      ].filter(Boolean).join("\n"),
      input: [{
        role: "user",
        content: [
          {
            type: "input_file",
            filename: input.file.name,
            file_data: dataUrl(input.file, bytes),
          },
          {
            type: "input_text",
            text: "Leia o arquivo, identifique produtos, serviços, planos ou pacotes e produza a prévia estruturada para revisão humana antes da publicação.",
          },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "altum_catalog_import",
          strict: true,
          schema: CATALOG_IMPORT_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI respondeu com status ${response.status}.`);
  const output = responseText(payload);
  if (!output) throw new Error("A IA não retornou conteúdo utilizável.");

  const parsed = JSON.parse(output) as { summary?: unknown; items?: unknown[] };
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((item, index) => normalizeCatalogImportItem(item, index))
    .filter((item): item is CatalogImportItem => Boolean(item));
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 600) : "",
    items,
    model,
  };
}
