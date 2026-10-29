/** Conservative extraction for the passive CRM observer; never invent missing facts. */
export function extractObservedCommercialFacts(value: string) {
  const text = value.replace(/\s+/g, " ").trim().slice(0, 4000);
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const facts: Record<string, string> = {};
  const capture = (key: string, pattern: RegExp) => {
    const match = text.match(pattern);
    const prefix = match?.index === undefined ? "" : normalized.slice(0, match.index);
    if (match?.[1] && !/\b(?:nao|nunca)\s*$/.test(prefix)) facts[key] = match[1].trim().slice(0, 320);
  };
  // A telephone, year, quantity or the seller's price is not the buyer's budget.
  capture("budgetBand", /\b(?:meu|nosso)\s+or[çc]amento\s*(?:[ée]|de|:|fica em)?\s*(?:r\$\s*)?(\d[\d.,]*(?:\s*(?:mil|reais|k))?)/i);
  if (!facts.budgetBand) capture("budgetBand", /\b(?:posso|podemos|consigo|conseguimos)\s+(?:investir|pagar|gastar)\s*(?:at[ée]\s*)?(?:r\$\s*)?(\d[\d.,]*(?:\s*(?:mil|reais|k))?)/i);
  const cityPrefix = normalized.match(/\b(?:moro em|minha cidade e|nossa empresa fica em|empresa em|estamos localizados em)\s+/);
  if (cityPrefix?.index !== undefined && !/\b(?:nao|nunca)\s*$/.test(normalized.slice(0, cityPrefix.index))) {
    const city = text.slice(cityPrefix.index + cityPrefix[0].length).match(/^([A-Za-zÀ-ÿ]+(?:\s+(?:de|do|da|dos|das)\s+[A-Za-zÀ-ÿ]+|\s+[A-ZÀ-Ý][a-zà-ÿ]+){0,4})/);
    if (city) facts.city = city[1].trim();
  }
  capture("teamSize", /\b(?:equipe|time)\s+(?:de|com)\s+(\d{1,3}\s*(?:pessoas|vendedores|atendentes|funcion[áa]rios)?)/i);
  capture("serviceInterest", /\b(?:tenho interesse (?:em|no|na)|quero contratar|preciso contratar|procuro)\s+([^.!?;]{3,160})/i);
  capture("primaryGoal", /\b(?:meu objetivo [ée]|nosso objetivo [ée]|quero melhorar|precisamos melhorar)\s+([^.!?;]{3,160})/i);
  capture("need", /\b(?:meu problema [ée]|nosso problema [ée]|a dificuldade [ée]|estamos com dificuldade (?:em|para))\s+([^.!?;]{3,200})/i);
  capture("deadline", /\b(?:preciso|precisamos|quero)\s+(?:come[çc]ar|implantar|resolver|ter pronto)\s+([^.!?;]{3,120})/i);
  if (!/\bnao\s+(?:sou|decido)\b/.test(normalized) && /\b(?:sou (?:o dono|a dona|proprietario|proprietaria)|eu que decido)\b/.test(normalized)) facts.decisionMaker = "Cliente declara ser o decisor";
  const priceObjection = normalized.match(/\b(?:achei|esta|ficou) (?:muito )?caro\b|\bfora do (?:meu |nosso )?orcamento\b/);
  if (priceObjection?.index !== undefined && !/\b(?:nao|nunca)\s*$/.test(normalized.slice(0, priceObjection.index))) facts.dominantObjection = text.slice(0, 320);
  // Questions and hypothetical answers are not declarations of customer facts.
  if (/\?|\b(?:se eu|se nos|supondo|por exemplo)\b/.test(normalized)) return {};
  return facts;
}
