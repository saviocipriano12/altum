import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("inbox audio uses the resolved media URL without a stale MIME declaration", async () => {
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  assert.match(inbox, /<audio\s+src=\{mediaUrl\}/);
  assert.doesNotMatch(inbox, /<source src=\{mediaUrl\} type=\{message\.mediaMimeType/);
  assert.match(inbox, /contentType\?: unknown/);
});

test("remote WhatsApp audio is converted and persisted for mobile playback", async () => {
  const mediaRoute = await source("app/api/tenant/[tenantId]/chats/[chatId]/messages/[messageId]/media/route.ts");
  assert.match(mediaRoute, /if \(directMediaUrl\) \{[\s\S]*needsMobileAudioPlayback\(media\.contentType\)/);
  assert.match(mediaRoute, /saveChatMediaBuffer\([\s\S]*variant: "playback"/);
  assert.match(mediaRoute, /mediaMimeType: "audio\/mpeg"/);
  assert.match(mediaRoute, /Falha ao preparar audio remoto para celular/);
});

test("open chat polling requests only newer messages and merges them by id", async () => {
  const messagesRoute = await source("app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts");
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  assert.match(messagesRoute, /searchParams\.get\("since"\)/);
  assert.match(messagesRoute, /where\("createdAt", ">", Timestamp\.fromMillis\(sinceMs\)\)/);
  assert.match(inbox, /incrementalMessages: true/);
  assert.match(inbox, /mergeChatMessages\(current, nextMessages\)/);
  assert.match(inbox, /messagesRef\.current\.map\(messageTimeMs\)/);
});

test("protected chat media falls back to an authenticated Blob when signed URLs fail", async () => {
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  assert.match(inbox, /const fallback = await authedFetch\(protectedUrl\)/);
  assert.match(inbox, /URL\.createObjectURL\(blob\)/);
  assert.match(inbox, /URL\.revokeObjectURL\(blobUrl\)/);
});

test("Inbox defers secondary channel and AI settings so the first conversation can open sooner", async () => {
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  assert.match(inbox, /const deferredLoad = window\.setTimeout\(\(\) => \{[\s\S]*loadTenantChannels\(\);[\s\S]*loadTenantAiSettings\(\);[\s\S]*\}, 900\)/);
});

test("Inbox uses a compact first load instead of enriching hundreds of conversations", async () => {
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  const chatsRoute = await source("app/api/tenant/[tenantId]/chats/route.ts");
  assert.match(inbox, /new URLSearchParams\(\{ limit: "100", view: "compact" \}\)/);
  assert.match(chatsRoute, /const compact = url\.searchParams\.get\("view"\) === "compact"/);
  assert.match(chatsRoute, /compact \? Promise\.resolve\(emptyChatEnrichment\(\)\) : getChatEnrichment\(tenantId\)/);
});

test("CRM opens its lead list before loading cross-chat signals and metrics", async () => {
  const crm = await source("app/cliente/painel/crm/page.tsx");
  const leadsRoute = await source("app/api/tenant/[tenantId]/leads/route.ts");
  assert.match(crm, /leads\?limit=\$\{CRM_PAGE_SIZE\}&view=compact/);
  assert.match(crm, /void authedFetch\(`\/api\/tenant\/\$\{tenant\.tenantId\}\/metrics-summary`\)/);
  assert.match(leadsRoute, /const compact = url\.searchParams\.get\("view"\) === "compact"/);
  assert.match(leadsRoute, /const chatRows = compact \? \[\] : await listChatsForLeadPage/);
});

test("Reports and campaigns render their operational core before secondary datasets", async () => {
  const reports = await source("app/cliente/painel/relatorios/page.tsx");
  const campaigns = await source("app/cliente/painel/campanhas/page.tsx");
  assert.match(reports, /const metricsRes = await authedFetch\(`\/api\/tenant\/\$\{tenantId\}\/metrics-summary`\)/);
  assert.match(reports, /void Promise\.all\(\[\s*authedFetch\(`\/api\/tenant\/\$\{tenantId\}\/leads`\)/);
  assert.match(campaigns, /const campaignsRes = await authedFetch\(`\/api\/tenant\/\$\{tenant\.tenantId\}\/outbound-campaigns`\)/);
  assert.match(campaigns, /void Promise\.all\(\[\s*authedFetch\(`\/api\/tenant\/\$\{tenant\.tenantId\}\/metrics-summary/);
});

test("Assistant Altum avoids a settings request waterfall", async () => {
  const ai = await source("app/cliente/painel/ia/page.tsx");
  assert.match(ai, /const \[settingsRes, kbRes, logsRes, usageRes, campaignsRes, tenantSettingsRes\] = await Promise\.all/);
  assert.doesNotMatch(ai, /\]\);\s*const tenantSettingsRes = await authedFetch/);
});

test("stored chat audio streams authenticated bytes without requiring a signed URL", async () => {
  const mediaRoute = await source("app/api/tenant/[tenantId]/chats/[chatId]/messages/[messageId]/media/route.ts");
  assert.match(mediaRoute, /A reprodu\S+o no chat nunca pode depender de convers\S+o/);
  assert.match(mediaRoute, /if \(!resolveUrl\) \{[\s\S]*const \[storedBuffer\] = await file\.download\(\);[\s\S]*new NextResponse\(new Uint8Array\(storedBuffer\)/);
});

test("Inbox loads protected audio as an authenticated Blob instead of a fragile signed URL", async () => {
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  assert.match(inbox, /message\.type[^\n]+=== "audio"/);
  assert.match(inbox, /const audio = await authedFetch\(protectedUrl\)/);
  assert.match(inbox, /audio_stream_http_/);
});

test("Meta webhook rejects invalid signatures before processing events", async () => {
  const webhook = await source("app/api/webhooks/meta/route.ts");
  assert.match(webhook, /Webhook Meta bloqueado por assinatura divergente/);
  assert.match(webhook, /Assinatura do webhook invalida/);
  assert.match(webhook, /status: 401/);
  assert.doesNotMatch(webhook, /modo tolerante/);
});

test("ecommerce webhooks never accept an unsigned legacy connection", async () => {
  const ecommerce = await source("lib/server/ecommerce.ts");
  assert.match(ecommerce, /const configured = clean\(process\.env\.ECOMMERCE_WEBHOOK_TOKEN[\s\S]*if \(!configured\) return false;/);
  assert.doesNotMatch(ecommerce, /if \(!configured\) return true;/);
});

test("public lead entry points have a shared server-side rate limit", async () => {
  const paths = [
    "app/api/public/contact/submit/route.ts",
    "app/api/public/diagnostic/submit/route.ts",
    "app/api/public/forms/[formId]/submit/route.ts",
    "app/api/public/forms/[formId]/chat/start/route.ts",
    "app/api/public/chats/[chatId]/messages/route.ts",
  ];

  for (const path of paths) {
    const route = await source(path);
    assert.match(route, /assertPublicRateLimit/);
    assert.match(route, /PublicRateLimitError/);
    assert.match(route, /status: 429/);
  }
});

test("Firestore rules isolate commercial records by assignment for client agents", async () => {
  const rules = await source("firestore.rules");
  assert.match(rules, /function canReadCommercialRecord/);
  assert.match(rules, /function recordAssignedToMe/);
  assert.match(rules, /match \/leads\/\{leadId\}[\s\S]*allow read: if canReadCommercialRecord/);
  assert.match(rules, /match \/chats\/\{chatId\}[\s\S]*allow read: if canReadCommercialRecord/);
  assert.match(rules, /match \/messages\/\{messageId\}[\s\S]*allow read: if canReadChat/);
  assert.doesNotMatch(rules, /match \/leads\/\{leadId\}\s*\{\s*allow read: if isAdmin\(\) \|\| isOwner\(resource\.data\.ownerId\) \|\| hasTenantMembership/);
});

test("admin detail screens use authenticated server reads instead of browser Firestore listeners", async () => {
  const portal = await source("app/admin/clientes/[id]/portal/page.tsx");
  const leadDetail = await source("app/admin/prospeccao/[id]/page.tsx");
  const chat = await source("app/admin/chat/page.tsx");

  assert.match(portal, /\/api\/admin\/clientes\/\$\{encodeURIComponent\(clientId\)\}\/summary/);
  assert.match(leadDetail, /\/api\/admin\/leads\/\$\{encodeURIComponent\(leadId\)\}/);
  assert.match(chat, /\/api\/admin\/chats\/\$\{encodeURIComponent\(selectedChatId\)\}\/actions/);
  assert.doesNotMatch(leadDetail, /onSnapshot\(doc\(db, "leads"/);
});

test("administrative chat mutations validate chat ownership on the server", async () => {
  const actions = await source("app/api/admin/chats/[chatId]/actions/route.ts");
  assert.match(actions, /chatSnap\.get\("ownerId"\) !== actor\.uid/);
  assert.match(actions, /messageSnap\.get\("chatId"\) !== cleanChatId/);
  assert.match(actions, /FieldValue\.serverTimestamp\(\)/);
});
