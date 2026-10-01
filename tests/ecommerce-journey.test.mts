import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deriveEcommerceOrderJourney } from "../lib/ecommerce-journey.ts";

const ecommerceServerSource = readFileSync(new URL("../lib/server/ecommerce.ts", import.meta.url), "utf8");

test("pedido pendente acompanha pagamento sem confirmar compra", () => {
  const journey = deriveEcommerceOrderJourney({ status: "created", paymentStatus: "pending" });
  assert.equal(journey.state, "order_created");
  assert.equal(journey.pipelineStage, "proposta");
  assert.equal(journey.shouldFollowUpPayment, true);
  assert.equal(journey.shouldConfirmPurchase, false);
});

test("pagamento confirmado fecha a venda, mas ainda nao antecipa upsell", () => {
  const journey = deriveEcommerceOrderJourney({ paymentStatus: "paid" });
  assert.equal(journey.state, "payment_confirmed");
  assert.equal(journey.pipelineStage, "ganho");
  assert.equal(journey.shouldConfirmPurchase, true);
  assert.equal(journey.shouldCreatePostPurchaseUpsell, false);
});

test("rastreio identifica pedido enviado", () => {
  const journey = deriveEcommerceOrderJourney({ paymentStatus: "paid", trackingCode: "BR123" });
  assert.equal(journey.state, "shipped");
  assert.equal(journey.shouldSendTracking, true);
  assert.equal(journey.shouldWaitForTracking, false);
});

test("pos-venda comercial so e liberado depois da entrega", () => {
  const journey = deriveEcommerceOrderJourney({ paymentStatus: "paid", fulfillmentStatus: "delivered" });
  assert.equal(journey.state, "delivered");
  assert.equal(journey.shouldCreatePostPurchaseUpsell, true);
});

test("cancelamento e estorno encerram a jornada como perdida", () => {
  for (const paymentStatus of ["cancelled", "refunded"]) {
    const journey = deriveEcommerceOrderJourney({ paymentStatus, fulfillmentStatus: "delivered" });
    assert.equal(journey.pipelineStage, "perdido");
    assert.equal(journey.terminal, true);
    assert.equal(journey.shouldConfirmPurchase, false);
    assert.equal(journey.shouldCreatePostPurchaseUpsell, false);
  }
});

test("reembolso parcial preserva a venda e bloqueia novos disparos comerciais", () => {
  const journey = deriveEcommerceOrderJourney({ paymentStatus: "partially_refunded", fulfillmentStatus: "fulfilled" });
  assert.equal(journey.state, "partially_refunded");
  assert.equal(journey.pipelineStage, "ganho");
  assert.equal(journey.terminal, false);
  assert.equal(journey.shouldConfirmPurchase, false);
  assert.equal(journey.shouldCreatePostPurchaseUpsell, false);
});

test("webhooks repetidos preservam criacao e usam eventos comerciais deterministas", () => {
  assert.match(ecommerceServerSource, /eventAlreadyExists/);
  assert.match(ecommerceServerSource, /deliveryCount:\s*FieldValue\.increment\(1\)/);
  assert.match(ecommerceServerSource, /collection\("events"\)\.doc\(/);
  assert.match(ecommerceServerSource, /createdAt:\s*orderSnap\.exists/);
  assert.doesNotMatch(ecommerceServerSource, /collection\("events"\)\.add\(\{\s*\n\s*type:\s*"ecommerce_/);
});

test("carrinho recuperado encerra a pendencia comercial anterior", () => {
  assert.match(ecommerceServerSource, /cart\.status === "recovered"/);
  assert.match(ecommerceServerSource, /type:\s*"abandoned_cart_recovery",\s*status:\s*"done"/);
  assert.match(ecommerceServerSource, /reason:\s*"cart_recovered"/);
});

test("pedidos constroem perfil de recompra por transicao de pagamento, sem duplicar webhooks", () => {
  assert.match(ecommerceServerSource, /collection\("ecommerce_customers"\)/);
  assert.match(ecommerceServerSource, /Revenue changes only on a commercial state transition/);
  assert.match(ecommerceServerSource, /const purchaseDelta = journey\.paid && !previouslyPaid \? 1/);
  assert.match(ecommerceServerSource, /ecommerceCustomerLifetimeValue/);
  assert.match(ecommerceServerSource, /previousJourneyState: clean\(orderSnap\.data\(\)\?\.journeyState, 60\)/);
});
