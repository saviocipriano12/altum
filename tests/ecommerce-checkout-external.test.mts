import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ecommerceSource = readFileSync(new URL("../lib/server/ecommerce.ts", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../lib/server/commerce/registry.ts", import.meta.url), "utf8");

test("checkout externo reconhece envelopes comuns e identificadores de evento", () => {
  assert.match(ecommerceSource, /envelope\.data \|\| envelope\.payload \|\| envelope\.resource/);
  assert.match(ecommerceSource, /x-yampi-event/);
  assert.match(ecommerceSource, /x-cartpanda-event/);
  assert.match(ecommerceSource, /x-appmax-event/);
  assert.match(ecommerceSource, /x-yampi-event-id/);
});

test("checkout externo declara reembolso condicionado ao payload do provedor", () => {
  assert.match(registrySource, /refunds:\s*"partial"/);
  assert.match(registrySource, /reembolso quando o evento trouxer os dados/);
});
