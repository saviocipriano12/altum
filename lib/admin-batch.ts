import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
export const adminBatchSchema = z.object({
  requestKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
  action: z.enum(["sync", "discover_pixels", "draft", "approve", "reject", "apply"]),
  confirmed: z.boolean().optional(),
  rangeDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  targets: z.array(z.object({
    tenantId: id, platform: z.enum(["meta_ads", "google_ads"]).optional(), channelId: id.optional(),
    draftId: id.optional(), tool: z.enum(["draft_campaign_pause", "draft_campaign_budget_change"]).optional(),
    arguments: z.object({
      platform: z.enum(["meta_ads", "google_ads"]), campaignId: id, adAccountId: z.string().min(1).max(180),
      reason: z.string().min(8).max(600), evidence: z.array(z.string().min(1).max(300)).min(1).max(10),
      currentDailyBudget: z.number().finite().positive().optional(), proposedDailyBudget: z.number().finite().positive().optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    }).strict().optional(),
  }).strict()).min(1).max(20),
}).strict().superRefine((body, ctx) => {
  const keys = new Set<string>();
  for (const [index, target] of body.targets.entries()) {
    const valid = ["sync", "discover_pixels"].includes(body.action) ? target.channelId && target.platform
      : body.action === "draft" ? target.tool && target.arguments : target.draftId;
    if (!valid) ctx.addIssue({ code: "custom", path: ["targets", index], message: "Alvo incompleto." });
    const key = `${target.tenantId}:${target.channelId || target.draftId || `${target.arguments?.platform}:${target.arguments?.adAccountId}:${target.arguments?.campaignId}`}`;
    if (keys.has(key)) ctx.addIssue({ code: "custom", path: ["targets", index], message: "Alvo duplicado." });
    keys.add(key);
  }
  if (body.action === "apply" && body.confirmed !== true) ctx.addIssue({ code: "custom", path: ["confirmed"], message: "Revise e confirme a aplicação das ações selecionadas." });
});

export type AdminBatchRequest = z.infer<typeof adminBatchSchema>;
