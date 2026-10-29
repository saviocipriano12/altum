import { isAiConversationInTestScope, type AiConversationRollout } from "./ai-conversation-rollout";
import { catalogSocialReply } from "./shopify-conversation-catalog";

/** Server-owned rollout only. Absence of a restriction is NOT a catalog grant. */
export function isExplicitAiTestConversation(input: {
  rollout?: AiConversationRollout; tenantId: string; chatId?: string;
}) {
  return Boolean(input.rollout?.exclusiveTest && input.chatId && isAiConversationInTestScope({
    rollout: input.rollout, tenantId: input.tenantId, chatId: input.chatId,
  }));
}

/** Never turn a matched internal document into a sales response without a model. */
export function exclusiveTestNeedsHumanFallback(input: {
  rollout?: AiConversationRollout; tenantId: string; chatId: string;
  inboundText: string; hasModelResponse: boolean; hasCatalogResponse: boolean;
}) {
  return isExplicitAiTestConversation(input) && !input.hasModelResponse && !input.hasCatalogResponse
    && !catalogSocialReply(input.inboundText);
}
