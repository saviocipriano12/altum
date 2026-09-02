import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_PLATFORM_PLANS } from "../lib/platform-plans.ts";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("self-service plans never expose a free or invalid checkout", () => {
  const checkoutable = DEFAULT_PLATFORM_PLANS.filter((plan) => plan.checkoutEnabled);
  assert.ok(checkoutable.length >= 2);
  assert.ok(checkoutable.every((plan) => typeof plan.monthlyPrice === "number" && plan.monthlyPrice > 0));
});

test("Firestore rules prevent self-service privilege escalation", async () => {
  const rules = await source("firestore.rules");
  assert.match(rules, /allow create: if isAdmin\(\);/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
  assert.match(rules, /match \/asaas_checkouts\/\{docId\}/);
  assert.doesNotMatch(rules, /allow update: if isSelf\(uid\) \|\| isAdmin\(\)/);
});

test("checkout resolves official plans and keeps the Asaas key server-side", async () => {
  const checkout = await source("app/api/billing/asaas/checkout/route.ts");
  assert.match(checkout, /getPlatformPlan\(body\.planId\)/);
  assert.match(checkout, /process\.env\.ASAAS_API_KEY/);
  assert.match(checkout, /access_token: apiKey/);
  assert.doesNotMatch(checkout, /body\.monthlyPrice/);
});

test("Asaas webhook validates token and deduplicates events", async () => {
  const webhook = await source("app/api/webhooks/asaas/route.ts");
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /asaas_webhook_events_internal/);
  assert.match(webhook, /CHECKOUT_PAID/);
  assert.match(webhook, /applyPlatformPlanEntitlements/);
});

test("new accounts receive exactly seven trial days", async () => {
  const auth = await source("lib/server/self-service-auth.ts");
  assert.match(auth, /const TRIAL_DAYS = 7/);
  assert.match(auth, /billingStatus: "trial"/);
  assert.match(auth, /getPlatformPlanEntitlements\("operacao"\)/);
});

test("each commercial plan has explicit feature and usage limits", async () => {
  const entitlements = await source("lib/platform-plan-entitlements.ts");
  assert.match(entitlements, /essencial:/);
  assert.match(entitlements, /operacao:/);
  assert.match(entitlements, /estrutura_assistida:/);
  assert.match(entitlements, /messagesPerMonth/);
  assert.match(entitlements, /aiRunsPerMonth/);
  assert.match(entitlements, /storageMb/);
});

test("client session exposes billing state without payment secrets", async () => {
  const me = await source("app/api/client-portal/me/route.ts");
  assert.match(me, /billingStatus/);
  assert.match(me, /trialEndsAt/);
  assert.match(me, /subscriptionId/);
  assert.doesNotMatch(me, /ASAAS_API_KEY/);
});

test("unverified password accounts are redirected before portal access", async () => {
  const login = await source("app/cliente/login/page.tsx");
  const portalAuth = await source("app/lib/server/portal-auth.ts");
  assert.match(login, /!credential\.user\.emailVerified/);
  assert.match(login, /cliente\/verificar-email/);
  assert.match(portalAuth, /email_not_verified/);
});

test("public auth pages do not race the server profile bootstrap", async () => {
  const authContext = await source("context/AuthContext.tsx");
  assert.match(authContext, /isPublicAuthPath/);
  assert.match(authContext, /corrida com o bootstrap seguro/);
});

test("subscription management enforces refund, grace, upgrade and audit", async () => {
  const subscription = await source("app/api/billing/asaas/subscription/route.ts");
  const webhook = await source("app/api/webhooks/asaas/route.ts");
  assert.match(subscription, /isWithinRefundWindow/);
  assert.match(subscription, /isPlanUpgrade/);
  assert.match(subscription, /status: "INACTIVE"/);
  assert.match(subscription, /audit_logs/);
  assert.match(webhook, /billingStatus = "past_due"/);
  assert.match(webhook, /getBillingBlockAt/);
});

test("Firebase Admin accepts one secret JSON or three server-only variables", async () => {
  const firebaseAdmin = await source("app/lib/server/firebase-admin.ts");
  assert.match(firebaseAdmin, /FIREBASE_SERVICE_ACCOUNT_KEY/);
  assert.match(firebaseAdmin, /FIREBASE_CLIENT_EMAIL/);
  assert.match(firebaseAdmin, /FIREBASE_PRIVATE_KEY/);
  assert.doesNotMatch(firebaseAdmin, /NEXT_PUBLIC_FIREBASE_PRIVATE_KEY/);
});

test("Firebase App Check is opt-in through the public site key", async () => {
  const firebaseClient = await source("firebaseConfig.ts");
  assert.match(firebaseClient, /ReCaptchaEnterpriseProvider/);
  assert.match(firebaseClient, /NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY/);
});

test("password policy uses eight characters consistently", async () => {
  const signup = await source("app/cadastro/page.tsx");
  const reset = await source("app/cliente/redefinir-senha/redefinir-senha-form.tsx");
  assert.match(signup, /password\.length >= 8/);
  assert.match(signup, /minLength=\{8\}/);
  assert.match(reset, /password\.length >= 8/);
  assert.match(reset, /confirmPasswordReset/);
});

test("password recovery uses a generic response and custom Altum action handler", async () => {
  const request = await source("app/cliente/esqueci-senha/esqueci-senha-form.tsx");
  const resetRoute = await source("app/api/auth/email/password-reset/route.ts");
  const verificationRoute = await source("app/api/auth/email/verification/route.ts");
  const emailService = await source("lib/server/auth-email.ts");
  const action = await source("app/cliente/acao-email/acao-email-client.tsx");
  assert.match(request, /\/api\/auth\/email\/password-reset/);
  assert.match(request, /Se existir uma conta/);
  assert.match(resetRoute, /assertPublicRateLimit/);
  assert.match(resetRoute, /status: 202/);
  assert.match(verificationRoute, /requireFirebaseUser/);
  assert.match(emailService, /generatePasswordResetLink/);
  assert.match(emailService, /generateEmailVerificationLink/);
  assert.match(emailService, /RESEND_API_KEY/);
  assert.doesNotMatch(emailService, /NEXT_PUBLIC_RESEND/);
  assert.match(action, /verifyEmail/);
  assert.match(action, /resetPassword/);
  assert.match(action, /applyActionCode/);
});

test("Google login dependencies are allowed by the CSP", async () => {
  const nextConfig = await source("next.config.ts");
  assert.match(nextConfig, /script-src/);
  assert.match(nextConfig, /https:\/\/apis\.google\.com/);
  assert.match(nextConfig, /https:\/\/accounts\.google\.com/);
});
