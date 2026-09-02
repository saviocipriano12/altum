export type CatalogImportKind = "produto" | "servico" | "plano" | "pacote";
export type CatalogImportConfidence = "high" | "medium" | "low";

export type CatalogImportItem = {
  tempId: string;
  kind: CatalogImportKind;
  name: string;
  category: string;
  priceFrom: number | null;
  priceTo: number | null;
  targetProfile: string;
  description: string;
  benefits: string[];
  commonQuestions: string[];
  objections: string[];
  whenRecommend: string;
  whenHuman: string;
  tags: string[];
  confidence: CatalogImportConfidence;
  warnings: string[];
};

function clean(value: unknown, max = 800) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems = 12, maxLength = 180) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n|;|\|/)
      : [];
  return Array.from(new Set(source.map((item) => clean(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

export function normalizeCatalogKind(value: unknown): CatalogImportKind {
  const normalized = clean(value, 30).toLowerCase();
  if (/servi[cç]o/.test(normalized)) return "servico";
  if (normalized === "plano") return "plano";
  if (normalized === "pacote" || normalized === "kit" || normalized === "combo") return "pacote";
  return "produto";
}

export function parseCatalogPrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const raw = clean(value, 80);
  if (!raw) return null;
  const withoutCurrency = raw.replace(/[^\d,.-]/g, "");
  if (!withoutCurrency || !/\d/.test(withoutCurrency)) return null;
  const normalized = withoutCurrency.includes(",")
    ? withoutCurrency.replace(/\./g, "").replace(",", ".")
    : withoutCurrency;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function confidence(value: unknown): CatalogImportConfidence {
  const normalized = clean(value, 20).toLowerCase();
  if (normalized === "high" || normalized === "alta") return "high";
  if (normalized === "low" || normalized === "baixa") return "low";
  return "medium";
}

export function catalogServiceKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 80);
}

export function normalizeCatalogImportItem(value: unknown, index = 0): CatalogImportItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const name = clean(data.name ?? data.nome ?? data.productName, 160);
  if (!name) return null;
  const priceFrom = parseCatalogPrice(data.priceFrom ?? data.preco ?? data.price);
  const priceTo = parseCatalogPrice(data.priceTo ?? data.precoAte);
  const itemWarnings = cleanList(data.warnings ?? data.alertas, 8, 180);
  const description = clean(data.description ?? data.descricao ?? data.content, 900);
  const targetProfile = clean(data.targetProfile ?? data.publico ?? data.publicoIdeal, 180);
  if (!description) itemWarnings.push("Descrição comercial não identificada.");
  if (priceFrom === null && priceTo === null) itemWarnings.push("Preço não identificado.");

  return {
    tempId: clean(data.tempId, 100) || `item_${index + 1}`,
    kind: normalizeCatalogKind(data.kind ?? data.tipo),
    name,
    category: clean(data.category ?? data.categoria, 120),
    priceFrom,
    priceTo,
    targetProfile,
    description,
    benefits: cleanList(data.benefits ?? data.beneficios, 10, 180),
    commonQuestions: cleanList(data.commonQuestions ?? data.perguntasFrequentes, 10, 240),
    objections: cleanList(data.objections ?? data.objecoes, 10, 200),
    whenRecommend: clean(data.whenRecommend ?? data.quandoRecomendar, 400),
    whenHuman: clean(data.whenHuman ?? data.quandoChamarHumano, 300),
    tags: cleanList(data.tags, 12, 60),
    confidence: confidence(data.confidence ?? data.confianca),
    warnings: Array.from(new Set(itemWarnings)).slice(0, 8),
  };
}

function countDelimiter(line: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function firstColumn(row: Record<string, string>, names: string[]) {
  for (const name of names) if (row[name]) return row[name];
  return "";
}

export function parseCatalogDelimitedText(text: string) {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiters = [";", ",", "\t", "|"];
  const delimiter = delimiters.sort((a, b) => countDelimiter(sample, b) - countDelimiter(sample, a))[0];
  const rows = parseDelimitedRows(text.replace(/^\uFEFF/, ""), delimiter);
  if (rows.length < 2) return [] as CatalogImportItem[];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1, 61).map((values, index) => {
    const row = Object.fromEntries(headers.map((header, position) => [header, values[position] || ""]));
    return normalizeCatalogImportItem({
      name: firstColumn(row, ["nome", "produto", "servico", "name", "titulo", "descricaoitem"]),
      kind: firstColumn(row, ["tipo", "kind"]),
      category: firstColumn(row, ["categoria", "category", "departamento"]),
      priceFrom: firstColumn(row, ["preco", "valor", "price", "precode", "precoapartir"]),
      priceTo: firstColumn(row, ["precoate", "valormaximo", "priceto"]),
      targetProfile: firstColumn(row, ["publico", "publicoideal", "perfil", "targetprofile"]),
      description: firstColumn(row, ["descricao", "description", "detalhes", "resumo"]),
      benefits: firstColumn(row, ["beneficios", "benefits", "diferenciais"]),
      commonQuestions: firstColumn(row, ["faq", "duvidas", "perguntasfrequentes"]),
      objections: firstColumn(row, ["objecoes", "objections"]),
      whenRecommend: firstColumn(row, ["quandorecomendar", "indicacao", "recomendacao"]),
      tags: firstColumn(row, ["tags", "etiquetas"]),
      confidence: "medium",
    }, index);
  }).filter((item): item is CatalogImportItem => Boolean(item));
}

export function buildCatalogImportContent(item: CatalogImportItem) {
  const sections: Array<[string, string]> = [
    ["Nome", item.name],
    ["Tipo", item.kind],
    ["Categoria", item.category],
    ["Público ideal", item.targetProfile],
    ["Descrição para cliente", item.description],
    ["Principais benefícios", item.benefits.join("; ")],
    ["Dúvidas frequentes", item.commonQuestions.join("; ")],
    ["Objeções comuns", item.objections.join("; ")],
    ["Quando recomendar", item.whenRecommend],
    ["Quando chamar humano", item.whenHuman],
  ];
  return sections.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`).join("\n\n").slice(0, 1580);
}

export function catalogImportTags(item: CatalogImportItem, importId: string) {
  return Array.from(new Set([
    "catalogo",
    `tipo:${item.kind}`,
    "origem:importacao-inteligente",
    item.category ? `categoria:${item.category}` : "",
    `importacao:${importId}`,
    ...item.tags,
  ].filter(Boolean))).slice(0, 20);
}
