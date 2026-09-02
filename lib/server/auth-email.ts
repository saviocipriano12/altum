import "server-only";

import crypto from "node:crypto";
import { Resend } from "resend";
import { adminAuth } from "@/app/lib/server/firebase-admin";

type AuthEmailKind = "verification" | "password-reset";

export class AuthEmailConfigurationError extends Error {}
export class AuthEmailDeliveryError extends Error {}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPublicSiteUrl() {
  const configured =
    clean(process.env.NEXT_PUBLIC_SITE_URL, 500) ||
    clean(process.env.NEXT_PUBLIC_APP_URL, 500) ||
    clean(process.env.APP_URL, 500) ||
    "https://www.altumia.com.br";

  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AuthEmailConfigurationError("A URL publica da Altum e invalida.");
  }
  return parsed.origin;
}

function buildContinueUrl(kind: AuthEmailKind) {
  const pathname = kind === "verification" ? "/cliente/verificar-email?verified=1" : "/cliente/login?passwordReset=1";
  return new URL(pathname, getPublicSiteUrl()).toString();
}

/**
 * O Firebase Admin assina o codigo de uso unico. Como o Console atualmente
 * falha ao salvar a URL acionavel, preservamos todos os parametros assinados
 * e trocamos somente a pagina que processa a acao.
 */
export function buildAltumActionUrl(firebaseActionLink: string) {
  const generated = new URL(firebaseActionLink);
  const custom = new URL("/cliente/acao-email", getPublicSiteUrl());
  const allowedParameters = ["mode", "oobCode", "apiKey", "continueUrl", "lang", "tenantId"];

  for (const parameter of allowedParameters) {
    const value = generated.searchParams.get(parameter);
    if (value) custom.searchParams.set(parameter, value);
  }
  if (!custom.searchParams.has("mode") || !custom.searchParams.has("oobCode")) {
    throw new AuthEmailConfigurationError("O Firebase gerou um link de acao incompleto.");
  }
  if (!custom.searchParams.has("lang")) custom.searchParams.set("lang", "pt-BR");
  return custom.toString();
}

function renderEmail(input: { kind: AuthEmailKind; name?: string; actionUrl: string }) {
  const name = clean(input.name, 120);
  const greeting = name ? `Ola, ${escapeHtml(name)}!` : "Ola!";
  const isVerification = input.kind === "verification";
  const title = isVerification ? "Confirme seu e-mail" : "Crie uma nova senha";
  const description = isVerification
    ? "Confirme que este e-mail pertence a voce para liberar o acesso seguro a plataforma Altum."
    : "Recebemos uma solicitacao para redefinir a senha da sua conta Altum.";
  const button = isVerification ? "Verificar meu e-mail" : "Redefinir minha senha";
  const expiry = isVerification
    ? "Se voce nao criou esta conta, ignore esta mensagem."
    : "Se voce nao solicitou a redefinicao, ignore esta mensagem. Sua senha atual continuara valida.";
  const safeActionUrl = escapeHtml(input.actionUrl);

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden">${description}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden">
        <tr><td style="padding:28px 32px;background:linear-gradient(135deg,#0f172a,#172554 58%,#5b21b6);color:#ffffff">
          <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#bfdbfe">Altum - Operacao comercial com IA</div>
          <h1 style="margin:16px 0 0;font-size:28px;line-height:1.2">${title}</h1>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 14px;font-size:16px;font-weight:700">${greeting}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569">${description}</p>
          <a href="${safeActionUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:10px">${button}</a>
          <p style="margin:26px 0 8px;font-size:12px;line-height:1.6;color:#64748b">Se o botao nao abrir, copie este endereco no navegador:</p>
          <p style="margin:0;word-break:break-all;font-size:11px;line-height:1.6;color:#2563eb">${safeActionUrl}</p>
          <p style="margin:26px 0 0;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">${expiry}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${greeting}\n\n${description}\n\n${button}: ${input.actionUrl}\n\n${expiry}\n\nEquipe Altum`;
  return { html, text, subject: isVerification ? "Confirme seu e-mail na Altum" : "Redefina sua senha da Altum" };
}

async function deliverAuthEmail(input: { kind: AuthEmailKind; to: string; name?: string; actionUrl: string }) {
  const apiKey = clean(process.env.RESEND_API_KEY, 500);
  if (!apiKey) throw new AuthEmailConfigurationError("RESEND_API_KEY nao configurada no servidor.");

  const from = clean(process.env.AUTH_EMAIL_FROM, 300) || "Altum <conta@altumia.com.br>";
  const replyTo = clean(process.env.AUTH_EMAIL_REPLY_TO, 300) || "suporte.altum@gmail.com";
  const content = renderEmail(input);
  const idempotencyKey = crypto.createHash("sha256").update(`${input.kind}|${input.to}|${input.actionUrl}`).digest("hex");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: input.to,
      replyTo,
      subject: content.subject,
      html: content.html,
      text: content.text,
    },
    { idempotencyKey: `altum-auth-${idempotencyKey}` }
  );

  if (error) {
    console.error("Falha ao enviar e-mail de autenticacao pela Resend:", {
      kind: input.kind,
      name: error.name,
      message: error.message,
    });
    throw new AuthEmailDeliveryError("O e-mail de seguranca nao pode ser enviado agora.");
  }
}

export async function sendVerificationEmail(input: { email: string; name?: string }) {
  const firebaseLink = await adminAuth.generateEmailVerificationLink(input.email, {
    url: buildContinueUrl("verification"),
    handleCodeInApp: false,
  });
  const actionUrl = buildAltumActionUrl(firebaseLink);
  await deliverAuthEmail({ kind: "verification", to: input.email, name: input.name, actionUrl });
}

export async function sendPasswordResetEmail(input: { email: string; name?: string }) {
  const firebaseLink = await adminAuth.generatePasswordResetLink(input.email, {
    url: buildContinueUrl("password-reset"),
    handleCodeInApp: false,
  });
  const actionUrl = buildAltumActionUrl(firebaseLink);
  await deliverAuthEmail({ kind: "password-reset", to: input.email, name: input.name, actionUrl });
}
