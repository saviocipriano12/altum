import assert from "node:assert/strict";
import test from "node:test";
import { parseMeetingBotTarget } from "../lib/server/meetings/bot-provider.ts";

test("aceita um link valido do Google Meet", () => {
  const target = parseMeetingBotTarget("https://meet.google.com/abc-defg-hij");
  assert.equal(target.platform, "google_meet");
  assert.equal(target.nativeMeetingId, "abc-defg-hij");
});

test("aceita links de subdominios oficiais do Zoom", () => {
  const target = parseMeetingBotTarget("https://us02web.zoom.us/j/81234567890?pwd=segredo");
  assert.equal(target.platform, "zoom");
  assert.equal(target.nativeMeetingId, "81234567890");
});

test("recusa dominios parecidos e links inseguros", () => {
  assert.throws(() => parseMeetingBotTarget("https://meet.google.com.evil.test/abc-defg-hij"));
  assert.throws(() => parseMeetingBotTarget("http://meet.google.com/abc-defg-hij"));
  assert.throws(() => parseMeetingBotTarget("https://zoom.us.evil.test/j/81234567890"));
});
