export type CreativeQualityCheck = {
  id: "delivery" | "format" | "size" | "identity" | "brand";
  status: "passed" | "warning" | "manual_review";
  message: string;
};

export type CreativeQualityPreflight = {
  status: "ready_for_review" | "needs_attention";
  summary: string;
  checks: CreativeQualityCheck[];
};

/**
 * This is an honest delivery preflight, not a claim that a model can judge
 * aesthetics, factuality or likeness perfectly. It makes the technical checks
 * explicit and leaves brand/identity approval to the person in the chat.
 */
export function assessCreativeAsset(input: {
  type: string;
  persistence: "stored" | "external";
  contentType: string | null;
  size: number | null;
  identityProfileId?: unknown;
}): CreativeQualityPreflight {
  const expected = input.type === "video" ? "video/" : "image/";
  const formatMatches = input.contentType ? input.contentType.startsWith(expected) : null;
  const checks: CreativeQualityCheck[] = [
    input.persistence === "stored"
      ? { id: "delivery", status: "passed", message: "O arquivo foi guardado na biblioteca privada da Altum." }
      : { id: "delivery", status: "warning", message: "O provider entregou um link externo; confirme a disponibilidade antes de reutilizar." },
    formatMatches === true
      ? { id: "format", status: "passed", message: `O arquivo recebido corresponde a ${input.type === "video" ? "vídeo" : "imagem"}.` }
      : formatMatches === false
        ? { id: "format", status: "warning", message: "O formato recebido não corresponde ao pedido; revise antes de aprovar." }
        : { id: "format", status: "warning", message: "O provider não informou o formato do arquivo; revise antes de aprovar." },
    typeof input.size === "number" && input.size > 1024
      ? { id: "size", status: "passed", message: "O arquivo tem conteúdo mensurável para revisão." }
      : { id: "size", status: "warning", message: "O tamanho do arquivo não pôde ser validado pela Altum." },
    input.identityProfileId
      ? { id: "identity", status: "manual_review", message: "Confira manualmente se a identidade autorizada permaneceu fiel antes de reutilizar." }
      : { id: "brand", status: "manual_review", message: "Confira marca, texto, fatos, direitos e adequação ao canal antes de aprovar." },
  ];
  const needsAttention = checks.some((check) => check.status === "warning");
  return {
    status: needsAttention ? "needs_attention" : "ready_for_review",
    summary: needsAttention
      ? "A entrega chegou, mas tem pontos técnicos para revisar antes de aprovar."
      : "A entrega passou pelas verificações técnicas e está pronta para sua revisão criativa.",
    checks,
  };
}
