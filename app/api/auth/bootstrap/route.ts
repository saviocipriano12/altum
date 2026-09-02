import { NextResponse } from "next/server";
import {
  provisionSelfServiceAccount,
  requireFreshFirebaseUser,
  SelfServiceAuthError,
} from "@/lib/server/self-service-auth";

type Body = { name?: string; companyName?: string; acceptedTerms?: boolean };

export async function POST(req: Request) {
  try {
    const decoded = await requireFreshFirebaseUser(req);
    const body = (await req.json()) as Body;
    if (body.acceptedTerms !== true) {
      return NextResponse.json({ error: "Aceite os Termos de Uso e a Politica de Privacidade." }, { status: 400 });
    }
    if (!decoded.email) {
      return NextResponse.json({ error: "A conta precisa ter um e-mail valido." }, { status: 400 });
    }
    const provider = decoded.firebase?.sign_in_provider || "password";
    const result = await provisionSelfServiceAccount({
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: Boolean(decoded.email_verified),
      name: String(body.name || decoded.name || ""),
      companyName: String(body.companyName || ""),
      provider,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof SelfServiceAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Falha no cadastro self-service:", error);
    return NextResponse.json({ error: "Nao foi possivel preparar sua conta." }, { status: 500 });
  }
}
