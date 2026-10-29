/** Restrict the tenant before resuming a chat; never lift the restriction on failure. */
export async function startInboxAiTest(input: {
  tenantId: string;
  chatId: string;
  request: (url: string, init: RequestInit) => Promise<Response>;
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.tenantId) || !/^[a-zA-Z0-9_-]{1,440}$/.test(input.chatId)) {
    throw new Error("Selecione uma conversa valida desta empresa.");
  }
  const settings = await input.request(`/api/tenant/${input.tenantId}/settings/ai`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true, responsePaused: false, testOnly: true,
      testChatIds: [input.chatId], rolloutMode: "automatic", rolloutPercent: 100 }),
  });
  const saved = await settings.json();
  if (!settings.ok) throw new Error(saved.error || "Nao foi possivel restringir a IA. O teste nao foi iniciado.");
  if (saved.ai?.testOnly !== true || saved.ai?.testChatIds?.length !== 1 ||
    saved.ai.testChatIds[0] !== input.chatId || saved.ai.enabled !== true ||
    saved.ai.responsePaused !== false || saved.ai.rolloutMode !== "automatic" || saved.ai.rolloutPercent !== 100) {
    throw new Error("Nao foi possivel confirmar o teste restrito. A conversa nao foi retomada; confira as configuracoes da IA.");
  }
  const resumed = await input.request(`/api/tenant/${input.tenantId}/chats/${input.chatId}/ai-state`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }),
  });
  const result = await resumed.json();
  if (!resumed.ok) throw new Error(result.error || "O teste ficou restrito, mas nao foi possivel retomar a conversa.");
}
