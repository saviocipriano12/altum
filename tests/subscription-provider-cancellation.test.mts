import test from "node:test";
import assert from "node:assert/strict";
import { completeProviderCancellation, RefundReviewRequired } from "../lib/subscription-provider-cancellation.ts";

test("cancellation stops recurrence before initiating a refund", async () => {
  const events: string[] = [];
  await completeProviderCancellation({ subscriptionId: "sub1", refundPaymentId: "pay1", refundEligible: true, reason: "Cliente", state: {},
    request: async (path, init) => { events.push(`${init?.method || "GET"} ${path}`); return {}; },
    persist: async (state) => { events.push(Object.keys(state)[0]); },
  });
  assert.deepEqual(events, ["DELETE /subscriptions/sub1", "providerCancelled", "refundAttempted", "POST /payments/pay1/refund", "refundAccepted"]);
});
test("an uncertain refund response never causes a second refund request", async () => {
  const state: { providerCancelled?: boolean; refundAttempted?: boolean; refundAccepted?: boolean } = {};
  let refundCalls = 0;
  const input = { subscriptionId: "sub1", refundPaymentId: "pay1", refundEligible: true, reason: "Cliente", state,
    request: async (_path: string, init?: { method?: string }) => {
      if (init?.method === "POST") { refundCalls++; throw new Error("timeout after provider accepted"); }
      return { status: "REFUNDED" };
    }, persist: async (patch: typeof state) => { Object.assign(state, patch); },
  };
  await assert.rejects(completeProviderCancellation(input));
  await completeProviderCancellation(input);
  assert.equal(refundCalls, 1);
  assert.equal(state.refundAccepted, true);
});
test("ambiguous refund with an unchanged charge is escalated for review", async () => {
  let posts = 0;
  await assert.rejects(completeProviderCancellation({ subscriptionId: "sub1", refundPaymentId: "pay1", refundEligible: true, reason: "Cliente",
    state: { providerCancelled: true, refundAttempted: true },
    request: async (_path, init) => { if (init?.method === "POST") posts++; return { status: "RECEIVED" }; }, persist: async () => {},
  }), RefundReviewRequired);
  assert.equal(posts, 0);
});
test("ordinary cancellation does not refund a paid month", async () => {
  const methods: string[] = [];
  await completeProviderCancellation({ subscriptionId: "sub1", refundPaymentId: "", refundEligible: false, reason: "Cliente", state: {},
    request: async (_path, init) => { methods.push(init?.method || "GET"); return {}; }, persist: async () => {},
  });
  assert.deepEqual(methods, ["DELETE"]);
});
test("a failure to stop recurrence prevents refund and can be retried", async () => {
  let posted = false;
  await assert.rejects(completeProviderCancellation({ subscriptionId: "sub1", refundPaymentId: "pay1", refundEligible: true, reason: "Cliente", state: {},
    request: async (_path, init) => { if (init?.method === "POST") posted = true; throw new Error("provider down"); }, persist: async () => {},
  }));
  assert.equal(posted, false);
});
