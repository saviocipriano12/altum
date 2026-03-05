import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type ConfigBody = {
  agencyName?: string;
  responsavel?: string;
  cnpj?: string;
  email?: string;
  whatsapp?: string;
  siteBase?: string;
  corPrimaria?: string;
  corSecundaria?: string;
  corDestaque?: string;
  mensagemBoasVindas?: string;
  scriptPrimeiroContato?: string;
  diasFollowUp?: number;
  webhookProspeccao?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanLong(value: unknown, max = 6000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const snap = await adminDb.collection("config").doc("altum").get();
    const data = (snap.data() || {}) as Record<string, unknown>;

    return NextResponse.json({
      agencyName: clean(data.agencyName, 140),
      responsavel: clean(data.responsavel, 140),
      cnpj: clean(data.cnpj, 40),
      email: clean(data.email, 180),
      whatsapp: clean(data.whatsapp, 40),
      siteBase: clean(data.siteBase, 300),
      corPrimaria: clean(data.corPrimaria, 20),
      corSecundaria: clean(data.corSecundaria, 20),
      corDestaque: clean(data.corDestaque, 20),
      mensagemBoasVindas: cleanLong(data.mensagemBoasVindas, 3000),
      scriptPrimeiroContato: cleanLong(data.scriptPrimeiroContato, 4000),
      diasFollowUp: Number(data.diasFollowUp || 0) || 0,
      webhookProspeccao: clean(data.webhookProspeccao, 500),
      hasMetaWabaToken: Boolean(clean(data.metaWabaToken, 200)),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao carregar configuracao ALTUM:", error);
    return NextResponse.json({ error: "Falha ao carregar configuracao." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as ConfigBody;

    const payload = {
      agencyName: clean(body.agencyName, 140) || "ALTUM",
      responsavel: clean(body.responsavel, 140),
      cnpj: clean(body.cnpj, 40),
      email: clean(body.email, 180),
      whatsapp: clean(body.whatsapp, 40),
      siteBase: clean(body.siteBase, 300),
      corPrimaria: clean(body.corPrimaria, 20) || "#2563eb",
      corSecundaria: clean(body.corSecundaria, 20) || "#f97316",
      corDestaque: clean(body.corDestaque, 20) || "#22c55e",
      mensagemBoasVindas: cleanLong(body.mensagemBoasVindas, 3000),
      scriptPrimeiroContato: cleanLong(body.scriptPrimeiroContato, 4000),
      diasFollowUp: Number(body.diasFollowUp || 0) || 0,
      webhookProspeccao: clean(body.webhookProspeccao, 500),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("config").doc("altum").set(payload, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao salvar configuracao ALTUM:", error);
    return NextResponse.json({ error: "Falha ao salvar configuracao." }, { status: 500 });
  }
}
