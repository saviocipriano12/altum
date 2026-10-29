import type { WhatsAppTemplateHeaderMedia } from "@/app/lib/server/whatsapp-channel";
import { ChatOutboundPayloadError } from "./chat-outbound-payload";

export function normalizeOutboundTemplate(value: unknown) {
  const invalid = () => new ChatOutboundPayloadError("Template, idioma, variaveis ou cabecalho invalidos.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  if (typeof body.templateName !== "string") throw invalid();
  const templateName = body.templateName.trim().replace(/\s+/g, "_").toLowerCase();
  const languageCode = body.languageCode == null ? "pt_BR" : body.languageCode;
  if (!/^[a-z0-9_]{1,512}$/.test(templateName) || typeof languageCode !== "string" || !/^[a-zA-Z]{2,3}(?:_[a-zA-Z]{2,4})?$/.test(languageCode.trim())) throw invalid();
  const params = body.bodyParams ?? [];
  if (!Array.isArray(params) || params.length > 20 || params.some((item) => typeof item !== "string" || !item.trim() || item.length > 4096)) throw invalid();
  let headerMedia: WhatsAppTemplateHeaderMedia | null = null;
  if (body.headerMedia != null) {
    if (typeof body.headerMedia !== "object" || Array.isArray(body.headerMedia)) throw invalid();
    const header = body.headerMedia as Record<string, unknown>;
    if (!["image", "video", "document"].includes(String(header.type))) throw invalid();
    for (const field of ["link", "id", "filename"]) if (header[field] != null && typeof header[field] !== "string") throw invalid();
    const link = String(header.link || "").trim(), id = String(header.id || "").trim(), filename = String(header.filename || "").trim();
    if ((!link && !id) || filename.length > 180 || id.length > 512 || link.length > 4000) throw invalid();
    if (link) { try { if (!["http:", "https:"].includes(new URL(link).protocol)) throw invalid(); } catch { throw invalid(); } }
    headerMedia = { type: header.type as WhatsAppTemplateHeaderMedia["type"], ...(link ? { link } : {}), ...(id ? { id } : {}), ...(filename ? { filename } : {}) };
  }
  return { templateName, languageCode: languageCode.trim(), bodyParams: params.map((item: string) => item.trim()), headerMedia };
}
export function outboundTemplatePreview(template: ReturnType<typeof normalizeOutboundTemplate>) {
  return `Template: ${template.templateName}${template.bodyParams.length ? `\nVariaveis: ${template.bodyParams.join(" | ")}` : ""}`;
}
