import type { TenantMembership } from "../../lib/server/tenant.ts";
import type { WhatsAppChannelConfig } from "../../app/lib/server/whatsapp-channel.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const tenantId = process.argv[2] || "";
const mode = process.argv[3] || "same";
const workerIndex = process.argv[4] || "0";
if (!/^qa_multiprocess_\d+_[a-z0-9]+$/.test(tenantId) || !process.send) throw new Error("Worker requires isolated QA tenant and IPC");
const { adminDb } = await import("../../app/lib/server/firebase-admin.ts");
const { startTenantWhatsAppConversation: start } = await import("../../lib/server/whatsapp-conversation-start.ts");
const { queueTenantChatText, queueTenantChatMedia } = await import("../../lib/server/chat-outbound.ts");
const user = { uid: "qa-process-owner", name: "Operador ficticio" };
const membership: TenantMembership = { id: "qa-process-membership", tenantId, userId: user.uid, role: "client_owner", status: "active", isDefault: true, capabilities: ["respond_inbox"] };
const channel: WhatsAppChannelConfig = { id: `channel_${tenantId}`, tenantId, source: "tenant_channel", provider: "evolution", phoneNumberId: "qa-process-number", accessToken: "qa-not-a-token", channelScope: "shared" };
await new Promise<void>((resolve) => {
  process.once("message", () => resolve());
  process.send!({ type: "ready" });
});
try {
  const settled = await Promise.allSettled(Array.from({ length: 4 }, async (_, index) => {
    if (mode === "mixed") {
      const chatId = `mixed_${tenantId}`;
      const common = { tenantId, chatId, actor: { id: user.uid, name: user.name }, clientRequestId: `mixed-${workerIndex}-${index}-0001` };
      const result = index % 2
        ? await queueTenantChatMedia({ ...common, mediaType: "image", storagePath: `chat-media/${tenantId}/${chatId}/qa.jpg`, mediaSize: 123, filename: "qa.jpg", contentType: "image/jpeg" })
        : await queueTenantChatText({ ...common, text: "Texto ficticio misto" });
      return { ...result, chatId };
    }
    return start({ tenantId, user, membership, channel,
    body: { leadId: `lead_${tenantId}`, text: "Mensagem ficticia entre processos",
      clientRequestId: mode === "distinct" ? `process-distinct-${workerIndex}-${index}-0001` : "process-shared-request-0001" } });
  }));
  process.send!({ type: "done", results: settled.map((result) => result.status === "fulfilled"
    ? { ok: true, chatId: result.value.chatId, jobId: "jobId" in result.value ? result.value.jobId : null }
    : { ok: false, stage: result.reason?.whatsappStartStage || "unknown", code: result.reason?.code,
        message: result.reason instanceof Error ? result.reason.message : "Unknown failure" }) });
} finally { await adminDb.terminate(); process.disconnect(); }
