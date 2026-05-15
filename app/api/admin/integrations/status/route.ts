import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type IntegrationStatus = {
  key: string;
  label: string;
  status: "ok" | "missing";
  details: string;
  requiredEnvs: string[];
  missingEnvs: string[];
};

function checkIntegration(
  key: string,
  label: string,
  envKeys: string[],
  details: string
): IntegrationStatus {
  const missing = envKeys.filter((envKey) => !process.env[envKey]);
  return {
    key,
    label,
    status: missing.length ? "missing" : "ok",
    details,
    requiredEnvs: envKeys,
    missingEnvs: missing,
  };
}

function checkIntegrationWithAliases(
  key: string,
  label: string,
  envGroups: string[][],
  details: string
): IntegrationStatus {
  const missingGroups = envGroups.filter((group) => !group.some((envKey) => Boolean(process.env[envKey])));
  return {
    key,
    label,
    status: missingGroups.length ? "missing" : "ok",
    details,
    requiredEnvs: envGroups.map((group) => group.join(" | ")),
    missingEnvs: missingGroups.map((group) => group.join(" | ")),
  };
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });

    const integrations: IntegrationStatus[] = [
      checkIntegrationWithAliases(
        "meta_whatsapp",
        "Meta WhatsApp Cloud API",
        [
          ["META_WA_TOKEN"],
          ["META_PHONE_ID"],
          ["META_VERIFY_TOKEN"],
          ["META_APP_SECRET"],
        ],
        "Envio, webhook e validacao de assinatura para inbox e automacoes."
      ),
      checkIntegration(
        "meta_ads",
        "Meta Ads (Marketing API)",
        ["META_ADS_ACCESS_TOKEN", "META_GRAPH_VERSION"],
        "Sincronizacao automatica das contas Meta Ads na area de campanhas."
      ),
      checkIntegration(
        "google_ads",
        "Google Ads (OAuth/API)",
        [
          "GOOGLE_ADS_DEVELOPER_TOKEN",
          "GOOGLE_ADS_CLIENT_ID",
          "GOOGLE_ADS_CLIENT_SECRET",
        ],
        "Conector de performance para contas Google Ads. O refresh token e obtido por tenant via OAuth."
      ),
      checkIntegration(
        "google_places",
        "Google Places (Prospecção)",
        ["GOOGLE_PLACES_API_KEY"],
        "Captação de leads no gerador de prospecção."
      ),
      checkIntegration(
        "asaas",
        "Asaas (Cobrança)",
        ["ASAAS_API_KEY", "ASAAS_API_URL", "ASAAS_WEBHOOK_TOKEN"],
        "Checkout, cobrança e confirmação de pagamentos."
      ),
      checkIntegration(
        "firebase_admin",
        "Firebase Admin SDK",
        ["FIREBASE_SERVICE_ACCOUNT_KEY"],
        "Autenticação server-side, permissões de API e jobs administrativos."
      ),
      checkIntegrationWithAliases(
        "ai_provider",
        "IA Generativa (futuro)",
        [["OPENAI_API_KEY", "OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY"]],
        "Opcional nesta fase. Necessário para copiloto generativo completo."
      ),
    ];

    return NextResponse.json({
      ok: true,
      summary: {
        total: integrations.length,
        healthy: integrations.filter((item) => item.status === "ok").length,
        missing: integrations.filter((item) => item.status === "missing").length,
      },
      integrations,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao listar status das integracoes:", error);
    return NextResponse.json(
      { error: "Falha ao listar status das integracoes." },
      { status: 500 }
    );
  }
}

