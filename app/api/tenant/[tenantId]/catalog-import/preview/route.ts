import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantSettings, assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule, getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { parseCatalogDelimitedText } from "@/lib/catalog-import";
import { extractCatalogWithAi } from "@/lib/server/catalog-import-ai";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "csv", "tsv", "txt", "md"]);

function extension(value: string) {
  return value.split(".").pop()?.toLowerCase() || "";
}

function clean(value: unknown, max = 600) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_ai");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione um catálogo ou planilha." }, { status: 400 });
    }
    const fileExtension = extension(file.name);
    if (!ALLOWED_EXTENSIONS.has(fileExtension)) {
      return NextResponse.json({ error: "Formato não aceito. Use PDF, XLSX, XLS, CSV, TSV, TXT ou MD." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "O arquivo deve ter no máximo 4 MB." }, { status: 400 });
    }

    const [entitlements, settings] = await Promise.all([
      getTenantEntitlements(tenantId),
      getTenantSettings(tenantId),
    ]);
    const canUseAi = entitlements.modules.ai && Boolean(process.env.OPENAI_API_KEY);
    const deterministicFormat = fileExtension === "csv" || fileExtension === "tsv" || fileExtension === "txt";
    const localItems = deterministicFormat ? parseCatalogDelimitedText(await file.text()) : [];
    const tenantContext = [clean(settings?.name, 180), clean(settings?.niche, 120), clean(settings?.website, 300)]
      .filter(Boolean)
      .join(" | ");

    if (canUseAi) {
      try {
        const extracted = await extractCatalogWithAi({ file, tenantContext });
        if (extracted.items.length) {
          return NextResponse.json({
            ok: true,
            preview: {
              fileName: file.name,
              fileSize: file.size,
              summary: extracted.summary || `${extracted.items.length} item(ns) identificado(s).`,
              engine: "ai",
              model: extracted.model,
              items: extracted.items,
              warnings: [],
            },
          });
        }
      } catch (error) {
        if (!localItems.length) throw error;
        return NextResponse.json({
          ok: true,
          preview: {
            fileName: file.name,
            fileSize: file.size,
            summary: `${localItems.length} item(ns) lido(s) diretamente da planilha.`,
            engine: "local",
            model: null,
            items: localItems,
            warnings: ["A análise por IA ficou indisponível; revise descrições e argumentos antes de publicar."],
          },
        });
      }
    }

    if (localItems.length) {
      return NextResponse.json({
        ok: true,
        preview: {
          fileName: file.name,
          fileSize: file.size,
          summary: `${localItems.length} item(ns) lido(s) diretamente da planilha.`,
          engine: "local",
          model: null,
          items: localItems,
          warnings: entitlements.modules.ai
            ? ["Configure a chave da OpenAI para enriquecer automaticamente descrições, FAQ e argumentos."]
            : ["O módulo de IA não está contratado; a planilha foi importada sem enriquecimento automático."],
        },
      });
    }

    if (!entitlements.modules.ai) {
      return NextResponse.json({ error: "PDF e Excel exigem o módulo de IA. Para importação sem IA, use uma planilha CSV com cabeçalho." }, { status: 403 });
    }
    return NextResponse.json({ error: "A análise inteligente não está configurada. Verifique a integração OpenAI ou envie um arquivo CSV." }, { status: 503 });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao analisar catálogo:", error);
    const message = error instanceof Error && !error.message.startsWith("OPENAI_")
      ? `Não foi possível interpretar o arquivo: ${error.message}`
      : "Não foi possível interpretar o arquivo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
