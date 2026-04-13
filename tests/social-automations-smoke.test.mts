import test from "node:test";
import assert from "node:assert/strict";
import {
  isWithinSocialActiveHours,
  normalizeTenantSocialAutomationConfig,
  textTriggersSocialOptOut,
} from "../lib/server/social/config.ts";
import { parseMetaSocialEvents } from "../lib/server/social/meta.ts";

test("social config normalizes defaults and opt-out keywords", () => {
  const config = normalizeTenantSocialAutomationConfig("tenant_123", {
    enabled: true,
    dmAutoReply: false,
    optOutKeywords: ["PARE", "cancelar", "parar"],
    activeHours: {
      timezone: "America/Sao_Paulo",
      start: "09:00",
      end: "18:30",
      days: [1, 2, 3, 4, 5],
    },
  });

  assert.equal(config.tenantId, "tenant_123");
  assert.equal(config.dmAutoReply, false);
  assert.deepEqual(config.optOutKeywords, ["pare", "cancelar", "parar"]);
  assert.equal(config.activeHours.end, "18:30");
});

test("social active hours respect timezone and configured weekdays", () => {
  const active = isWithinSocialActiveHours(
    {
      timezone: "America/Sao_Paulo",
      start: "08:00",
      end: "20:00",
      days: [1, 2, 3, 4, 5],
    },
    new Date("2026-04-13T15:00:00.000Z")
  );

  const inactive = isWithinSocialActiveHours(
    {
      timezone: "America/Sao_Paulo",
      start: "08:00",
      end: "20:00",
      days: [1, 2, 3, 4, 5],
    },
    new Date("2026-04-12T02:00:00.000Z")
  );

  assert.equal(active, true);
  assert.equal(inactive, false);
});

test("social opt-out detects normalized keywords in text", () => {
  assert.equal(textTriggersSocialOptOut("Quero PARAR de receber mensagens", ["parar", "stop"]), true);
  assert.equal(textTriggersSocialOptOut("Pode continuar", ["parar", "stop"]), false);
});

test("meta social parser extracts comment and follower events", () => {
  const events = parseMetaSocialEvents({
    object: "instagram",
    entry: [
      {
        id: "ig_business_1",
        changes: [
          {
            field: "comments",
            value: {
              id: "comment_1",
              text: "Quero saber preco",
              from: { id: "user_1", username: "ana" },
              created_time: 1710000000,
            },
          },
          {
            field: "followers",
            value: {
              from: { id: "user_2", username: "bruno" },
              timestamp: 1710000010,
            },
          },
        ],
      },
    ],
  });

  assert.equal(events.length, 2);
  assert.equal(events[0]?.eventType, "comment");
  assert.equal(events[0]?.actorId, "user_1");
  assert.equal(events[0]?.text, "Quero saber preco");
  assert.equal(events[1]?.eventType, "new_follower");
  assert.equal(events[1]?.actorId, "user_2");
});
