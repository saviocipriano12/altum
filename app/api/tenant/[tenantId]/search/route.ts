import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

const MODULES = [
  { id: "dashboard", label: "Dashboard", path: "/cliente/painel", description: "Visao executiva e KPIs" },
  { id: "inbox", label: "Inbox", path: "/cliente/painel/inbox", description: "Conversas e takeover" },
  { id: "crm", label: "CRM", path: "/cliente/painel/crm", description: "Leads e pipeline" },
  { id: "ia", label: "IA", path: "/cliente/painel/ia", description: "Agente e base de conhecimento" },
  { id: "automacoes", label: "Automacoes", path: "/cliente/painel/automacoes", description: "Fluxos e gatilhos" },
  { id: "metricas", label: "Metricas", path: "/cliente/painel/metricas", description: "Performance consolidada" },
  { id: "configuracoes", label: "Configuracoes", path: "/cliente/painel/configuracoes", description: "Canais e governanca" },
];

type SearchLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string;
};

type SearchChat = {
  id: string;
  contactName: string;
  contactPhone: string;
  preview: string;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function includesAny(haystack: string, query: string) {
  if (!haystack || !query) return false;
  return haystack.includes(query);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const url = new URL(req.url);
    const query = normalizeText(url.searchParams.get("q") || "").slice(0, 120);

    const modules = MODULES.filter((item) => {
      if (!query) return true;
      return includesAny(normalizeText(item.label), query) || includesAny(normalizeText(item.description), query);
    }).slice(0, 7);

    if (query.length < 2) {
      return NextResponse.json({ ok: true, tenantId, query, modules, leads: [], chats: [] });
    }

    const [leadsSnap, chatsSnap] = await Promise.all([
      adminDb.collection("leads").where("tenantId", "==", tenantId).limit(180).get(),
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(180).get(),
    ]);

    const leads: SearchLead[] = leadsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          name: typeof data.nome === "string" ? data.nome : "Lead",
          email: typeof data.email === "string" ? data.email : "",
          phone: typeof data.telefone === "string" ? data.telefone : "",
          stage:
            typeof data.pipelineStage === "string"
              ? data.pipelineStage
              : typeof data.stage === "string"
                ? data.stage
                : "captado",
        };
      })
      .filter((item) => {
        const haystack = normalizeText(`${item.name} ${item.email} ${item.phone} ${item.stage}`);
        return includesAny(haystack, query);
      })
      .slice(0, 8);

    const chats: SearchChat[] = chatsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          contactName: typeof data.contactName === "string" ? data.contactName : "Conversa",
          contactPhone: typeof data.contactPhone === "string" ? data.contactPhone : "",
          preview: typeof data.lastMessage === "string" ? data.lastMessage : "",
        };
      })
      .filter((item) => {
        const haystack = normalizeText(`${item.contactName} ${item.contactPhone} ${item.preview}`);
        return includesAny(haystack, query);
      })
      .slice(0, 8);

    return NextResponse.json({ ok: true, tenantId, query, modules, leads, chats });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao buscar dados no painel cliente:", error);
    return NextResponse.json({ error: "Falha ao executar busca global." }, { status: 500 });
  }
}
