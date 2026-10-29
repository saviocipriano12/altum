import { selectLiveCatalogVariant, type LiveCatalogProduct, type LiveCatalogResult } from "./shopify-live-catalog";

export type CommerceConversationContext = {
  connectionId: string; productId: string; productName: string;
  selection: Record<string, string>; updatedAt: string;
  pendingProducts?: { id: string; name: string }[];
  requestedText?: string;
  discovery?: boolean;
  awaitingAlternative?: boolean;
  awaitingWebsite?: boolean;
  alternativesOffered?: boolean;
  searchQuery?: string;
  candidatesComplete?: boolean;
};
export type CommerceConversationTurn = {
  status: string; decision: "respond" | "ask_more" | "handoff"; reason: string;
  confidence: number; nextAction: string; ledBy: "fallback";
  responseText: string; checkedAt: string | null; verifiedPrice: boolean;
  verifiedInventory: boolean; context: CommerceConversationContext | null;
  variantId: string | null;
  verifiedUrls?: string[];
  needsInterpretation?: boolean;
  recoveryQuery?: string;
};

// The pilot grants only the existing tenant/chat a temporary read-only lookup.
// A phone suffix, client-supplied product context or another tenant is not enough.
export function isLiveCatalogPilotAllowed(input: { tenantId: string; chatId?: string; pilot: unknown; now?: number }) {
  if (!input.chatId || !input.pilot || typeof input.pilot !== "object") return false;
  const pilot = input.pilot as Record<string, unknown>;
  const remaining = Date.parse(typeof pilot.expiresAt === "string" ? pilot.expiresAt : "") - (input.now ?? Date.now());
  return pilot.enabled === true && pilot.tenantId === input.tenantId
    && Array.isArray(pilot.chatIds) && pilot.chatIds.length <= 5
    && pilot.chatIds.some((id) => typeof id === "string" && id === input.chatId)
    && Number.isFinite(remaining) && remaining > 0 && remaining <= 86_400_000;
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const stop = new Set("oi ola bom boa dia tarde noite voce voces vcs tem temos teria existe disponivel disponibilidade estoque tamanho tamanhos quanto custa preco valor quero queria gostaria comprar saber ver consultar camisa camiseta de do da dos das a o as os um uma no na nos nas em para por e essa esse esta este aquela aquele ela ele eu me com favor consegue poderia pode tambem ainda titular reserva torcedor jogador feminino feminina masculino masculina uniforme".split(" "));
// Model, audience and garment qualifiers must survive search (not interchangeable).
for (const word of ["camisa", "camiseta", "titular", "reserva", "torcedor", "jogador", "feminino", "feminina", "masculino", "masculina", "uniforme"]) stop.delete(word);
for (const word of ["agora", "porfavor", "cor", "cores", "sim", "nao", "so", "somente", "entao", "tudo", "bem", "ai", "aqui", "por", "aqui", "obrigado", "obrigada"]) stop.add(word);
for (const word of "estou estamos buscando procurando procuro busco preciso queria querendo encontrar achar teria queria saber certo beleza la ai algum alguma alguns algumas desta desse dessa tem ter vi anunciado anuncio ser pra pro ta entendi tipo dai pois favor".split(" ")) stop.add(word);

export function catalogSocialReply(text: string) {
  const value = normalize(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(oi|ola|opa|bom dia|boa tarde|boa noite)( tudo bem)?$/.test(value)) return "Oi! Tudo bem por aí? Pode falar, estou aqui para te ajudar. 😊";
  if (/^(tudo bem|tudo sim|bem|sim tudo bem)( e (voce|vc))?$/.test(value)) return "Tudo bem por aqui também! 😊 Me conta qual time ou modelo você está procurando.";
  if (/^(obrigad[oa]|valeu|muito obrigad[oa])$/.test(value)) return "Imagina! Se quiser ver outro modelo ou tirar uma dúvida, estou por aqui. 😊";
  return null;
}

export function wantsStoreWebsite(text: string) {
  return /\b(site|catalogo|ver tudo|ver todos|link da loja)\b/.test(normalize(text));
}

export function productDisplayName(name: string) {
  const clean = name.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const longSleeve = /\bmanga longa\b/i.test(clean);
  const label = clean.replace(/^camis(?:a|eta)\s+/i, "").replace(/\bmanga longa\b/gi, "").replace(/\s+/g, " ").trim();
  return `${label}${longSleeve ? " · Manga longa" : ""}`.slice(0, 200);
}

function productMenu(products: { name: string }[]) {
  return products.map((item, index) => `${index + 1}) ${productDisplayName(item.name)}`).join("\n");
}

export function welcomeCatalogTurn(turn: CommerceConversationTurn, hasReplied = true) {
  if (hasReplied || turn.status === "social") return turn;
  // Keep the useful product question; the shared composer permits one question.
  return { ...turn, responseText: `Oi! Espero que esteja tudo bem por aí. 😊\n\n${turn.responseText}` };
}

export function catalogSearchPhrase(text: string) {
  // Fold accents only to compare grammar; keep the merchant's spelling in search.
  return (text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*/gu) || [])
    .filter((word) => !stop.has(normalize(word)) && !/^(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl|[2-4]xl)$/.test(word))
    .slice(0, 8).join(" ");
}

