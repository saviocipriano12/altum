import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/server/auth-email";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";
import { adminAuth } from "@/app/lib/server/firebase-admin";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 180) : "";
}

function hasTrustedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === new URL(req.url).host;
}

export async function POST(req: Request) {
  try {
    if (!hasTrustedOrigin(req)) {
      return NextResponse.json({ error: "Origem nao autorizada." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { email?: unknown };
    const email = normalizeEmail(body.email);
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Informe um e-mail valido." }, { status: 400 });
    }

    await assertPublicRateLimit(req, {
      scope: "auth_password_reset",
      subject: email,
      limit: 4,
      windowMs: 15 * 60 * 1000,
    });

    try {
      const user = await adminAuth.getUserByEmail(email);
      if (!user.disabled) {
        await sendPasswordResetEmail({ email, name: user.displayName });
      }
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code !== "auth/user-not-found") {
        // A resposta publica permanece neutra para impedir enumeracao de contas.
        console.error("Falha interna na recuperacao de senha:", error);
      }
    }

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof PublicRateLimitError) {
      return NextResponse.json(
        { error: error.message, code: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    console.error("Falha ao processar recuperacao de senha:", error);
    // Resposta neutra inclusive em falhas internas para nao revelar contas existentes.
    return NextResponse.json({ ok: true }, { status: 202 });
  }
}
