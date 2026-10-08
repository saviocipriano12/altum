import { creativeSkillReferences } from "@/lib/server/agent-os/external-skills";

export type CreativeFormat = "image" | "carousel" | "video" | "copy";

export function buildCreativeDrafts(input: { title: string; brief: string; format: CreativeFormat; brand: { positioning: string; audience: string; tone: string; offers: string[]; restrictions: string[] } | null }) {
  const brand = input.brand;
  const offer = brand?.offers[0] || "a oferta principal";
  const audience = brand?.audience || "o público prioritário";
  const tone = brand?.tone || "claro, humano e direto";
  const guardrail = brand?.restrictions[0] || "não fazer promessas sem evidência";
  const sourceSkills = creativeSkillReferences(input.format);
  const methods = sourceSkills.map((skill) => `- ${skill.id}: ${skill.guidance}`).join("\n");
  const base = `Briefing: ${input.brief}\nPúblico: ${audience}\nTom: ${tone}\nOferta: ${offer}\nRestrição: ${guardrail}${methods ? `\nMétodos externos incorporados (em revisão):\n${methods}` : ""}`;
  if (input.format === "video") return [
    { title: "Vídeo — problema e virada", content: `${base}\n\nRoteiro (30s)\n1. Gancho: "Você ainda perde tempo com [dor do público]?"\n2. Cena: mostre a situação real em três cortes curtos.\n3. Virada: apresente ${offer} como caminho prático.\n4. Prova: inclua um dado ou demonstração aprovada.\n5. CTA: "Fale com a gente para entender o próximo passo."` },
    { title: "Vídeo — demonstração", content: `${base}\n\nRoteiro (20s)\n1. Mostre o antes.\n2. Demonstre uma transformação concreta.\n3. Feche com benefício específico, sem prometer resultado garantido.\n4. CTA curto de conversa.` },
  ];
  if (input.format === "carousel") return [
    { title: "Carrossel — diagnóstico", content: `${base}\n\nCards\n1. Pergunta que expõe a dor.\n2. Por que ela acontece.\n3. Impacto de manter como está.\n4. O caminho recomendado.\n5. Como ${offer} ajuda.\n6. CTA para conversa.` },
    { title: "Carrossel — método", content: `${base}\n\nCards\n1. Promessa responsável.\n2-4. Três passos práticos.\n5. Erro comum a evitar.\n6. Convite para conhecer a oferta.` },
  ];
  if (input.format === "copy") return [
    { title: "Copy — dor e benefício", content: `${base}\n\nHeadline: Pare de [dor] e comece a [benefício concreto].\nTexto: Contextualize a dor, explique a abordagem e conecte ${offer} ao resultado desejado.\nCTA: Vamos avaliar o seu cenário?` },
    { title: "Copy — prova e convite", content: `${base}\n\nHeadline: Um caminho mais simples para [resultado].\nTexto: Abra com uma evidência aprovada, apresente a oferta e feche sem urgência artificial.\nCTA: Conheça como funciona.` },
  ];
  return [
    { title: "Imagem — conceito de impacto", content: `${base}\n\nDireção visual: contraste entre o problema e o resultado desejado; produto/serviço em foco; texto curto de até 7 palavras; CTA discreto. Use a cor principal e mantenha área segura para adaptação a canais.` },
    { title: "Imagem — conceito editorial", content: `${base}\n\nDireção visual: composição limpa, cenário realista do público, headline objetiva e prova visual ligada à oferta. Evite elementos decorativos que não ajudem a mensagem.` },
  ];
}