export function isProtectedCommerceTurn(text: string) {
  return /\b(humano|atendente|cancelar|reembolso|pedido|pagamento|comprovante|rastreio|senha|cvv|desconto|frete|prazo|troca|reclamacao|negociacao|original|tecido)\b/.test(normalize(text));
}

// The model may propose a read-only search, never facts or a product ID. Require
// evidence in this message and a meaningful common anchor; reject invented specs.
export function acceptedCatalogInterpretation(value: unknown, inboundText: string): string | null {
  if (!value || typeof value !== "object" || isProtectedCommerceTurn(inboundText)) return null;
  const data = value as Record<string, unknown>;
  if (data.kind !== "product_search" || typeof data.confidence !== "number" || !Number.isFinite(data.confidence) || data.confidence < 0.85 || data.confidence > 1
    || typeof data.query !== "string" || typeof data.evidence !== "string" || !data.evidence.trim()
    || !normalize(inboundText).includes(normalize(data.evidence)) || data.query.length > 180
    || !/^[\p{L}\p{N}\s/-]+$/u.test(data.query)) return null;
  const source: string[] = normalize(inboundText).match(/[a-z0-9]+(?:[-/][a-z0-9]+)*/g) || [];
  const query = catalogSearchPhrase(data.query);
  const terms = normalize(query).split(/\s+/);
  const oneEdit = (first: string, second: string) => {
    if (first.length < 5 || second.length < 5 || Math.abs(first.length - second.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < first.length && j < second.length) {
      if (first[i] === second[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (first.length >= second.length) i++;
      if (second.length >= first.length) j++;
    }
    return edits + Number(i < first.length || j < second.length) <= 1;
  };
  const supported = (term: string) => source.includes(term) || source.some((word) => oneEdit(term, word));
  const anchor = terms.some((term) => term.length >= 3 && !["camisa", "camiseta", "produto", "manga", "longa", "curta", "titular", "reserva", "torcedor", "jogador", "masculina", "feminina", "infantil"].includes(term) && supported(term));
  if (!anchor) return null;
  if (terms.some((term) => !["camisa", "camiseta", "produto"].includes(term) && !supported(term))) return null;
  const specs = /^(?:titular|reserva|torcedor|jogador|masculin[oa]|feminin[oa]|infantil|longa|curta|\d{2,4}[-/]\d{2,4})$/;
  if (terms.some((term) => specs.test(term) && !source.includes(term))) return null;
  return query || null;
}

export function catalogAlternativePhrase(query: string) {
  const words = query.split(/\s+/).filter((word) => !/^(titular|reserva|torcedor|jogador|\d{2,4}[-/]\d{2,4})$/.test(normalize(word)));
  const alternative = words.join(" ");
  const anchors = words.filter((word) => !/^(camisa|camiseta|manga|longa|curta|masculin[oa]|feminin[oa]|infantil)$/.test(normalize(word)));
  return anchors.length && alternative !== query ? alternative : null;
}

export function catalogSearchProposal(result: { catalogSearch?: unknown; confidence?: number; extractedFields?: Record<string, string> } | null, inboundText: string) {
  if (!result) return null;
  const fallback = { kind: "product_search", query: result.extractedFields?.serviceInterest, evidence: inboundText, confidence: result.confidence };
  for (const candidate of [result.catalogSearch, fallback]) if (acceptedCatalogInterpretation(candidate, inboundText)) return candidate;
  return null;
}

export function catalogRecoveryTurn(turn: CommerceConversationTurn, reason: string, query: string): CommerceConversationTurn {
  return { ...turn, status: reason, decision: "handoff", reason: `shopify_live_${reason}`, nextAction: "encontrar_alternativa_com_vendedor",
    recoveryQuery: query.slice(0, 180), needsInterpretation: false,
    responseText: "Quero te ajudar a encontrar uma opção que combine com o que você procura. Um vendedor pode conferir outras possibilidades sem te indicar um modelo errado." };
}

export function handoffAcknowledgement(input: { recovery?: boolean; notified: boolean; taskRecorded: boolean }) {
  const purpose = input.recovery ? "Quero te ajudar a encontrar o modelo mais adequado com apoio da equipe, sem indicar uma opção errada." : "Quero te ajudar a resolver isso com o apoio de uma pessoa da equipe.";
  return input.notified ? `${purpose} Já enviei o contexto para o responsável continuar com você. Ainda não tenho confirmação de alternativa ou prazo.`
    : input.taskRecorded ? `${purpose} Deixei seu pedido registrado para atendimento humano no painel, mas não consegui confirmar o aviso por WhatsApp. Não tenho um prazo de retorno confirmado.`
      : `${purpose} Não consegui confirmar o encaminhamento para um vendedor agora. Se quiser, continuamos por aqui procurando outra opção, sem prometer disponibilidade.`;
}

export function isCatalogTurn(text: string, context: CommerceConversationContext | null) {
  const value = normalize(text);
  if (isProtectedCommerceTurn(text)) return false;
  return Boolean(catalogSocialReply(text)) || wantsStoreWebsite(text)
    || /\b(camisa|camiseta|produto|estoque|disponivel|disponibilidade|tamanho|preco|custa|foto|fotos|imagem|imagens|carrinho|link)\b/.test(value)
    || Boolean(context && /\b(foto|fotos|imagem|imagens|carrinho|link|modelos)\b/.test(value))
    || Boolean(context && (/\b(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl)\b/.test(value) || value.split(/\s+/).length <= 5));
}

export function usableCommerceContext(value: unknown, now = Date.now()): CommerceConversationContext | null {
  if (!value || typeof value !== "object") return null;
  const data = value as CommerceConversationContext;
  const pendingProducts = Array.isArray(data.pendingProducts) && data.pendingProducts.length > 0 && data.pendingProducts.length <= 4
    && data.pendingProducts.every((item) => item && /^gid:\/\/shopify\/Product\/\d+$/.test(item.id) && typeof item.name === "string" && item.name.length <= 300)
    ? data.pendingProducts.map((item) => ({ id: item.id, name: item.name })) : undefined;
  if (typeof data.connectionId !== "string" || (!/^gid:\/\/shopify\/Product\/\d+$/.test(data.productId || "") && !(data.productId === "" && (pendingProducts || data.discovery === true)))
    || typeof data.productName !== "string" || typeof data.updatedAt !== "string"
    || !data.selection || typeof data.selection !== "object" || Array.isArray(data.selection)) return null;
  const age = now - Date.parse(data.updatedAt);
  if (!Number.isFinite(age) || age < 0 || age > 86_400_000) return null;
  const selection = Object.fromEntries(Object.entries(data.selection).filter(([key, item]) => key.length <= 80 && typeof item === "string" && item.length <= 100));
  return { connectionId: data.connectionId, productId: data.productId, productName: data.productName.slice(0, 300), selection, updatedAt: data.updatedAt,
    ...(pendingProducts ? { pendingProducts } : {}),
    ...(data.discovery === true ? { discovery: true } : {}),
    ...(data.awaitingAlternative === true ? { awaitingAlternative: true } : {}),
    ...(data.awaitingWebsite === true ? { awaitingWebsite: true } : {}),
    ...(data.alternativesOffered === true ? { alternativesOffered: true } : {}),
    ...(typeof data.searchQuery === "string" ? { searchQuery: data.searchQuery.slice(0, 180) } : {}),
    ...(typeof data.candidatesComplete === "boolean" ? { candidatesComplete: data.candidatesComplete } : {}),
    ...(typeof data.requestedText === "string" ? { requestedText: data.requestedText.slice(0, 300) } : {}) };
}

// Keep unresolved model references, never stock/price snapshots. Unsupported media
// must not escape to the legacy offer picker and send a different club's product.
export function catalogFollowup(text: string, context: CommerceConversationContext | null): { productId?: string; query?: string; turn?: CommerceConversationTurn } {
  if (!context) return {};
  const value = normalize(text);
  const pending = context.pendingProducts;
  if (context.alternativesOffered && /\b(nenhum|nenhuma)\b|nao (gostei|quero|sao esses)/.test(value)) return {
    turn: catalogRecoveryTurn({ ...catalogTurnFallback("alternatives_declined", ""), context }, "alternatives_declined", context.requestedText || ""),
  };
  if (wantsStoreWebsite(text)) return {};
  if (context.awaitingWebsite && /^(nao|nao obrigado|nao obrigada)[!.\s]*$/.test(value)) return {
    turn: { ...catalogTurnFallback("website_declined", "Sem problema! Continuamos por aqui. 😊\n\nO que você gostaria de conferir?"), context: { ...context, awaitingWebsite: false } },
  };
  if (/\b(foto|fotos|imagem|imagens|carrinho|link)\b/.test(value)) {
    const limitation = /\b(carrinho)\b/.test(value) ? "Ainda não consigo montar o carrinho por aqui." : /\b(link)\b/.test(value) ? "Posso te passar o site da loja para você conferir os modelos." : "Ainda não consigo enviar as fotos dos produtos nesta conversa.";
    return { turn: { ...catalogTurnFallback("unsupported_media", `${limitation} Mas posso continuar te ajudando a escolher. 😊${pending ? `\n\n${productMenu(pending)}` : ""}\n\nQuer que eu te passe o site da loja para ver as fotos e os modelos?`), context: { ...context, awaitingWebsite: true } } };
  }
  if (/\b(outro|outros|outra|outras|alternativa|alternativas)\b/.test(value)
    && !/\b(camisa|camiseta)\b/.test(value)) return { turn: { ...catalogTurnFallback("alternative_required", "Claro! Vamos procurar outra opção. 😊\n\nQual outro time ou modelo você gostaria de ver?"), context: { ...context, awaitingWebsite: false } } };
  if (context.awaitingAlternative && /^(sim|quero|pode)[!.\s]*$/.test(value)) return { turn: {
    ...catalogTurnFallback("alternative_required", "Claro! Qual outro time ou modelo você gostaria de ver? Se preferir navegar pela loja, é só pedir o site."), context,
  } };
  if (!pending) return {};
  const ordinal = value.match(/\b(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|[1-4])\b/);
  const ordinalIndex = ordinal ? ({ primeira: 0, primeiro: 0, segunda: 1, segundo: 1, terceira: 2, terceiro: 2, quarta: 3, quarto: 3 } as Record<string, number>)[ordinal[1]] ?? Number(ordinal[1]) - 1 : -1;
  const exact = pending.find((item) => normalize(item.name) === value);
  const hints = normalize(catalogSearchPhrase(text)).split(/\s+/).filter((word) => word && !["camisa", "camiseta", "modelo"].includes(word));
  const hinted = hints.length ? pending.filter((item) => hints.every((word) => normalize(item.name).includes(word))) : [];
  const selected = exact || (ordinalIndex >= 0 ? pending[ordinalIndex] : undefined) || (context.candidatesComplete !== false && hinted.length === 1 ? hinted[0] : undefined);
  if (selected) return { productId: selected.id };
  // An explicit new product must never inherit the previous club or season.
  if (/\b(camisa|camiseta)\b/.test(value)) return {};
  if (context.searchQuery && /\b(manga|longa|curta|masculin[oa]|feminin[oa]|infantil|titular|reserva|torcedor|jogador)\b|\d{2}[/\\]\d{2}/.test(value)) {
    let base = context.searchQuery.split(/\s+/);
    const groups = [/^(manga|longa|curta)$/, /^(masculin[oa]|feminin[oa]|infantil)$/, /^(titular|reserva)$/, /^(torcedor|jogador)$/, /^\d{2,4}[-/]\d{2,4}$/];
    const refinement = catalogSearchPhrase(text).split(/\s+/);
    for (const group of groups) if (refinement.some((word) => group.test(normalize(word)))) base = base.filter((word) => !group.test(normalize(word)));
    return { query: [...new Set([...base, ...refinement])].join(" ") };
  }
  // A new explicit product query can be searched; generic follow-ups cannot.
  const unfamiliarTopic = hints.some((hint) => hint.length >= 3 && !["sei", "ok", "isso", "qualquer"].includes(hint) && !pending.some((item) => normalize(item.name).includes(hint)));
  return { turn: { ...catalogTurnFallback("product_selection", `Sem problema! Estas são as opções que encontrei — ainda preciso conferir o tamanho no modelo que você escolher:\n\n${productMenu(pending)}\n\nQual deles você prefere? Pode me dizer o número.`), needsInterpretation: unfamiliarTopic, context: { ...context, awaitingWebsite: false } } };
}

function optionsFromText(product: LiveCatalogProduct, text: string, previous: Record<string, string>) {
  const incoming = ` ${normalize(text).replace(/[^a-z0-9/-]+/g, " ")} `;
  const result = { ...previous };
  const names = new Set(product.variants.flatMap((variant) => variant.options.map((option) => option.name)));
  for (const name of names) {
    const values = [...new Set(product.variants.flatMap((variant) => variant.options.filter((option) => option.name === name).map((option) => option.value)))];
    const matches = values.filter((value) => incoming.includes(` ${normalize(value)} `));
    if (matches.length === 1) result[name] = matches[0];
    else if (matches.length > 1) delete result[name];
  }
  return result;
}

export function catalogTurnFallback(status: string, responseText: string): CommerceConversationTurn {
  return { status, decision: "ask_more", reason: `shopify_live_${status}`, confidence: 0.99,
    nextAction: "consultar_produto", ledBy: "fallback", responseText, checkedAt: null,
    verifiedPrice: false, verifiedInventory: false, context: null, variantId: null };
}

export function resolveStoreWebsite(catalog: LiveCatalogResult, previous: CommerceConversationContext | null, now = Date.now()): CommerceConversationTurn {
  const age = now - Date.parse(catalog.checkedAt);
  let storeUrl: string | null = null;
  try {
    const url = new URL(catalog.storeUrl || "");
    if (url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") && !/^[\d.]+$/.test(url.hostname)) storeUrl = `${url.origin}/`;
  } catch { /* No made-up website if the authenticated shop did not return it. */ }
  if (!storeUrl || !Number.isFinite(age) || age < 0 || age > 30_000) return catalogTurnFallback("website_unavailable", "Não consegui confirmar o endereço da loja agora. Posso continuar te ajudando a procurar um modelo por aqui?");
  return { ...catalogTurnFallback("store_website", `Claro! 😊 Você pode ver as fotos e os modelos no site da loja:\n\n${storeUrl}\n\nSe gostar de algum, me diga o nome e o tamanho que eu confiro o estoque para você.`),
    decision: "respond", verifiedUrls: [storeUrl], checkedAt: catalog.checkedAt,
    context: previous ? { ...previous, awaitingWebsite: false } : null };
}

export function resolveCatalogConversation(input: {
  catalog: LiveCatalogResult; inboundText: string; previous?: CommerceConversationContext | null; now?: number;
}): CommerceConversationTurn {
  const { catalog, inboundText } = input;
  const age = (input.now ?? Date.now()) - Date.parse(catalog.checkedAt);
  if (!Number.isFinite(age) || age < 0 || age > 30_000) return catalogTurnFallback("stale", "Não consegui confirmar o estoque atualizado agora. Posso pedir à equipe para verificar?");
  if (!catalog.productsComplete || catalog.products.length !== 1) {
    const names = productMenu(catalog.products.slice(0, 4));
    const turn = catalogTurnFallback("product_selection", names
      ? `Vou te ajudar a escolher! 😊 Encontrei ${catalog.products.length > 1 ? "estas opções" : "esta opção"} na loja. Você escolhe o modelo, e eu confiro o tamanho para você:\n\n${names}\n\nQual deles você prefere? Pode responder com o número.`
      : "Não encontrei esse modelo na consulta de agora — ele pode estar com outro nome no site.\n\nQuer procurar outro modelo ou prefere ver as opções no site?");
    if (catalog.products.length > 0) turn.context = { connectionId: catalog.connectionId, productId: "", productName: "", selection: {}, updatedAt: catalog.checkedAt,
      pendingProducts: catalog.products.slice(0, 4).map((product) => ({ id: product.id, name: product.name.slice(0, 300) })), requestedText: inboundText.slice(0, 300), candidatesComplete: catalog.productsComplete && catalog.products.length <= 4 };
    else if (!catalog.products.length) turn.context = { connectionId: catalog.connectionId, productId: "", productName: "", selection: {}, updatedAt: catalog.checkedAt,
      discovery: true, awaitingAlternative: true, requestedText: inboundText.slice(0, 300) };
    return turn;
  }
  const product = catalog.products[0];
  const sameProduct = input.previous?.productId === product.id && input.previous.connectionId === catalog.connectionId;
  const selection = optionsFromText(product, inboundText, sameProduct ? input.previous!.selection : {});
  const context: CommerceConversationContext = { connectionId: catalog.connectionId, productId: product.id, productName: product.name, selection, updatedAt: catalog.checkedAt };
  const base = { ...catalogTurnFallback("selection", ""), checkedAt: catalog.checkedAt, context };
  if (product.status !== "ACTIVE" || !product.onlineStoreUrl) return { ...base, status: "unpublished", responseText: "Esse produto não está confirmado como publicado na loja online. Posso pedir à equipe para verificar?" };
  if (!product.variantsComplete) return { ...base, status: "incomplete", responseText: "Não consegui verificar todas as opções desse modelo. Posso pedir à equipe para conferir o tamanho que você procura?" };
  const match = selectLiveCatalogVariant(product, selection);
  const requestedSizeToken = normalize(inboundText).match(/\b(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl|[2-4]xl)\b/)?.[1];
  if (requestedSizeToken && !product.variants.some((item) => item.options.some((option) => /tamanho|size/i.test(option.name)))) return {
    ...base, status: "unknown", responseText: "Esse modelo não informa os tamanhos de forma suficiente para eu confirmar a opção que você pediu. Um vendedor pode verificar as medidas e ajudar na escolha.",
  };
  const variant = product.variants.length === 1 && product.variants[0].options.every((option) => normalize(option.value) === "default title")
    ? product.variants[0] : match.variant;
  if (!variant) {
    const optionNames = [...new Set(product.variants.flatMap((item) => item.options.filter((option) => !selection[option.name]).map((option) => option.name)))];
    const options = optionNames.map((name) => `${name}: ${[...new Set(product.variants.flatMap((item) => item.options.filter((option) => option.name === name).map((option) => option.value)))].slice(0, 12).join(", ")}`).join("\n");
    const requestedSize = normalize(inboundText).match(/\b(pp|p|m|g|gg|xg|xgg|s|l|xl|xxl|[2-4]xl)\b/)?.[1];
    const sizeMismatch = requestedSize && !product.variants.some((item) => item.options.some((option) => /tamanho|size/i.test(option.name) && normalize(option.value) === requestedSize));
    return { ...base, status: match.status, responseText: match.status === "not_found"
      ? `Não encontrei essa combinação de opções em ${productDisplayName(product.name)}.\n\nVocê prefere conferir outra opção desse modelo ou procurar outro?`
      : `Boa escolha! ${productDisplayName(product.name)}.\n\n${sizeMismatch ? `Você pediu ${requestedSize!.toUpperCase()}. A loja mostra esse modelo em outra numeração; para não indicar o tamanho errado, confira as opções abaixo.\n` : ""}${options}${options ? "\n\n" : ""}Qual dessas opções você quer que eu confira no estoque?` };
  }
  const label = `${productDisplayName(product.name)}${variant.title && variant.title !== "Default Title" ? ` — ${variant.title}` : ""}`;
  if (variant.availability === "unknown" || variant.availability === "backorder_possible") return { ...base, variantId: variant.id, status: variant.availability,
    responseText: variant.availability === "backorder_possible"
      ? `${label}: a loja permite venda sem estoque, mas não consigo confirmar pronta entrega. Posso pedir à equipe para conferir?`
      : `${label}: não consegui confirmar estoque disponível. Posso pedir à equipe para verificar?` };
  let price = "";
  if (variant.price && /^[A-Z]{3}$/.test(catalog.currency)) {
    price = new Intl.NumberFormat("pt-BR", { style: "currency", currency: catalog.currency }).format(Number(variant.price));
  }
  return { ...base, status: variant.availability, decision: "respond", reason: `shopify_live_${variant.availability}`,
    variantId: variant.id, verifiedInventory: true, verifiedPrice: Boolean(price),
    responseText: variant.availability === "in_stock"
      ? `Boa notícia! Consultei a loja agora e ${label} está disponível${price ? ` por ${price}` : ""}. 😊 O estoque pode mudar até a finalização.\n\nQuer que eu te passe o site da loja para conferir os detalhes?`
      : `Conferi agora: ${label} está sem estoque para venda online neste momento.\n\nVocê gostaria de procurar outro modelo ou prefere ver as opções no site?`,
    context: variant.availability === "out_of_stock" ? { ...context, awaitingAlternative: true } : { ...context, awaitingWebsite: true } };
}
