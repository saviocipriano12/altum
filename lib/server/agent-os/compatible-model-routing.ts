/**
 * Lightweight routing for a single OpenAI-compatible account that exposes
 * several models (for example Alibaba Model Studio). It never invents a
 * model name: every alternative must have been discovered from that account's
 * `/models` response. The manually selected model remains the safe default.
 */
function normalizeModel(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function byWords(catalog: string[], words: string[]) {
  return words.flatMap((word) => catalog.filter((model) => model.toLowerCase().includes(word)));
}

export function selectCompatibleModels(input: {
  preferredModel: unknown;
  modelCatalog: unknown;
  prompt: string;
}) {
  const preferred = normalizeModel(input.preferredModel);
  const catalog = Array.isArray(input.modelCatalog)
    ? unique(input.modelCatalog.map(normalizeModel))
    : [];
  const text = input.prompt.toLocaleLowerCase("pt-BR");
  const isCode = /\b(c[oó]digo|programa[çc][aã]o|typescript|javascript|python|sql|api|bug|desenvolv)/i.test(text);
  const isDeepWork = text.length > 1_800 || /\b(estrat[eé]gia|an[aá]lise|planejamento|plano|campanha|pesquisa|diagn[oó]stico|complex)/i.test(text);
  const isQuickTask = text.length < 420 && /\b(resuma|resumo|classif|lista|t[ií]tulo|ideia|traduza|tradu[çc][aã]o)/i.test(text);

  if (isCode) {
    return unique([...byWords(catalog, ["coder", "code"]), preferred, ...catalog]).slice(0, 4);
  }
  if (isDeepWork) {
    return unique([...byWords(catalog, ["max", "plus", "thinking", "reasoning"]), preferred, ...catalog]).slice(0, 4);
  }
  if (isQuickTask) {
    return unique([...byWords(catalog, ["flash", "turbo", "lite", "mini", "small"]), preferred, ...catalog]).slice(0, 4);
  }
  return unique([preferred, ...catalog]).slice(0, 4);
}
