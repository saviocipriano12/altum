import { NextResponse } from "next/server";
import { adminAuth } from "@/app/lib/server/firebase-admin";
import { sendVerificationEmail } from "@/lib/server/auth-email";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";
import { requireFirebaseUser, SelfServiceAuthError } from "@/lib/server/self-service-auth";

function hasTrustedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === new URL(req.url).host;
}

export async function POST(req: Request) {
  try {
    if (!hasTrustedOrigin(req)) {
      return NextResponse.json({ error: "Origem nao autorizada." }, { status: 403 });
    }
    const actor = await requireFirebaseUser(req);
    await assertPublicRateLimit(req, {
      scope: "auth_email_verification",
      subject: actor.uid,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    const user = await adminAuth.getUser(actor.uid);
    if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });
    if (!user.email) {
      return NextResponse.json({ error: "A conta nao possui um e-mail valido." }, { status: 400 });
    }

    await sendVerificationEmail({ email: user.email, name: user.displayName });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PublicRateLimitError) {
      return NextResponse.json(
        { error: error.message, code: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    if (error instanceof SelfServiceAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Falha ao enviar verificacao de e-mail:", error);
    return NextResponse.json(
      { error: "Nao foi possivel enviar o e-mail agora. Tente novamente em alguns minutos." },
      { status: 503 }
    );
  }
}
